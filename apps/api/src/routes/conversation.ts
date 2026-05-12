// Conversation routes — Inbox / human takeover / release / close (Phase 3C → 8A)
// All endpoints are tenant-scoped via req.user.tenantId.

import type { FastifyInstance } from 'fastify'
import { prisma, Direction, SenderType, ConversationStatus } from '@omni/db'
import type { Prisma } from '@omni/db'
import { requireAuth, getAuthUser } from '../auth'
import { publishEvent } from '../realtime-bus'

const VALID_STATUSES = Object.values(ConversationStatus) as string[]
const DEFAULT_PAGE   = 1
const DEFAULT_SIZE   = 20
const MAX_SIZE       = 100

function parseIntSafe(v: string | undefined, fallback: number): number {
  if (!v) return fallback
  const n = parseInt(v, 10)
  return isNaN(n) ? fallback : n
}

// ── Shared takeover/release helpers ──────────────────────────────────────────

async function performTakeover(id: string, tenantId: string, userId: string, email: string) {
  const existing = await prisma.conversation.findFirst({ where: { id, tenantId } })
  if (!existing) return null
  if (existing.status === 'CLOSED') return { error: 'Cannot take over a closed conversation' }

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

  publishEvent(tenantId, 'conversation.handoff.updated', {
    conversationId: id,
    status:         updated.status,
    assignedUserId: updated.assignedUserId,
  })
  publishEvent(tenantId, 'conversation.updated', {
    conversationId: id,
    status:         updated.status,
  })

  return { conversationId: id, status: updated.status, assignedUserId: updated.assignedUserId }
}

async function performReleaseAi(id: string, tenantId: string, email: string) {
  const existing = await prisma.conversation.findFirst({ where: { id, tenantId } })
  if (!existing) return null
  if (existing.status === 'CLOSED') return { error: 'Cannot release a closed conversation' }

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

  publishEvent(tenantId, 'conversation.handoff.updated', {
    conversationId: id,
    status:         updated.status,
    assignedUserId: null,
  })
  publishEvent(tenantId, 'conversation.updated', {
    conversationId: id,
    status:         updated.status,
  })

  return { conversationId: id, status: updated.status, assignedUserId: null }
}

