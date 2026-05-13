// Tenant Admin Settings API — Phase 15A
//
// GET  /settings/overview        — tenant profile + AI + KB + channel + plan summary (no secrets)
// PATCH /settings/company-profile — update company name, industry, businessHours
//
// Safety:
//   - All endpoints auth-required, tenant-scoped via JWT.
//   - No secrets, tokens, or .env contents in responses.
//   - No real WhatsApp/Meta/AI calls.

import type { FastifyInstance } from 'fastify'
import { prisma }               from '@omni/db'
import { requireAuth, requireRole, getAuthUser } from '../auth'
import { createAuditLog }                        from '../lib/audit'

export async function settingsRoutes(app: FastifyInstance) {

  // ── GET /settings/overview ────────────────────────────────────────────────
  app.get('/overview', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)

    const [tenant, onboarding, kbCount, draft, channels, users] = await Promise.all([
      prisma.tenant.findUnique({
        where:  { id: tenantId },
        select: { id: true, name: true, slug: true, defaultLanguage: true, plan: true, isActive: true, createdAt: true },
      }),
      prisma.onboardingDraft.findUnique({ where: { tenantId } }),
      prisma.knowledgeItem.count({ where: { tenantId, isActive: true } }),
      prisma.channelSetupDraft.findUnique({ where: { tenantId } }),
      prisma.channel.findMany({
        where:  { tenantId, isActive: true },
        select: { id: true, type: true, displayName: true, isActive: true },
      }),
      prisma.user.findMany({
        where:  { tenantId, isActive: true },
        select: { id: true, name: true, email: true, role: true },
      }),
    ])

    const waSessionAllowed = process.env.OMNI_ALLOW_WA_SESSION     === 'true'
    const metaSendAllowed  = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'

    return {
      tenantId,
      company: {
        name:            tenant?.name ?? null,
        slug:            tenant?.slug ?? null,
        plan:            tenant?.plan ?? 'trial',
        isActive:        tenant?.isActive ?? false,
        defaultLanguage: tenant?.defaultLanguage ?? 'zh',
        memberSince:     tenant?.createdAt ?? null,
      },
      onboarding: {
        status:         onboarding?.status ?? null,
        companyName:    onboarding?.companyName ?? null,
        industry:       onboarding?.industry ?? null,
        goalsCount:     onboarding?.aiGoals?.length ?? 0,
        businessHours:  onboarding?.businessHours ?? null,
        hasPreview:     !!onboarding?.generatedPreview,
        enabledAt:      onboarding?.enabledAt ?? null,
      },
      knowledgeBase: {
        activeItems:    kbCount,
        ready:          kbCount > 0,
      },
      channel: {
        type:             draft?.channelType ?? null,
        setupStatus:      draft?.setupStatus ?? 'NOT_STARTED',
        credentialStatus: draft?.credentialStatus ?? 'NONE',
        activeChannels:   channels.length,
        channels:         channels.map(c => ({ id: c.id, type: c.type, displayName: c.displayName })),
      },
      safety: {
        realSendEnabled:    false,
        waSessionAllowed,
        metaSendAllowed,
        realSendDisabled:   !waSessionAllowed && !metaSendAllowed,
      },
      team: {
        userCount: users.length,
        users:     users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
        rbacNote:  'RBAC enforced: OWNER/ADMIN can manage team, MANAGER can view, AGENT/VIEWER have inbox access only.',
      },
      links: {
        onboarding:      '/onboarding',
        knowledge:       '/knowledge',
        channelSetup:    '/channels/setup',
        launchChecklist: '/launch-checklist',
        boss:            '/boss',
        billing:         '/billing',
        productionQa:    '/production-qa',
      },
    }
  })

  // ── PATCH /settings/company-profile ──────────────────────────────────────
  app.patch<{
    Body: {
      companyName?:   string
      industry?:      string
      businessHours?: string
      website?:       string
      serviceArea?:   string
    }
  }>('/company-profile', { preHandler: requireRole('OWNER', 'ADMIN') }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const { companyName, industry, businessHours, website, serviceArea } = req.body ?? {}

    const data: Record<string, string> = {}
    if (companyName   !== undefined) data.companyName   = companyName.trim()
    if (industry      !== undefined) data.industry      = industry
    if (businessHours !== undefined) data.businessHours = businessHours
    if (website       !== undefined) data.website       = website
    if (serviceArea   !== undefined) data.serviceArea   = serviceArea

    const updated = await prisma.onboardingDraft.upsert({
      where:  { tenantId },
      update: data,
      create: { tenantId, ...data },
    })

    void createAuditLog({
      tenantId,
      actorUserId: getAuthUser(req).userId,
      actorRole:   getAuthUser(req).role,
      action:      'SETTINGS_PROFILE_UPDATE',
      entityType:  'Tenant',
      entityId:    tenantId,
      metadata:    { updatedFields: Object.keys(data) },
    })

    return {
      saved:        true,
      tenantId,
      companyName:  updated.companyName,
      industry:     updated.industry,
      businessHours: updated.businessHours,
    }
  })
}
