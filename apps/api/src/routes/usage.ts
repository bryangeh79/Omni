// Usage metering + cost summary routes (Phase 6).
// All endpoints are tenant-scoped via JWT. No cross-tenant access.
// AI costs are INTERNAL estimates — not customer-facing billing enforcement.
// WhatsApp / Meta official message fees are SEPARATE from AI costs tracked here.

import type { FastifyInstance } from 'fastify'
import { prisma }               from '@omni/db'
import { AI_MODEL_PRICING, calculateAiCostUsd } from '@omni/shared'
import { requireAuth, getAuthUser }             from '../auth'

// ── Date validation helper ────────────────────────────────────────────────────

function parseDate(s: string | undefined, fallbackDaysAgo: number): Date | null {
  if (!s) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - fallbackDaysAgo)
    d.setUTCHours(0, 0, 0, 0)
    return d
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00.000Z')
  return isNaN(d.getTime()) ? null : d
}

// ────────────────────────────────────────────────────────────────────────────

export async function usageRoutes(app: FastifyInstance) {

  // ── GET /usage/summary?from=YYYY-MM-DD&to=YYYY-MM-DD ────────────────────────
  // Tenant-scoped usage totals + daily breakdown for a date range.
  app.get<{
    Querystring: { from?: string; to?: string }
  }>('/summary', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { from, to } = req.query

    const fromDate = parseDate(from, 30)
    const toDate   = parseDate(to,   0)

    if (!fromDate) return reply.status(400).send({ error: 'Invalid from date. Use YYYY-MM-DD.' })
    if (!toDate)   return reply.status(400).send({ error: 'Invalid to date. Use YYYY-MM-DD.' })

    toDate.setUTCHours(23, 59, 59, 999)

    if (fromDate > toDate) {
      return reply.status(400).send({ error: 'from must not be after to' })
    }

    const records = await prisma.usageRecord.findMany({
      where:   { tenantId, date: { gte: fromDate, lte: toDate } },
      orderBy: { date: 'asc' },
    })

    const totalMessages   = records.reduce((s, r) => s + r.messages,  0)
    const totalLlmTokens  = records.reduce((s, r) => s + r.llmTokens, 0)
    const totalLlmCostUsd = records.reduce((s, r) => s + r.llmCostUsd, 0)

    return {
      tenantId,
      from:             fromDate.toISOString().slice(0, 10),
      to:               toDate.toISOString().slice(0, 10),
      totalMessages,
      totalAiReplies:   totalMessages,  // 1 AI reply per processed inbound message
      totalLlmTokens,
      totalLlmCostUsd:  Math.round(totalLlmCostUsd * 1_000_000) / 1_000_000,
      costNote:         'AI costs are internal estimates. Verify provider pricing before billing.',
      records:          records.map((r) => ({
        date:       r.date.toISOString().slice(0, 10),
        messages:   r.messages,
        llmTokens:  r.llmTokens,
        llmCostUsd: r.llmCostUsd,
      })),
    }
  })

  // ── GET /usage/ai-costs — provider pricing table ─────────────────────────────
  // Returns all known/estimated model pricing. No tenant data.
  app.get('/ai-costs', { preHandler: requireAuth }, async () => {
    return {
      note:         'Prices are estimates. Always verify against provider pricing pages before billing.',
      currency:     'USD',
      pricingTable: AI_MODEL_PRICING,
    }
  })

  // ── POST /usage/cost-calculator ──────────────────────────────────────────────
  // Internal cost estimation helper.
  // NOT customer-facing. Protected by tenant JWT only.
  app.post<{
    Body: {
      monthlyActiveCustomers?:  number
      avgAiRepliesPerCustomer?: number
      avgInputTokensPerReply?:  number
      avgOutputTokensPerReply?: number
      provider?:                string
      model?:                   string
      whatsappChannels?:        number
      metaMessageCostUsd?:      number
      serverCostUsd?:           number
      supportCostUsd?:          number
      targetGrossMarginPct?:    number
    }
  }>('/cost-calculator', { preHandler: requireAuth }, async (req, reply) => {
    const {
      monthlyActiveCustomers,
      avgAiRepliesPerCustomer,
      avgInputTokensPerReply,
      avgOutputTokensPerReply,
      provider,
      model,
      whatsappChannels,
      metaMessageCostUsd,
      serverCostUsd,
      supportCostUsd,
      targetGrossMarginPct,
    } = req.body ?? {}

    if (
      !monthlyActiveCustomers || !avgAiRepliesPerCustomer ||
      !avgInputTokensPerReply  || !avgOutputTokensPerReply ||
      !provider || !model
    ) {
      return reply.status(400).send({
        error: 'Required fields: monthlyActiveCustomers, avgAiRepliesPerCustomer, ' +
               'avgInputTokensPerReply, avgOutputTokensPerReply, provider, model',
      })
    }

    if (monthlyActiveCustomers <= 0 || avgAiRepliesPerCustomer <= 0) {
      return reply.status(400).send({
        error: 'monthlyActiveCustomers and avgAiRepliesPerCustomer must be > 0',
      })
    }

    const estimatedAiReplies    = Math.round(monthlyActiveCustomers * avgAiRepliesPerCustomer)
    const estimatedInputTokens  = estimatedAiReplies * avgInputTokensPerReply
    const estimatedOutputTokens = estimatedAiReplies * avgOutputTokensPerReply
    const estimatedTokens       = estimatedInputTokens + estimatedOutputTokens

    // Per-reply AI cost (null = unknown pricing for this model)
    const perReplyAiCost = calculateAiCostUsd({
      provider, model,
      inputTokens:  avgInputTokensPerReply,
      outputTokens: avgOutputTokensPerReply,
    })

    const estimatedAiCostUsd = perReplyAiCost !== null
      ? Math.round(perReplyAiCost * estimatedAiReplies * 1_000_000) / 1_000_000
      : null

    // Meta message cost — only if both metaMessageCostUsd and whatsappChannels provided
    const estimatedMetaMessageCostUsd =
      (typeof metaMessageCostUsd === 'number' && typeof whatsappChannels === 'number')
        ? Math.round(metaMessageCostUsd * estimatedAiReplies * 1_000_000) / 1_000_000
        : null

    // Total cost — only computable when AI cost is known
    const fixedCosts = (serverCostUsd ?? 0) + (supportCostUsd ?? 0)
    const estimatedTotalCostUsd =
      estimatedAiCostUsd !== null
        ? Math.round(
            (estimatedAiCostUsd + (estimatedMetaMessageCostUsd ?? 0) + fixedCosts) * 1_000_000,
          ) / 1_000_000
        : null

    // Minimum price to achieve target gross margin
    let suggestedMinimumPriceUsd: number | null = null
    if (
      estimatedTotalCostUsd !== null &&
      typeof targetGrossMarginPct === 'number' &&
      targetGrossMarginPct > 0 &&
      targetGrossMarginPct < 100
    ) {
      suggestedMinimumPriceUsd =
        Math.round((estimatedTotalCostUsd / (1 - targetGrossMarginPct / 100)) * 1_000_000) / 1_000_000
    }

    return {
      note:    'Internal cost calculator — NOT customer-facing. Verify provider pricing before any billing use.',
      inputs: {
        monthlyActiveCustomers,
        avgAiRepliesPerCustomer,
        avgInputTokensPerReply,
        avgOutputTokensPerReply,
        provider,
        model,
        whatsappChannels:     whatsappChannels     ?? null,
        metaMessageCostUsd:   metaMessageCostUsd   ?? null,
        serverCostUsd:        serverCostUsd         ?? null,
        supportCostUsd:       supportCostUsd         ?? null,
        targetGrossMarginPct: targetGrossMarginPct  ?? null,
      },
      estimatedAiReplies,
      estimatedTokens,
      estimatedAiCostUsd,
      estimatedMetaMessageCostUsd,
      estimatedTotalCostUsd,
      suggestedMinimumPriceUsd,
    }
  })
}
