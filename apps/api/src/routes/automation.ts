// Automation Rules routes — follow-up + handoff configuration (Phase 3E)
// Configuration only. Background scheduling and message sending: Phase 4+.
// All endpoints are tenant-scoped via req.user.tenantId.

import type { FastifyInstance } from 'fastify'
import { prisma } from '@omni/db'
import type { Prisma } from '@omni/db'
import { requireAuth, getAuthUser } from '../auth'

// ── Allowlists ─────────────────────────────────────────────────────────────

const VALID_FOLLOW_UP_TRIGGERS = [
  'PRICE_ASKED_NO_REPLY',
  'CONSIDERING',
  'BOOKING_NOT_CONFIRMED',
  'HIGH_INTENT_UNHANDLED',
  'LONG_NO_REPLY',
  'APPOINTMENT_REMINDER',
  'QUOTE_SENT_NO_RESPONSE',
] as const

const VALID_HANDOFF_CONDITIONS = [
  'USER_REQUESTS_HUMAN',
  'FAQ_NO_ANSWER',
  'AI_UNCERTAIN',
  'SCORE_GTE_80',
  'QUOTE_PAYMENT_COMPLAINT',
  'REFUND_REQUEST',
  'REPEATED_QUESTIONING',
  'TECHNICAL_ISSUE',
  'INSULT_OR_ABUSE',
] as const

const MAX_DELAY_HOURS = 720 // 30 days
const DEFAULT_SIZE    = 100

function parseIntSafe(v: string | undefined, fallback: number): number {
  if (!v) return fallback
  const n = parseInt(v, 10)
  return isNaN(n) ? fallback : n
}

