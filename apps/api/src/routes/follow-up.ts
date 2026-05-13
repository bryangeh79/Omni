// Follow-up Task routes — Phase 9B
// All endpoints are tenant-scoped via req.user.tenantId from JWT.
//
// GET  /follow-ups            — list tasks (today/overdue/all)
// POST /follow-ups/:id/complete
// POST /follow-ups/:id/cancel
// POST /follow-ups/schedule-demo — create test task for smoke/demo

import type { FastifyInstance } from 'fastify'
import { prisma, FollowUpStatus } from '@omni/db'
import type { Prisma } from '@omni/db'
import { requireAuth, getAuthUser } from '../auth'
import {
  completeFollowUpTask,
  cancelFollowUpTask,
  SCENARIO_STEPS,
} from '../follow-up-engine'

const VALID_SCENARIOS = Object.keys(SCENARIO_STEPS)

export async function followUpRoutes(app: FastifyInstance) {

  // ──────────────────────────────────────────────────────────────────────────
  // GET /follow-ups
  // ?status=PENDING|DONE|CANCELLED|SKIPPED
  // ?today=true    → dueAt today
  // ?overdue=true  → dueAt in the past + still PENDING
  // ?requiresHuman=true
  // ──────────────────────────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      status?:        string
      today?:         string
      overdue?:       string
      requiresHuman?: string
      page?:          string
      pageSize?:      string
    }
  }>('/', { preHandler: requireAuth }, async (req, _reply) => {
    const { tenantId } = getAuthUser(req)
    const { status, today, overdue, requiresHuman } = req.query

    const page     = Math.max(1, parseInt(req.query.page ?? '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize ?? '50', 10) || 50))

    const where: Prisma.FollowUpTaskWhereInput = { tenantId }

    if (status && Object.values(FollowUpStatus).includes(status as FollowUpStatus)) {
      where.status = status as FollowUpStatus
    }
    if (requiresHuman === 'true')  where.requiresHuman = true
    if (requiresHuman === 'false') where.requiresHuman = false

    const now   = new Date()
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
    const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999)

    if (overdue === 'true') {
      where.status = FollowUpStatus.PENDING
      where.dueAt  = { lt: now }
    } else if (today === 'true') {
      where.dueAt = { gte: todayStart, lte: todayEnd }
    }

    const [rows, total] = await Promise.all([
      prisma.followUpTask.findMany({
        where,
        include: {
          customer:     { select: { id: true, name: true, phone: true, whatsappName: true, stage: true, score: true } },
          conversation: { select: { id: true, status: true, channelId: true } },
        },
        orderBy: { dueAt: 'asc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.followUpTask.count({ where }),
    ])

    return {
      data:       rows,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    }
  })

  // ──────────────────────────────────────────────────────────────────────────
  // POST /follow-ups/:id/complete
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/:id/complete',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const { id }       = req.params

      const ok = await completeFollowUpTask(id, tenantId)
      if (!ok) return reply.status(404).send({ error: 'Follow-up task not found or not PENDING' })

      return { taskId: id, status: 'DONE' }
    },
  )

  // ──────────────────────────────────────────────────────────────────────────
  // POST /follow-ups/:id/cancel
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body:   { reason?: string }
  }>(
    '/:id/cancel',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const { id }       = req.params
      const reason       = req.body?.reason ?? 'MANUAL'

      const ok = await cancelFollowUpTask(id, tenantId, reason)
      if (!ok) return reply.status(404).send({ error: 'Follow-up task not found or not PENDING' })

      return { taskId: id, status: 'CANCELLED', reason }
    },
  )

  // ──────────────────────────────────────────────────────────────────────────
  // POST /follow-ups/schedule-demo
  // Creates a demo task 2 minutes from now for smoke / UI testing.
  // Requires an open conversation in the tenant; returns 404 if none exists.
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{
    Body: { scenario?: string; dueOffsetMinutes?: number }
  }>(
    '/schedule-demo',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const scenario     = req.body?.scenario ?? 'PRICE_ASKED_NO_REPLY'
      const offsetMin    = Math.min(60, Math.max(0, req.body?.dueOffsetMinutes ?? 2))

      if (!VALID_SCENARIOS.includes(scenario)) {
        return reply.status(400).send({
          error:          `Invalid scenario. Valid: ${VALID_SCENARIOS.join(', ')}`,
          validScenarios: VALID_SCENARIOS,
        })
      }

      // Find the first open conversation for this tenant
      const conv = await prisma.conversation.findFirst({
        where:   { tenantId, status: { in: ['AI_HANDLING', 'PENDING_HANDOFF'] } },
        orderBy: { lastMessageAt: 'desc' },
        select:  { id: true, customerId: true },
      })
      if (!conv) {
        return reply.status(404).send({ error: 'No open conversation found for this tenant' })
      }

      // Directly create a task with custom dueAt (bypass engine delay logic)
      const dueAt = new Date(Date.now() + offsetMin * 60 * 1000)
      const steps = SCENARIO_STEPS[scenario]!
      const step  = steps[0]!

      // Check for existing duplicate
      const existing = await prisma.followUpTask.findFirst({
        where: { conversationId: conv.id, scenario, stepIndex: 0, status: 'PENDING' },
      })

      const task = existing ?? await prisma.followUpTask.create({
        data: {
          tenantId,
          conversationId:  conv.id,
          customerId:      conv.customerId,
          scenario,
          stepIndex:       0,
          dueAt,
          requiresHuman:   step.requiresHuman,
          suggestedMessage: step.messageTemplate,
        },
      })

      return reply.status(201).send({
        taskId:          task.id,
        conversationId:  conv.id,
        scenario,
        dueAt:           task.dueAt,
        requiresHuman:   step.requiresHuman,
        suggestedMessage: step.messageTemplate,
        note:            existing ? 'duplicate_existing' : 'created',
      })
    },
  )

  // ──────────────────────────────────────────────────────────────────────────
  // GET /follow-ups/scenarios — list valid scenarios + step counts
  // ──────────────────────────────────────────────────────────────────────────
  app.get('/scenarios', { preHandler: requireAuth }, async () => ({
    scenarios: VALID_SCENARIOS.map((s) => ({
      scenario:   s,
      stepCount:  SCENARIO_STEPS[s]!.length,
      hasHumanReminder: SCENARIO_STEPS[s]!.some((step) => step.requiresHuman),
    })),
  }))
}
