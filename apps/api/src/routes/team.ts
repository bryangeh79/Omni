// Team Management API — Phase 15B
//
// GET  /team/members          — list team members (MANAGER+)
// POST /team/invite-draft     — invite stub, no real email (ADMIN+)
// PATCH /team/members/:id/role   — update role (OWNER/ADMIN only)
// PATCH /team/members/:id/status — activate/deactivate (OWNER/ADMIN only)
//
// Safety:
//   - passwordHash NEVER returned in any response
//   - No real email sent — emailSent: false, stub only
//   - Tenant-scoped via JWT

import type { FastifyInstance } from 'fastify'
import { prisma }               from '@omni/db'
import { requireRole, getAuthUser } from '../auth'
import { createAuditLog }           from '../lib/audit'

const ADMIN_ROLES   = ['OWNER', 'ADMIN']
const MANAGER_ROLES = ['OWNER', 'ADMIN', 'MANAGER']
const VALID_ROLES   = ['OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER']

// Safe user projection — never include passwordHash
function safeUser(u: {
  id: string; name: string | null; email: string; role: string; isActive: boolean; createdAt: Date
}) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, createdAt: u.createdAt }
}

export async function teamRoutes(app: FastifyInstance) {

  // ── GET /team/members ─────────────────────────────────────────────────────
  app.get('/members', { preHandler: requireRole(...MANAGER_ROLES) }, async (req) => {
    const { tenantId } = getAuthUser(req)

    const users = await prisma.user.findMany({
      where:   { tenantId },
      select:  { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    return {
      tenantId,
      total:   users.length,
      active:  users.filter(u => u.isActive).length,
      members: users.map(safeUser),
    }
  })

  // ── POST /team/invite-draft ───────────────────────────────────────────────
  // Stub invite — no real email. Records the intent only.
  app.post<{
    Body: { email?: string; name?: string; role?: string }
  }>('/invite-draft', { preHandler: requireRole(...ADMIN_ROLES) }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const { email, name, role } = req.body ?? {}

    if (!email || !email.includes('@')) {
      return reply.status(400).send({ error: 'Valid email is required' })
    }
    const assignRole = role && VALID_ROLES.includes(role) ? role : 'AGENT'

    const existing = await prisma.user.findUnique({ where: { tenantId_email: { tenantId, email } } })
    if (existing) {
      return reply.status(409).send({ error: 'User with this email already exists in this tenant' })
    }

    void createAuditLog({
      tenantId,
      actorUserId: getAuthUser(req).userId,
      actorRole:   getAuthUser(req).role,
      action:      'TEAM_INVITE_DRAFT',
      entityType:  'TeamInvite',
      metadata:    { email, name: name ?? null, role: assignRole },
    })

    return {
      tenantId,
      invited: {
        email,
        name:  name ?? null,
        role:  assignRole,
      },
      emailSent:  false,
      stub:       true,
      note:       'Invite recorded as draft. No real email sent — email delivery not configured in this phase.',
      action:     'Operator must manually provision user credentials via /auth/register or seed script.',
    }
  })

  // ── PATCH /team/members/:id/role ──────────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body:   { role?: string }
  }>('/members/:id/role', { preHandler: requireRole(...ADMIN_ROLES) }, async (req, reply) => {
    const { tenantId, userId: callerId } = getAuthUser(req)
    const { id }  = req.params
    const { role } = req.body ?? {}

    if (!role || !VALID_ROLES.includes(role)) {
      return reply.status(400).send({ error: `Invalid role. Valid: ${VALID_ROLES.join(', ')}` })
    }

    const target = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, tenantId: true, role: true, email: true },
    })
    if (!target || target.tenantId !== tenantId) {
      return reply.status(404).send({ error: 'User not found' })
    }
    if (target.id === callerId && role !== 'OWNER') {
      return reply.status(400).send({ error: 'Cannot demote yourself' })
    }

    const updated = await prisma.user.update({
      where:  { id },
      data:   { role: role as never },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    })

    void createAuditLog({
      tenantId,
      actorUserId: callerId,
      actorRole:   getAuthUser(req).role,
      action:      'TEAM_ROLE_UPDATE',
      entityType:  'User',
      entityId:    id,
      metadata:    { newRole: role, targetEmail: target.email },
    })

    return { saved: true, tenantId, user: safeUser(updated) }
  })

  // ── PATCH /team/members/:id/status ────────────────────────────────────────
  app.patch<{
    Params: { id: string }
    Body:   { isActive?: boolean }
  }>('/members/:id/status', { preHandler: requireRole(...ADMIN_ROLES) }, async (req, reply) => {
    const { tenantId, userId: callerId } = getAuthUser(req)
    const { id }       = req.params
    const { isActive } = req.body ?? {}

    if (typeof isActive !== 'boolean') {
      return reply.status(400).send({ error: 'isActive (boolean) is required' })
    }

    const target = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, tenantId: true },
    })
    if (!target || target.tenantId !== tenantId) {
      return reply.status(404).send({ error: 'User not found' })
    }
    if (target.id === callerId && !isActive) {
      return reply.status(400).send({ error: 'Cannot deactivate yourself' })
    }

    const updated = await prisma.user.update({
      where:  { id },
      data:   { isActive },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    })

    void createAuditLog({
      tenantId,
      actorUserId: callerId,
      actorRole:   getAuthUser(req).role,
      action:      'TEAM_STATUS_UPDATE',
      entityType:  'User',
      entityId:    id,
      metadata:    { isActive },
    })

    return { saved: true, tenantId, user: safeUser(updated) }
  })
}
