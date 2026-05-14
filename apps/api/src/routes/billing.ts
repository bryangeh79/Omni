// Billing / Plan Readiness API — Phase 15A
//
// GET  /billing/plans             — static plan definitions (no real payment)
// GET  /billing/usage-summary     — current month usage from UsageRecord
// POST /billing/select-plan-draft — save plan preference (no charge, no payment gateway)
//
// Safety:
//   - All endpoints auth-required, tenant-scoped.
//   - No real payment gateway, no real charging.
//   - Meta official API fees explicitly stated as pass-through/credits — not bundled.
//   - No secrets in responses.

import type { FastifyInstance } from 'fastify'
import { prisma }               from '@omni/db'
import { requireAuth, requireRole, getAuthUser } from '../auth'
import { createAuditLog }                        from '../lib/audit'
import {
  PLANS as PLAN_DEFS, ADD_ONS, RECOMMENDED_ADD_ONS, META_API_FEE_NOTE,
} from '../lib/plans'
import {
  getQuotaSummary, setAiSmartReplyEnabled, createPurchaseIntent, processStubPaymentEvent,
} from '../lib/quota'

// ── Plan definitions ───────────────────────────────────────────────────────
const PLANS = [
  {
    id:          'starter',
    name:        'Starter',
    priceRm:     199,
    period:      'month',
    channels:    1,
    users:       2,
    features: [
      '1 WhatsApp channel (WA Web or Meta)',
      'AI customer service replies',
      'Basic CRM (customers, tags, stage)',
      'Basic FAQ knowledge base',
      'Basic follow-up automation',
      'Boss Today dashboard',
      'Mobile PWA',
    ],
    limits: {
      aiRepliesPerMonth:        2000,
      customersPerMonth:        500,
      knowledgeItems:           50,
    },
    metaApiFeeNote:      'Meta WhatsApp API message fees are NOT included — billed separately as pass-through credits at cost.',
    ordinaryWaNote:      'Ordinary WhatsApp (WA Web) entry supported; session stability is best-effort per WhatsApp ToS.',
    noBroadcastNote:     'Bulk broadcast and marketing blast are not supported — 1:1 AI customer service only.',
    recommended:         false,
  },
  {
    id:          'pro',
    name:        'Pro',
    priceRm:     499,
    period:      'month',
    channels:    3,
    users:       5,
    features: [
      '1–3 WhatsApp channels',
      'Full AI customer service + lead scoring',
      'High-intent alerts and escalation',
      'Automated follow-up + conversion rules',
      'Full Boss Dashboard + lead pipeline',
      'Multi-user team (up to 5)',
      'Knowledge base (up to 200 items)',
      'Mobile PWA + inbox',
    ],
    limits: {
      aiRepliesPerMonth:        8000,
      customersPerMonth:        2000,
      knowledgeItems:           200,
    },
    metaApiFeeNote:      'Meta WhatsApp API message fees are NOT included — billed separately as pass-through credits at cost.',
    ordinaryWaNote:      'Ordinary WhatsApp (WA Web) entry supported; session stability is best-effort per WhatsApp ToS.',
    noBroadcastNote:     'Bulk broadcast and marketing blast are not supported — 1:1 AI customer service only.',
    recommended:         true,
  },
  {
    id:          'business',
    name:        'Business',
    priceRm:     999,
    period:      'month',
    channels:    10,
    users:       20,
    features: [
      'Multi-channel + multi-agent support',
      'Higher AI usage volume',
      'Meta WhatsApp Business Platform official API',
      'Advanced Boss Dashboard + analytics',
      'Priority support and onboarding',
      'Custom follow-up automation',
      'Knowledge base (up to 1000 items)',
      'SLA-based uptime commitment',
    ],
    limits: {
      aiRepliesPerMonth:        30000,
      customersPerMonth:        10000,
      knowledgeItems:           1000,
    },
    metaApiFeeNote:      'Meta WhatsApp API message fees are NOT included — billed separately as pass-through credits at cost. Enterprise volume pricing available.',
    ordinaryWaNote:      'Ordinary WhatsApp (WA Web) also supported; Meta official API recommended for Business plan.',
    noBroadcastNote:     'Bulk broadcast and marketing blast are not supported — 1:1 AI customer service only.',
    recommended:         false,
  },
]

