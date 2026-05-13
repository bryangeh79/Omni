// Audit Log API — Phase 15C
//
// GET  /audit/logs         — tenant-scoped paginated audit log (requireAuth)
// POST /audit/demo-event   — create safe stub event for smoke tests (requireAuth)
//
// Safety:
//   - All endpoints auth-required, tenant-scoped via JWT.
//   - metadataJson is opaque string — never parsed back to expose secrets.
//   - No raw tokens, passwords, or .env values ever returned.

import type { FastifyInstance } from 'fastify'
import { prisma }               from '@omni/db'
import { requireAuth, getAuthUser } from '../auth'
import { createAuditLog }           from '../lib/audit'

const MAX_PAGE_SIZE  = 100
const DEF_PAGE_SIZE  = 50

export async function auditRoutes(app: FastifyInstance) {

  // ── GET /audit/logs ───────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      page?:       string
      pageSize?:   string
      action?:     string
      entityType?: string
    }
  }>('/logs', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const { page, pageSize, action, entityType } = req.query

    const take  = Math.min(parseInt(pageSize ?? String(DEF_PAGE_SIZE), 10) || DEF_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip  = (Math.max(parseInt(page ?? '1', 10) || 1, 1) - 1) * take

    const where: Record<string, unknown> = { tenantId }
    if (action)     where['action']     = action
    if (entityType) where['entityType'] = entityType

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id:          true,
          tenantId:    true,
          actorUserId: true,
          actorRole:   true,
          action:      true,
          entityType:  true,
          entityId:    true,
          metadataJson: true,
          ip:          true,
          createdAt:   true,
          // userAgent omitted — can be long and is rarely needed in the UI
        },
      }),
    ])

    return {
      tenantId,
      pagination: {
        total,
        page:     Math.max(parseInt(page ?? '1', 10) || 1, 1),
        pageSize: take,
        pages:    Math.ceil(total / take),
      },
      logs,
    }
  })

  // ── POST /audit/demo-event ────────────────────────────────────────────────
  // Creates a safe stub audit event. Used by smoke tests only.
  app.post('/demo-event', { preHandler: requireAuth }, async (req) => {
    const { tenantId, userId, role } = getAuthUser(req)
    await createAuditLog({
      tenantId,
      actorUserId: userId,
      actorRole:   role,
      action:      'SMOKE_TEST_EVENT',
      entityType:  'SmokeTest',
      entityId:    'smoke-test-001',
      metadata:    { source: 'smoke-test', stub: true },
    })
    return {
      tenantId,
      created: true,
      action:  'SMOKE_TEST_EVENT',
      stub:    true,
      note:    'Demo audit event created for smoke test validation.',
    }
  })
}
