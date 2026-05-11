// Knowledge Base routes — CRUD + keyword search (Phase 3D)
// All endpoints are tenant-scoped via req.user.tenantId.
// Vector/semantic search is a Phase 4+ TODO.

import type { FastifyInstance } from 'fastify'
import { prisma, KnowledgeItemType } from '@omni/db'
import type { Prisma } from '@omni/db'
import { requireAuth, getAuthUser } from '../auth'

// ── Constants ──────────────────────────────────────────────────────────────
const VALID_TYPES     = Object.values(KnowledgeItemType) as string[]
const VALID_LANGUAGES = ['zh', 'en', 'ms']
const DEFAULT_PAGE    = 1
const DEFAULT_SIZE    = 20
const MAX_SIZE        = 100
const DEFAULT_SEARCH_LIMIT = 20
const MAX_SEARCH_LIMIT     = 50

function parseIntSafe(v: string | undefined, fallback: number): number {
  if (!v) return fallback
  const n = parseInt(v, 10)
  return isNaN(n) ? fallback : n
}

export async function knowledgeRoutes(app: FastifyInstance) {

  // ──────────────────────────────────────────────────────────────────────────
  // POST /knowledge/search  ← registered BEFORE /:id to avoid route conflict
  // Body: { q, language?, type?, limit? }
  // Keyword search: question matches ranked before answer-only matches.
  // Phase 4: replace with vector/semantic search.
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{
    Body: { q?: string; language?: string; type?: string; limit?: number }
  }>('/search', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { q, language, type } = req.body ?? {}
    const limit = Math.min(MAX_SEARCH_LIMIT, Math.max(1, (req.body?.limit ?? DEFAULT_SEARCH_LIMIT)))

    if (!q || typeof q !== 'string' || !q.trim()) {
      return reply.status(400).send({ error: 'q (search query) is required and must be non-empty' })
    }
    if (type && !VALID_TYPES.includes(type)) {
      return reply.status(400).send({ error: `Invalid type. Valid: ${VALID_TYPES.join(', ')}` })
    }
    if (language && !VALID_LANGUAGES.includes(language)) {
      return reply.status(400).send({ error: `Invalid language. Valid: ${VALID_LANGUAGES.join(', ')}` })
    }

    const qTrim     = q.trim()
    const baseWhere: Prisma.KnowledgeItemWhereInput = {
      tenantId,
      isActive: true,
      ...(type     ? { type: type as KnowledgeItemType } : {}),
      ...(language ? { language }                       : {}),
    }

    // Pass 1: items where QUESTION contains q (higher relevance)
    const qMatches = await prisma.knowledgeItem.findMany({
      where:   { ...baseWhere, question: { contains: qTrim, mode: 'insensitive' as const } },
      orderBy: { updatedAt: 'desc' },
      take:    limit,
    })

    // Pass 2: items where ANSWER contains q but question does NOT (filler)
    const qMatchIds = new Set(qMatches.map((m) => m.id))
    const remaining = limit - qMatches.length
    const aMatches  = remaining > 0
      ? await prisma.knowledgeItem.findMany({
          where: {
            ...baseWhere,
            id:     { notIn: [...qMatchIds] },
            answer: { contains: qTrim, mode: 'insensitive' as const },
          },
          orderBy: { updatedAt: 'desc' },
          take:    remaining,
        })
      : []

    const results = [...qMatches, ...aMatches]

    return {
      data:  results,
      total: results.length,
      note:  'Keyword search placeholder — vector/semantic search in Phase 4',
    }
  })

  // ──────────────────────────────────────────────────────────────────────────
  // GET /knowledge
  // ──────────────────────────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      page?:      string
      pageSize?:  string
      type?:      string
      language?:  string
      isActive?:  string
      q?:         string
    }
  }>('/', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { type, language, q } = req.query

    const page     = Math.max(1, parseIntSafe(req.query.page, DEFAULT_PAGE))
    const pageSize = Math.min(MAX_SIZE, Math.max(1, parseIntSafe(req.query.pageSize, DEFAULT_SIZE)))

    // isActive filter: default to all, unless explicitly 'true' or 'false'
    const isActiveRaw = req.query.isActive
    const isActive = isActiveRaw === 'true' ? true : isActiveRaw === 'false' ? false : undefined

    if (type && !VALID_TYPES.includes(type)) {
      return reply.status(400).send({ error: `Invalid type. Valid: ${VALID_TYPES.join(', ')}` })
    }
    if (language && !VALID_LANGUAGES.includes(language)) {
      return reply.status(400).send({ error: `Invalid language. Valid: ${VALID_LANGUAGES.join(', ')}` })
    }

    const where: Prisma.KnowledgeItemWhereInput = {
      tenantId,
      ...(type                  ? { type: type as KnowledgeItemType } : {}),
      ...(language              ? { language }                        : {}),
      ...(isActive !== undefined ? { isActive }                       : {}),
      ...(q && q.trim() ? {
        OR: [
          { question: { contains: q.trim(), mode: 'insensitive' as const } },
          { answer:   { contains: q.trim(), mode: 'insensitive' as const } },
        ],
      } : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.knowledgeItem.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.knowledgeItem.count({ where }),
    ])

    return {
      data:       rows,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    }
  })

  // ──────────────────────────────────────────────────────────────────────────
  // GET /knowledge/:id
  // ──────────────────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const { id }       = req.params

      const item = await prisma.knowledgeItem.findFirst({ where: { id, tenantId } })
      if (!item) return reply.status(404).send({ error: 'Knowledge item not found' })
      return item
    },
  )

  // ──────────────────────────────────────────────────────────────────────────
  // POST /knowledge
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{
    Body: {
      type?:      string
      question?:  string
      answer?:    string
      language?:  string
      isActive?:  boolean
    }
  }>('/', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const body = req.body ?? {}

    // Required fields
    if (!body.type || !VALID_TYPES.includes(body.type)) {
      return reply.status(400).send({ error: `type is required. Valid: ${VALID_TYPES.join(', ')}` })
    }
    if (!body.answer || typeof body.answer !== 'string' || !body.answer.trim()) {
      return reply.status(400).send({ error: 'answer is required and must be non-empty' })
    }
    if (body.language !== undefined && !VALID_LANGUAGES.includes(body.language)) {
      return reply.status(400).send({ error: `Invalid language. Valid: ${VALID_LANGUAGES.join(', ')}` })
    }

    // For FAQ types, question is required; for KNOWLEDGE_CHUNK, optional
    if (body.type !== 'KNOWLEDGE_CHUNK' && (!body.question || !body.question.trim())) {
      return reply.status(400).send({
        error: `question is required for ${body.type}. It is optional only for KNOWLEDGE_CHUNK.`,
      })
    }

    const item = await prisma.knowledgeItem.create({
      data: {
        tenantId,
        type:     body.type as KnowledgeItemType,
        question: body.question?.trim() ?? null,
        answer:   body.answer.trim(),
        language: body.language ?? 'zh',
        isActive: body.isActive ?? true,
      },
    })

    return reply.status(201).send(item)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /knowledge/:id
  // ──────────────────────────────────────────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body: {
      type?:      string
      question?:  string | null
      answer?:    string
      language?:  string
      isActive?:  boolean
    }
  }>(
    '/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const { id }       = req.params
      const body         = req.body ?? {}

      if (body.type !== undefined && !VALID_TYPES.includes(body.type)) {
        return reply.status(400).send({ error: `Invalid type. Valid: ${VALID_TYPES.join(', ')}` })
      }
      if (body.language !== undefined && !VALID_LANGUAGES.includes(body.language)) {
        return reply.status(400).send({ error: `Invalid language. Valid: ${VALID_LANGUAGES.join(', ')}` })
      }
      if (body.answer !== undefined && (!body.answer || !body.answer.trim())) {
        return reply.status(400).send({ error: 'answer must be non-empty if provided' })
      }

      const existing = await prisma.knowledgeItem.findFirst({ where: { id, tenantId } })
      if (!existing) return reply.status(404).send({ error: 'Knowledge item not found' })

      const data: Prisma.KnowledgeItemUpdateInput = {}
      if ('type'     in body && body.type     !== undefined) data.type     = body.type as KnowledgeItemType
      if ('question' in body)                                data.question = body.question ?? null
      if ('answer'   in body && body.answer   !== undefined) data.answer   = body.answer.trim()
      if ('language' in body && body.language !== undefined) data.language = body.language
      if ('isActive' in body && body.isActive !== undefined) data.isActive = body.isActive

      const updated = await prisma.knowledgeItem.update({ where: { id }, data })
      return updated
    },
  )

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /knowledge/:id — soft delete (sets isActive=false)
  // ──────────────────────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const { id }       = req.params

      const existing = await prisma.knowledgeItem.findFirst({ where: { id, tenantId } })
      if (!existing) return reply.status(404).send({ error: 'Knowledge item not found' })

      if (!existing.isActive) {
        // Already soft-deleted — idempotent
        return { id, isActive: false, note: 'Already inactive' }
      }

      const updated = await prisma.knowledgeItem.update({
        where: { id },
        data:  { isActive: false },
      })
      return { id: updated.id, isActive: updated.isActive }
    },
  )
}
