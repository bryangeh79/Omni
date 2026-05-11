// Customer / CRM routes — full CRUD implementation (Phase 3B)
// All endpoints are tenant-scoped via req.user.tenantId from JWT.

import type { FastifyInstance } from 'fastify'
import { prisma, LeadStage } from '@omni/db'
import type { Prisma } from '@omni/db'
import { requireAuth, getAuthUser } from '../auth'

// ── Constants ──────────────────────────────────────────────────────────────
const VALID_STAGES    = Object.values(LeadStage) as string[]
const VALID_LANGUAGES = ['zh', 'en', 'ms']
const DEFAULT_PAGE    = 1
const DEFAULT_SIZE    = 20
const MAX_SIZE        = 100

// ── Helpers ────────────────────────────────────────────────────────────────

function parseIntSafe(v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback
  const n = parseInt(v, 10)
  return isNaN(n) ? fallback : n
}

/** Map Customer from DB + flatten tags to string[] */
function formatCustomer(c: {
  tags: { tag: string }[]
  [key: string]: unknown
}) {
  const { tags, ...rest } = c
  return { ...rest, tags: tags.map((t) => t.tag) }
}

// ── Routes ─────────────────────────────────────────────────────────────────

export async function customerRoutes(app: FastifyInstance) {

  // ──────────────────────────────────────────────────────────────────────────
  // GET /customers
  // ──────────────────────────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      page?: string
      pageSize?: string
      stage?: string
      minScore?: string
      maxScore?: string
      tag?: string
      language?: string
      source?: string
      q?: string
    }
  }>('/', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { stage, minScore, maxScore, tag, language, source, q } = req.query

    const page     = Math.max(1, parseIntSafe(req.query.page, DEFAULT_PAGE))
    const pageSize = Math.min(MAX_SIZE, Math.max(1, parseIntSafe(req.query.pageSize, DEFAULT_SIZE)))

    if (stage && !VALID_STAGES.includes(stage)) {
      return reply.status(400).send({ error: `Invalid stage. Valid: ${VALID_STAGES.join(', ')}` })
    }
    if (language && !VALID_LANGUAGES.includes(language)) {
      return reply.status(400).send({ error: `Invalid language. Valid: ${VALID_LANGUAGES.join(', ')}` })
    }

    // Build where clause — always tenant-scoped
    const where: Prisma.CustomerWhereInput = { tenantId }
    if (stage)    where.stage            = stage as LeadStage
    if (language) where.languagePreference = language
    if (source)   where.source           = source
    if (tag)      where.tags             = { some: { tag } }

    // Score range
    if (minScore !== undefined || maxScore !== undefined) {
      const min = parseIntSafe(minScore, 0)
      const max = parseIntSafe(maxScore, 100)
      where.score = { gte: min, lte: max }
    }

    // Free-text search across name / phone / company / whatsappName
    if (q && q.trim()) {
      const qTrim = q.trim()
      where.OR = [
        { name:         { contains: qTrim, mode: 'insensitive' as const } },
        { phone:        { contains: qTrim } },
        { company:      { contains: qTrim, mode: 'insensitive' as const } },
        { whatsappName: { contains: qTrim, mode: 'insensitive' as const } },
      ]
    }

    const [rows, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include:  { tags: { select: { tag: true } } },
        orderBy:  { updatedAt: 'desc' },
        skip:     (page - 1) * pageSize,
        take:     pageSize,
      }),
      prisma.customer.count({ where }),
    ])

    return {
      data:       rows.map(formatCustomer),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  })

  // ──────────────────────────────────────────────────────────────────────────
  // GET /customers/:id
  // ──────────────────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const { id }       = req.params

      const customer = await prisma.customer.findFirst({
        where:   { id, tenantId },
        include: {
          tags: { select: { tag: true } },
          conversations: {
            select: { id: true, status: true, lastMessageAt: true },
            orderBy: { lastMessageAt: 'desc' },
            take: 5,
          },
        },
      })

      if (!customer) {
        // 404 even if the ID exists in another tenant — no cross-tenant leak
        return reply.status(404).send({ error: 'Customer not found' })
      }

      const { tags, conversations, ...rest } = customer
      return {
        ...rest,
        tags:              tags.map((t) => t.tag),
        conversationCount: conversations.length,
        lastMessageAt:     conversations[0]?.lastMessageAt ?? null,
        recentConversations: conversations,
      }
    },
  )

  // ──────────────────────────────────────────────────────────────────────────
  // POST /customers
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{
    Body: {
      phone?:               string
      whatsappName?:        string
      name?:                string
      company?:             string
      industry?:            string
      region?:              string
      languagePreference?:  string
      source?:              string
      interestedProduct?:   string
      need?:                string
      budget?:              string
      purchaseTiming?:      string
      urgency?:             number
      painPoint?:           string
      stage?:               string
      score?:               number
      ownerId?:             string
      nextFollowUpAt?:      string
      notes?:               string
      isBlacklisted?:       boolean
    }
  }>('/', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const body = req.body ?? {}

    if (!body.phone || typeof body.phone !== 'string' || !body.phone.trim()) {
      return reply.status(400).send({ error: 'phone is required' })
    }

    // Validate optional fields
    if (body.stage !== undefined && !VALID_STAGES.includes(body.stage)) {
      return reply.status(400).send({ error: `Invalid stage. Valid: ${VALID_STAGES.join(', ')}` })
    }
    if (body.score !== undefined && (body.score < 0 || body.score > 100)) {
      return reply.status(400).send({ error: 'score must be 0-100' })
    }
    if (body.urgency !== undefined && (body.urgency < 1 || body.urgency > 5)) {
      return reply.status(400).send({ error: 'urgency must be 1-5' })
    }
    if (body.languagePreference !== undefined && !VALID_LANGUAGES.includes(body.languagePreference)) {
      return reply.status(400).send({ error: `Invalid languagePreference. Valid: ${VALID_LANGUAGES.join(', ')}` })
    }

    // Duplicate phone check (same tenant)
    const existing = await prisma.customer.findUnique({
      where: { tenantId_phone: { tenantId, phone: body.phone.trim() } },
    })
    if (existing) {
      return reply.status(409).send({
        error:      'A customer with this phone number already exists in this tenant',
        customerId: existing.id,
      })
    }

    const customer = await prisma.customer.create({
      data: {
        tenantId,
        phone:               body.phone.trim(),
        whatsappName:        body.whatsappName,
        name:                body.name,
        company:             body.company,
        industry:            body.industry,
        region:              body.region,
        languagePreference:  body.languagePreference,
        source:              body.source,
        interestedProduct:   body.interestedProduct,
        need:                body.need,
        budget:              body.budget,
        purchaseTiming:      body.purchaseTiming,
        urgency:             body.urgency,
        painPoint:           body.painPoint,
        stage:               (body.stage ?? 'NEW') as LeadStage,
        score:               body.score ?? 0,
        ownerId:             body.ownerId,
        nextFollowUpAt:      body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : undefined,
        notes:               body.notes,
        isBlacklisted:       body.isBlacklisted ?? false,
      },
      include: { tags: { select: { tag: true } } },
    })

    return reply.status(201).send(formatCustomer(customer))
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /customers/:id
  // ──────────────────────────────────────────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body: {
      whatsappName?:        string | null
      name?:                string | null
      company?:             string | null
      industry?:            string | null
      region?:              string | null
      languagePreference?:  string | null
      source?:              string | null
      interestedProduct?:   string | null
      need?:                string | null
      budget?:              string | null
      purchaseTiming?:      string | null
      urgency?:             number | null
      painPoint?:           string | null
      stage?:               string
      score?:               number
      ownerId?:             string | null
      nextFollowUpAt?:      string | null
      notes?:               string | null
      isBlacklisted?:       boolean
    }
  }>(
    '/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const { id }       = req.params
      const body         = req.body ?? {}

      // Validate values if provided
      if (body.stage !== undefined && !VALID_STAGES.includes(body.stage)) {
        return reply.status(400).send({ error: `Invalid stage. Valid: ${VALID_STAGES.join(', ')}` })
      }
      if (body.score !== undefined && (body.score < 0 || body.score > 100)) {
        return reply.status(400).send({ error: 'score must be 0-100' })
      }
      if (body.urgency !== undefined && body.urgency !== null && (body.urgency < 1 || body.urgency > 5)) {
        return reply.status(400).send({ error: 'urgency must be 1-5' })
      }
      if (
        body.languagePreference !== undefined &&
        body.languagePreference !== null &&
        !VALID_LANGUAGES.includes(body.languagePreference)
      ) {
        return reply.status(400).send({ error: `Invalid languagePreference. Valid: ${VALID_LANGUAGES.join(', ')}` })
      }

      // Tenant-scoped existence check before update
      const existing = await prisma.customer.findFirst({ where: { id, tenantId } })
      if (!existing) {
        return reply.status(404).send({ error: 'Customer not found' })
      }

      // Build update data — only include fields present in body
      type UpdateData = Prisma.CustomerUpdateInput
      const data: UpdateData = {}
      const updatable = [
        'whatsappName', 'name', 'company', 'industry', 'region',
        'languagePreference', 'source', 'interestedProduct', 'need',
        'budget', 'purchaseTiming', 'urgency', 'painPoint',
        'ownerId', 'notes', 'isBlacklisted',
      ] as const
      for (const field of updatable) {
        if (field in body) (data as Record<string, unknown>)[field] = (body as Record<string, unknown>)[field]
      }
      if ('stage' in body && body.stage !== undefined) data.stage = body.stage as LeadStage
      if ('score' in body && body.score !== undefined) data.score = body.score
      if ('nextFollowUpAt' in body) {
        data.nextFollowUpAt = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null
      }

      const updated = await prisma.customer.update({
        where:   { id },
        data,
        include: { tags: { select: { tag: true } } },
      })

      return formatCustomer(updated)
    },
  )

  // ──────────────────────────────────────────────────────────────────────────
  // POST /customers/:id/tags
  // ──────────────────────────────────────────────────────────────────────────
  app.post<{
    Params: { id: string }
    Body:   { tag?: string }
  }>(
    '/:id/tags',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const { id }       = req.params
      const { tag }      = req.body ?? {}

      if (!tag || typeof tag !== 'string' || !tag.trim()) {
        return reply.status(400).send({ error: 'tag is required' })
      }

      // Verify customer belongs to tenant
      const customer = await prisma.customer.findFirst({ where: { id, tenantId } })
      if (!customer) {
        return reply.status(404).send({ error: 'Customer not found' })
      }

      // Idempotent upsert
      await prisma.customerTag.upsert({
        where:  { customerId_tag: { customerId: id, tag: tag.trim() } },
        create: { customerId: id, tag: tag.trim() },
        update: {},
      })

      const updated = await prisma.customer.findFirst({
        where:   { id },
        include: { tags: { select: { tag: true } } },
      })

      return reply.status(201).send({
        customerId: id,
        tags:       updated?.tags.map((t) => t.tag) ?? [],
      })
    },
  )

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /customers/:id/tags/:tag
  // ──────────────────────────────────────────────────────────────────────────
  app.delete<{
    Params: { id: string; tag: string }
  }>(
    '/:id/tags/:tag',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId }  = getAuthUser(req)
      const { id, tag }   = req.params

      // Verify customer belongs to tenant
      const customer = await prisma.customer.findFirst({ where: { id, tenantId } })
      if (!customer) {
        return reply.status(404).send({ error: 'Customer not found' })
      }

      await prisma.customerTag.deleteMany({
        where: { customerId: id, tag },
      })

      const updated = await prisma.customer.findFirst({
        where:   { id },
        include: { tags: { select: { tag: true } } },
      })

      return {
        customerId: id,
        tags:       updated?.tags.map((t) => t.tag) ?? [],
      }
    },
  )
}
