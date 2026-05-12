// Meta WhatsApp Business Platform channel config routes (Phase 7A/7B).
// All endpoints are tenant-scoped via JWT. Raw Meta tokens are write-only — never returned.
// Real API sends are disabled by default (OMNI_ENABLE_REAL_META_SEND guards delivery).

import type { FastifyInstance } from 'fastify'
import { prisma, PrismaChannelType } from '@omni/db'
import {
  encryptApiKey, decryptApiKey, extractLast4, isVaultConfigured,
} from '@omni/shared'
import { requireAuth, getAuthUser } from '../auth'

// ── Safe channel view — never returns raw/encrypted tokens ───────────────────

function safeChannelView(ch: {
  id: string; tenantId: string; type: string; displayName: string; isActive: boolean;
  metaPhoneNumberId?: string | null; wabaId?: string | null; displayPhoneNumber?: string | null;
  metaAccessTokenRef?: string | null; metaAccessTokenLast4?: string | null;
  metaAccessTokenUpdatedAt?: Date | null; webhookVerifyTokenRef?: string | null;
  metaAppSecretRef?: string | null; metaAppSecretLast4?: string | null;
  metaAppSecretUpdatedAt?: Date | null; lastWebhookAt?: Date | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id:                    ch.id,
    tenantId:              ch.tenantId,
    type:                  ch.type,
    displayName:           ch.displayName,
    isActive:              ch.isActive,
    phoneNumberId:         ch.metaPhoneNumberId   ?? null,
    wabaId:                ch.wabaId              ?? null,
    displayPhoneNumber:    ch.displayPhoneNumber  ?? null,
    hasAccessToken:        !!ch.metaAccessTokenRef,
    accessTokenLast4:      ch.metaAccessTokenLast4 ?? null,
    accessTokenUpdatedAt:  ch.metaAccessTokenUpdatedAt ?? null,
    hasWebhookVerifyToken: !!ch.webhookVerifyTokenRef,
    hasAppSecret:          !!ch.metaAppSecretRef,
    appSecretLast4:        ch.metaAppSecretLast4 ?? null,
    appSecretUpdatedAt:    ch.metaAppSecretUpdatedAt ?? null,
    lastWebhookAt:         ch.lastWebhookAt ?? null,
    createdAt:             ch.createdAt,
    updatedAt:             ch.updatedAt,
  }
}

// ────────────────────────────────────────────────────────────────────────────