export async function billingRoutes(app: FastifyInstance) {

  // ── GET /billing/plans ────────────────────────────────────────────────────
  app.get('/plans', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)

    const tenant = await prisma.tenant.findUnique({
      where:  { id: tenantId },
      select: { plan: true },
    })

    return {
      tenantId,
      currentPlan:  tenant?.plan ?? 'trial',
      plans:        PLANS,
      boundary: {
        noBroadcast:   'Bulk broadcast, ads, and mass marketing are NOT supported in any plan.',
        metaFees:      'Meta official API per-conversation fees are pass-through credits, not bundled in plan price.',
        ordinaryWa:    'Ordinary WhatsApp (WA Web) session stability is best-effort per WhatsApp ToS.',
        noRealCharge:  'Billing is in planning mode — no real charges are applied until payment gateway is configured.',
      },
      paymentGateway: 'NOT_CONFIGURED',
      note: 'Plan selection is a draft preference. No real charging occurs in this phase.',
    }
  })

  // ── GET /billing/usage-summary ────────────────────────────────────────────
  app.get('/usage-summary', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const now   = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)

    const [usageRows, customerCount, kbCount] = await Promise.all([
      prisma.usageRecord.findMany({
        where:   { tenantId, date: { gte: start } },
        select:  { llmTokens: true, llmCostUsd: true, messages: true },
      }),
      prisma.customer.count({ where: { tenantId } }),
      prisma.knowledgeItem.count({ where: { tenantId, isActive: true } }),
    ])

    const totalAiReplies  = usageRows.reduce((s, r) => s + r.messages, 0)
    const totalLlmTokens  = usageRows.reduce((s, r) => s + r.llmTokens, 0)
    const totalCostUsd    = usageRows.reduce((s, r) => s + r.llmCostUsd, 0)

    const tenant = await prisma.tenant.findUnique({
      where:  { id: tenantId },
      select: { plan: true },
    })
    const currentPlan = PLANS.find(p => p.id === (tenant?.plan ?? 'trial')) ?? PLANS[0]

    return {
      tenantId,
      period:     `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      currentPlan: tenant?.plan ?? 'trial',
      usage: {
        aiRepliesThisMonth:    totalAiReplies,
        llmTokensThisMonth:    totalLlmTokens,
        estimatedCostUsd:      parseFloat(totalCostUsd.toFixed(4)),
        estimatedCostRm:       parseFloat((totalCostUsd * 4.5).toFixed(2)),  // rough USD→RM
        customers:             customerCount,
        activeKnowledgeItems:  kbCount,
      },
      planLimits: {
        aiRepliesPerMonth:     currentPlan.limits.aiRepliesPerMonth,
        customersPerMonth:     currentPlan.limits.customersPerMonth,
        knowledgeItems:        currentPlan.limits.knowledgeItems,
      },
      metaFeeNote: 'Meta official API message fees are not included in this usage summary — billed separately.',
    }
  })

  // ── POST /billing/select-plan-draft ───────────────────────────────────────
  // Save plan preference — NO real charge, NO payment gateway
  app.post<{ Body: { planId?: string } }>(
    '/select-plan-draft',
    { preHandler: requireRole('OWNER', 'ADMIN') },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const { planId }   = req.body ?? {}

      const validIds = PLANS.map(p => p.id)
      if (!planId || !validIds.includes(planId)) {
        return reply.status(400).send({
          error: `Invalid planId. Valid: ${validIds.join(', ')}`,
        })
      }

      // Update tenant plan field (draft preference, no real charge)
      await prisma.tenant.update({
        where: { id: tenantId },
        data:  { plan: planId },
      })

      const selectedPlan = PLANS.find(p => p.id === planId)!

      void createAuditLog({
        tenantId,
        actorUserId: getAuthUser(req).userId,
        actorRole:   getAuthUser(req).role,
        action:      'BILLING_PLAN_SELECTED',
        entityType:  'Tenant',
        entityId:    tenantId,
        metadata:    { planId, priceRm: selectedPlan.priceRm },
      })

      return {
        saved:          true,
        tenantId,
        selectedPlan:   planId,
        priceRm:        selectedPlan.priceRm,
        charged:        false,
        paymentGateway: 'NOT_CONFIGURED',
        note: 'Plan preference saved. No real charging occurs — payment gateway not configured in this phase.',
      }
    }
  )

  // ════════════════════════════════════════════════════════════════════════
  // Round-9A: Quota + AI Smart Reply + Add-on Foundation
  // No real payment gateway. All endpoints tenant-scoped and auditable.
  // ════════════════════════════════════════════════════════════════════════

  // ── GET /billing/plan-definitions ───────────────────────────────────────
  // Returns Round-9A plan + add-on spec for tenant-facing UI.
  app.get('/plan-definitions', { preHandler: requireAuth }, async () => {
    return {
      plans: PLAN_DEFS,
      addOns: ADD_ONS,
      recommendedAddOnIds: RECOMMENDED_ADD_ONS,
      metaApiFeeNote: META_API_FEE_NOTE,
      noBroadcastNote: 'Omni 仅用于 1:1 WhatsApp AI 客服与成交跟进，不支持广播 / 广告 / 群发。',
      realAiProviderCalled: false,
      realPaymentGatewayCalled: false,
    }
  })

  // ── GET /billing/quota-summary ──────────────────────────────────────────
  app.get('/quota-summary', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } })
    const planId = tenant?.plan ?? 'trial'

    // Compute current usage counters from existing tables.
    const [usedProductSlots, usedWhatsapp, usedTeamUsers] = await Promise.all([
      // Active products live in OnboardingDraft.generatedPreview.products[] (Round-8).
      prisma.onboardingDraft.findUnique({ where: { tenantId }, select: { generatedPreview: true } })
        .then(d => {
          const p = (d?.generatedPreview as Record<string, unknown> | null)?.products
          return Array.isArray(p) ? p.length : 0
        }),
      prisma.channel.count({ where: { tenantId, isActive: true } }).catch(() => 0),
      prisma.user.count({ where: { tenantId, isActive: true } }),
    ])

    const summary = await getQuotaSummary(tenantId, planId, usedProductSlots, usedWhatsapp, usedTeamUsers)
    return {
      ...summary,
      addOns: ADD_ONS,
      recommendedAddOnIds: RECOMMENDED_ADD_ONS[planId as keyof typeof RECOMMENDED_ADD_ONS] ?? [],
      metaApiFeeNote: META_API_FEE_NOTE,
      realAiProviderCalled: false,
      realPaymentGatewayCalled: false,
    }
  })

  // ── POST /billing/ai-smart-reply ────────────────────────────────────────
  // Body: { enabled: boolean }
  app.post<{ Body: { enabled?: boolean } }>(
    '/ai-smart-reply',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const enabled = req.body?.enabled
      if (typeof enabled !== 'boolean') return reply.status(400).send({ error: 'enabled (boolean) is required' })
      const value = await setAiSmartReplyEnabled(tenantId, enabled)
      await createAuditLog({
        tenantId, actorUserId: getAuthUser(req).userId, actorRole: getAuthUser(req).role,
        action: 'BILLING_AI_SMART_REPLY_TOGGLED', entityType: 'TenantBillingState', entityId: tenantId,
        metadata: { enabled: value },
      })
      return { aiSmartReplyEnabled: value, realAiProviderCalled: false }
    },
  )

  // ── POST /billing/purchase-intent ───────────────────────────────────────
  // Body: { addOnId: string }
  // Creates a pending purchase intent in the ledger. Does NOT charge.
  app.post<{ Body: { addOnId?: string } }>(
    '/purchase-intent',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const addOnId = req.body?.addOnId
      if (!addOnId) return reply.status(400).send({ error: 'addOnId is required' })
      try {
        const result = await createPurchaseIntent(tenantId, addOnId)
        return reply.status(201).send({
          intentId: result.intentId,
          addOn:    { id: result.addOn.id, label: result.addOn.label, priceRm: result.addOn.priceRm, recurring: result.addOn.recurring },
          status:   'pending',
          charged:  false,
          paymentGateway: 'NOT_CONFIGURED',
          note: '已创建购买意向。未触发真实付款；需后续 stub payment event 才会应用余额。',
          realPaymentGatewayCalled: false,
        })
      } catch (e) {
        return reply.status(400).send({ error: e instanceof Error ? e.message : 'create intent failed' })
      }
    },
  )

  // ── POST /billing/payment-event ─────────────────────────────────────────
  // Stub-mode payment event. In production this will be a signed webhook from a
  // payment provider. For now we accept trusted server-side calls and apply on success.
  // Body: { intentId, externalEventId, status, note? }
  app.post<{ Body: { intentId?: string; externalEventId?: string; status?: 'success' | 'failed' | 'pending'; note?: string } }>(
    '/payment-event',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const { intentId, externalEventId, status, note } = req.body ?? {}
      if (!intentId)        return reply.status(400).send({ error: 'intentId is required' })
      if (!externalEventId) return reply.status(400).send({ error: 'externalEventId is required (idempotency)' })
      if (!status || !['success', 'failed', 'pending'].includes(status))
        return reply.status(400).send({ error: 'status must be success | failed | pending' })
      try {
        const result = await processStubPaymentEvent(tenantId, { intentId, externalEventId, status, note })
        await createAuditLog({
          tenantId, actorUserId: getAuthUser(req).userId, actorRole: getAuthUser(req).role,
          action: 'BILLING_PAYMENT_EVENT_PROCESSED', entityType: 'TenantBillingState', entityId: tenantId,
          metadata: { intentId, status, applied: result.applied, alreadyProcessed: result.alreadyProcessed },
        })
        return {
          ...result,
          realPaymentGatewayCalled: false,
          paymentGateway: 'NOT_CONFIGURED',
          note: result.alreadyProcessed
            ? '该 externalEventId 已处理过；返回之前的结果（idempotent）。'
            : (result.applied ? '付款成功，已应用余额。' : 'pending / failed — 未应用任何余额变更。'),
        }
      } catch (e) {
        return reply.status(400).send({ error: e instanceof Error ? e.message : 'process failed' })
      }
    },
  )
}
