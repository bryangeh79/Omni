// Meta WhatsApp Business Platform inbound webhook (Phase 7A + 7B security hardening).
// Public routes — no JWT auth. Secured by:
//   Phase 7A: channelId path scoping + verify-token handshake
//   Phase 7B: X-Hub-Signature-256 HMAC verification + replay cache
//
// SAFETY RULES:
//   - Never log hub.verify_token, app secret, raw signature, or raw body content
//   - Always return 200 to prevent Meta retry storms (errors are logged only)
//   - Idempotent by Meta message ID (wamid)
//   - No AI reply sent from webhook handler — enqueue only
//   - Replay cache is process-scoped (document: multi-instance needs Redis-backed cache)

import crypto            from 'crypto'
import type { IncomingMessage } from 'http'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma, PrismaChannelType } from '@omni/db'
import { decryptApiKey, isVaultConfigured } from '@omni/shared'
import { routeInboundMessage } from '../message-router'

// ── Meta payload types ────────────────────────────────────────────────────────

interface MetaTextMsg {
  from:      string
  id:        string   // wamid
  timestamp: string
  type:      string
  text?:     { body: string }
}

interface MetaWebhookPayload {
  object?: string
  entry?: Array<{
    id: string
    changes?: Array<{
      value?: {
        messaging_product?: string
        metadata?:   { display_phone_number: string; phone_number_id: string }
        contacts?:   Array<{ profile?: { name?: string }; wa_id: string }>
        messages?:   MetaTextMsg[]
      }
      field?: string
    }>
  }>
}

// ── Raw body store (scoped to this plugin) ────────────────────────────────────
// WeakMap keyed by Node IncomingMessage — entries are GC'd when request ends.
// Required for X-Hub-Signature-256 HMAC verification.
const rawBodyMap = new WeakMap<IncomingMessage, Buffer>()

// ── HMAC verification ─────────────────────────────────────────────────────────

function verifyMetaHmac(rawBody: Buffer, appSecret: string, headerSig: string | undefined): boolean {
  if (!headerSig || !headerSig.startsWith('sha256=')) return false

  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')

  const sigBuf = Buffer.from(headerSig, 'utf8')
  const expBuf = Buffer.from(expected,  'utf8')
  if (sigBuf.length !== expBuf.length) return false
  return crypto.timingSafeEqual(sigBuf, expBuf)
}

// ── Replay protection (best-effort, process-scoped) ───────────────────────────
// Caches a SHA-256 hash of each seen signature for REPLAY_WINDOW_MS.
// Limitation: does NOT prevent replays across multiple server instances.
// For production multi-instance deployments, back this with Redis.

const REPLAY_WINDOW_MS = 5 * 60 * 1000  // 5 minutes
const seenSigHashes    = new Map<string, number>()

function isReplaySignature(sig: string): boolean {
  const now = Date.now()
  for (const [s, ts] of seenSigHashes) {
    if (now - ts > REPLAY_WINDOW_MS) seenSigHashes.delete(s)
  }
  const h = crypto.createHash('sha256').update(sig).digest('hex')
  if (seenSigHashes.has(h)) return true
  seenSigHashes.set(h, now)
  return false
}

// ────────────────────────────────────────────────────────────────────────────

