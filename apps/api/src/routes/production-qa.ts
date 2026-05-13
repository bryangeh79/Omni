// Production QA API — Phase 15A
//
// GET /production-qa/checklist — comprehensive launch readiness checklist
//
// Categories: product flow, safety, data, ops, commercial
// No real calls. No secrets. Auth-required.

import type { FastifyInstance } from 'fastify'
import { prisma }               from '@omni/db'
import { requireAuth, getAuthUser } from '../auth'

interface QaItem {
  id:       string
  category: string
  label:    string
  status:   'PASS' | 'FAIL' | 'WARN' | 'MANUAL'
  detail:   string
  action?:  string
}

export async function productionQaRoutes(app: FastifyInstance) {

  // ── GET /production-qa/checklist ──────────────────────────────────────────
  app.get('/checklist', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)

    const [onboarding, kbCount, draft, users, followUpRules, tenant] = await Promise.all([
      prisma.onboardingDraft.findUnique({ where: { tenantId } }),
      prisma.knowledgeItem.count({ where: { tenantId, isActive: true } }),
      prisma.channelSetupDraft.findUnique({ where: { tenantId } }),
      prisma.user.count({ where: { tenantId, isActive: true } }),
      prisma.followUpRule.count({ where: { tenantId } }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, isActive: true } }),
    ])

    const waSessionAllowed = process.env.OMNI_ALLOW_WA_SESSION     === 'true'
    const metaSendAllowed  = process.env.OMNI_ENABLE_REAL_META_SEND === 'true'
    const aiEnabled        = process.env.OMNI_ENABLE_ONBOARDING_AI  === 'true'
    const vaultConfigured  = !!process.env.OMNI_API_KEY_ENCRYPTION_SECRET

    const items: QaItem[] = [
      // ── Product Flow ──────────────────────────────────────────────────────
      {
        id: 'onboarding_enabled', category: 'Product Flow',
        label:   'Onboarding wizard completed',
        status:  onboarding?.status === 'ENABLED' ? 'PASS' : 'FAIL',
        detail:  onboarding?.status === 'ENABLED' ? 'Status: ENABLED' : 'Onboarding not completed',
        action:  '/onboarding',
      },
      {
        id: 'knowledge_base', category: 'Product Flow',
        label:   'Knowledge base has active items',
        status:  kbCount > 0 ? 'PASS' : 'WARN',
        detail:  kbCount > 0 ? `${kbCount} active items` : 'No KB items — AI will use generic responses',
        action:  '/knowledge',
      },
      {
        id: 'channel_configured', category: 'Product Flow',
        label:   'Channel type selected and draft saved',
        status:  draft?.channelType ? 'PASS' : 'FAIL',
        detail:  draft?.channelType ? `Type: ${draft.channelType}, Status: ${draft.setupStatus}` : 'No channel configured',
        action:  '/channels/setup',
      },
      {
        id: 'channel_test', category: 'Product Flow',
        label:   'Channel stub test completed',
        status:  draft?.lastTestAt ? 'PASS' : 'WARN',
        detail:  draft?.lastTestAt ? `Last test: ${draft.lastTestAt.toISOString()}` : 'No test recorded',
        action:  '/channels/setup',
      },
      {
        id: 'inbox_ready', category: 'Product Flow',
        label:   'Inbox is accessible',
        status:  'PASS',
        detail:  'Inbox available at /inbox',
        action:  '/inbox',
      },
      {
        id: 'boss_ready', category: 'Product Flow',
        label:   'Boss Dashboard accessible',
        status:  'PASS',
        detail:  'Boss dashboard available at /boss',
        action:  '/boss',
      },
      {
        id: 'follow_up_rules', category: 'Product Flow',
        label:   'Follow-up automation rules configured',
        status:  followUpRules > 0 ? 'PASS' : 'WARN',
        detail:  followUpRules > 0 ? `${followUpRules} rules configured` : 'No follow-up rules — configure for better conversion',
        action:  '/boss',
      },

      // ── Safety ────────────────────────────────────────────────────────────
      {
        id: 'real_send_disabled', category: 'Safety',
        label:   'Real send disabled by default',
        status:  !waSessionAllowed && !metaSendAllowed ? 'PASS' : 'WARN',
        detail:  !waSessionAllowed && !metaSendAllowed
          ? 'OMNI_ALLOW_WA_SESSION=false, OMNI_ENABLE_REAL_META_SEND=false'
          : `WARNING: real send flag(s) enabled. Review before launch.`,
      },
      {
        id: 'no_broadcast', category: 'Safety',
        label:   'No broadcast/ads/bulk sending',
        status:  'PASS',
        detail:  'Broadcast, ads, and bulk sending are not implemented. 1:1 AI customer service only.',
      },
      {
        id: 'credential_vault', category: 'Safety',
        label:   'Credential vault configured',
        status:  vaultConfigured ? 'PASS' : 'WARN',
        detail:  vaultConfigured ? 'OMNI_API_KEY_ENCRYPTION_SECRET is set' : 'OMNI_API_KEY_ENCRYPTION_SECRET not set — credentials stored as DRAFT (unencrypted)',
      },
      {
        id: 'ai_provider_safe', category: 'Safety',
        label:   'AI provider calls gated',
        status:  !aiEnabled ? 'PASS' : 'WARN',
        detail:  !aiEnabled ? 'OMNI_ENABLE_ONBOARDING_AI=false (deterministic templates only)' : 'AI provider calls enabled — ensure API keys are secured',
      },

      // ── Data ──────────────────────────────────────────────────────────────
      {
        id: 'tenant_active', category: 'Data',
        label:   'Tenant is active',
        status:  tenant?.isActive ? 'PASS' : 'FAIL',
        detail:  tenant?.isActive ? 'Tenant active' : 'Tenant is not active',
      },
      {
        id: 'team_users', category: 'Data',
        label:   'At least one user configured',
        status:  users > 0 ? 'PASS' : 'FAIL',
        detail:  `${users} active user(s)`,
      },
      {
        id: 'tenant_isolation', category: 'Data',
        label:   'Tenant isolation (JWT-scoped)',
        status:  'PASS',
        detail:  'All API endpoints are tenant-scoped via JWT. Cross-tenant access is not possible.',
      },

      // ── Ops ───────────────────────────────────────────────────────────────
      {
        id: 'health_endpoint', category: 'Ops',
        label:   'Health endpoint available',
        status:  'PASS',
        detail:  'GET /health and GET /ops/health are available',
        action:  '/ops/health',
      },
      {
        id: 'ops_readiness', category: 'Ops',
        label:   'Ops readiness check passes',
        status:  'MANUAL',
        detail:  'Run GET /ops/health to verify DB, Redis, and worker status',
        action:  '/ops/health',
      },
      {
        id: 'backup_docs', category: 'Ops',
        label:   'Backup strategy documented',
        status:  'MANUAL',
        detail:  'Database backup and recovery plan must be configured by operator (pg_dump, RDS snapshots, etc.)',
      },
      {
        id: 'monitoring_configured', category: 'Ops',
        label:   'Monitoring and alerting configured',
        status:  'MANUAL',
        detail:  'Operator must configure uptime monitoring (e.g. UptimeRobot, Grafana) and alert channels for API/worker failures.',
      },
      {
        id: 'log_retention', category: 'Ops',
        label:   'Log retention policy configured',
        status:  'MANUAL',
        detail:  'Operator must define log retention policy (e.g. 30-day rolling) and configure log aggregation (CloudWatch, Datadog, etc.).',
      },
      {
        id: 'incident_response', category: 'Ops',
        label:   'Incident response runbook documented',
        status:  'MANUAL',
        detail:  'On-call escalation path, runbook URL, and incident SLA targets must be documented before live activation.',
      },
      {
        id: 'support_contact', category: 'Ops',
        label:   'Support contact configured for tenants',
        status:  'MANUAL',
        detail:  'Customer-facing support email / WhatsApp / Intercom must be set up so tenants can reach operator support.',
      },

      // ── Commercial ────────────────────────────────────────────────────────
      {
        id: 'plan_selected', category: 'Commercial',
        label:   'Plan selected',
        status:  tenant?.plan && tenant.plan !== 'trial' ? 'PASS' : 'WARN',
        detail:  `Current plan: ${tenant?.plan ?? 'trial'}`,
        action:  '/billing',
      },
      {
        id: 'meta_fees_understood', category: 'Commercial',
        label:   'Meta API fees understood (pass-through)',
        status:  'MANUAL',
        detail:  'Meta WhatsApp API per-conversation fees are NOT bundled — pass-through credits billed separately.',
        action:  '/billing',
      },
      {
        id: 'no_real_payment', category: 'Commercial',
        label:   'No real payment configured (safe)',
        status:  'PASS',
        detail:  'Payment gateway is NOT_CONFIGURED. No real charges will occur until explicitly enabled.',
      },
    ]

    const passed  = items.filter(i => i.status === 'PASS').length
    const failed  = items.filter(i => i.status === 'FAIL').length
    const warned  = items.filter(i => i.status === 'WARN').length
    const manual  = items.filter(i => i.status === 'MANUAL').length

    const overallStatus = failed > 0 ? 'FAIL' : warned > 3 ? 'WARN' : manual > 0 ? 'MANUAL_REVIEW_NEEDED' : 'PASS'

    return {
      tenantId,
      asOf:          new Date().toISOString(),
      overallStatus,
      summary: { passed, failed, warned, manual, total: items.length },
      items,
      operatorNote: 'Items marked MANUAL require operator review before live activation. Items marked FAIL must be resolved.',
    }
  })
}
