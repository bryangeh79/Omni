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
}