export async function conversationRoutes(app: FastifyInstance) {

  // ──────────────────────────────────────────────────────────────────────────
  // GET /conversations
  // Enhanced for Phase 8A dashboard:
  //   - ?handoff=true  → filter PENDING_HANDOFF
  //   - ?sort=lastMessageAt (default) | createdAt
  //   - includes customer tags, unread count, needsHuman derived field
  // ──────────────────────────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      page?:       string
      pageSize?:   string
      limit?:      string
      status?:     string
      handoff?:    string
      channelId?:  string
      customerId?: string
      q?:          string
      sort?:       string
    }
  }>('/', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { status, handoff, channelId, customerId, q, sort } = req.query

    const page     = Math.max(1, parseIntSafe(req.query.page, DEFAULT_PAGE))
    // accept either pageSize or limit
    const pageSize = Math.min(
      MAX_SIZE,
      Math.max(1, parseIntSafe(req.query.pageSize ?? req.query.limit, DEFAULT_SIZE)),
    )

    if (status && !VALID_STATUSES.includes(status)) {
      return reply.status(400).send({ error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` })
    }

    const where: Prisma.ConversationWhereInput = { tenantId }

    // ?handoff=true shorthand overrides status
    if (handoff === 'true') {
      where.status = ConversationStatus.PENDING_HANDOFF
    } else if (status) {
      where.status = status as ConversationStatus
    }

    if (channelId)  where.channelId  = channelId
    if (customerId) where.customerId = customerId

    if (q && q.trim()) {
      where.customer = {
        OR: [
          { name:         { contains: q.trim(), mode: 'insensitive' as const } },
          { phone:        { contains: q.trim() } },
          { whatsappName: { contains: q.trim(), mode: 'insensitive' as const } },
        ],
      }
    }

    const orderField = sort === 'createdAt' ? 'createdAt' : 'lastMessageAt'

    const [rows, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true, name: true, phone: true, whatsappName: true,
              stage: true, score: true,
              tags: { select: { tag: true } },
            },
          },
          channel: {
            select: { id: true, type: true, displayName: true },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take:    1,
            select:  { id: true, content: true, direction: true, senderType: true, createdAt: true },
          },
          _count: {
            select: {
              messages: {
                where: { isRead: false, direction: Direction.INBOUND },
              },
            },
          },
        },
        orderBy: { [orderField]: 'desc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.conversation.count({ where }),
    ])

    return {
      data: rows.map(({ messages, customer, _count, ...conv }) => ({
        ...conv,
        customer: { ...customer, tags: customer.tags.map((t) => t.tag) },
        lastMessage:  messages[0] ?? null,
        unreadCount:  _count.messages,
        needsHuman:   conv.status === ConversationStatus.PENDING_HANDOFF,
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
  app.get<{ Params: { id: string }; Querystring: { page?: string; pageSize?: string } }>(
    '/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const { id }       = req.params

      const page     = Math.max(1, parseIntSafe(req.query.page, 1))
      const pageSize = Math.min(200, Math.max(1, parseIntSafe(req.query.pageSize, 50)))

      const conversation = await prisma.conversation.findFirst({
        where:   { id, tenantId },
        include: {
          customer: {
            include: { tags: { select: { tag: true } } },
          },
          channel:  true,
          messages: {
            orderBy: { createdAt: 'asc' },
            skip:    (page - 1) * pageSize,
            take:    pageSize,
          },
          _count: {
            select: {
              messages: {
                where: { isRead: false, direction: Direction.INBOUND },
              },
            },
          },
        },
      })

      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' })
      }

      const { customer, _count, ...rest } = conversation
      return {
        ...rest,
        customer: {
          ...customer,
          tags: customer.tags.map((t) => t.tag),
        },
        unreadCount: _count.messages,
        needsHuman:  rest.status === ConversationStatus.PENDING_HANDOFF,
        messageCount: conversation.messages.length,
      }
    },
  )

  // ──────────────────────────────────────────────────────────────────────────
  // GET /conversations/:id/messages   (paginated message list)
  // ──────────────────────────────────────────────────────────────────────────
  app.get<{
    Params: { id: string }
    Querystring: { page?: string; pageSize?: string }
  }>('/:id/messages', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { id }       = req.params
    const page         = Math.max(1, parseIntSafe(req.query.page, 1))
    const pageSize     = Math.min(200, Math.max(1, parseIntSafe(req.query.pageSize, 50)))

    const conversation = await prisma.conversation.findFirst({ where: { id, tenantId } })
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' })

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where:   { conversationId: id },
        orderBy: { createdAt: 'asc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.message.count({ where: { conversationId: id } }),
    ])

    return {
      data: messages,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    }
  })

  // ──────────────────────────────────────────────────────────────────────────
  // POST /conversations/:id/takeover
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/:id/takeover',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId, userId, email } = getAuthUser(req)
      const { id } = req.params

      const result = await performTakeover(id, tenantId, userId, email)
      if (result === null)          return reply.status(404).send({ error: 'Conversation not found' })
      if ('error' in result)        return reply.status(400).send({ error: result.error })
      return result
    },
  )

  // ──────────────────────────────────────────────────────────────────────────
  // POST /conversations/:id/release       (legacy alias from Phase 3C)
  // POST /conversations/:id/release-ai    (Phase 8A canonical name)
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/:id/release',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId, email } = getAuthUser(req)
      const result = await performReleaseAi(req.params.id, tenantId, email)
      if (result === null)   return reply.status(404).send({ error: 'Conversation not found' })
      if ('error' in result) return reply.status(400).send({ error: result.error })
      return result
    },
  )

  app.post<{ Params: { id: string } }>(
    '/:id/release-ai',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId, email } = getAuthUser(req)
      const result = await performReleaseAi(req.params.id, tenantId, email)
      if (result === null)   return reply.status(404).send({ error: 'Conversation not found' })
      if ('error' in result) return reply.status(400).send({ error: result.error })
      return result
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

      publishEvent(tenantId, 'conversation.updated', {
        conversationId: id,
        status:         updated.status,
      })

      return { conversationId: id, status: updated.status }
    },
  )
}
