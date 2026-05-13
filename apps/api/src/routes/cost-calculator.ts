// Internal Cost / Pricing Calculator — Phase 11A
//
// GET  /admin/cost-calculator/defaults   — default pricing assumptions
// POST /admin/cost-calculator/estimate   — compute cost + margin estimate
//
// This is internal admin/owner planning, NOT customer-facing billing enforcement.
// All calculations are deterministic — no external API calls.
//
// Cost separation:
//   AI costs:   LLM token usage (OpenAI / Gemini / DeepSeek)
//   Meta costs: WhatsApp Business API message fees (passed through, NOT collected here)
//   Server/ops: infrastructure, support, payment processor
//
// Package pricing assumptions (Malaysia / regional SaaS):
//   Starter:  RM 199/month  — up to 3 agents, 500 customers
//   Pro:      RM 499/month  — up to 10 agents, 2000 customers
//   Business: RM 999+/month — unlimited agents, 10000+ customers

import type { FastifyInstance } from 'fastify'
import { requireRole }          from '../auth'

// ── USD → MYR conversion (approximate; update periodically) ──────────────────
const USD_TO_MYR = 4.7

// ── Package definitions ───────────────────────────────────────────────────────
const PACKAGES = [
  {
    name:           'Starter',
    priceRm:        199,
    maxAgents:      3,
    maxCustomers:   500,
    features:       ['AI auto-reply', 'Inbox', 'CRM', 'Follow-up automation'],
    targetMonthlyActiveCustomers: 100,
  },
  {
    name:           'Pro',
    priceRm:        499,
    maxAgents:      10,
    maxCustomers:   2000,
    features:       ['All Starter', 'Boss Dashboard', 'Analytics', 'Priority support'],
    targetMonthlyActiveCustomers: 500,
  },
  {
    name:           'Business',
    priceRm:        999,
    maxAgents:      -1,  // unlimited
    maxCustomers:   -1,  // unlimited
    features:       ['All Pro', 'Custom AI persona', 'SLA support', 'Custom integrations'],
    targetMonthlyActiveCustomers: 2000,
  },
] as const

// ── Default cost assumptions ──────────────────────────────────────────────────
const DEFAULTS = {
  // AI costs (USD per 1000 AI replies, using gpt-4o-mini as reference)
  aiCostPer1kRepliesUsd:         0.08,   // ~600 input + 150 output tokens × $0.15/$0.60 per 1M
  // Meta WhatsApp Business API message fees (per message, varies by country + type)
  // Conversation-based pricing: up to 24h window per "conversation"
  metaConversationFeeUsd:         0.04,   // approximate; verify at Meta pricing page
  // Server / infrastructure (monthly, shared across all tenants)
  serverCostUsdPerMonthBase:     100,    // VPS + DB + Redis + CDN
  serverCostUsdPerTenant:          5,    // per-tenant share
  // Support cost
  supportCostUsdPerMonthBase:     50,
  // Payment processor (e.g., Stripe 2.9% + $0.30)
  paymentProcessorPctFee:          0.029,
  // Currency
  usdToMyr:                       USD_TO_MYR,
}

// ── Estimate calculator ───────────────────────────────────────────────────────
interface EstimateInput {
  tenantCount?:                  number
  activeCustomersPerTenant?:     number
  avgAiRepliesPerCustomer?:      number
  aiCostPer1kRepliesUsd?:        number
  metaConversationFeeUsd?:       number
  serverCostUsdPerMonthBase?:    number
  serverCostUsdPerTenant?:       number
  supportCostUsdPerMonthBase?:   number
  selectedPackageName?:          string   // Starter | Pro | Business
  targetGrossMarginPct?:         number   // e.g. 60 = 60%
}

