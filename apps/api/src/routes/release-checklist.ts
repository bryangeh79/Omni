// Release Checklist API — Phase 15D
//
// GET /release-checklist/status — SaaS v1 release readiness summary (requireAuth)
//
// Aggregates production-qa data and adds static v1 release gates.
// Safety:
//   - Auth-required, tenant-scoped.
//   - No secrets in responses.
//   - No real sends or external calls.

import type { FastifyInstance } from 'fastify'
import { prisma }               from '@omni/db'
import { requireAuth, getAuthUser } from '../auth'

const V1_GATES = [
  { key: 'product_complete',       label: 'Product flow complete',              status: 'PASS' as const },
  { key: 'no_broadcast',           label: 'No broadcast/ads/bulk sending',      status: 'PASS' as const },
  { key: 'real_send_default_off',  label: 'Real send disabled by default',      status: 'PASS' as const },
  { key: 'auth_rbac',              label: 'Auth + RBAC enforced',               status: 'PASS' as const },
  { key: 'audit_logs',             label: 'Audit logs available',               status: 'PASS' as const },
  { key: 'ops_runbook',            label: 'Ops runbook available',              status: 'PASS' as const },
  { key: 'meta_fees_separated',    label: 'Meta API fees separated/noted',      status: 'PASS' as const },
  { key: 'payment_not_live',       label: 'Payment gateway not yet live (safe)',status: 'PASS' as const },
  { key: 'navigation_shell',       label: 'App shell / navigation present',     status: 'PASS' as const },
  { key: 'manual_activation',      label: 'Manual activation required for live',status: 'MANUAL' as const },
  { key: 'backup_needed',          label: 'Database backup (operator action)',  status: 'MANUAL' as const },
  { key: 'monitoring_needed',      label: 'External monitoring (operator action)', status: 'MANUAL' as const },
]

export async function releaseChecklistRoutes(app: FastifyInstance) {

  // ── GET /release-checklist/status ─────────────────────────────────────────
  app.get('/status', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)

    const [onboarding, kbCount, draft, users, tenant, auditCount] = await Promise.all([
      prisma.onboardingDraft.findUnique({ where: { tenantId } }),
      prisma.knowledgeItem.count({ where: { tenantId, isActive: true } }),
      prisma.channelSetupDraft.findUnique({ where: { tenantId } }),
      prisma.user.count({ where: { tenantId, isActive: true } }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, isActive: true } }),
      prisma.auditLog.count({ where: { tenantId } }),
    ])

    const waSessionAllowed = process.env.OMNI_ALLOW_WA_SESSION     === 'true'
    const metaSendAllowed  = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'
    const vaultConfigured  = !!process.env.OMNI_API_KEY_ENCRYPTION_SECRET

    // Dynamic items derived from tenant state
    const dynamicItems = [
      {
        key:    'onboarding_done',
        label:  'Onboarding completed',
        status: onboarding?.status === 'ENABLED' ? 'PASS' : 'WARN',
        detail: onboarding?.status === 'ENABLED' ? 'Status: ENABLED' : 'Onboarding not yet completed',
      },
      {
        key:    'knowledge_base',
        label:  'Knowledge base has items',
        status: kbCount > 0 ? 'PASS' : 'WARN',
        detail: `${kbCount} active KB items`,
      },
      {
        key:    'channel_configured',
        label:  'Channel configured',
        status: draft?.channelType ? 'PASS' : 'WARN',
        detail: draft?.channelType ? `Type: ${draft.channelType}` : 'No channel configured',
      },
      {
        key:    'team_users',
        label:  'Team users configured',
        status: users > 0 ? 'PASS' : 'FAIL',
        detail: `${users} active user(s)`,
      },
      {
        key:    'vault_configured',
        label:  'Credential vault configured',
        status: vaultConfigured ? 'PASS' : 'WARN',
        detail: vaultConfigured ? 'OMNI_API_KEY_ENCRYPTION_SECRET is set' : 'Not set — credentials stored as draft',
      },
      {
        key:    'safety_flags',
        label:  'Safety flags default off',
        status: (!waSessionAllowed && !metaSendAllowed) ? 'PASS' : 'WARN',
        detail: (!waSessionAllowed && !metaSendAllowed)
          ? 'Real sends disabled — safe'
          : 'WARNING: one or more real-send flags enabled',
      },
      {
        key:    'billing_plan',
        label:  'Billing plan selected',
        status: (tenant?.plan && tenant.plan !== 'trial') ? 'PASS' : 'WARN',
        detail: `Current plan: ${tenant?.plan ?? 'trial'}`,
      },
      {
        key:    'audit_active',
        label:  'Audit log active',
        status: 'PASS',
        detail: `${auditCount} audit event(s) recorded`,
      },
    ]

    const allItems  = [...V1_GATES, ...dynamicItems]
    const passed    = allItems.filter(i => i.status === 'PASS').length
    const failed    = allItems.filter(i => i.status === 'FAIL').length
    const warned    = allItems.filter(i => i.status === 'WARN').length
    const manual    = allItems.filter(i => i.status === 'MANUAL').length

    const overallStatus = failed > 0 ? 'FAIL' : warned > 3 ? 'WARN' : manual > 0 ? 'MANUAL_REVIEW_NEEDED' : 'PASS'
    const saasV1Ready   = failed === 0 && !waSessionAllowed && !metaSendAllowed

    return {
      tenantId,
      asOf:          new Date().toISOString(),
      overallStatus,
      saasV1Ready,
      summary:       { passed, failed, warned, manual, total: allItems.length },
      v1Gates:       V1_GATES,
      dynamicItems,
      safetyFlags: {
        realWaSessionEnabled:  waSessionAllowed,
        realMetaSendEnabled:   metaSendAllowed,
        realSendDisabled:      !waSessionAllowed && !metaSendAllowed,
        vaultConfigured,
      },
      note: 'Items marked MANUAL require operator action before production launch. Items marked WARN should be reviewed.',
    }
  })
}
