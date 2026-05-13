// Activation API — Phase 16A
//
// GET  /activation/preflight  — tenant-scoped pre-activation readiness checks (requireAuth)
// POST /activation/dry-run    — simulate what an activation would check, never enables real send (requireAuth)
// GET  /activation/health     — safe local health summary post-activation (requireAuth)
//
// Safety contract:
//   - Never enables real send (OMNI_ALLOW_WA_SESSION / OMNI_ENABLE_REAL_META_SEND must remain unchanged)
//   - No real external calls to WhatsApp/Meta/AI/email
//   - No secrets in responses
//   - All endpoints auth-required, tenant-scoped via JWT

import type { FastifyInstance } from 'fastify'
import { prisma }               from '@omni/db'
import { requireAuth, getAuthUser } from '../auth'
import { createAuditLog }           from '../lib/audit'

type ReadinessLevel =
  | 'BLOCKED'
  | 'READY_FOR_OPERATOR_REVIEW'
  | 'READY_FOR_STAGING'
  | 'READY_FOR_LIVE_REVIEW'

function computeReadiness(checks: { key: string; passed: boolean; required: boolean }[]): ReadinessLevel {
  const criticalFailed = checks.filter(c => c.required && !c.passed)
  if (criticalFailed.length > 0) return 'BLOCKED'
  const allPassed = checks.every(c => c.passed)
  const waSessionAllowed = process.env.OMNI_ALLOW_WA_SESSION     === 'true'
  const metaSendAllowed  = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'
  if (allPassed && (waSessionAllowed || metaSendAllowed)) return 'READY_FOR_LIVE_REVIEW'
  if (allPassed) return 'READY_FOR_STAGING'
  return 'READY_FOR_OPERATOR_REVIEW'
}

