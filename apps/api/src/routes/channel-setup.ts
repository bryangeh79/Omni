// Channel Setup Wizard API — Phase 13A + 13B + 14A
//
// Phase 13A:
// GET  /channels/setup/status           — persisted draft state (no secrets)
// POST /channels/setup/save-draft       — persist draft to DB
// POST /channels/setup/test             — stub test + update DB testStatus
// POST /channels/setup/credentials-draft — encrypt & store credential ref (no plaintext in response)
// GET  /channels/setup/credentials-status — credential metadata only (never raw values)
// DELETE /channels/setup/credentials   — clear stored credential ref
// POST /channels/setup/request-activation — guarded; blocked by default without env flags
// POST /channels/setup/confirm-activation — guarded; blocked by default without env flags
//
// Phase 13B:
// GET  /channels/setup/meta-webhook/status   — Meta webhook wizard state (no secrets)
// POST /channels/setup/meta-webhook/save-draft — save webhook wizard progress
// POST /channels/setup/meta-webhook/test-stub  — stub webhook test (no Meta API call)
// GET  /channels/setup/launch-checklist       — deterministic launch readiness checklist
// POST /channels/setup/test-message-stub      — stub send preview (never sends)
//
// Phase 14A:
// GET  /channels/setup/wa-web/status         — WA Web activation readiness (no session secrets)
// POST /channels/setup/wa-web/request-qr     — guarded QR request (blocked without env flag)
// GET  /channels/setup/wa-web/session-status — safe session status summary
// POST /channels/setup/wa-web/disconnect     — safe disconnect (guarded)
// GET  /channels/setup/meta-webhook/live-status    — Meta live verification readiness
// POST /channels/setup/meta-webhook/request-live-test — guarded live test (blocked by default)
// POST /channels/setup/meta-webhook/confirm-live-test — guarded live confirm (blocked by default)
// GET  /channels/setup/health              — channel health summary (no secrets)
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 13B: Meta Webhook Setup Wizard
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /channels/setup/meta-webhook/status ───────────────────────────────
  // Returns webhook wizard state — no secrets, no verify tokens
  app.get('/meta-webhook/status', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const draft = await getOrCreateDraft(tenantId)

    // Parse webhook wizard progress from activationNotes JSON
    let webhookProgress: Record<string, unknown> = {}
    try {
      if (draft.activationNotes) {
        const parsed = JSON.parse(draft.activationNotes) as Record<string, unknown>
        if (parsed.webhookWizard) webhookProgress = parsed.webhookWizard as Record<string, unknown>
      }
    } catch { /* ignore parse errors — treat as empty */ }

    return {
      tenantId,
      channelType:          draft.channelType,
      credentialStatus:     draft.credentialStatus,
      webhookSubscribed:    webhookProgress.webhookSubscribed ?? false,
      verifyTokenSet:       webhookProgress.verifyTokenSet ?? false,
      verifyTokenLast4:     webhookProgress.verifyTokenLast4 ?? null,  // safe display only
      stepCompleted:        webhookProgress.stepCompleted ?? 0,
      webhookCallbackNote:  'Callback URL: {your-api-base}/webhook/meta — configure in Meta App Dashboard',
      realMetaSendEnabled:  false,
      note: 'Webhook setup wizard state. No raw tokens returned.',
    }
  })

  // ── POST /channels/setup/meta-webhook/save-draft ──────────────────────────
  // Save webhook wizard progress — stores progress in activationNotes JSON
  app.post<{
    Body: {
      webhookSubscribed?:  boolean
      verifyTokenHint?:    string   // only last 4 chars stored; never echoed raw
      stepCompleted?:      number
      wabaId?:             string
      phoneNumberId?:      string
    }
  }>('/meta-webhook/save-draft', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const { webhookSubscribed, verifyTokenHint, stepCompleted, wabaId, phoneNumberId } = req.body ?? {}

    const draft = await getOrCreateDraft(tenantId)

    // Parse existing activationNotes
    let notes: Record<string, unknown> = {}
    try {
      if (draft.activationNotes) notes = JSON.parse(draft.activationNotes) as Record<string, unknown>
    } catch { /* ignore */ }

    // Update webhook wizard progress
    const existingWizard = (notes.webhookWizard as Record<string, unknown>) ?? {}
    const verifyTokenLast4 = verifyTokenHint ? verifyTokenHint.trim().slice(-4) : (existingWizard.verifyTokenLast4 ?? null)

    notes.webhookWizard = {
      ...existingWizard,
      ...(webhookSubscribed !== undefined ? { webhookSubscribed } : {}),
      ...(verifyTokenHint   !== undefined ? { verifyTokenSet: true, verifyTokenLast4 } : {}),
      ...(stepCompleted     !== undefined ? { stepCompleted } : {}),
      ...(wabaId            !== undefined ? { wabaIdSet: true } : {}),
      ...(phoneNumberId     !== undefined ? { phoneNumberIdSet: true } : {}),
      savedAt: new Date().toISOString(),
    }

    await prisma.channelSetupDraft.update({
      where: { tenantId },
      data:  { activationNotes: JSON.stringify(notes) },
    })

    return {
      saved:              true,
      tenantId,
      stepCompleted:      notes.webhookWizard && typeof (notes.webhookWizard as Record<string, unknown>).stepCompleted === 'number'
        ? (notes.webhookWizard as Record<string, unknown>).stepCompleted
        : 0,
      webhookSubscribed:  !!(notes.webhookWizard as Record<string, unknown>).webhookSubscribed,
      verifyTokenSet:     !!(notes.webhookWizard as Record<string, unknown>).verifyTokenSet,
      verifyTokenLast4:   (notes.webhookWizard as Record<string, unknown>).verifyTokenLast4 ?? null,
      note: 'Webhook wizard progress saved. No raw tokens stored or returned.',
    }
  })

  // ── POST /channels/setup/meta-webhook/test-stub ───────────────────────────
  // Stub webhook test — NEVER calls real Meta API
  app.post('/meta-webhook/test-stub', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return {
      tenantId,
      testResult:       'STUB',
      metaApiCalled:    false,
      webhookVerified:  false,
      note: 'Safe stub test. Real webhook verification requires Meta App Dashboard configuration and real credentials.',
      realMetaSendEnabled: false,
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 13B: Launch Checklist
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /channels/setup/launch-checklist ─────────────────────────────────
  // Deterministic readiness checklist — no real calls, no secrets
  app.get('/launch-checklist', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)

    // Fetch all relevant state in parallel
    const [onboarding, kbCount, draft, followUpRuleCount] = await Promise.all([
      prisma.onboardingDraft.findUnique({ where: { tenantId } }),
      prisma.knowledgeItem.count({ where: { tenantId, isActive: true } }),
      prisma.channelSetupDraft.findUnique({ where: { tenantId } }),
      prisma.followUpRule.count({ where: { tenantId } }),
    ])

    const waSessionAllowed  = process.env.OMNI_ALLOW_WA_SESSION     === 'true'
    const metaSendAllowed   = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'
    const aiEnabled         = process.env.OMNI_ENABLE_ONBOARDING_AI  === 'true'

    const onboardingCompleted = onboarding?.status === 'ENABLED'
    const kbReady             = kbCount > 0
    const channelTypeSaved    = !!draft?.channelType
    const credentialsSaved    = draft?.credentialStatus === 'ENCRYPTED_STORED' || draft?.credentialStatus === 'DRAFT'
    const stubTestDone        = draft?.setupStatus !== 'DRAFT' && !!draft?.lastTestAt
    const activationRequested = draft?.setupStatus === 'ACTIVATION_PENDING' || draft?.setupStatus === 'ACTIVE'
    const followUpReady       = followUpRuleCount > 0

    const items = [
      {
        key:     'onboarding_completed',
        label:   'Onboarding wizard completed',
        status:  onboardingCompleted ? 'DONE' : 'PENDING',
        action:  '/onboarding',
        detail:  onboardingCompleted ? 'Enabled' : 'Complete onboarding wizard first',
      },
      {
        key:     'knowledge_base_ready',
        label:   'Knowledge base has active items',
        status:  kbReady ? 'DONE' : 'WARN',
        action:  '/knowledge',
        detail:  kbReady ? `${kbCount} active item${kbCount !== 1 ? 's' : ''}` : 'Add product/service materials in onboarding or manually',
      },
      {
        key:     'channel_type_saved',
        label:   'Channel type selected and draft saved',
        status:  channelTypeSaved ? 'DONE' : 'PENDING',
        action:  '/channels/setup',
        detail:  channelTypeSaved ? `Type: ${draft?.channelType}` : 'Choose WA_WEB or META_WA_BUSINESS',
      },
      {
        key:     'credentials_saved',
        label:   'Channel credentials configured (Meta API)',
        status:  credentialsSaved ? 'DONE' : (draft?.channelType === 'META_WA_BUSINESS' ? 'PENDING' : 'SKIP'),
        action:  '/channels/setup',
        detail:  credentialsSaved ? `Credential status: ${draft?.credentialStatus}` : (draft?.channelType !== 'META_WA_BUSINESS' ? 'Not required for WA_WEB' : 'Save Meta API credentials'),
      },
      {
        key:     'stub_test_done',
        label:   'Stub connection test completed',
        status:  stubTestDone ? 'DONE' : 'PENDING',
        action:  '/channels/setup',
        detail:  stubTestDone ? `Last test: ${draft?.lastTestAt?.toISOString() ?? 'unknown'}` : 'Run stub test from channel setup',
      },
      {
        key:     'activation_requested',
        label:   'Activation requested',
        status:  activationRequested ? 'DONE' : 'PENDING',
        action:  '/channels/setup',
        detail:  activationRequested ? `Status: ${draft?.setupStatus}` : 'Request activation from channel setup',
      },
      {
        key:     'follow_up_rules',
        label:   'Follow-up automation rules configured',
        status:  followUpReady ? 'DONE' : 'WARN',
        action:  '/boss',
        detail:  followUpReady ? `${followUpRuleCount} rule${followUpRuleCount !== 1 ? 's' : ''} configured` : 'Optional — configure follow-up rules for better conversion',
      },
      {
        key:     'real_wa_session_flag',
        label:   'OMNI_ALLOW_WA_SESSION enabled (WA Web activation)',
        status:  waSessionAllowed ? 'DONE' : 'BLOCKED',
        action:  null,
        detail:  waSessionAllowed ? 'Enabled by operator' : 'Operator must set OMNI_ALLOW_WA_SESSION=true in .env to activate WA Web',
      },
      {
        key:     'real_meta_send_flag',
        label:   'OMNI_ENABLE_REAL_META_SEND enabled (Meta API activation)',
        status:  metaSendAllowed ? 'DONE' : 'BLOCKED',
        action:  null,
        detail:  metaSendAllowed ? 'Enabled by operator' : 'Operator must set OMNI_ENABLE_REAL_META_SEND=true in .env to activate Meta API',
      },
    ]

    // Determine overall launch status
    const criticalPending = items
      .filter(i => i.status === 'PENDING' && ['onboarding_completed', 'channel_type_saved'].includes(i.key))
      .length

    const allFlagsBlocked = !waSessionAllowed && !metaSendAllowed
    const basicConfigDone = onboardingCompleted && channelTypeSaved

    let launchStatus: string
    let launchNote: string

    if (criticalPending > 0) {
      launchStatus = 'NOT_READY'
      launchNote   = 'Complete onboarding and choose a channel type before proceeding.'
    } else if (!basicConfigDone) {
      launchStatus = 'NOT_READY'
      launchNote   = 'Basic configuration incomplete.'
    } else if (allFlagsBlocked) {
      launchStatus = 'READY_FOR_STAGING'
      launchNote   = 'Configuration is ready. Real sending is disabled by default — operator must enable flags for live use.'
    } else {
      launchStatus = 'READY_FOR_PRODUCTION_REVIEW'
      launchNote   = 'Real send flag(s) are enabled. Review all settings before going live.'
    }

    return {
      tenantId,
      launchStatus,
      launchNote,
      items,
      summary: {
        done:    items.filter(i => i.status === 'DONE').length,
        pending: items.filter(i => i.status === 'PENDING').length,
        warn:    items.filter(i => i.status === 'WARN').length,
        blocked: items.filter(i => i.status === 'BLOCKED').length,
        skip:    items.filter(i => i.status === 'SKIP').length,
      },
      safety: {
        realWaSessionEnabled:  waSessionAllowed,
        realMetaSendEnabled:   metaSendAllowed,
        aiProviderEnabled:     aiEnabled,
        realSendActive:        false,  // always false in this response
      },
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 13B: Test Message Stub
  // ═══════════════════════════════════════════════════════════════════════════

  // ── POST /channels/setup/test-message-stub ────────────────────────────────
  // Accepts a fake phone/message but NEVER sends anything.
  // Returns a preview of what would be sent and sendStatus=STUB_NOT_SENT.
  app.post<{
    Body: {
      toPhone?:    string
      message?:    string
      channelType?: string
    }
  }>('/test-message-stub', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { toPhone, message, channelType } = req.body ?? {}

    if (!toPhone || !message) {
      return reply.status(400).send({ error: 'toPhone and message are required for test message stub.' })
    }

    const draft = await getOrCreateDraft(tenantId)
    const effectiveChannelType = channelType ?? draft.channelType ?? 'UNKNOWN'

    // Mask phone for response (show only last 4)
    const phoneMasked = toPhone.trim().length >= 4
      ? `****${toPhone.trim().slice(-4)}`
      : '****'

    return {
      tenantId,
      sendStatus:       'STUB_NOT_SENT',
      toPhoneMasked:    phoneMasked,
      channelType:      effectiveChannelType,
      messagePreview:   message.trim().slice(0, 200),  // truncated preview only
      wouldSendLength:  message.trim().length,
      realSent:         false,
      metaApiCalled:    false,
      waSessionUsed:    false,
      blockedReason:    'Real sending disabled by default. Set OMNI_ENABLE_REAL_META_SEND=true or OMNI_ALLOW_WA_SESSION=true to enable.',
      channelReady:     draft.setupStatus === 'ACTIVE',
      note: 'Safe stub. No WhatsApp message was sent. Raw phone number is not stored or returned.',
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 14A: WA Web Guarded Activation Foundation
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /channels/setup/wa-web/status ────────────────────────────────────
  // Safe WA Web activation readiness — no session data, no secrets
  app.get('/wa-web/status', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const draft = await getOrCreateDraft(tenantId)
    const waSessionAllowed = process.env.OMNI_ALLOW_WA_SESSION === 'true'

    // Check if a real channel exists for this tenant (WA_WEB type)
    const existingChannel = await prisma.channel.findFirst({
      where: { tenantId, type: 'WHATSAPP_WEB' },
      select: { id: true, isActive: true, createdAt: true },
    })

    return {
      tenantId,
      channelType:         draft.channelType,
      setupStatus:         draft.setupStatus,
      waSessionAllowed,
      sessionStatus:       waSessionAllowed ? (existingChannel ? (existingChannel.isActive ? 'CONNECTED' : 'NOT_CONNECTED') : 'NOT_STARTED') : 'BLOCKED',
      channelExists:       !!existingChannel,
      channelIsActive:     existingChannel?.isActive ?? false,
      qrAvailable:         false,         // QR is only via /channels/whatsapp-web/:id/qr
      missingConditions:   waSessionAllowed ? [] : ['OMNI_ALLOW_WA_SESSION=true not set — operator must enable before WA Web activation'],
      realSessionStarted:  false,         // Phase 14A never starts a real session from setup routes
      note: waSessionAllowed
        ? 'WA Web session flag is enabled. Use POST /channels/setup/wa-web/request-qr to initiate (if further conditions met).'
        : 'WA Web session is blocked by default. OMNI_ALLOW_WA_SESSION must be set to true by operator.',
    }
  })

  // ── POST /channels/setup/wa-web/request-qr ───────────────────────────────
  // Guarded QR request — blocked unless OMNI_ALLOW_WA_SESSION=true
  // Even when allowed, returns NOT_IMPLEMENTED_GUARDED (real QR is via /channels/whatsapp-web)
  app.post('/wa-web/request-qr', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const waSessionAllowed = process.env.OMNI_ALLOW_WA_SESSION === 'true'

    if (!waSessionAllowed) {
      return {
        tenantId,
        qrIssued:          false,
        blocked:           true,
        missingConditions: ['OMNI_ALLOW_WA_SESSION=true not set — operator must set this env var to allow WA Web session start'],
        realSessionStarted: false,
        note: 'QR request blocked. OMNI_ALLOW_WA_SESSION must be true before a WA Web session can start.',
      }
    }

    // Flag is set — delegate to real session adapter via safe reference
    // Real QR generation is implemented at POST /channels/whatsapp-web/connect
    return {
      tenantId,
      qrIssued:          false,
      blocked:           false,
      implementationStatus: 'GUARDED_REDIRECT',
      realSessionStarted:   false,
      note: 'OMNI_ALLOW_WA_SESSION is set. Use POST /channels/whatsapp-web/connect to start a session and poll GET /channels/whatsapp-web/:id/qr for the QR code.',
      nextStep: 'POST /channels/whatsapp-web/connect',
    }
  })

  // ── GET /channels/setup/wa-web/session-status ─────────────────────────────
  // Safe session status — no QR payload, no raw session data
  app.get('/wa-web/session-status', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const waSessionAllowed = process.env.OMNI_ALLOW_WA_SESSION === 'true'

    const channel = await prisma.channel.findFirst({
      where: { tenantId, type: 'WHATSAPP_WEB' },
      select: { id: true, isActive: true, waWebSessionRef: true, createdAt: true, updatedAt: true },
    })

    return {
      tenantId,
      waSessionAllowed,
      channelExists:      !!channel,
      channelIsActive:    channel?.isActive ?? false,
      hasSessionRef:      !!channel?.waWebSessionRef,  // boolean only — never the ref
      sessionStatus:      !waSessionAllowed ? 'BLOCKED' : !channel ? 'NOT_STARTED' : channel.isActive ? 'CONNECTED' : 'NOT_CONNECTED',
      lastUpdatedAt:      channel?.updatedAt ?? null,
      realSessionData:    false,   // raw session data never returned
      note: 'Session status summary only. No raw session data returned.',
    }
  })

  // ── POST /channels/setup/wa-web/disconnect ────────────────────────────────
  // Safe disconnect — removes channel record if it exists, no broad kills
  app.post('/wa-web/disconnect', { preHandler: requireAuth }, async (req, _reply) => {
    const { tenantId } = getAuthUser(req)
    const waSessionAllowed = process.env.OMNI_ALLOW_WA_SESSION === 'true'

    if (!waSessionAllowed) {
      return {
        tenantId,
        disconnected:      false,
        blocked:           true,
        note: 'WA Web session is not active (OMNI_ALLOW_WA_SESSION not set). Nothing to disconnect.',
      }
    }

    const channel = await prisma.channel.findFirst({
      where:  { tenantId, type: 'WHATSAPP_WEB' },
      select: { id: true },
    })

    if (!channel) {
      return {
        tenantId,
        disconnected: false,
        channelFound: false,
        note: 'No WA Web channel found for this tenant.',
      }
    }

    // Mark channel inactive (do not delete — preserves conversation history)
    await prisma.channel.update({
      where: { id: channel.id },
      data:  { isActive: false },
    })

    return {
      tenantId,
      disconnected:  true,
      channelId:     channel.id,
      channelActive: false,
      note: 'Channel marked inactive. Session adapter cleanup requires a process restart or explicit adapter disconnect via /channels/whatsapp-web/:id/disconnect.',
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 14A: Meta Live Webhook Verification Guardrails
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /channels/setup/meta-webhook/live-status ──────────────────────────
  app.get('/meta-webhook/live-status', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const draft = await getOrCreateDraft(tenantId)
    const metaSendAllowed = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'

    // Parse webhook progress from activationNotes
    let webhookProgress: Record<string, unknown> = {}
    try {
      if (draft.activationNotes) {
        const parsed = JSON.parse(draft.activationNotes) as Record<string, unknown>
        if (parsed.webhookWizard) webhookProgress = parsed.webhookWizard as Record<string, unknown>
      }
    } catch { /* ignore */ }

    const credentialsSaved    = draft.credentialStatus === 'ENCRYPTED_STORED' || draft.credentialStatus === 'DRAFT'
    const webhookSubscribed   = !!(webhookProgress.webhookSubscribed)
    const verifyTokenSet      = !!(webhookProgress.verifyTokenSet)

    const missingConditions: string[] = []
    if (!metaSendAllowed)      missingConditions.push('OMNI_ENABLE_REAL_META_SEND=true not set')
    if (!credentialsSaved)     missingConditions.push('credentials not saved (run /channels/setup/credentials-draft)')
    if (!webhookSubscribed)    missingConditions.push('webhook not subscribed in Meta App Dashboard')
    if (!verifyTokenSet)       missingConditions.push('verify token not saved')

    let liveStatus: string
    if (!metaSendAllowed)           liveStatus = 'BLOCKED_FLAG'
    else if (!credentialsSaved)     liveStatus = 'BLOCKED_NO_CREDENTIALS'
    else if (!webhookSubscribed)    liveStatus = 'BLOCKED_NO_WEBHOOK'
    else                            liveStatus = 'READY_FOR_LIVE_TEST'

    return {
      tenantId,
      liveStatus,
      metaSendAllowed,
      credentialStatus:   draft.credentialStatus,
      webhookSubscribed,
      verifyTokenSet,
      missingConditions,
      realMetaApiCalled:  false,
      note: missingConditions.length === 0
        ? 'All conditions met. Use request-live-test to initiate (operator-gated).'
        : `Live verification blocked. Missing: ${missingConditions.join('; ')}`,
    }
  })

  // ── POST /channels/setup/meta-webhook/request-live-test ──────────────────
  // Guarded: blocked by default without OMNI_ENABLE_REAL_META_SEND + credentials
  app.post('/meta-webhook/request-live-test', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const draft = await getOrCreateDraft(tenantId)
    const metaSendAllowed   = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'
    const credentialsSaved  = draft.credentialStatus === 'ENCRYPTED_STORED'

    const missing: string[] = []
    if (!metaSendAllowed)   missing.push('OMNI_ENABLE_REAL_META_SEND=true not set')
    if (!credentialsSaved)  missing.push('credentialStatus must be ENCRYPTED_STORED (not DRAFT or NONE)')

    return {
      tenantId,
      testInitiated:      false,
      blocked:            missing.length > 0,
      missingConditions:  missing,
      realMetaApiCalled:  false,
      note: missing.length > 0
        ? `Live test blocked. ${missing.join('; ')}`
        : 'Conditions met — real Meta API live test would initiate here. NOT_IMPLEMENTED_GUARDED: real webhook delivery test requires Phase 14B implementation.',
    }
  })

  // ── POST /channels/setup/meta-webhook/confirm-live-test ──────────────────
  // Final live test confirmation — safe by default
  app.post('/meta-webhook/confirm-live-test', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const metaSendAllowed = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'

    return {
      tenantId,
      confirmed:         false,
      blocked:           !metaSendAllowed,
      realMetaApiCalled: false,
      realSendEnabled:   metaSendAllowed,
      note: metaSendAllowed
        ? 'OMNI_ENABLE_REAL_META_SEND is set. Real confirmation not yet implemented (Phase 14B).'
        : 'Live test confirm blocked. OMNI_ENABLE_REAL_META_SEND=true required.',
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 14A: Channel Health Summary
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /channels/setup/health ────────────────────────────────────────────
  // Deterministic channel health — no secrets, no external calls
  app.get('/health', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const draft = await getOrCreateDraft(tenantId)
    const waSessionAllowed  = process.env.OMNI_ALLOW_WA_SESSION     === 'true'
    const metaSendAllowed   = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'

    // Check real channels
    const waChannel = await prisma.channel.findFirst({
      where:  { tenantId, type: 'WHATSAPP_WEB' },
      select: { id: true, isActive: true, updatedAt: true },
    })
    const metaChannel = await prisma.channel.findFirst({
      where:  { tenantId, type: 'META_API' },
      select: { id: true, isActive: true, lastWebhookAt: true, updatedAt: true },
    })

    // Determine WA Web session status
    let waWebSessionStatus: string
    if (!waSessionAllowed)             waWebSessionStatus = 'BLOCKED'
    else if (!waChannel)               waWebSessionStatus = 'NOT_CONNECTED'
    else if (waChannel.isActive)       waWebSessionStatus = 'CONNECTED'
    else                               waWebSessionStatus = 'NOT_CONNECTED'

    // Determine Meta webhook status
    let metaWebhookStatus: string
    if (!draft.channelType)                                       metaWebhookStatus = 'NOT_CONFIGURED'
    else if (draft.channelType !== 'META_WA_BUSINESS')           metaWebhookStatus = 'NOT_APPLICABLE'
    else if (!metaSendAllowed)                                   metaWebhookStatus = 'BLOCKED'
    else if (metaChannel?.isActive && metaChannel.lastWebhookAt) metaWebhookStatus = 'LIVE_VERIFIED'
    else if (draft.setupStatus === 'ACTIVATION_PENDING')         metaWebhookStatus = 'LIVE_PENDING'
    else if (draft.setupStatus === 'TESTED_STUB')                metaWebhookStatus = 'STUB_TESTED'
    else                                                         metaWebhookStatus = 'NOT_CONFIGURED'

    // Determine health level
    const channelType = draft.channelType
    let healthLevel: string
    let recommendedAction: string

    if (!channelType) {
      healthLevel       = 'BLOCKED'
      recommendedAction = 'Choose a channel type at /channels/setup'
    } else if (channelType === 'WA_WEB' && waWebSessionStatus === 'CONNECTED') {
      healthLevel       = 'OK'
      recommendedAction = 'Channel is connected. Monitor via /inbox and /boss.'
    } else if (channelType === 'META_WA_BUSINESS' && metaWebhookStatus === 'LIVE_VERIFIED') {
      healthLevel       = 'OK'
      recommendedAction = 'Meta channel live. Monitor via /inbox and /boss.'
    } else if (draft.setupStatus === 'DRAFT') {
      healthLevel       = 'BLOCKED'
      recommendedAction = 'Complete channel setup at /channels/setup'
    } else if (!waSessionAllowed && !metaSendAllowed) {
      healthLevel       = 'WARN'
      recommendedAction = 'Configuration saved. Operator must enable real send flags to go live.'
    } else {
      healthLevel       = 'WARN'
      recommendedAction = 'Channel configured but not yet live. Complete activation steps.'
    }

    return {
      tenantId,
      channelType,
      setupStatus:         draft.setupStatus,
      credentialStatus:    draft.credentialStatus,
      lastTestAt:          draft.lastTestAt,
      waWebSessionStatus,
      metaWebhookStatus,
      realSendEnabled:     false,   // always false in response — safety
      healthLevel,
      recommendedAction,
      waSessionAllowed,
      metaSendAllowed,
    }
  })
}
