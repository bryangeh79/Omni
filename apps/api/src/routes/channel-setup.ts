// Channel Setup Wizard API — Phase 13A: DB persistence + credential vault + guarded activation
//
// GET  /channels/setup/status           — persisted draft state (no secrets)
// POST /channels/setup/save-draft       — persist draft to DB
// POST /channels/setup/test             — stub test + update DB testStatus
// POST /channels/setup/credentials-draft — encrypt & store credential ref (no plaintext in response)
// GET  /channels/setup/credentials-status — credential metadata only (never raw values)
// DELETE /channels/setup/credentials   — clear stored credential ref
// POST /channels/setup/request-activation — guarded; blocked by default without env flags
// POST /channels/setup/confirm-activation — guarded; blocked by default without env flags
//
// Safety rules:
//   - All endpoints: requireAuth, tenantId from JWT only.
//   - OMNI_ALLOW_WA_SESSION: never enabled here — activation blocked without it.
//   - OMNI_ENABLE_REAL_META_SEND: never enabled here — activation blocked without it.
//   - credentialRef: always encrypted (AES-256-GCM) or null. Never in response.
//   - No raw credentials, tokens, secrets, or .env contents in any response.
//   - No real WhatsApp session started. No real Meta API called.

import type { FastifyInstance } from 'fastify'
import { prisma, ChannelSetupStatus, CredentialStatus } from '@omni/db'
import { requireAuth, getAuthUser } from '../auth'
import { isVaultConfigured, encryptApiKey, extractLast4 } from '@omni/shared'

const VALID_CHANNEL_TYPES = ['WA_WEB', 'META_WA_BUSINESS']

// ── Helper: load or create draft ───────────────────────────────────────────────
async function getOrCreateDraft(tenantId: string) {
  return prisma.channelSetupDraft.upsert({
    where:  { tenantId },
    update: {},
    create: { tenantId },
  })
}

// ── Helper: safe draft response (never includes credentialRef) ────────────────
function safeDraftResponse(draft: {
  id:                  string
  tenantId:            string
  channelType:         string | null
  displayName:         string | null
  phoneLast4:          string | null
  setupStatus:         string
  credentialStatus:    string
  credentialLast4:     string | null
  testStatus:          string
  lastTestAt:          Date | null
  realWaSessionEnabled: boolean
  realMetaSendEnabled:  boolean
  activationNotes:     string | null
  createdAt:           Date
  updatedAt:           Date
}) {
  return {
    tenantId:             draft.tenantId,
    channelType:          draft.channelType,
    displayName:          draft.displayName,
    phoneLast4:           draft.phoneLast4,
    setupStatus:          draft.setupStatus,
    credentialStatus:     draft.credentialStatus,
    credentialLast4:      draft.credentialLast4,
    testStatus:           draft.testStatus,
    lastTestAt:           draft.lastTestAt,
    realWaSessionEnabled: false,     // safety flag snapshot — always false in response
    realMetaSendEnabled:  false,
    activationNotes:      draft.activationNotes,
    createdAt:            draft.createdAt,
    updatedAt:            draft.updatedAt,
  }
}

