// Message routes — list + human send (Phase 3C)
// All tenant-owned endpoints require auth.
// Outbound send writes to DB only; real WhatsApp delivery not implemented here.

import type { FastifyInstance } from 'fastify'
import { prisma, Direction, SenderType } from '@omni/db'
import { requireAuth, getAuthUser } from '../auth'

const DEFAULT_PAGE = 1
const DEFAULT_SIZE = 50
const MAX_SIZE     = 200

function parseIntSafe(v: string | undefined, fallback: number): number {
  if (!v) return fallback
  const n = parseInt(v, 10)
  return isNaN(n) ? fallback : n
}

export async function messageRoutes(app: FastifyInstance) {

  // ──────────────────────────────────────────────────────────────────────────
  // GET /messages?conversationId=
  // ──────────────────────────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      conversationId?: string
      page?:           string
      pageSize?:       string
    }
  }>('/', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { conversationId } = req.query

    if (!conversationId) {
      return reply.status(400).send({ error: 'conversationId query param is required' })
    }

    const page     = Math.max(1, parseIntSafe(req.query.page, DEFAULT_PAGE))
    const pageSize = Math.min(MAX_SIZE, Math.max(1, parseIntSafe(req.query.pageSize, DEFAULT_SIZE)))

    // Verify conversation belongs to this tenant (no cross-tenant leak)
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    })
    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' })
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where:   { conversationId },
        orderBy: { createdAt: 'asc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.message.count({ where: { conversationId } }),
    ])

    return {
      data: messages,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  })

  // ──────────────────────────────────────────────────────────────────────────
  // POST /messages/send
  // Writes a HUMAN_AGENT outbound message to DB.
  // Does NOT send via WhatsApp adapter in Phase 3C.
  // Returns sendStatus: 'STUB_NOT_SENT' — real delivery in Phase 4.
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{
    Body: { conversationId?: string; body?: string }
  }>('/send', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { conversationId, body } = req.body ?? {}

    if (!conversationId) {
      return reply.status(400).send({ error: 'conversationId is required' })
    }
    if (!body || typeof body !== 'string' || !body.trim()) {
      return reply.status(400).send({ error: 'body (message text) is required and must be non-empty' })
    }

    // Verify conversation belongs to this tenant
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    })
    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' })
    }
    if (conversation.status === 'CLOSED') {
      return reply.status(400).send({ error: 'Cannot send to a closed conversation' })
    }

    // Write message to DB
    const message = await prisma.message.create({
      data: {
        conversationId,
        direction:  Direction.OUTBOUND,
        senderType: SenderType.HUMAN_AGENT,
        content:    body.trim(),
        isRead:     true,
      },
    })

    // Update conversation lastMessageAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data:  { lastMessageAt: new Date() },
    })

    // Real WhatsApp delivery not implemented in Phase 3C.
    // Phase 4: look up adapter from registry and call sendMessage().
    return reply.status(201).send({
      ...message,
      sendStatus: 'STUB_NOT_SENT' as const,
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // POST /messages/webhook/:channelId
  // Internal route — called by channel adapter, not by browser clients.
  // No auth: secured by network boundary + future channel secret (Phase 4).
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{ Params: { channelId: string } }>(
    '/webhook/:channelId',
    async (req, reply) => {
      // Phase 4: parse inbound payload, call routeInboundMessage(), return 200
      return reply.status(200).send({ received: true, note: 'Phase 4 — full implementation pending' })
    },
  )
}