export async function activationRoutes(app: FastifyInstance) {

  // ── GET /activation/preflight ─────────────────────────────────────────────
  app.get('/preflight', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)

    const [onboarding, kbCount, draft, users, tenant, auditCount, channels] = await Promise.all([
      prisma.onboardingDraft.findUnique({ where: { tenantId } }),
      prisma.knowledgeItem.count({ where: { tenantId, isActive: true } }),
      prisma.channelSetupDraft.findUnique({ where: { tenantId } }),
      prisma.user.findMany({
        where:  { tenantId, isActive: true },
        select: { id: true, role: true },
      }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { isActive: true, plan: true } }),
      prisma.auditLog.count({ where: { tenantId } }),
      prisma.channel.findMany({
        where:  { tenantId, isActive: true },
        select: { id: true, type: true, isActive: true },
      }),
    ])

    const waSessionAllowed = process.env.OMNI_ALLOW_WA_SESSION     === 'true'
    const metaSendAllowed  = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'
    const vaultConfigured  = !!process.env.OMNI_API_KEY_ENCRYPTION_SECRET
    const adminUsers       = users.filter(u => ['OWNER', 'ADMIN'].includes(u.role))

    const checks = [
      {
        key:          'onboarding_enabled',
        label:        'Onboarding wizard completed',
        passed:       onboarding?.status === 'ENABLED',
        required:     true,
        detail:       onboarding?.status === 'ENABLED' ? 'Status: ENABLED' : 'Complete the onboarding wizard first',
        action:       '/onboarding',
      },
      {
        key:          'knowledge_items',
        label:        'Knowledge base has active items',
        passed:       kbCount > 0,
        required:     false,
        detail:       kbCount > 0 ? `${kbCount} active items` : 'Add KB items for better AI responses',
        action:       '/knowledge',
      },
      {
        key:          'channel_configured',
        label:        'Channel type selected and configured',
        passed:       !!draft?.channelType,
        required:     true,
        detail:       draft?.channelType ? `Type: ${draft.channelType}, Status: ${draft.setupStatus}` : 'Configure a channel first',
        action:       '/channels/setup',
      },
      {
        key:          'channel_tested',
        label:        'Channel stub test completed',
        passed:       !!draft?.lastTestAt,
        required:     false,
        detail:       draft?.lastTestAt ? `Last test: ${draft.lastTestAt.toISOString()}` : 'Run a stub test to verify setup',
        action:       '/channels/setup',
      },
      {
        key:          'credentials_ready',
        label:        'Channel credentials stored (draft or encrypted)',
        passed:       draft?.credentialStatus !== 'NONE',
        required:     false,
        detail:       draft?.credentialStatus === 'ENCRYPTED_STORED'
          ? 'Credentials encrypted and stored'
          : draft?.credentialStatus === 'DRAFT'
          ? 'Credentials in draft (vault not configured — add OMNI_API_KEY_ENCRYPTION_SECRET for encryption)'
          : 'No credentials stored yet',
        action:       '/channels/setup',
      },
      {
        key:          'vault_configured',
        label:        'Credential vault configured',
        passed:       vaultConfigured,
        required:     false,
        detail:       vaultConfigured ? 'OMNI_API_KEY_ENCRYPTION_SECRET is set' : 'Not set — required for encrypted credential storage before live',
      },
      {
        key:          'admin_user_exists',
        label:        'Admin or Owner user exists',
        passed:       adminUsers.length > 0,
        required:     true,
        detail:       adminUsers.length > 0 ? `${adminUsers.length} admin/owner user(s)` : 'Create an OWNER or ADMIN user first',
        action:       '/team',
      },
      {
        key:          'tenant_active',
        label:        'Tenant is active',
        passed:       tenant?.isActive === true,
        required:     true,
        detail:       tenant?.isActive ? 'Tenant active' : 'Tenant is not active',
      },
      {
        key:          'audit_active',
        label:        'Audit log active',
        passed:       true,  // AuditLog table always available after Phase 15C
        required:     false,
        detail:       `${auditCount} audit event(s) recorded`,
        action:       '/audit',
      },
      {
        key:          'real_send_flags',
        label:        'Real send flags reviewed',
        passed:       true,  // Always "passed" — just informational
        required:     false,
        detail:       waSessionAllowed || metaSendAllowed
          ? `WARNING: real send flag(s) are currently enabled (waSession=${waSessionAllowed}, metaSend=${metaSendAllowed})`
          : 'Both real send flags are OFF (default safe state)',
      },
      {
        key:          'backup_configured',
        label:        'Database backup configured (manual)',
        passed:       false,  // Always manual
        required:     false,
        detail:       'Operator must configure pg_dump schedule before production launch',
        action:       '/ops/runbook',
      },
      {
        key:          'monitoring_configured',
        label:        'External monitoring configured (manual)',
        passed:       false,  // Always manual
        required:     false,
        detail:       'Operator must configure uptime monitoring on /ops/health',
        action:       '/ops/runbook',
      },
    ]

    const readiness = computeReadiness(checks)
    const passed    = checks.filter(c => c.passed).length
    const failed    = checks.filter(c => !c.passed).length
    const critical  = checks.filter(c => c.required && !c.passed).length

    return {
      tenantId,
      asOf:      new Date().toISOString(),
      readiness,
      summary:   { passed, failed, critical, total: checks.length },
      checks,
      currentFlags: {
        realWaSessionEnabled:  waSessionAllowed,
        realMetaSendEnabled:   metaSendAllowed,
        realSendCurrentlyOff:  !waSessionAllowed && !metaSendAllowed,
        vaultConfigured,
      },
      channelSummary: {
        hasDraft:          !!draft,
        channelType:       draft?.channelType ?? null,
        setupStatus:       draft?.setupStatus ?? 'NOT_STARTED',
        credentialStatus:  draft?.credentialStatus ?? 'NONE',
        activeChannels:    channels.length,
      },
      nextAction: critical > 0
        ? 'Resolve BLOCKED items before proceeding with activation'
        : readiness === 'READY_FOR_STAGING'
        ? 'All checks clear — proceed to dry-run and staging activation'
        : readiness === 'READY_FOR_LIVE_REVIEW'
        ? 'All checks clear and real send flag is active — monitor carefully'
        : 'Review outstanding items then re-run preflight',
      activationGuide: '/activation-guide',
      note: 'This is a deterministic local check. No real API calls made. Real send remains disabled until operator manually changes env flags.',
    }
  })

  // ── POST /activation/dry-run ──────────────────────────────────────────────
  app.post<{
    Body: {
      channelType?:  string
      intendedMode?: string
    }
  }>('/dry-run', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId, userId, role } = getAuthUser(req)
    const { channelType, intendedMode } = req.body ?? {}

    const validChannelTypes = ['WA_WEB', 'META_WA_BUSINESS']
    const validModes        = ['STAGING', 'LIVE_REVIEW']

    if (!channelType || !validChannelTypes.includes(channelType)) {
      return reply.status(400).send({
        error: `channelType required. Valid: ${validChannelTypes.join(', ')}`,
      })
    }
    if (!intendedMode || !validModes.includes(intendedMode)) {
      return reply.status(400).send({
        error: `intendedMode required. Valid: ${validModes.join(', ')}`,
      })
    }

    const waSessionAllowed = process.env.OMNI_ALLOW_WA_SESSION     === 'true'
    const metaSendAllowed  = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'

    const isWaWeb  = channelType === 'WA_WEB'
    const isMeta   = channelType === 'META_WA_BUSINESS'
    const isLive   = intendedMode === 'LIVE_REVIEW'

    // What would be required for the intended mode
    const requiredFlags: string[] = []
    if (isWaWeb  && isLive) requiredFlags.push('OMNI_ALLOW_WA_SESSION=true')
    if (isMeta   && isLive) requiredFlags.push('OMNI_ENABLE_REAL_META_SEND=true')

    // What is currently enabled
    const currentFlagStatus = isWaWeb
      ? { flag: 'OMNI_ALLOW_WA_SESSION', currentValue: waSessionAllowed }
      : { flag: 'OMNI_ENABLE_REAL_META_SEND', currentValue: metaSendAllowed }

    const blockedReasons: string[] = []
    if (isLive && isWaWeb  && !waSessionAllowed) blockedReasons.push('OMNI_ALLOW_WA_SESSION is not set to true')
    if (isLive && isMeta   && !metaSendAllowed)  blockedReasons.push('OMNI_ENABLE_REAL_META_SEND is not set to true')

    // Check preflight-level items
    const [onboarding, draft] = await Promise.all([
      prisma.onboardingDraft.findUnique({ where: { tenantId } }),
      prisma.channelSetupDraft.findUnique({ where: { tenantId } }),
    ])
    if (onboarding?.status !== 'ENABLED') blockedReasons.push('Onboarding not completed')
    if (!draft?.channelType)              blockedReasons.push('No channel type configured')

    const wouldActivate = blockedReasons.length === 0
    const dryRunStatus  = wouldActivate
      ? (isLive ? 'WOULD_ACTIVATE_LIVE' : 'WOULD_PROCEED_STAGING')
      : 'BLOCKED'

    // Log audit event (fire-and-forget)
    void createAuditLog({
      tenantId,
      actorUserId: userId,
      actorRole:   role,
      action:      'ACTIVATION_DRY_RUN',
      entityType:  'Tenant',
      entityId:    tenantId,
      metadata:    { channelType, intendedMode, dryRunStatus, blockedCount: blockedReasons.length },
    })

    return {
      tenantId,
      dryRun:              true,
      realSendEnabled:     false,  // DRY RUN NEVER enables real send
      channelType,
      intendedMode,
      dryRunStatus,
      wouldActivate,
      blockedReasons,
      requiredFlags,
      currentFlagStatus,
      stepsIfProceeding: isWaWeb ? [
        'Set OMNI_ALLOW_WA_SESSION=true in production .env',
        'Restart API server to pick up new env value',
        'Navigate to /channels/setup/wa-web/qr to scan QR code',
        'Verify session status at /channels/setup/wa-web/status',
        'Send a test message to a known number',
        'Monitor /activation/health for session health',
      ] : [
        'Set OMNI_ENABLE_REAL_META_SEND=true in production .env',
        'Ensure channel has encrypted credentials via /channels/setup/credentials-draft',
        'Restart API server to pick up new env value',
        'Verify webhook is subscribed via /channels/setup/meta-webhook/status',
        'Send a test message to a known number',
        'Monitor /activation/health for send health',
      ],
      safetyNote: 'This is a dry run — no real WhatsApp/Meta connection was made. No env flags were changed.',
    }
  })

  // ── GET /activation/health ─────────────────────────────────────────────────
  app.get('/health', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)

    const [draft, channels, recentAudit, recentErrors] = await Promise.all([
      prisma.channelSetupDraft.findUnique({ where: { tenantId } }),
      prisma.channel.findMany({
        where:  { tenantId, isActive: true },
        select: { id: true, type: true, displayName: true, isActive: true, lastWebhookAt: true },
      }),
      prisma.auditLog.findMany({
        where:   { tenantId },
        orderBy: { createdAt: 'desc' },
        take:    5,
        select:  { action: true, createdAt: true, actorRole: true },
      }),
      // Placeholder: no DB error log table yet — return empty
      Promise.resolve([] as unknown[]),
    ])

    const waSessionAllowed = process.env.OMNI_ALLOW_WA_SESSION     === 'true'
    const metaSendAllowed  = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'
    const realSendActive   = waSessionAllowed || metaSendAllowed

    const channelHealth = channels.map(c => ({
      id:            c.id,
      type:          c.type,
      displayName:   c.displayName,
      isActive:      c.isActive,
      lastWebhookAt: c.lastWebhookAt ?? null,
      healthNote:    !realSendActive ? 'Send disabled — stub mode' : 'Send enabled — monitor for errors',
    }))

    const overallHealthLevel =
      !realSendActive                ? 'SAFE_STUB_MODE'
      : channels.length === 0        ? 'WARN_NO_CHANNELS'
      : 'ACTIVE_MONITORING_NEEDED'

    const recommendedAction =
      !realSendActive
        ? 'System in safe stub mode. No real WhatsApp/Meta sends occur. When ready to activate, follow /activation-guide.'
        : channels.length === 0
        ? 'Real send is enabled but no active channels found. Verify channel setup.'
        : 'Real send is active. Monitor webhook activity and error logs.'

    return {
      tenantId,
      asOf:              new Date().toISOString(),
      overallHealthLevel,
      safetyFlags: {
        realWaSessionEnabled:  waSessionAllowed,
        realMetaSendEnabled:   metaSendAllowed,
        realSendActive,
        realSendCurrentlyOff:  !realSendActive,
      },
      channelHealth,
      activeChannelCount:  channels.length,
      recentAuditActivity: recentAudit,
      recentErrors:        recentErrors,  // Empty placeholder — no error log table yet
      recommendedAction,
      activationGuide:     '/activation-guide',
      note: 'Health data is local/DB-derived only. No external monitoring provider required for this check.',
    }
  })
}
