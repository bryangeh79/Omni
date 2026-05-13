// Boss Dashboard Command Center API — Phase 11A
//
// GET /boss/today   — actionable today snapshot for the operator/owner
// GET /boss/metrics — aggregate metrics (30-day window)
//
// All data is DB-derived and tenant-scoped.
// No real AI provider calls. No secrets in responses.

import type { FastifyInstance } from 'fastify'
import { prisma }               from '@omni/db'
import { requireAuth, getAuthUser } from '../auth'

function todayRange(): { start: Date; end: Date } {
  const now   = new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end   = new Date(now); end.setHours(23, 59, 59, 999)
  return { start, end }
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

// ── Suggested action builder ──────────────────────────────────────────────────
interface ActionItem {
  priority:    'urgent' | 'high' | 'normal'
  type:        string
  label:       string
  count?:      number
  hint?:       string
  link?:       string
}

function buildSuggestedActions(data: {
  needHumanCount:         number
  highIntentUnhandled:    number
  overdueFollowUps:       number
  humanRemindersPending:  number
  dueFollowUpsToday:      number
  newCustomersToday:      number
}): ActionItem[] {
  const actions: ActionItem[] = []

  if (data.needHumanCount > 0) {
    actions.push({
      priority: 'urgent',
      type:     'NEED_HUMAN',
      label:    `${data.needHumanCount} conversation${data.needHumanCount > 1 ? 's' : ''} waiting for human`,
      count:    data.needHumanCount,
      hint:     'Customers are pending handoff — take over before they disengage.',
      link:     '/inbox',
    })
  }

  if (data.humanRemindersPending > 0) {
    actions.push({
      priority: 'urgent',
      type:     'HUMAN_REMINDER',
      label:    `${data.humanRemindersPending} high-intent customer reminder${data.humanRemindersPending > 1 ? 's' : ''}`,
      count:    data.humanRemindersPending,
      hint:     'High-intent customers require your personal attention.',
      link:     '/pwa',
    })
  }

  if (data.overdueFollowUps > 0) {
    actions.push({
      priority: 'high',
      type:     'OVERDUE_FOLLOWUP',
      label:    `${data.overdueFollowUps} overdue follow-up${data.overdueFollowUps > 1 ? 's' : ''}`,
      count:    data.overdueFollowUps,
      hint:     'These follow-ups are past due and may lose customer interest.',
      link:     '/pwa',
    })
  }

  if (data.highIntentUnhandled > 0) {
    actions.push({
      priority: 'high',
      type:     'HIGH_INTENT',
      label:    `${data.highIntentUnhandled} high-intent lead${data.highIntentUnhandled > 1 ? 's' : ''} to review`,
      count:    data.highIntentUnhandled,
      hint:     'Score ≥ 60 customers are showing buying signals.',
      link:     '/inbox',
    })
  }

  if (data.dueFollowUpsToday > 0) {
    actions.push({
      priority: 'normal',
      type:     'DUE_TODAY',
      label:    `${data.dueFollowUpsToday} follow-up${data.dueFollowUpsToday > 1 ? 's' : ''} due today`,
      count:    data.dueFollowUpsToday,
      hint:     'Stay on schedule for best conversion rates.',
      link:     '/pwa',
    })
  }

  if (data.newCustomersToday > 0) {
    actions.push({
      priority: 'normal',
      type:     'NEW_CUSTOMER',
      label:    `${data.newCustomersToday} new customer${data.newCustomersToday > 1 ? 's' : ''} today`,
      count:    data.newCustomersToday,
      hint:     'Review new leads and set their stage.',
      link:     '/inbox',
    })
  }

  // If everything is clear
  if (actions.length === 0) {
    actions.push({
      priority: 'normal',
      type:     'ALL_CLEAR',
      label:    'All caught up! No urgent actions needed.',
      hint:     'Check /inbox or /pwa for conversation history.',
    })
  }

  return actions
}

export async function bossRoutes(app: FastifyInstance) {

  // ── GET /boss/today ─────────────────────────────────────────────────────────
  app.get('/today', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const { start, end } = todayRange()
    const now = new Date()

    const [
      newCustomersToday,
      highIntentCustomers,
      needHumanConvs,
      overdueFollowUps,
      dueFollowUpsToday,
      humanRemindersPending,
      openConversations,
      closedToday,
      usageToday,
      pendingHandoffConvs,
    ] = await Promise.all([
      // New customers today
      prisma.customer.count({
        where: { tenantId, createdAt: { gte: start, lte: end } },
      }),
      // High-intent customers (score >= 60, not blacklisted)
      prisma.customer.count({
        where: { tenantId, score: { gte: 60 }, isBlacklisted: false },
      }),
      // Need-human conversations (PENDING_HANDOFF)
      prisma.conversation.count({
        where: { tenantId, status: 'PENDING_HANDOFF' },
      }),
      // Overdue follow-ups
      prisma.followUpTask.count({
        where: { tenantId, status: 'PENDING', dueAt: { lt: now } },
      }),
      // Follow-ups due today
      prisma.followUpTask.count({
        where: { tenantId, status: 'PENDING', dueAt: { gte: start, lte: end } },
      }),
      // Human reminder follow-ups pending
      prisma.followUpTask.count({
        where: { tenantId, status: 'PENDING', requiresHuman: true },
      }),
      // Open conversations (not CLOSED)
      prisma.conversation.count({
        where: { tenantId, status: { not: 'CLOSED' } },
      }),
      // Conversations closed today
      prisma.conversation.count({
        where: { tenantId, status: 'CLOSED', updatedAt: { gte: start, lte: end } },
      }),
      // AI usage today (best-effort)
      prisma.usageRecord.findFirst({
        where: { tenantId, date: start },
        select: { llmTokens: true, messages: true, llmCostUsd: true },
      }),
      // PENDING_HANDOFF conversations with customer summary
      prisma.conversation.findMany({
        where:   { tenantId, status: 'PENDING_HANDOFF' },
        include: { customer: { select: { id: true, name: true, phone: true, whatsappName: true, stage: true, score: true } } },
        orderBy: { lastMessageAt: 'desc' },
        take:    10,
      }),
    ])

    const suggestedActions = buildSuggestedActions({
      needHumanCount:        needHumanConvs,
      highIntentUnhandled:   highIntentCustomers,
      overdueFollowUps,
      humanRemindersPending,
      dueFollowUpsToday,
      newCustomersToday,
    })

    return {
      tenantId,
      asOf:                  now.toISOString(),
      today: {
        newCustomers:          newCustomersToday,
        needHuman:             needHumanConvs,
        highIntentCustomers,
        overdueFollowUps,
        dueFollowUpsToday,
        humanRemindersPending,
        openConversations,
        closedToday,
        aiReplies:             usageToday?.messages ?? 0,
        aiCostUsd:             usageToday?.llmCostUsd ?? 0,
      },
      urgentCustomers: pendingHandoffConvs.map((c) => ({
        conversationId: c.id,
        status:         c.status,
        lastMessageAt:  c.lastMessageAt,
        customer:       c.customer,
      })),
      suggestedActions,
    }
  })

  // ── GET /boss/metrics ────────────────────────────────────────────────────────
  app.get('/metrics', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const { start: todayStart } = todayRange()
    const past30 = daysAgo(30)
    const now    = new Date()

    const [
      totalCustomers,
      newCustomers30d,
      highIntentCustomers,
      stageBreakdown,
      openConvs,
      pendingHandoff,
      closedToday,
      closed30d,
      followUpPending,
      followUpOverdue,
      followUpCompleted30d,
      usageRecords,
    ] = await Promise.all([
      prisma.customer.count({ where: { tenantId } }),
      prisma.customer.count({ where: { tenantId, createdAt: { gte: past30 } } }),
      prisma.customer.count({ where: { tenantId, score: { gte: 60 }, isBlacklisted: false } }),
      prisma.customer.groupBy({
        by:    ['stage'],
        where: { tenantId },
        _count: { stage: true },
      }),
      prisma.conversation.count({ where: { tenantId, status: { not: 'CLOSED' } } }),
      prisma.conversation.count({ where: { tenantId, status: 'PENDING_HANDOFF' } }),
      prisma.conversation.count({ where: { tenantId, status: 'CLOSED', updatedAt: { gte: todayStart } } }),
      prisma.conversation.count({ where: { tenantId, status: 'CLOSED', updatedAt: { gte: past30 } } }),
      prisma.followUpTask.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.followUpTask.count({ where: { tenantId, status: 'PENDING', dueAt: { lt: now } } }),
      prisma.followUpTask.count({ where: { tenantId, status: 'DONE', completedAt: { gte: past30 } } }),
      prisma.usageRecord.findMany({
        where:   { tenantId, date: { gte: past30 } },
        select:  { messages: true, llmTokens: true, llmCostUsd: true },
      }),
    ])

    const totalReplies  = usageRecords.reduce((s, r) => s + r.messages, 0)
    const totalTokens   = usageRecords.reduce((s, r) => s + r.llmTokens, 0)
    const totalCostUsd  = usageRecords.reduce((s, r) => s + r.llmCostUsd, 0)

    const stages: Record<string, number> = {}
    for (const row of stageBreakdown) stages[row.stage] = row._count.stage

    return {
      tenantId,
      asOf:          now.toISOString(),
      customers: {
        total:          totalCustomers,
        new30d:         newCustomers30d,
        highIntent:     highIntentCustomers,
        stageBreakdown: stages,
      },
      conversations: {
        open:           openConvs,
        pendingHandoff,
        closedToday,
        closed30d,
      },
      followUps: {
        pending:        followUpPending,
        overdue:        followUpOverdue,
        completed30d:   followUpCompleted30d,
      },
      usage30d: {
        aiReplies:      totalReplies,
        llmTokens:      totalTokens,
        estimatedCostUsd: totalCostUsd,
      },
    }
  })

  // ── GET /boss/pipeline ───────────────────────────────────────────────────────
  // Lead pipeline analytics — stage distribution + conversion insights.
  // Supports ?range=today|7d|30d (default: 30d).
  app.get<{ Querystring: { range?: string } }>(
    '/pipeline',
    { preHandler: requireAuth },
    async (req) => {
      const { tenantId } = getAuthUser(req)
      const range  = req.query.range ?? '30d'
      const since  = range === 'today' ? todayRange().start : daysAgo(range === '7d' ? 7 : 30)
      const now    = new Date()

      const [
        stageDistribution,
        highIntentNoOwner,
        wonSince,
        lostSince,
        newSince,
        overdueByStage,
        followUpsByStage,
      ] = await Promise.all([
        // All customer stage counts
        prisma.customer.groupBy({
          by:    ['stage'],
          where: { tenantId, isBlacklisted: false },
          _count: { stage: true },
        }),
        // High-intent with no owner assigned
        prisma.customer.count({
          where: { tenantId, stage: 'HIGH_INTENT', ownerId: null, isBlacklisted: false },
        }),
        // Won in the period
        prisma.customer.count({
          where: { tenantId, stage: 'WON', updatedAt: { gte: since } },
        }),
        // Lost in the period
        prisma.customer.count({
          where: { tenantId, stage: 'LOST', updatedAt: { gte: since } },
        }),
        // New leads in the period
        prisma.customer.count({
          where: { tenantId, createdAt: { gte: since } },
        }),
        // Overdue follow-up tasks grouped by customer stage
        prisma.followUpTask.findMany({
          where:   { tenantId, status: 'PENDING', dueAt: { lt: now } },
          include: { customer: { select: { stage: true } } },
        }),
        // Pending follow-up tasks (all) for per-stage count
        prisma.followUpTask.findMany({
          where:   { tenantId, status: 'PENDING' },
          include: { customer: { select: { stage: true } } },
        }),
      ])

      // Build stage distribution map
      const stages: Record<string, number> = {}
      for (const row of stageDistribution) stages[row.stage] = row._count.stage

      // Build overdue count by stage
      const overdueCountByStage: Record<string, number> = {}
      for (const t of overdueByStage) {
        const s = t.customer.stage
        overdueCountByStage[s] = (overdueCountByStage[s] ?? 0) + 1
      }

      // Build pending follow-up count by stage
      const followUpCountByStage: Record<string, number> = {}
      for (const t of followUpsByStage) {
        const s = t.customer.stage
        followUpCountByStage[s] = (followUpCountByStage[s] ?? 0) + 1
      }

      // Pipeline health score (simple: % of active leads in INTERESTED or above)
      const total = Object.values(stages).reduce((a, b) => a + b, 0)
      const warm  = (stages['INTERESTED'] ?? 0) + (stages['HIGH_INTENT'] ?? 0) +
                    (stages['QUOTED'] ?? 0)      + (stages['BOOKED'] ?? 0)
      const pipelineHealthPct = total > 0 ? Math.round((warm / total) * 100) : 0

      // Funnel order for display
      const FUNNEL = ['NEW', 'INTERESTED', 'HIGH_INTENT', 'QUOTED', 'BOOKED', 'WON', 'LOST', 'AFTER_SALES']
      const funnel = FUNNEL.map((stage) => ({
        stage,
        count:             stages[stage] ?? 0,
        overdueFollowUps:  overdueCountByStage[stage] ?? 0,
        pendingFollowUps:  followUpCountByStage[stage] ?? 0,
      }))

      return {
        tenantId,
        range,
        asOf:              now.toISOString(),
        funnel,
        summary: {
          totalLeads:          total,
          newSince,
          wonSince,
          lostSince,
          highIntentNoOwner,
          pipelineHealthPct,
          note:               pipelineHealthPct >= 50 ? 'Pipeline is healthy' :
                              pipelineHealthPct >= 20 ? 'Pipeline needs attention' :
                                                       'Pipeline is stalled — review follow-up strategy',
        },
        // TODO Phase 12: price-asked-to-quoted conversion rate (needs message content tagging)
        priceAskedConversion: {
          available:  false,
          note:       'Requires message content tagging — Phase 12',
        },
      }
    },
  )

  // ── GET /boss/agents ─────────────────────────────────────────────────────────
  // Per-agent / per-owner performance foundation.
  // Based on Conversation.assignedUserId (may be null for unassigned).
  app.get('/agents', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const past30 = daysAgo(30)
    const now    = new Date()

    const [users, agentWorkload] = await Promise.all([
      prisma.user.findMany({
        where:  { tenantId, isActive: true },
        select: { id: true, name: true, email: true, role: true },
      }),
      // All non-closed conversations for this tenant
      prisma.conversation.findMany({
        where:   { tenantId, status: { not: 'CLOSED' } },
        select:  { assignedUserId: true, status: true, lastMessageAt: true },
      }),
    ])

    const closedByAgent = await prisma.conversation.groupBy({
      by:    ['assignedUserId'],
      where: { tenantId, status: 'CLOSED', updatedAt: { gte: past30 } },
      _count: { assignedUserId: true },
    })

    const handoffByAgent = await prisma.conversation.groupBy({
      by:    ['assignedUserId'],
      where: { tenantId, status: 'HUMAN_HANDLING', lastMessageAt: { gte: past30 } },
      _count: { assignedUserId: true },
    })

    const closedMap: Record<string, number> = {}
    const handoffMap: Record<string, number> = {}
    for (const row of closedByAgent)  if (row.assignedUserId) closedMap[row.assignedUserId]  = row._count.assignedUserId
    for (const row of handoffByAgent) if (row.assignedUserId) handoffMap[row.assignedUserId] = row._count.assignedUserId

    const openByAgent: Record<string, number> = {}
    for (const conv of agentWorkload) {
      if (conv.assignedUserId) {
        openByAgent[conv.assignedUserId] = (openByAgent[conv.assignedUserId] ?? 0) + 1
      }
    }

    const agentStats = users.map((u) => ({
      userId:          u.id,
      name:            u.name,
      email:           u.email,
      role:            u.role,
      openConversations: openByAgent[u.id] ?? 0,
      closedLast30d:   closedMap[u.id]  ?? 0,
      handledLast30d:  handoffMap[u.id] ?? 0,
    }))

    // Unassigned conversations
    const unassigned = agentWorkload.filter((c) => !c.assignedUserId).length

    return {
      tenantId,
      asOf:        now.toISOString(),
      agents:      agentStats,
      unassigned,
      note:        'Avg response time not yet tracked — Phase 12',
    }
  })
}