function computeEstimate(input: EstimateInput) {
  const tenants       = Math.max(1,    input.tenantCount                  ?? 10)
  const customers     = Math.max(1,    input.activeCustomersPerTenant     ?? 100)
  const repliesPerCust = Math.max(0,   input.avgAiRepliesPerCustomer      ?? 5)
  const aiCost1k      = Math.max(0,    input.aiCostPer1kRepliesUsd        ?? DEFAULTS.aiCostPer1kRepliesUsd)
  const metaFee       = Math.max(0,    input.metaConversationFeeUsd       ?? DEFAULTS.metaConversationFeeUsd)
  const serverBase    = Math.max(0,    input.serverCostUsdPerMonthBase    ?? DEFAULTS.serverCostUsdPerMonthBase)
  const serverPerTen  = Math.max(0,    input.serverCostUsdPerTenant       ?? DEFAULTS.serverCostUsdPerTenant)
  const supportBase   = Math.max(0,    input.supportCostUsdPerMonthBase   ?? DEFAULTS.supportCostUsdPerMonthBase)
  const targetMargin  = Math.max(0,    input.targetGrossMarginPct         ?? 60)
  const pkg           = PACKAGES.find((p) => p.name === input.selectedPackageName) ?? PACKAGES[1]

  // ── AI cost ─────────────────────────────────────────────────────────────────
  const totalReplies         = tenants * customers * repliesPerCust
  const totalAiCostUsd       = (totalReplies / 1000) * aiCost1k

  // ── Meta cost (conversations, not messages 1:1) ─────────────────────────────
  // Each customer typically starts 1-2 WhatsApp conversations/month
  const metaConversations    = tenants * customers * 1.2  // rough: 1.2 conversations per customer
  const totalMetaCostUsd     = metaConversations * metaFee

  // ── Infrastructure cost ──────────────────────────────────────────────────────
  const totalServerCostUsd   = serverBase + (serverPerTen * tenants)
  const totalSupportCostUsd  = supportBase
  const totalCostUsd         = totalAiCostUsd + totalMetaCostUsd + totalServerCostUsd + totalSupportCostUsd

  // ── Revenue at selected package ──────────────────────────────────────────────
  const revenueRm            = tenants * pkg.priceRm
  const revenueUsd           = revenueRm / USD_TO_MYR
  const grossProfitUsd       = revenueUsd - totalCostUsd
  const grossMarginPct       = revenueUsd > 0 ? (grossProfitUsd / revenueUsd) * 100 : 0

  // ── Break-even price at target margin ────────────────────────────────────────
  const totalCostRm          = totalCostUsd * USD_TO_MYR
  const breakEvenRmPerTenant = totalCostRm / tenants
  const suggestedMinPriceRm  = Math.ceil(breakEvenRmPerTenant / (1 - targetMargin / 100))

  // ── Package recommendation ───────────────────────────────────────────────────
  let recommendation = ''
  if (suggestedMinPriceRm <= 199) recommendation = 'Starter (RM 199) — margins look healthy'
  else if (suggestedMinPriceRm <= 499) recommendation = 'Pro (RM 499) — covers costs with margin'
  else if (suggestedMinPriceRm <= 999) recommendation = 'Business (RM 999) — needed to cover costs'
  else recommendation = 'Custom pricing required — costs exceed Business package'

  return {
    inputs: { tenants, customers, repliesPerCust, aiCost1k, metaFee, serverBase, serverPerTen, supportBase, targetMargin },
    ai: {
      totalReplies,
      totalAiCostUsd:            round2(totalAiCostUsd),
      totalAiCostRm:             round2(totalAiCostUsd * USD_TO_MYR),
    },
    meta: {
      estimatedConversations:    Math.round(metaConversations),
      totalMetaCostUsd:          round2(totalMetaCostUsd),
      totalMetaCostRm:           round2(totalMetaCostUsd * USD_TO_MYR),
      note:                      'Meta WhatsApp conversation fees are passed through — verify current Meta pricing.',
    },
    infrastructure: {
      serverCostUsd:             round2(totalServerCostUsd),
      supportCostUsd:            round2(totalSupportCostUsd),
    },
    totals: {
      totalCostUsd:              round2(totalCostUsd),
      totalCostRm:               round2(totalCostRm),
      costPerTenantRm:           round2(totalCostRm / tenants),
    },
    revenue: {
      selectedPackage:           pkg.name,
      packagePriceRm:            pkg.priceRm,
      totalRevenueRm:            round2(revenueRm),
      grossProfitRm:             round2(grossProfitUsd * USD_TO_MYR),
      grossMarginPct:            round2(grossMarginPct),
    },
    recommendation: {
      breakEvenRmPerTenant:      round2(breakEvenRmPerTenant),
      suggestedMinPriceRm,
      advice:                    recommendation,
    },
    packages:                    PACKAGES.map((p) => ({
      name: p.name, priceRm: p.priceRm, maxAgents: p.maxAgents, maxCustomers: p.maxCustomers,
    })),
  }
}

function round2(n: number) { return Math.round(n * 100) / 100 }

export async function costCalculatorRoutes(app: FastifyInstance) {

  // ── GET /admin/cost-calculator/defaults ────────────────────────────────────
  // No auth required — public assumptions (no secrets, no tenant data).
  app.get('/defaults', async () => ({
    defaults:  DEFAULTS,
    packages:  PACKAGES.map((p) => ({ name: p.name, priceRm: p.priceRm, features: p.features })),
    note:      'All figures are estimates. Meta WhatsApp fees vary by country and conversation type. Verify before any pricing decisions.',
    currency:  { primary: 'MYR', secondary: 'USD', usdToMyr: USD_TO_MYR },
  }))

  // ── POST /admin/cost-calculator/estimate ───────────────────────────────────
  // Requires OWNER or ADMIN role (internal planning only).
  app.post<{ Body: EstimateInput }>(
    '/estimate',
    { preHandler: requireRole('OWNER', 'ADMIN') },
    async (req, reply) => {
      const input = req.body ?? {}
      if (typeof input !== 'object') return reply.status(400).send({ error: 'Body must be a JSON object' })
      return computeEstimate(input)
    },
  )

  // ── GET /admin/cost-calculator/packages ───────────────────────────────────
  // Public — package list for display.
  app.get('/packages', async () => ({
    packages: PACKAGES,
    currency: 'MYR',
  }))
}
