// Channel Setup Wizard API — safe stubs (Phase 12B)
//
// GET  /channels/setup/status     — current channel setup state (no secrets)
// POST /channels/setup/save-draft — save chosen channel type/display name
// POST /channels/setup/test       — stub connection test (NO real Meta/WA calls)
//
// Safety:
//   - All endpoints tenant-scoped via JWT.
//   - OMNI_ALLOW_WA_SESSION is never set here.
//   - OMNI_ENABLE_REAL_META_SEND is never set here.
//   - /test always returns STUB — never calls Meta API or starts WA session.
//   - No credentials, tokens, or secrets in responses.

import type { FastifyInstance } from 'fastify'
import { requireAuth, getAuthUser } from '../auth'

const VALID_CHANNEL_TYPES = ['WA_WEB', 'META_WA_BUSINESS']

export async function channelSetupRoutes(app: FastifyInstance) {

  // ── GET /channels/setup/status ────────────────────────────────────────────
  app.get('/status', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return {
      tenantId,
      channelType:            null,
      displayName:            null,
      testStatus:             'NOT_TESTED',
      realWaSessionEnabled:   false,
      realMetaSendEnabled:    false,
      note: 'Channel not yet configured. Choose a channel type and save a draft to begin.',
    }
  })

  // ── POST /channels/setup/save-draft ───────────────────────────────────────
  app.post<{
    Body: {
      channelType?:  string
      displayName?:  string
      phoneNumber?:  string
    }
  }>('/save-draft', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { channelType, displayName, phoneNumber } = req.body ?? {}

    if (channelType && !VALID_CHANNEL_TYPES.includes(channelType)) {
      return reply.status(400).send({
        error: `Invalid channelType. Valid: ${VALID_CHANNEL_TYPES.join(', ')}`,
      })
    }

    // No real channel connection — draft only
    return {
      saved:                  true,
      tenantId,
      channelType:            channelType ?? null,
      displayName:            displayName ?? null,
      phoneNumber:            phoneNumber ? '[provided]' : null,  // never echo phone back
      realWaSessionEnabled:   false,
      realMetaSendEnabled:    false,
      note:                   'Draft saved. No real channel connected. Configure credentials separately to go live.',
    }
  })

  // ── POST /channels/setup/test ─────────────────────────────────────────────
  // Stub only — never calls Meta API or starts a WA Web session
  app.post<{
    Body: { channelType?: string }
  }>('/test', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)

    return {
      tenantId,
      testResult:             'STUB',
      connected:              false,
      realWaSessionEnabled:   false,
      realMetaSendEnabled:    false,
      metaApiCalled:          false,
      whatsappSessionStarted: false,
      note: 'This is a safe stub test. Real connection testing requires channel credentials and explicit enable flags (not set by default).',
    }
  })
}