export async function channelSetupRoutes(app: FastifyInstance) {

  // ── GET /channels/setup/status ────────────────────────────────────────────
  app.get('/status', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const draft = await getOrCreateDraft(tenantId)
    return safeDraftResponse(draft)
  })

  // ── POST /channels/setup/save-draft ───────────────────────────────────────
  app.post<{
    Body: {
      channelType?:  string
      displayName?:  string
      phoneNumber?:  string   // only last 4 stored
    }
  }>('/save-draft', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { channelType, displayName, phoneNumber } = req.body ?? {}

    if (channelType && !VALID_CHANNEL_TYPES.includes(channelType)) {
      return reply.status(400).send({
        error: `Invalid channelType. Valid: ${VALID_CHANNEL_TYPES.join(', ')}`,
      })
    }

    const phoneLast4 = phoneNumber ? phoneNumber.trim().slice(-4) : undefined

    const draft = await prisma.channelSetupDraft.upsert({
      where:  { tenantId },
      update: {
        ...(channelType  !== undefined ? { channelType }  : {}),
        ...(displayName  !== undefined ? { displayName }  : {}),
        ...(phoneLast4   !== undefined ? { phoneLast4 }   : {}),
        setupStatus: ChannelSetupStatus.DRAFT,
      },
      create: {
        tenantId,
        channelType:  channelType  ?? null,
        displayName:  displayName  ?? null,
        phoneLast4:   phoneLast4   ?? null,
        setupStatus:  ChannelSetupStatus.DRAFT,
      },
    })

    return {
      saved: true,
      ...safeDraftResponse(draft),
      note: 'Draft saved. No real channel connected. Configure credentials separately to go live.',
    }
  })

  // ── POST /channels/setup/test ─────────────────────────────────────────────
  // Stub only — never calls real Meta API or starts WA session
  app.post<{
    Body: { channelType?: string }
  }>('/test', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)

    const now = new Date()
    const draft = await prisma.channelSetupDraft.upsert({
      where:  { tenantId },
      update: {
        testStatus: 'STUB',
        lastTestAt: now,
        setupStatus: ChannelSetupStatus.TESTED_STUB,
      },
      create: {
        tenantId,
        testStatus:  'STUB',
        lastTestAt:  now,
        setupStatus: ChannelSetupStatus.TESTED_STUB,
      },
    })

    return {
      testResult:             'STUB',
      connected:              false,
      realWaSessionEnabled:   false,
      realMetaSendEnabled:    false,
      metaApiCalled:          false,
      whatsappSessionStarted: false,
      testedAt:               now,
      setupStatus:            draft.setupStatus,
      note: 'Safe stub test. Real connection requires credentials + explicit enable flags.',
      tenantId,
    }
  })

  // ── POST /channels/setup/credentials-draft ────────────────────────────────
  // Accepts credential fields, encrypts them, stores only the encrypted ref.
  // Never returns raw credentials. Never logs them.
  app.post<{
    Body: {
      // Meta API credential fields (not echoed back)
      wabaId?:           string
      phoneNumberId?:    string
      accessToken?:      string   // encrypted; last4 stored for display
      metaAppSecret?:    string   // encrypted; never returned
      // WA Web (no credentials needed for session — session is separate)
      // Common
      channelType?:      string
    }
  }>('/credentials-draft', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const body = req.body ?? {}
    const { wabaId, phoneNumberId, accessToken, metaAppSecret, channelType } = body

    if (channelType && !VALID_CHANNEL_TYPES.includes(channelType)) {
      return reply.status(400).send({ error: `Invalid channelType. Valid: ${VALID_CHANNEL_TYPES.join(', ')}` })
    }

    // Validate: at least one field provided
    if (!wabaId && !phoneNumberId && !accessToken && !metaAppSecret) {
      return reply.status(400).send({ error: 'Provide at least one credential field (wabaId, phoneNumberId, accessToken, or metaAppSecret).' })
    }

    // Build credential payload to encrypt
    const credPayload: Record<string, string> = {}
    if (wabaId)        credPayload.wabaId        = wabaId.trim()
    if (phoneNumberId) credPayload.phoneNumberId = phoneNumberId.trim()
    if (accessToken)   credPayload.accessToken   = accessToken.trim()
    if (metaAppSecret) credPayload.metaAppSecret  = metaAppSecret.trim()

    const credentialLast4 = accessToken ? extractLast4(accessToken) : null

    let credentialRef: string | null = null
    let storedStatus: CredentialStatus

    if (isVaultConfigured()) {
      // Encrypt the credential payload
      credentialRef = encryptApiKey(JSON.stringify(credPayload))
      storedStatus  = CredentialStatus.ENCRYPTED_STORED
    } else {
      // Vault not configured — store redacted placeholder only
      credentialRef = null
      storedStatus  = CredentialStatus.DRAFT
    }

    const draft = await prisma.channelSetupDraft.upsert({
      where:  { tenantId },
      update: {
        credentialRef,
        credentialLast4,
        credentialStatus: storedStatus,
        setupStatus:      ChannelSetupStatus.CREDENTIALS_SAVED,
        ...(channelType ? { channelType } : {}),
      },
      create: {
        tenantId,
        credentialRef,
        credentialLast4,
        credentialStatus: storedStatus,
        setupStatus:      ChannelSetupStatus.CREDENTIALS_SAVED,
        channelType:      channelType ?? null,
      },
    })

    return {
      saved:            true,
      credentialStatus: draft.credentialStatus,
      credentialLast4:  draft.credentialLast4,
      setupStatus:      draft.setupStatus,
      vaultConfigured:  isVaultConfigured(),
      note: isVaultConfigured()
        ? 'Credentials encrypted and stored. Raw values are not retained or returned.'
        : 'Vault not configured (OMNI_API_KEY_ENCRYPTION_SECRET missing). Credential status saved as DRAFT — no encryption applied. Configure vault to store encrypted credentials.',
      tenantId,
    }
  })

  // ── GET /channels/setup/credentials-status ────────────────────────────────
  // Returns credential metadata only — never returns raw or decrypted values
  app.get('/credentials-status', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const draft = await getOrCreateDraft(tenantId)

    return {
      tenantId,
      credentialStatus:  draft.credentialStatus,
      credentialLast4:   draft.credentialLast4,    // safe display hint only
      setupStatus:       draft.setupStatus,
      channelType:       draft.channelType,
      vaultConfigured:   isVaultConfigured(),
      hasStoredRef:      !!draft.credentialRef,    // boolean only — never the ref itself
      note:              'Credential metadata only. Raw credentials are never returned.',
    }
  })

  // ── DELETE /channels/setup/credentials ───────────────────────────────────
  app.delete('/credentials', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)

    const draft = await prisma.channelSetupDraft.upsert({
      where:  { tenantId },
      update: {
        credentialRef:    null,
        credentialLast4:  null,
        credentialStatus: CredentialStatus.NONE,
        setupStatus:      ChannelSetupStatus.READY_FOR_CREDENTIALS,
      },
      create: {
        tenantId,
        credentialStatus: CredentialStatus.NONE,
        setupStatus:      ChannelSetupStatus.READY_FOR_CREDENTIALS,
      },
    })

    return {
      cleared:          true,
      credentialStatus: draft.credentialStatus,
      setupStatus:      draft.setupStatus,
      tenantId,
      note: 'Credential ref cleared. No stored credentials remain.',
    }
  })

  // ── POST /channels/setup/request-activation ───────────────────────────────
  // Guarded: blocked by default unless explicit env flags are set.
  // Tests MUST keep OMNI_ALLOW_WA_SESSION and OMNI_ENABLE_REAL_META_SEND as false/unset.
  app.post('/request-activation', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const draft = await getOrCreateDraft(tenantId)

    const waSessionAllowed  = process.env.OMNI_ALLOW_WA_SESSION     === 'true'
    const metaSendAllowed   = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'

    const channelType = draft.channelType
    const missingConditions: string[] = []

    if (!channelType) {
      missingConditions.push('channelType not set — save a draft first')
    }
    if (draft.credentialStatus !== CredentialStatus.ENCRYPTED_STORED && draft.credentialStatus !== CredentialStatus.DRAFT && channelType === 'META_WA_BUSINESS') {
      missingConditions.push('credential status must be ENCRYPTED_STORED or DRAFT for META_WA_BUSINESS')
    }
    if (channelType === 'WA_WEB' && !waSessionAllowed) {
      missingConditions.push('OMNI_ALLOW_WA_SESSION=true not set (required for WA_WEB activation)')
    }
    if (channelType === 'META_WA_BUSINESS' && !metaSendAllowed) {
      missingConditions.push('OMNI_ENABLE_REAL_META_SEND=true not set (required for META_WA_BUSINESS activation)')
    }

    const isBlocked = missingConditions.length > 0

    if (!isBlocked) {
      await prisma.channelSetupDraft.update({
        where: { tenantId },
        data:  { setupStatus: ChannelSetupStatus.ACTIVATION_PENDING },
      })
    }

    return {
      tenantId,
      activated:            false,                // never activated in default mode
      blocked:              isBlocked,
      missingConditions,
      setupStatus:          isBlocked ? draft.setupStatus : ChannelSetupStatus.ACTIVATION_PENDING,
      realWaSessionEnabled: waSessionAllowed,     // mirrors actual env flag
      realMetaSendEnabled:  metaSendAllowed,
      note: isBlocked
        ? `Activation blocked. Missing: ${missingConditions.join('; ')}`
        : 'Activation request pending. Real channel connection still requires confirm-activation.',
    }
  })

  // ── POST /channels/setup/confirm-activation ───────────────────────────────
  // Final activation gate. Blocked by default.
  // Even with ACTIVATION_PENDING status, real session/send is never started here
  // without explicit env flags AND separate credential validation.
  app.post('/confirm-activation', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const draft = await getOrCreateDraft(tenantId)

    const waSessionAllowed  = process.env.OMNI_ALLOW_WA_SESSION     === 'true'
    const metaSendAllowed   = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'

    const channelType = draft.channelType
    const blockers: string[] = []

    if (draft.setupStatus !== ChannelSetupStatus.ACTIVATION_PENDING) {
      blockers.push(`setupStatus must be ACTIVATION_PENDING (current: ${draft.setupStatus}) — call request-activation first`)
    }
    if (channelType === 'WA_WEB' && !waSessionAllowed) {
      blockers.push('OMNI_ALLOW_WA_SESSION=true not set')
    }
    if (channelType === 'META_WA_BUSINESS' && !metaSendAllowed) {
      blockers.push('OMNI_ENABLE_REAL_META_SEND=true not set')
    }
    if (channelType === 'META_WA_BUSINESS' && draft.credentialStatus !== CredentialStatus.ENCRYPTED_STORED) {
      blockers.push('credentials must be ENCRYPTED_STORED for META_WA_BUSINESS')
    }

    const activated = blockers.length === 0

    if (activated) {
      await prisma.channelSetupDraft.update({
        where: { tenantId },
        data:  { setupStatus: ChannelSetupStatus.ACTIVE },
      })
    }

    return {
      tenantId,
      activated,
      blocked:              !activated,
      blockers,
      setupStatus:          activated ? ChannelSetupStatus.ACTIVE : draft.setupStatus,
      realWaSessionEnabled: waSessionAllowed,
      realMetaSendEnabled:  metaSendAllowed,
      realSessionStarted:   false,    // QR/session start is a separate guarded step (Phase 14)
      realSendEnabled:      false,
      note: activated
        ? 'Setup draft marked ACTIVE. Real channel session start (QR/Meta webhook) is a separate step — see /channels/setup/status for next steps.'
        : `Activation confirm blocked. ${blockers.join('; ')}`,
    }
  })
}