export async function webhookMetaRoutes(app: FastifyInstance) {

  // Capture raw request body for HMAC verification.
  // In Fastify 5, addContentTypeParser callback receives FastifyRequest (not IncomingMessage).
  // We key the WeakMap by req.raw (the underlying IncomingMessage) for type-safe lookup.
  // Overrides JSON parser for this plugin scope only — other routes are unaffected.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (fastifyReq: FastifyRequest, body: Buffer, done: (err: Error | null, body?: unknown) => void) => {
      rawBodyMap.set(fastifyReq.raw as IncomingMessage, body)
      try {
        done(null, JSON.parse(body.toString('utf8')))
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )

  // ── GET /webhooks/meta/whatsapp/:channelId — Meta webhook verification ─────
  app.get<{
    Params:      { channelId: string }
    Querystring: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string }
  }>(
    '/meta/whatsapp/:channelId',
    async (req, reply) => {
      const { channelId } = req.params
      const mode      = req.query['hub.mode']
      const token     = req.query['hub.verify_token']
      const challenge = req.query['hub.challenge']

      if (!mode || !token || !challenge) {
        return reply.status(400).send({ error: 'Missing hub.mode, hub.verify_token, or hub.challenge' })
      }
      if (mode !== 'subscribe') {
        return reply.status(400).send({ error: 'hub.mode must be "subscribe"' })
      }

      const ch = await prisma.channel.findFirst({
        where: { id: channelId, type: PrismaChannelType.META_API },
      })
      if (!ch) return reply.status(404).send({ error: 'Channel not found' })
      if (!ch.webhookVerifyTokenRef) return reply.status(403).send({ error: 'No webhook verify token configured for this channel' })
      if (!isVaultConfigured()) return reply.status(503).send({ error: 'Vault not configured' })

      let storedToken: string
      try {
        storedToken = decryptApiKey(ch.webhookVerifyTokenRef)
      } catch {
        return reply.status(500).send({ error: 'Token decryption failed' })
      }

      const inBuf     = Buffer.from(token,       'utf8')
      const storedBuf = Buffer.from(storedToken, 'utf8')
      if (inBuf.length !== storedBuf.length || !crypto.timingSafeEqual(inBuf, storedBuf)) {
        return reply.status(403).send({ error: 'Webhook verification failed' })
      }

      return reply.type('text/plain').send(challenge)
    },
  )

  // ── POST /webhooks/meta/whatsapp/:channelId — inbound messages ─────────────
  // Phase 7B: verifies X-Hub-Signature-256 when appSecret is configured.
  // Always returns 200 — processing errors are logged, never propagated.
  app.post<{ Params: { channelId: string }; Body: MetaWebhookPayload }>(
    '/meta/whatsapp/:channelId',
    async (req, reply) => {
      const { channelId } = req.params

      try {
        // ── Phase 7B: X-Hub-Signature-256 HMAC verification ──────────────────
        const ch = await prisma.channel.findFirst({
          where: { id: channelId, type: PrismaChannelType.META_API },
        })

        if (ch?.metaAppSecretRef && isVaultConfigured()) {
          const rawBody = rawBodyMap.get(req.raw)
          const sig     = req.headers['x-hub-signature-256'] as string | undefined

          if (!rawBody) {
            console.error(`[webhook-meta] No raw body available for HMAC check, channelId=${channelId}`)
            return reply.status(400).send({ error: 'Cannot verify signature — raw body unavailable' })
          }

          let appSecret: string
          try {
            appSecret = decryptApiKey(ch.metaAppSecretRef)
          } catch {
            console.error(`[webhook-meta] App secret decryption failed, channelId=${channelId}`)
            return reply.status(500).send({ error: 'Internal error verifying signature' })
          }

          if (!sig) {
            return reply.status(403).send({ error: 'Missing x-hub-signature-256 header' })
          }
          if (!verifyMetaHmac(rawBody, appSecret, sig)) {
            return reply.status(403).send({ error: 'Invalid webhook signature' })
          }

          // Replay check (best-effort, process-scoped)
          if (isReplaySignature(sig)) {
            console.warn(`[webhook-meta] Replay detected, channelId=${channelId}`)
            return reply.status(200).send({ received: true, note: 'duplicate' })
          }

        } else if (!ch) {
          console.warn(`[webhook-meta] Unknown channelId=${channelId}`)
          return reply.status(200).send({ received: true })
        }

        // ── Parse and route payload ───────────────────────────────────────────
        const payload = req.body as MetaWebhookPayload
        if (payload?.object !== 'whatsapp_business_account') {
          return reply.status(200).send({ received: true })
        }

        // ch is guaranteed non-null here (checked above)
        const tenantId = ch!.tenantId

        await prisma.channel.update({
          where: { id: channelId },
          data:  { lastWebhookAt: new Date() },
        }).catch(() => { /* non-fatal */ })

        for (const entry of (payload.entry ?? [])) {
          for (const change of (entry.changes ?? [])) {
            if (change.field !== 'messages') continue
            const value = change.value
            if (!value?.messages?.length) continue

            for (const msg of value.messages) {
              if (msg.type !== 'text' || !msg.text?.body) continue

              const wamid = msg.id
              const from  = msg.from.startsWith('+') ? msg.from : `+${msg.from}`

              // ── Idempotency: skip duplicate wamid ─────────────────────────
              const exists = await prisma.message.findFirst({
                where: { channelMessageId: wamid },
                select: { id: true },
              })
              if (exists) {
                console.log(`[webhook-meta] Duplicate wamid=${wamid} — skipping`)
                continue
              }

              try {
                await routeInboundMessage(
                  {
                    channelType: 'META_API',
                    channelId,
                    externalId:  wamid,
                    from,
                    body:        msg.text.body,
                    receivedAt:  new Date(Number(msg.timestamp) * 1000),
                  },
                  tenantId,
                )
              } catch (err) {
                console.error(`[webhook-meta] Failed routing wamid=${wamid}:`, (err as Error).message)
              }
            }
          }
        }

      } catch (err) {
        console.error('[webhook-meta] POST error:', (err as Error).message)
      }

      return reply.status(200).send({ received: true })
    },
  )
}
