// Meta WhatsApp Business Platform inbound webhook (Phase 7A).
// Public routes — no JWT auth. Secured by channelId path scoping + verify token check.
//
// SAFETY RULES:
//   - Never log hub.verify_token or any raw token value
//   - Always return 200 to prevent Meta retry storms
//   - Idempotent by Meta message ID (wamid)
//   - No reply sent from webhook handler — enqueue only
//   - TODO Phase 7B: add X-Hub-Signature-256 HMAC verification for full security

import crypto from 'crypto'
import type { FastifyInstance } from 'fastify'
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

// ────────────────────────────────────────────────────────────────────────────

export async function webhookMetaRoutes(app: FastifyInstance) {

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

      // Constant-time comparison to prevent timing side-channels
      const inBuf  = Buffer.from(token,       'utf8')
      const storedBuf = Buffer.from(storedToken, 'utf8')
      if (inBuf.length !== storedBuf.length || !crypto.timingSafeEqual(inBuf, storedBuf)) {
        return reply.status(403).send({ error: 'Webhook verification failed' })
      }

      // Return challenge as plain text (Meta requirement)
      return reply.type('text/plain').send(challenge)
    },
  )

  // ── POST /webhooks/meta/whatsapp/:channelId — inbound messages ─────────────
  // Always returns 200. Process errors are logged, never propagated.
  app.post<{ Params: { channelId: string }; Body: MetaWebhookPayload }>(
    '/meta/whatsapp/:channelId',
    async (req, reply) => {
      const { channelId } = req.params

      try {
        const payload = req.body as MetaWebhookPayload
        if (payload?.object !== 'whatsapp_business_account') {
          return reply.status(200).send({ received: true })
        }

        const ch = await prisma.channel.findFirst({
          where: { id: channelId, type: PrismaChannelType.META_API },
        })
        if (!ch) {
          console.warn(`[webhook-meta] Unknown channelId=${channelId}`)
          return reply.status(200).send({ received: true })
        }

        // Update lastWebhookAt (non-fatal if it fails)
        await prisma.channel.update({
          where: { id: channelId },
          data:  { lastWebhookAt: new Date() },
        }).catch(() => { /* non-fatal */ })

        const tenantId = ch.tenantId

        for (const entry of (payload.entry ?? [])) {
          for (const change of (entry.changes ?? [])) {
            if (change.field !== 'messages') continue
            const value = change.value
            if (!value?.messages?.length) continue

            for (const msg of value.messages) {
              if (msg.type !== 'text' || !msg.text?.body) continue

              const wamid = msg.id
              const from  = msg.from.startsWith('+') ? msg.from : `+${msg.from}`

              // ── Idempotency: skip duplicate wamid ───────────────────────
              const exists = await prisma.message.findFirst({
                where: { channelMessageId: wamid },
                select: { id: true },
              })
              if (exists) {
                console.log(`[webhook-meta] Duplicate wamid=${wamid} — skipping`)
                continue
              }

              // ── Route to DB + BullMQ ─────────────────────────────────────
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