export async function metaChannelRoutes(app: FastifyInstance) {

  // ── GET /channels/meta — list tenant Meta channels ─────────────────────────
  app.get('/', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const channels = await prisma.channel.findMany({
      where:   { tenantId, type: PrismaChannelType.META_API },
      orderBy: { createdAt: 'desc' },
    })
    return { data: channels.map(safeChannelView) }
  })

  // ── GET /channels/meta/:id ─────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/:id', { preHandler: requireAuth }, async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const ch = await prisma.channel.findFirst({
        where: { id: req.params.id, tenantId, type: PrismaChannelType.META_API },
      })
      if (!ch) return reply.status(404).send({ error: 'Meta channel not found' })
      return safeChannelView(ch)
    },
  )

  // ── POST /channels/meta — create Meta channel config ──────────────────────
  app.post<{
    Body: {
      displayName?:        string
      phoneNumberId?:      string
      wabaId?:             string
      displayPhoneNumber?: string
      metaAccessToken?:    string
      webhookVerifyToken?: string
      appSecret?:          string   // Meta App Secret for X-Hub-Signature-256 (Phase 7B)
    }
  }>('/', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const {
      displayName, phoneNumberId, wabaId, displayPhoneNumber,
      metaAccessToken, webhookVerifyToken, appSecret,
    } = req.body ?? {}

    if (!phoneNumberId?.trim()) {
      return reply.status(400).send({ error: 'phoneNumberId is required' })
    }
    if ((metaAccessToken || webhookVerifyToken || appSecret) && !isVaultConfigured()) {
      return reply.status(503).send({ error: 'Vault not configured — set OMNI_API_KEY_ENCRYPTION_SECRET to store tokens' })
    }

    const now             = new Date()
    const tokenRef        = metaAccessToken?.trim()    ? encryptApiKey(metaAccessToken.trim())    : null
    const tokenLast4      = metaAccessToken?.trim()    ? extractLast4(metaAccessToken.trim())     : null
    const verifyTokenRef  = webhookVerifyToken?.trim() ? encryptApiKey(webhookVerifyToken.trim()) : null
    const appSecretRef    = appSecret?.trim()          ? encryptApiKey(appSecret.trim())          : null
    const appSecretLast4  = appSecret?.trim()          ? extractLast4(appSecret.trim())           : null

    const ch = await prisma.channel.create({
      data: {
        tenantId,
        type:                     PrismaChannelType.META_API,
        displayName:              (displayName?.trim() ?? 'WhatsApp Business API'),
        isActive:                 false,
        metaPhoneNumberId:        phoneNumberId.trim(),
        wabaId:                   wabaId?.trim()             ?? null,
        displayPhoneNumber:       displayPhoneNumber?.trim() ?? null,
        metaAccessTokenRef:       tokenRef,
        metaAccessTokenLast4:     tokenLast4,
        metaAccessTokenUpdatedAt: tokenRef    ? now : null,
        webhookVerifyTokenRef:    verifyTokenRef,
        metaAppSecretRef:         appSecretRef,
        metaAppSecretLast4:       appSecretLast4,
        metaAppSecretUpdatedAt:   appSecretRef ? now : null,
      },
    })

    return reply.status(201).send(safeChannelView(ch))
  })

  // ── PATCH /channels/meta/:id — update config (not tokens) ─────────────────
  app.patch<{
    Params: { id: string }
    Body: {
      displayName?:        string
      phoneNumberId?:      string
      wabaId?:             string
      displayPhoneNumber?: string
      isActive?:           boolean
    }
  }>('/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const ch = await prisma.channel.findFirst({
      where: { id: req.params.id, tenantId, type: PrismaChannelType.META_API },
    })
    if (!ch) return reply.status(404).send({ error: 'Meta channel not found' })

    const { displayName, phoneNumberId, wabaId, displayPhoneNumber, isActive } = req.body ?? {}
    const updated = await prisma.channel.update({
      where: { id: ch.id },
      data: {
        ...(displayName        !== undefined ? { displayName: displayName.trim() }                       : {}),
        ...(phoneNumberId      !== undefined ? { metaPhoneNumberId: phoneNumberId.trim() }               : {}),
        ...(wabaId             !== undefined ? { wabaId: wabaId?.trim() ?? null }                        : {}),
        ...(displayPhoneNumber !== undefined ? { displayPhoneNumber: displayPhoneNumber?.trim() ?? null } : {}),
        ...(isActive           !== undefined ? { isActive }                                               : {}),
      },
    })
    return safeChannelView(updated)
  })

  // ── POST /channels/meta/:id/token — store/replace encrypted tokens ─────────
  // Accepts metaAccessToken, webhookVerifyToken, and/or appSecret (Phase 7B).
  app.post<{
    Params: { id: string }
    Body: {
      metaAccessToken?:    string
      webhookVerifyToken?: string
      appSecret?:          string  // Meta App Secret for HMAC verification
    }
  }>('/:id/token', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const ch = await prisma.channel.findFirst({
      where: { id: req.params.id, tenantId, type: PrismaChannelType.META_API },
    })
    if (!ch) return reply.status(404).send({ error: 'Meta channel not found' })

    const { metaAccessToken, webhookVerifyToken, appSecret } = req.body ?? {}
    if (!metaAccessToken && !webhookVerifyToken && !appSecret) {
      return reply.status(400).send({ error: 'At least one of metaAccessToken, webhookVerifyToken, or appSecret is required' })
    }
    if (!isVaultConfigured()) {
      return reply.status(503).send({ error: 'Vault not configured — OMNI_API_KEY_ENCRYPTION_SECRET missing' })
    }

    const now  = new Date()
    const data: Record<string, unknown> = {}
    if (metaAccessToken?.trim()) {
      data.metaAccessTokenRef       = encryptApiKey(metaAccessToken.trim())
      data.metaAccessTokenLast4     = extractLast4(metaAccessToken.trim())
      data.metaAccessTokenUpdatedAt = now
    }
    if (webhookVerifyToken?.trim()) {
      data.webhookVerifyTokenRef = encryptApiKey(webhookVerifyToken.trim())
    }
    if (appSecret?.trim()) {
      data.metaAppSecretRef       = encryptApiKey(appSecret.trim())
      data.metaAppSecretLast4     = extractLast4(appSecret.trim())
      data.metaAppSecretUpdatedAt = now
    }

    const updated = await prisma.channel.update({
      where: { id: ch.id },
      data:  data as Parameters<typeof prisma.channel.update>[0]['data'],
    })

    return {
      ...safeChannelView(updated),
      message: 'Token(s) stored encrypted. Raw tokens discarded.',
    }
  })

  // ── DELETE /channels/meta/:id/token — clear all stored tokens + app secret ─
  app.delete<{ Params: { id: string } }>(
    '/:id/token', { preHandler: requireAuth }, async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const ch = await prisma.channel.findFirst({
        where: { id: req.params.id, tenantId, type: PrismaChannelType.META_API },
      })
      if (!ch) return reply.status(404).send({ error: 'Meta channel not found' })

      const updated = await prisma.channel.update({
        where: { id: ch.id },
        data: {
          metaAccessTokenRef:       null,
          metaAccessTokenLast4:     null,
          metaAccessTokenUpdatedAt: null,
          webhookVerifyTokenRef:    null,
          metaAppSecretRef:         null,
          metaAppSecretLast4:       null,
          metaAppSecretUpdatedAt:   null,
        },
      })
      return { ...safeChannelView(updated), message: 'All tokens and app secret cleared.' }
    },
  )

  // ── POST /channels/meta/:id/test-config-dry-run ────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/:id/test-config-dry-run', { preHandler: requireAuth }, async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const ch = await prisma.channel.findFirst({
        where: { id: req.params.id, tenantId, type: PrismaChannelType.META_API },
      })
      if (!ch) return reply.status(404).send({ error: 'Meta channel not found' })

      const checks = {
        hasPhoneNumberId: !!ch.metaPhoneNumberId,
        hasAccessToken:   !!ch.metaAccessTokenRef,
        hasWebhookToken:  !!ch.webhookVerifyTokenRef,
        hasAppSecret:     !!ch.metaAppSecretRef,     // Phase 7B
        vaultConfigured:  isVaultConfigured(),
      }

      let tokenDecryptable: boolean | null = null
      if (ch.metaAccessTokenRef && isVaultConfigured()) {
        try { decryptApiKey(ch.metaAccessTokenRef); tokenDecryptable = true }
        catch { tokenDecryptable = false }
      }

      return {
        channelId:        ch.id,
        phoneNumberId:    ch.metaPhoneNumberId,
        checks,
        tokenDecryptable,
        configValid:      checks.hasPhoneNumberId,
        hmacReady:        checks.hasAppSecret && checks.vaultConfigured,
        note:             'No Meta API call made. Local config validation only.',
      }
    },
  )
}
