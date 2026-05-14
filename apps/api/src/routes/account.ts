// Account API — Phase 17B
//
// GET   /account/overview  — safe tenant + user + onboarding + channel + checklist summary (requireAuth)
// PATCH /account/profile   — update business name + default language (requireRole OWNER/ADMIN)
//
// Safety contract:
//   - All endpoints auth-required, tenant-scoped via JWT
//   - PATCH restricted to OWNER/ADMIN
//   - passwordHash NEVER returned
//   - credentialRef NEVER returned
//   - No raw tokens, encrypted blobs, or .env values
//   - No real WhatsApp/Meta/AI/email/payment calls

import type { FastifyInstance } from 'fastify'
import { prisma }               from '@omni/db'
import { requireAuth, requireRole, getAuthUser } from '../auth'
import { createAuditLog }                         from '../lib/audit'
import {
  parseAuditMetadataSafe,
  summarizeAuditAction,
  classifySecuritySeverity,
  sanitizeAuditEvent,
} from '../lib/audit-safe'

const VALID_LANGUAGES = ['zh', 'en', 'ms'] as const

export async function accountRoutes(app: FastifyInstance) {

  // ── GET /account/overview ─────────────────────────────────────────────────
  app.get('/overview', { preHandler: requireAuth }, async (req) => {
    const { tenantId, userId } = getAuthUser(req)

    const [tenant, currentUser, onboarding, channelDraft, channels, kbCount, auditCount] = await Promise.all([
      prisma.tenant.findUnique({
        where:  { id: tenantId },
        select: { id: true, slug: true, name: true, defaultLanguage: true, plan: true, isActive: true, createdAt: true },
      }),
      prisma.user.findUnique({
        where:  { id: userId },
        select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      }),
      prisma.onboardingDraft.findUnique({
        where:  { tenantId },
        select: { status: true, companyName: true, industry: true, aiGoals: true, completedSteps: true, enabledAt: true },
      }),
      prisma.channelSetupDraft.findUnique({
        where:  { tenantId },
        select: { channelType: true, displayName: true, setupStatus: true, credentialStatus: true, testStatus: true, realWaSessionEnabled: true, realMetaSendEnabled: true },
      }),
      prisma.channel.findMany({
        where:  { tenantId, isActive: true },
        select: { id: true, type: true, displayName: true, isActive: true },
      }),
      prisma.knowledgeItem.count({ where: { tenantId, isActive: true } }),
      prisma.auditLog.count({ where: { tenantId } }),
    ])

    const waSessionAllowed = process.env.OMNI_ALLOW_WA_SESSION     === 'true'
    const metaSendAllowed  = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'

    // Deterministic setup checklist
    const setupChecklist = [
      {
        key:    'onboarding_complete',
        label:  'Complete onboarding wizard',
        passed: onboarding?.status === 'ENABLED',
        action: '/onboarding',
      },
      {
        key:    'knowledge_base_ready',
        label:  'Add knowledge base items',
        passed: kbCount > 0,
        action: '/knowledge',
      },
      {
        key:    'channel_configured',
        label:  'Configure WhatsApp channel',
        passed: !!channelDraft?.channelType,
        action: '/channels/setup',
      },
      {
        key:    'team_setup',
        label:  'Invite team members',
        passed: false,  // Always shown as actionable — no automated team-size check
        action: '/team',
      },
      {
        key:    'activation_review',
        label:  'Review activation guide',
        passed: false,  // Always actionable
        action: '/activation-guide',
      },
      {
        key:    'activation_monitor',
        label:  'Check activation monitoring',
        passed: false,
        action: '/activation/monitoring',
      },
    ]

    const completedCount = setupChecklist.filter(i => i.passed).length

    return {
      tenant: tenant ? {
        id:              tenant.id,
        slug:            tenant.slug,
        name:            tenant.name,
        defaultLanguage: tenant.defaultLanguage,
        plan:            tenant.plan,
        isActive:        tenant.isActive,
        memberSince:     tenant.createdAt,
      } : null,
      currentUser: currentUser ? {
        id:       currentUser.id,
        email:    currentUser.email,
        name:     currentUser.name,
        role:     currentUser.role,
        isActive: currentUser.isActive,
        memberSince: currentUser.createdAt,
        // passwordHash NEVER included
      } : null,
      onboarding: {
        status:      onboarding?.status ?? null,
        companyName: onboarding?.companyName ?? null,
        industry:    onboarding?.industry ?? null,
        goals:       onboarding?.aiGoals ?? [],
        completedSteps: onboarding?.completedSteps ?? 0,
        enabledAt:   onboarding?.enabledAt ?? null,
      },
      channel: {
        channelType:      channelDraft?.channelType ?? null,
        displayName:      channelDraft?.displayName ?? null,
        setupStatus:      channelDraft?.setupStatus ?? 'NOT_STARTED',
        credentialStatus: channelDraft?.credentialStatus ?? 'NONE',
        testStatus:       channelDraft?.testStatus ?? 'NOT_TESTED',
        activeChannelCount: channels.length,
        // credentialRef NEVER included
      },
      knowledgeBase: {
        activeItems: kbCount,
      },
      activity: {
        totalAuditEvents: auditCount,
      },
      setupChecklist,
      setupProgress: {
        completed: completedCount,
        total:     setupChecklist.length,
        percent:   Math.round((completedCount / setupChecklist.length) * 100),
      },
      safety: {
        realSendEnabled:      false,
        broadcastEnabled:     false,
        realWaSessionEnabled: waSessionAllowed,
        realMetaSendEnabled:  metaSendAllowed,
        realSendCurrentlyOff: !waSessionAllowed && !metaSendAllowed,
      },
      links: {
        onboarding:         '/onboarding',
        channels:           '/channels/setup',
        knowledge:          '/knowledge',
        team:               '/team',
        activationGuide:    '/activation-guide',
        activationMonitor:  '/activation/monitoring',
        releaseChecklist:   '/release-checklist',
        productionQa:       '/production-qa',
      },
      note: 'Account hub is tenant-scoped. Real sends remain disabled until activation guide checks complete. Not a broadcast or bulk-sending platform.',
    }
  })

  // ── PATCH /account/profile ────────────────────────────────────────────────
  // OWNER/ADMIN only: update business name and default language
  app.patch<{
    Body: {
      businessName?:    string
      defaultLanguage?: string
      companyName?:     string  // Optional: also update onboarding draft companyName
    }
  }>('/profile', { preHandler: requireRole('OWNER', 'ADMIN') }, async (req, reply) => {
    const { tenantId, userId, role } = getAuthUser(req)
    const { businessName, defaultLanguage, companyName } = req.body ?? {}

    // Validate at least one field
    if (businessName === undefined && defaultLanguage === undefined && companyName === undefined) {
      return reply.status(400).send({ error: 'At least one field is required: businessName, defaultLanguage, or companyName' })
    }

    // Validate businessName
    if (businessName !== undefined) {
      const trimmed = businessName.trim()
      if (trimmed.length < 2 || trimmed.length > 120) {
        return reply.status(400).send({ error: 'businessName must be 2-120 characters' })
      }
    }

    // Validate defaultLanguage
    if (defaultLanguage !== undefined && !VALID_LANGUAGES.includes(defaultLanguage as typeof VALID_LANGUAGES[number])) {
      return reply.status(400).send({ error: `defaultLanguage must be one of: ${VALID_LANGUAGES.join(', ')}` })
    }

    // Build update payload
    const tenantUpdate: Record<string, string> = {}
    if (businessName    !== undefined) tenantUpdate.name            = businessName.trim()
    if (defaultLanguage !== undefined) tenantUpdate.defaultLanguage = defaultLanguage

    const updated = await prisma.tenant.update({
      where:  { id: tenantId },
      data:   tenantUpdate,
      select: { id: true, slug: true, name: true, defaultLanguage: true, plan: true, isActive: true },
    })

    // Optionally update onboarding companyName
    let onboardingUpdated: { companyName: string | null } | null = null
    if (companyName !== undefined) {
      const trimmed = companyName.trim()
      const onbResult = await prisma.onboardingDraft.upsert({
        where:  { tenantId },
        update: { companyName: trimmed },
        create: { tenantId, companyName: trimmed, status: 'DRAFT' },
        select: { companyName: true },
      })
      onboardingUpdated = { companyName: onbResult.companyName }
    }

    void createAuditLog({
      tenantId,
      actorUserId: userId,
      actorRole:   role,
      action:      'ACCOUNT_PROFILE_UPDATE',
      entityType:  'Tenant',
      entityId:    tenantId,
      metadata:    { updatedFields: Object.keys({ ...tenantUpdate, ...(companyName !== undefined ? { companyName: true } : {}) }) },
    })

    return {
      saved: true,
      tenant: {
        id:              updated.id,
        slug:            updated.slug,
        name:            updated.name,
        defaultLanguage: updated.defaultLanguage,
        plan:            updated.plan,
        isActive:        updated.isActive,
      },
      onboarding: onboardingUpdated,
      note: 'Profile updated. No secrets or credentials exposed.',
    }
  })

  // ── Action group mapping (shared between activity + security events) ──────
  const ACTION_GROUPS: Record<string, string[]> = {
    account:    ['ACCOUNT_PROFILE_UPDATE', 'TENANT_SIGNUP'],
    team:       ['TEAM_INVITE_DRAFT', 'TEAM_ROLE_UPDATE', 'TEAM_STATUS_UPDATE'],
    billing:    ['BILLING_PLAN_SELECTED'],
    settings:   ['SETTINGS_PROFILE_UPDATE'],
    activation: ['ACTIVATION_DRY_RUN', 'ACTIVATION_TEST_MESSAGE_DRY_RUN'],
    security:   ['TEAM_ROLE_UPDATE', 'TEAM_STATUS_UPDATE', 'ACCOUNT_PROFILE_UPDATE'],
  }

  const ALL_GROUPS = ['account', 'team', 'billing', 'settings', 'activation', 'security']
  const ALL_ACCOUNT_ACTIONS: string[] = Array.from(new Set([
    ...ACTION_GROUPS.account,
    ...ACTION_GROUPS.team,
    ...ACTION_GROUPS.billing,
    ...ACTION_GROUPS.settings,
    ...ACTION_GROUPS.activation,
  ]))

  // Phase 18A: All sanitization is now centralized in lib/audit-safe.ts.
  // Local wrappers preserve the previous call-site shape (string|null tolerance).
  const safeMeta             = (json: string) => parseAuditMetadataSafe(json)
  const summarizeAction      = (action: string) => summarizeAuditAction(action)

  // ── GET /account/activity — Phase 17C + Phase 17D filters ────────────────
  // Returns recent safe audit events for the current tenant. Supports filters.
  // Never includes raw secrets, tokens, credential refs, or encrypted blobs.
  app.get<{ Querystring: {
    limit?:       string
    actionGroup?: string
    action?:      string
    from?:        string
    to?:          string
  } }>('/activity', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { actionGroup, action, from, to } = req.query

    // limit: default 20, max 100, reject negative/non-numeric explicitly
    const limitRaw = parseInt(req.query.limit ?? '20', 10)
    if (req.query.limit !== undefined && (!Number.isFinite(limitRaw) || limitRaw < 1)) {
      return reply.status(400).send({ error: 'limit must be a positive integer (1-100)' })
    }
    const take = Math.min(limitRaw || 20, 100)

    // Resolve actions filter
    let actionFilter: string[] = ALL_ACCOUNT_ACTIONS
    if (actionGroup) {
      if (!ALL_GROUPS.includes(actionGroup)) {
        return reply.status(400).send({
          error: `Invalid actionGroup. Valid: ${ALL_GROUPS.join(', ')}`,
        })
      }
      actionFilter = [...(ACTION_GROUPS[actionGroup] ?? [])]
    }
    if (action) {
      if (!ALL_ACCOUNT_ACTIONS.includes(action)) {
        return reply.status(400).send({ error: 'Unknown action' })
      }
      actionFilter = [action]
    }

    // Date range parsing
    const where: Record<string, unknown> = {
      tenantId,
      action: { in: actionFilter },
    }
    const createdAt: Record<string, Date> = {}
    if (from) {
      const d = new Date(from)
      if (isNaN(d.getTime())) {
        return reply.status(400).send({ error: 'Invalid from date (use ISO 8601)' })
      }
      createdAt.gte = d
    }
    if (to) {
      const d = new Date(to)
      if (isNaN(d.getTime())) {
        return reply.status(400).send({ error: 'Invalid to date (use ISO 8601)' })
      }
      createdAt.lte = d
    }
    if (Object.keys(createdAt).length > 0) {
      where.createdAt = createdAt
    }

    const events = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id:           true,
        action:       true,
        entityType:   true,
        actorRole:    true,
        createdAt:    true,
        metadataJson: true,
        // actorUserId, ip, userAgent intentionally omitted for display safety
      },
    })

    const safeEvents = events.map(e => ({
      id:           e.id,
      action:       e.action,
      entityType:   e.entityType,
      actorRole:    e.actorRole,
      createdAt:    e.createdAt,
      summary:      summarizeAction(e.action),
      safeMetadata: safeMeta(e.metadataJson),
    }))

    return {
      tenantId,
      asOf:    new Date().toISOString(),
      filters: {
        actionGroup: actionGroup ?? null,
        action:      action      ?? null,
        from:        from        ?? null,
        to:          to          ?? null,
        limit:       take,
      },
      availableActionGroups: ALL_GROUPS,
      events:  safeEvents,
      counts:  { totalReturned: safeEvents.length, maxRequested: take },
      note: 'Activity history is audit-log derived and tenant-scoped. Raw metadata values are filtered to a safe whitelist. No secrets/tokens/credentials are included.',
    }
  })

  // ── GET /account/security-events — Phase 17D ─────────────────────────────
  // Security-focused event summary with severity classification.
  // Restricted to OWNER/ADMIN. Local audit-derived data only — no real provider calls.
  app.get('/security-events', { preHandler: requireRole('OWNER', 'ADMIN') }, async (req) => {
    const { tenantId } = getAuthUser(req)

    const now      = new Date()
    const last24h  = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7d   = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Pull recent security-relevant audit events (up to last 7 days, max 100)
    const SECURITY_ACTIONS = [
      'TEAM_ROLE_UPDATE',
      'TEAM_STATUS_UPDATE',
      'ACCOUNT_PROFILE_UPDATE',
      'SETTINGS_PROFILE_UPDATE',
      'BILLING_PLAN_SELECTED',
      'ACTIVATION_DRY_RUN',
      'ACTIVATION_TEST_MESSAGE_DRY_RUN',
    ]
    const rawEvents = await prisma.auditLog.findMany({
      where:   { tenantId, action: { in: SECURITY_ACTIONS }, createdAt: { gte: last7d } },
      orderBy: { createdAt: 'desc' },
      take:    100,
      select: {
        id:           true,
        action:       true,
        entityType:   true,
        actorRole:    true,
        createdAt:    true,
        metadataJson: true,
      },
    })

    // Phase 18A: severity classification is now centralized in lib/audit-safe.ts
    const classified = rawEvents.map(e => {
      const meta = parseAuditMetadataSafe(e.metadataJson)
      const { severity, reason } = classifySecuritySeverity(e.action, meta)
      return {
        id:           e.id,
        action:       e.action,
        entityType:   e.entityType,
        actorRole:    e.actorRole,
        createdAt:    e.createdAt,
        severity,
        reason,
        summary:      summarizeAuditAction(e.action),
        safeMetadata: meta,
        within24h:    e.createdAt >= last24h,
      }
    })

    // Severity counts (across the full 7-day window)
    const severityCounts = {
      info:     classified.filter(c => c.severity === 'info').length,
      warning:  classified.filter(c => c.severity === 'warning').length,
      critical: classified.filter(c => c.severity === 'critical').length,
    }
    // Last-24h summary
    const last24hEvents = classified.filter(c => c.within24h)
    const last24hSummary = {
      total:    last24hEvents.length,
      info:     last24hEvents.filter(c => c.severity === 'info').length,
      warning:  last24hEvents.filter(c => c.severity === 'warning').length,
      critical: last24hEvents.filter(c => c.severity === 'critical').length,
    }

    // Recommended actions based on what's been observed
    const recommendedActions: string[] = []
    if (severityCounts.warning > 0) {
      recommendedActions.push('Review recent warning-level events for unexpected privilege changes or activation blockers')
    }
    if (last24hSummary.warning > 0) {
      recommendedActions.push('At least one warning-severity event occurred in the last 24 hours — investigate')
    }
    if (severityCounts.warning === 0 && severityCounts.critical === 0) {
      recommendedActions.push('No security warnings detected in the last 7 days')
    }
    recommendedActions.push('Real WhatsApp/Meta sends remain disabled by default — see /activation-guide before going live')
    recommendedActions.push('Audit log is the source of truth — review /audit for the full trail')

    const waSessionAllowed = process.env.OMNI_ALLOW_WA_SESSION     === 'true'
    const metaSendAllowed  = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'

    return {
      tenantId,
      asOf: now.toISOString(),
      windowDays: 7,
      last24h: last24hSummary,
      severityCounts,
      events: classified,
      recommendedActions,
      safetyFlags: {
        realSendEnabled:      false,
        broadcastEnabled:     false,
        realWaSessionEnabled: waSessionAllowed,
        realMetaSendEnabled:  metaSendAllowed,
        realSendCurrentlyOff: !waSessionAllowed && !metaSendAllowed,
      },
      note: 'Security events are local audit-log derived. No real provider calls. No secrets/tokens/credentials exposed.',
    }
  })

  // ── GET /account/export — Phase 17C ───────────────────────────────────────
  // Safe JSON summary of the tenant's account state. OWNER/ADMIN only.
  // NEVER includes: passwordHash, credentialRef, raw tokens, encrypted blobs, raw provider data.
  // NEVER includes: full conversations or customer messages.
  app.get('/export', { preHandler: requireRole('OWNER', 'ADMIN') }, async (req) => {
    const { tenantId } = getAuthUser(req)

    const [tenant, users, onboarding, channelDraft, channels, kbItems, aiConfig, followUpRules, handoffRules, customerCount, conversationCount, auditCount] = await Promise.all([
      prisma.tenant.findUnique({
        where:  { id: tenantId },
        select: { id: true, slug: true, name: true, defaultLanguage: true, plan: true, isActive: true, createdAt: true },
      }),
      prisma.user.findMany({
        where:  { tenantId },
        select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.onboardingDraft.findUnique({
        where:  { tenantId },
        select: { status: true, companyName: true, industry: true, aiGoals: true, businessHours: true, website: true, serviceArea: true, completedSteps: true, enabledAt: true, createdAt: true },
      }),
      prisma.channelSetupDraft.findUnique({
        where:  { tenantId },
        select: {
          channelType:      true,
          displayName:      true,
          phoneLast4:       true,   // last 4 only — safe
          setupStatus:      true,
          credentialStatus: true,    // status label only — never credentialRef
          testStatus:       true,
          lastTestAt:       true,
          realWaSessionEnabled: true,
          realMetaSendEnabled:  true,
          createdAt:        true,
          // credentialRef, credentialLast4 intentionally omitted
        },
      }),
      prisma.channel.findMany({
        where:  { tenantId },
        select: { id: true, type: true, displayName: true, isActive: true, createdAt: true },
        // metaAccessTokenRef, webhookVerifyTokenRef, metaAppSecretRef intentionally NOT selected
      }),
      prisma.knowledgeItem.findMany({
        where:  { tenantId, isActive: true },
        select: { id: true, type: true, question: true, language: true, createdAt: true },
        // answer intentionally omitted to avoid leaking pasted secrets if any
        take: 50,
      }),
      prisma.aiConfig.findUnique({
        where:  { tenantId },
        select: { aiProvider: true, model: true, useTenantApiKey: true, replyLanguagePolicy: true, isActive: true, createdAt: true },
        // apiKeyRef, apiKeyLast4 intentionally NOT selected
      }),
      prisma.followUpRule.findMany({
        where:  { tenantId },
        select: { id: true, trigger: true, delayHours: true, isActive: true },
        // messageTemplate omitted — may contain user content
      }),
      prisma.handoffRule.findMany({
        where:  { tenantId },
        select: { id: true, condition: true, isActive: true },
      }),
      prisma.customer.count({ where: { tenantId } }),
      prisma.conversation.count({ where: { tenantId } }),
      prisma.auditLog.count({ where: { tenantId } }),
    ])

    const waSessionAllowed = process.env.OMNI_ALLOW_WA_SESSION     === 'true'
    const metaSendAllowed  = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'

    return {
      generatedAt: new Date().toISOString(),
      tenantId,
      schemaVersion: '17c-1',
      tenant: tenant ? {
        id:              tenant.id,
        slug:            tenant.slug,
        name:            tenant.name,
        defaultLanguage: tenant.defaultLanguage,
        plan:            tenant.plan,
        isActive:        tenant.isActive,
        createdAt:       tenant.createdAt,
      } : null,
      users: users.map(u => ({
        id:        u.id,
        email:     u.email,
        name:      u.name,
        role:      u.role,
        isActive:  u.isActive,
        createdAt: u.createdAt,
        // passwordHash NEVER included
      })),
      onboarding: onboarding ?? null,
      channelSetup: channelDraft ? {
        channelType:          channelDraft.channelType,
        displayName:          channelDraft.displayName,
        phoneLast4:           channelDraft.phoneLast4,
        setupStatus:          channelDraft.setupStatus,
        credentialStatus:     channelDraft.credentialStatus,
        testStatus:           channelDraft.testStatus,
        lastTestAt:           channelDraft.lastTestAt,
        realWaSessionEnabled: channelDraft.realWaSessionEnabled,
        realMetaSendEnabled:  channelDraft.realMetaSendEnabled,
        createdAt:            channelDraft.createdAt,
        // credentialRef, credentialLast4 NEVER included
      } : null,
      activeChannels: channels.map(c => ({
        id:          c.id,
        type:        c.type,
        displayName: c.displayName,
        isActive:    c.isActive,
        createdAt:   c.createdAt,
        // metaAccessTokenRef, webhookVerifyTokenRef, metaAppSecretRef NEVER included
      })),
      knowledgeBase: {
        activeItemCount: kbItems.length,
        items: kbItems.map(k => ({
          id:        k.id,
          type:      k.type,
          question:  k.question,
          language:  k.language,
          createdAt: k.createdAt,
          // answer field deliberately excluded
        })),
        note: 'Only questions, not full answers, are exported to avoid leaking pasted content.',
      },
      aiConfig: aiConfig ? {
        aiProvider:          aiConfig.aiProvider,
        model:               aiConfig.model,
        useTenantApiKey:     aiConfig.useTenantApiKey,
        replyLanguagePolicy: aiConfig.replyLanguagePolicy,
        isActive:            aiConfig.isActive,
        createdAt:           aiConfig.createdAt,
        // apiKeyRef, apiKeyLast4, apiKeyProvider intentionally excluded
      } : null,
      followUpRules: followUpRules.map(r => ({
        id:         r.id,
        trigger:    r.trigger,
        delayHours: r.delayHours,
        isActive:   r.isActive,
        // messageTemplate excluded
      })),
      handoffRules: handoffRules.map(r => ({
        id:        r.id,
        condition: r.condition,
        isActive:  r.isActive,
      })),
      counts: {
        users:         users.length,
        activeUsers:   users.filter(u => u.isActive).length,
        activeChannels: channels.filter(c => c.isActive).length,
        customers:     customerCount,
        conversations: conversationCount,
        knowledgeItems: kbItems.length,
        followUpRules: followUpRules.length,
        handoffRules:  handoffRules.length,
        auditEvents:   auditCount,
      },
      safety: {
        realSendEnabled:      false,
        broadcastEnabled:     false,
        realWaSessionEnabled: waSessionAllowed,
        realMetaSendEnabled:  metaSendAllowed,
        realSendCurrentlyOff: !waSessionAllowed && !metaSendAllowed,
      },
      setupChecklist: {
        onboardingComplete:   onboarding?.status === 'ENABLED',
        knowledgeBaseReady:   kbItems.length > 0,
        channelConfigured:    !!channelDraft?.channelType,
        teamHasAdmin:         users.some(u => ['OWNER', 'ADMIN'].includes(u.role) && u.isActive),
      },
      links: {
        account:            '/account',
        activationGuide:    '/activation-guide',
        activationMonitor:  '/activation/monitoring',
        opsRunbook:         '/ops/runbook',
        releaseChecklist:   '/release-checklist',
      },
      redaction: {
        passwordHashExcluded:     true,
        credentialRefsExcluded:   true,
        tokensExcluded:           true,
        encryptedBlobsExcluded:   true,
        rawProviderDataExcluded:  true,
        rawConversationsExcluded: true,
        rawKnowledgeAnswersExcluded: true,
        rawFollowUpTemplatesExcluded: true,
        apiKeyRefsExcluded:       true,
        metaAccessTokenRefExcluded: true,
        webhookVerifyTokenRefExcluded: true,
      },
      notes: [
        'This export is a safe summary, NOT a full database backup.',
        'No secrets, tokens, password hashes, credential refs, or encrypted blobs are included.',
        'Full customer conversations and message content are NOT exported in this phase.',
        'Real WhatsApp/Meta sends remain disabled unless operator explicitly changes env flags.',
        'Omni is not a broadcast, ads, or bulk-sending platform.',
      ],
    }
  })
}