export async function automationRoutes(app: FastifyInstance) {

  // ════════════════════════════════════════════════════════════════════════
  // FOLLOW-UP RULES
  // ════════════════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────────────────────────────────
  // GET /automation/follow-up-rules
  // ──────────────────────────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      isActive?:  string
      page?:      string
      pageSize?:  string
    }
  }>('/follow-up-rules', { preHandler: requireAuth }, async (req, _reply) => {
    const { tenantId } = getAuthUser(req)
    const isActiveRaw  = req.query.isActive
    const isActive     = isActiveRaw === 'true' ? true : isActiveRaw === 'false' ? false : undefined
    const page         = Math.max(1, parseIntSafe(req.query.page, 1))
    const pageSize     = Math.min(DEFAULT_SIZE, Math.max(1, parseIntSafe(req.query.pageSize, DEFAULT_SIZE)))

    const where: Prisma.FollowUpRuleWhereInput = {
      tenantId,
      ...(isActive !== undefined ? { isActive } : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.followUpRule.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.followUpRule.count({ where }),
    ])

    return {
      data: rows,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      validTriggers: VALID_FOLLOW_UP_TRIGGERS,
    }
  })

  // ──────────────────────────────────────────────────────────────────────────
  // POST /automation/follow-up-rules
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{
    Body: {
      trigger?:         string
      delayHours?:      number
      messageTemplate?: string
      isActive?:        boolean
    }
  }>('/follow-up-rules', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const body         = req.body ?? {}

    if (!body.trigger || !(VALID_FOLLOW_UP_TRIGGERS as readonly string[]).includes(body.trigger)) {
      return reply.status(400).send({
        error: `trigger is required. Valid values: ${VALID_FOLLOW_UP_TRIGGERS.join(', ')}`,
      })
    }
    if (body.delayHours === undefined || body.delayHours === null) {
      return reply.status(400).send({ error: 'delayHours is required' })
    }
    if (!Number.isInteger(body.delayHours) || body.delayHours < 0 || body.delayHours > MAX_DELAY_HOURS) {
      return reply.status(400).send({ error: `delayHours must be an integer between 0 and ${MAX_DELAY_HOURS}` })
    }
    if (!body.messageTemplate || typeof body.messageTemplate !== 'string' || !body.messageTemplate.trim()) {
      return reply.status(400).send({ error: 'messageTemplate is required and must be non-empty' })
    }

    const rule = await prisma.followUpRule.create({
      data: {
        tenantId,
        trigger:         body.trigger,
        delayHours:      body.delayHours,
        messageTemplate: body.messageTemplate.trim(),
        isActive:        body.isActive ?? true,
      },
    })

    return reply.status(201).send(rule)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /automation/follow-up-rules/:id
  // ──────────────────────────────────────────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body: {
      trigger?:         string
      delayHours?:      number
      messageTemplate?: string
      isActive?:        boolean
    }
  }>('/follow-up-rules/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { id }       = req.params
    const body         = req.body ?? {}

    if (body.trigger !== undefined && !(VALID_FOLLOW_UP_TRIGGERS as readonly string[]).includes(body.trigger)) {
      return reply.status(400).send({
        error: `Invalid trigger. Valid values: ${VALID_FOLLOW_UP_TRIGGERS.join(', ')}`,
      })
    }
    if (body.delayHours !== undefined) {
      if (!Number.isInteger(body.delayHours) || body.delayHours < 0 || body.delayHours > MAX_DELAY_HOURS) {
        return reply.status(400).send({ error: `delayHours must be an integer between 0 and ${MAX_DELAY_HOURS}` })
      }
    }
    if (body.messageTemplate !== undefined && (!body.messageTemplate || !body.messageTemplate.trim())) {
      return reply.status(400).send({ error: 'messageTemplate must be non-empty if provided' })
    }

    const existing = await prisma.followUpRule.findFirst({ where: { id, tenantId } })
    if (!existing) return reply.status(404).send({ error: 'Follow-up rule not found' })

    const data: Prisma.FollowUpRuleUpdateInput = {}
    if ('trigger'         in body && body.trigger         !== undefined) data.trigger         = body.trigger
    if ('delayHours'      in body && body.delayHours      !== undefined) data.delayHours      = body.delayHours
    if ('messageTemplate' in body && body.messageTemplate !== undefined) data.messageTemplate = body.messageTemplate.trim()
    if ('isActive'        in body && body.isActive        !== undefined) data.isActive        = body.isActive

    const updated = await prisma.followUpRule.update({ where: { id }, data })
    return updated
  })

  // ════════════════════════════════════════════════════════════════════════
  // HANDOFF RULES
  // ════════════════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────────────────────────────────
  // GET /automation/handoff-rules
  // ──────────────────────────────────────────────────────────────────────────
  app.get<{
    Querystring: { isActive?: string; page?: string; pageSize?: string }
  }>('/handoff-rules', { preHandler: requireAuth }, async (req, _reply) => {
    const { tenantId } = getAuthUser(req)
    const isActiveRaw  = req.query.isActive
    const isActive     = isActiveRaw === 'true' ? true : isActiveRaw === 'false' ? false : undefined
    const page         = Math.max(1, parseIntSafe(req.query.page, 1))
    const pageSize     = Math.min(DEFAULT_SIZE, Math.max(1, parseIntSafe(req.query.pageSize, DEFAULT_SIZE)))

    const where: Prisma.HandoffRuleWhereInput = {
      tenantId,
      ...(isActive !== undefined ? { isActive } : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.handoffRule.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.handoffRule.count({ where }),
    ])

    return {
      data: rows,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      validConditions: VALID_HANDOFF_CONDITIONS,
    }
  })

  // ──────────────────────────────────────────────────────────────────────────
  // POST /automation/handoff-rules
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{
    Body: { condition?: string; isActive?: boolean }
  }>('/handoff-rules', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const body         = req.body ?? {}

    if (!body.condition || !(VALID_HANDOFF_CONDITIONS as readonly string[]).includes(body.condition)) {
      return reply.status(400).send({
        error: `condition is required. Valid values: ${VALID_HANDOFF_CONDITIONS.join(', ')}`,
      })
    }

    const rule = await prisma.handoffRule.create({
      data: {
        tenantId,
        condition: body.condition,
        isActive:  body.isActive ?? true,
      },
    })

    return reply.status(201).send(rule)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /automation/handoff-rules/:id
  // ──────────────────────────────────────────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body: { condition?: string; isActive?: boolean }
  }>('/handoff-rules/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { id }       = req.params
    const body         = req.body ?? {}

    if (body.condition !== undefined && !(VALID_HANDOFF_CONDITIONS as readonly string[]).includes(body.condition)) {
      return reply.status(400).send({
        error: `Invalid condition. Valid values: ${VALID_HANDOFF_CONDITIONS.join(', ')}`,
      })
    }

    const existing = await prisma.handoffRule.findFirst({ where: { id, tenantId } })
    if (!existing) return reply.status(404).send({ error: 'Handoff rule not found' })

    const data: Prisma.HandoffRuleUpdateInput = {}
    if ('condition' in body && body.condition !== undefined) data.condition = body.condition
    if ('isActive'  in body && body.isActive  !== undefined) data.isActive  = body.isActive

    const updated = await prisma.handoffRule.update({ where: { id }, data })
    return updated
  })
}
