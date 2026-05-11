// Conversation routes — Inbox / human takeover / release / close (Phase 3C)
// All endpoints are tenant-scoped via req.user.tenantId.

import type { FastifyInstance } from 'fastify'
import { prisma, Direction, SenderType, ConversationStatus } from '@omni/db'
import type { Prisma } from '@omni/db'
import { requireAuth, getAuthUser } from '../auth'

const VALID_STATUSES = Object.values(ConversationStatus) as string[]
const DEFAULT_PAGE   = 1
const DEFAULT_SIZE   = 20
const MAX_SIZE       = 100

function parseIntSafe(v: string | undefined, fallback: number): number {
  if (!v) return fallback
  const n = parseInt(v, 10)
  return isNaN(n) ? fallback : n
}

export async function conversationRoutes(app: FastifyInstance) {

  // ──────────────────────────────────────────────────────────────────────────
  // GET /conversations
  // ──────────────────────────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      page?:         string
      pageSize?:     string
      status?:       string
      channelId?:    string
      customerId?:   string
      q?:            string
    }
  }>('/', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { status, channelId, customerId, q } = req.query

    const page     = Math.max(1, parseIntSafe(req.query.page, DEFAULT_PAGE))
    const pageSize = Math.min(MAX_SIZE, Math.max(1, parseIntSafe(req.query.pageSize, DEFAULT_SIZE)))

    if (status && !VALID_STATUSES.includes(status)) {
      return reply.status(400).send({ error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` })
    }

    const where: Prisma.ConversationWhereInput = { tenantId }
    if (status)     where.status     = status as ConversationStatus
    if (channelId)  where.channelId  = channelId
    if (customerId) where.customerId = customerId

    // Search by customer name / phone / whatsappName
    if (q && q.trim()) {
      where.customer = {
        OR: [
          { name:         { contains: q.trim(), mode: 'insensitive' as const } },
          { phone:        { contains: q.trim() } },
          { whatsappName: { contains: q.trim(), mode: 'insensitive' as const } },
        ],
      }
    }

    const [rows, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          customer: {
            select: { id: true, name: true, phone: true, whatsappName: true, stage: true, score: true },
          },
          channel: {
            select: { id: true, type: true, displayName: true },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take:    1,
            select:  { id: true, content: true, direction: true, senderType: true, createdAt: true },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.conversation.count({ where }),
    ])

    return {
      data: rows.map(({ messages, ...conv }) => ({
        ...conv,
        lastMessage: messages[0] ?? null,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  })

  // ──────────────────────────────────────────────────────────────────────────
  // GET /conversations/:id
  // ──────────────────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const { id }       = req.params

      const conversation = await prisma.conversation.findFirst({
        where:   { id, tenantId },
        include: {
          customer: {
            include: { tags: { select: { tag: true } } },
          },
          channel:  true,
          messages: {
            orderBy: { createdAt: 'asc' },
            take:    50,
          },
        },
      })

      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' })
      }

      const { customer, ...rest } = conversation
      return {
        ...rest,
        customer: {
          ...customer,
          tags: customer.tags.map((t) => t.tag),
        },
        messageCount: conversation.messages.length,
      }
    },
  )

  // ──────────────────────────────────────────────────────────────────────────
  // POST /conversations/:id/takeover
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/:id/takeover',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId, userId, email } = getAuthUser(req)
      const { id }                      = req.params

      const existing = await prisma.conversation.findFirst({ where: { id, tenantId } })
      if (!existing) return reply.status(404).send({ error: 'Conversation not found' })

      if (existing.status === 'CLOSED') {
        return reply.status(400).send({ error: 'Cannot take over a closed conversation' })
      }

      const [updated] = await Promise.all([
        prisma.conversation.update({
          where: { id },
          data:  { status: ConversationStatus.HUMAN_HANDLING, assignedUserId: userId },
        }),
        prisma.message.create({
          data: {
            conversationId: id,
            direction:      Direction.OUTBOUND,
            senderType:     SenderType.SYSTEM,
            content:        `Conversation assigned to ${email}`,
            isRead:         true,
          },
        }),
      ])

      return {
        conversationId: id,
        status:         updated.status,
        assignedUserId: updated.assignedUserId,
      }
    },
  )

  // ──────────────────────────────────────────────────────────────────────────
  // POST /conversations/:id/release
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/:id/release',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId, email } = getAuthUser(req)
      const { id }              = req.params

      const existing = await prisma.conversation.findFirst({ where: { id, tenantId } })
      if (!existing) return reply.status(404).send({ error: 'Conversation not found' })

      if (existing.status === 'CLOSED') {
        return reply.status(400).send({ error: 'Cannot release a closed conversation' })
      }

      const [updated] = await Promise.all([
        prisma.conversation.update({
          where: { id },
          data:  { status: ConversationStatus.AI_HANDLING, assignedUserId: null },
        }),
        prisma.message.create({
          data: {
            conversationId: id,
            direction:      Direction.OUTBOUND,
            senderType:     SenderType.SYSTEM,
            content:        `Conversation released back to AI by ${email}`,
            isRead:         true,
          },
        }),
      ])

      return {
        conversationId: id,
        status:         updated.status,
        assignedUserId: updated.assignedUserId,
      }
    },
  )

  // ──────────────────────────────────────────────────────────────────────────
  // POST /conversations/:id/close
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/:id/close',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId, email } = getAuthUser(req)
      const { id }              = req.params

      const existing = await prisma.conversation.findFirst({ where: { id, tenantId } })
      if (!existing) return reply.status(404).send({ error: 'Conversation not found' })

      if (existing.status === 'CLOSED') {
        return { conversationId: id, status: 'CLOSED', note: 'Already closed' }
      }

      const [updated] = await Promise.all([
        prisma.conversation.update({
          where: { id },
          data:  { status: ConversationStatus.CLOSED },
        }),
        prisma.message.create({
          data: {
            conversationId: id,
            direction:      Direction.OUTBOUND,
            senderType:     SenderType.SYSTEM,
            content:        `Conversation closed by ${email}`,
            isRead:         true,
          },
        }),
      ])

      return { conversationId: id, status: updated.status }
    },
  )
}
