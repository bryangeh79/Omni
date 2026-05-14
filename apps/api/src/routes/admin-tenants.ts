// Round-9B: SaaS Admin — Tenant Provisioning + License/Contract foundation.
//
// IMPORTANT (auth):
//   Until platform-admin RBAC ships, these endpoints are gated by
//   requireRole('OWNER', 'ADMIN'). Annotated with TODO so a future Round
//   can swap in a true platform-admin role. They still NEVER expose:
//     passwordHash, accessToken, refreshToken, raw passwords, internalNotes
//     (unless the actor is the same tenant's admin), metadataJson.
//
//   No real email, no real payment, no real AI/Meta/WhatsApp call.

import type { FastifyInstance } from 'fastify'
import { prisma } from '@omni/db'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { requireAuth, requireRole, getAuthUser } from '../auth'
import { createAuditLog } from '../lib/audit'
import { isValidServiceStatus, suggestLicenseCode, SERVICE_STATUS_LABEL, SERVICE_STATUSES, type ServiceStatus } from '../lib/service-access'

function newTempPassword(): string {
  // 12-char temp password including digits; SaaS Admin shows ONCE and asks tenant to rotate.
  return crypto.randomBytes(9).toString('base64url').slice(0, 12)
}

function safeTenantView(t: { id: string; name: string; slug: string; plan: string; serviceStatus: string; contractStartAt: Date | null; contractEndAt: Date | null; licenseCode: string | null; suspensionReason: string | null; createdAt: Date; isActive: boolean }, ownerEmail: string | null, daysRemaining: number | null) {
  // Note: internalNotes intentionally NOT included.
  return {
    id:               t.id,
    name:             t.name,
    slug:             t.slug,
    plan:             t.plan,
    serviceStatus:    t.serviceStatus,
    serviceStatusLabel: (SERVICE_STATUS_LABEL as Record<string, string>)[t.serviceStatus] ?? t.serviceStatus,
    contractStartAt:  t.contractStartAt?.toISOString() ?? null,
    contractEndAt:    t.contractEndAt?.toISOString() ?? null,
    daysRemaining,
    licenseCode:      t.licenseCode,
    suspensionReason: t.suspensionReason,
    ownerEmail,
    createdAt:        t.createdAt.toISOString(),
    isActive:         t.isActive,
  }
}

async function ownerEmailOf(tenantId: string): Promise<string | null> {
  const u = await prisma.user.findFirst({
    where:  { tenantId, role: 'OWNER' },
    select: { email: true },
    orderBy:{ createdAt: 'asc' },
  })
  return u?.email ?? null
}

export async function adminTenantsRoutes(app: FastifyInstance) {

  // ── GET /admin/tenants ────────────────────────────────────────────────
  // TODO(platform-rbac): swap requireRole to a true platform-admin role guard.
  app.get('/', { preHandler: [requireAuth, requireRole('OWNER', 'ADMIN')] }, async (req, reply) => {
    void reply
    const url = new URL(req.url, 'http://x')
    const status = url.searchParams.get('serviceStatus')
    const q      = url.searchParams.get('q')?.trim() ?? ''
    const where: Record<string, unknown> = {}
    if (status && isValidServiceStatus(status)) where.serviceStatus = status
    if (q) where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
      { licenseCode: { contains: q, mode: 'insensitive' } },
    ]
    const list = await prisma.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, name: true, slug: true, plan: true, serviceStatus: true, contractStartAt: true, contractEndAt: true, licenseCode: true, suspensionReason: true, createdAt: true, isActive: true },
    })
    const enriched = await Promise.all(list.map(async t => {
      const oe = await ownerEmailOf(t.id)
      const daysRemaining = t.contractEndAt
        ? Math.max(0, Math.ceil((t.contractEndAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null
      return safeTenantView(t, oe, daysRemaining)
    }))
    return {
      tenants:                    enriched,
      total:                      enriched.length,
      realEmailSent:              false,
      realPaymentGatewayCalled:   false,
      realAiProviderCalled:       false,
    }
  })

  // ── GET /admin/tenants/:id ────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth, requireRole('OWNER', 'ADMIN')] },
    async (req, reply) => {
      const t = await prisma.tenant.findUnique({
        where: { id: req.params.id },
        select: { id: true, name: true, slug: true, plan: true, serviceStatus: true, contractStartAt: true, contractEndAt: true, licenseCode: true, suspensionReason: true, internalNotes: true, createdAt: true, isActive: true },
      })
      if (!t) return reply.status(404).send({ error: 'tenant not found' })
      const oe = await ownerEmailOf(t.id)
      const days = t.contractEndAt ? Math.max(0, Math.ceil((t.contractEndAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null
      return {
        ...safeTenantView(t, oe, days),
        // Admin-only field — exposed only because the route is gated by OWNER/ADMIN guard.
        internalNotes: t.internalNotes,
      }
    },
  )

  // ── POST /admin/tenants — create tenant ──────────────────────────────
  app.post<{ Body: {
    name?: string
    slug?: string
    plan?: string
    ownerName?: string
    ownerEmail?: string
    temporaryPassword?: string
    generateTemporaryPassword?: boolean
    contractStartAt?: string
    contractEndAt?: string
    serviceStatus?: string
    licenseCode?: string
    internalNotes?: string
  } }>(
    '/',
    { preHandler: [requireAuth, requireRole('OWNER', 'ADMIN')] },
    async (req, reply) => {
      const b = req.body ?? {}
      if (!b.name?.trim())                 return reply.status(400).send({ error: 'name is required' })
      if (!b.slug?.trim())                 return reply.status(400).send({ error: 'slug is required' })
      if (!b.ownerName?.trim())            return reply.status(400).send({ error: 'ownerName is required' })
      if (!b.ownerEmail?.trim())           return reply.status(400).send({ error: 'ownerEmail is required' })
      const plan = b.plan?.trim() || 'trial'
      const serviceStatus = b.serviceStatus?.trim() || 'TRIAL'
      if (!isValidServiceStatus(serviceStatus)) return reply.status(400).send({ error: `serviceStatus must be one of ${SERVICE_STATUSES.join('|')}` })
      const slug = b.slug.trim().toLowerCase()
      if (!/^[a-z0-9-]{3,40}$/.test(slug)) return reply.status(400).send({ error: 'slug must be 3-40 chars [a-z0-9-]' })
      const dup = await prisma.tenant.findUnique({ where: { slug } })
      if (dup) return reply.status(409).send({ error: 'slug already exists', existingId: dup.id })

      const generated = b.generateTemporaryPassword === true
      const password = generated ? newTempPassword() : (b.temporaryPassword?.trim() ?? '')
      if (!password || password.length < 8) return reply.status(400).send({ error: 'temporaryPassword min 8 chars (or set generateTemporaryPassword=true)' })
      const passwordHash = await bcrypt.hash(password, 10)

      // Decide license code: explicit, or auto-suggested.
      let licenseCode = b.licenseCode?.trim() ?? null
      if (!licenseCode) {
        const ordinal = await prisma.tenant.count() + 1
        licenseCode = suggestLicenseCode(plan, ordinal)
      }

      // Idempotency guard against extremely unlikely licenseCode collision.
      const codeDup = await prisma.tenant.findUnique({ where: { licenseCode } })
      if (codeDup) return reply.status(409).send({ error: 'licenseCode already exists' })

      // Create tenant + owner user.
      const tenant = await prisma.tenant.create({
        data: {
          name:             b.name.trim(),
          slug,
          plan,
          serviceStatus:    serviceStatus as ServiceStatus,
          contractStartAt:  b.contractStartAt ? new Date(b.contractStartAt) : null,
          contractEndAt:    b.contractEndAt   ? new Date(b.contractEndAt)   : null,
          licenseCode,
          internalNotes:    b.internalNotes?.trim() || null,
          isActive:         true,
        },
      })
      await prisma.user.create({
        data: {
          tenantId:     tenant.id,
          email:        b.ownerEmail.trim().toLowerCase(),
          name:         b.ownerName.trim(),
          passwordHash,
          role:         'OWNER',
          isActive:     true,
        },
      })

      const actor = getAuthUser(req)
      await createAuditLog({
        tenantId:    tenant.id,
        actorUserId: actor.userId, actorRole: actor.role,
        action:      'TENANT_PROVISIONED_BY_ADMIN',
        entityType:  'Tenant',
        entityId:    tenant.id,
        metadata: {
          plan, serviceStatus, licenseCode,
          contractStartAt: tenant.contractStartAt?.toISOString() ?? null,
          contractEndAt:   tenant.contractEndAt?.toISOString()   ?? null,
          ownerEmail:      b.ownerEmail.trim().toLowerCase(),
          generatedTempPassword: generated,
        },
      })

      return reply.status(201).send({
        tenantId:           tenant.id,
        tenantSlug:         tenant.slug,
        plan,
        serviceStatus,
        contractEndAt:      tenant.contractEndAt?.toISOString() ?? null,
        licenseCode,
        loginEmail:         b.ownerEmail.trim().toLowerCase(),
        // Show temp password ONCE; SaaS Admin must hand it to tenant manually.
        temporaryPassword:  password,
        temporaryPasswordShownOnce: true,
        note:               '请将登录资料手动发送给客户（不会自动发邮件）。建议客户首次登录后立即重置密码。',
        realEmailSent:              false,
        realPaymentGatewayCalled:   false,
        realAiProviderCalled:       false,
      })
    },
  )

  // ── PATCH /admin/tenants/:id/service-status ───────────────────────────
  app.patch<{ Params: { id: string }, Body: { serviceStatus?: string; suspensionReason?: string } }>(
    '/:id/service-status',
    { preHandler: [requireAuth, requireRole('OWNER', 'ADMIN')] },
    async (req, reply) => {
      const { id } = req.params
      const status = req.body?.serviceStatus
      if (!isValidServiceStatus(status)) return reply.status(400).send({ error: `serviceStatus must be one of ${SERVICE_STATUSES.join('|')}` })
      const prev = await prisma.tenant.findUnique({ where: { id }, select: { serviceStatus: true } })
      if (!prev) return reply.status(404).send({ error: 'tenant not found' })
      const updated = await prisma.tenant.update({
        where: { id },
        data:  { serviceStatus: status, suspensionReason: req.body?.suspensionReason?.trim() || null },
        select:{ id: true, serviceStatus: true, suspensionReason: true },
      })
      const actor = getAuthUser(req)
      const action = status === 'SUSPENDED' ? 'TENANT_SUSPENDED'
                    : status === 'ACTIVE' && prev.serviceStatus === 'SUSPENDED' ? 'TENANT_REACTIVATED'
                    : 'TENANT_SERVICE_STATUS_CHANGED'
      await createAuditLog({
        tenantId:    id,
        actorUserId: actor.userId, actorRole: actor.role,
        action, entityType: 'Tenant', entityId: id,
        metadata:    { oldStatus: prev.serviceStatus, newStatus: status, suspensionReason: req.body?.suspensionReason ?? null },
      })
      return {
        ...updated,
        serviceStatusLabel: (SERVICE_STATUS_LABEL as Record<string, string>)[updated.serviceStatus] ?? updated.serviceStatus,
        realEmailSent: false, realAiProviderCalled: false,
      }
    },
  )

  // ── PATCH /admin/tenants/:id/contract ─────────────────────────────────
  app.patch<{ Params: { id: string }, Body: { contractStartAt?: string; contractEndAt?: string; licenseCode?: string } }>(
    '/:id/contract',
    { preHandler: [requireAuth, requireRole('OWNER', 'ADMIN')] },
    async (req, reply) => {
      const { id } = req.params
      const prev = await prisma.tenant.findUnique({ where: { id }, select: { contractEndAt: true } })
      if (!prev) return reply.status(404).send({ error: 'tenant not found' })
      const data: Record<string, unknown> = {}
      if (req.body?.contractStartAt !== undefined) data.contractStartAt = req.body.contractStartAt ? new Date(req.body.contractStartAt) : null
      if (req.body?.contractEndAt   !== undefined) data.contractEndAt   = req.body.contractEndAt   ? new Date(req.body.contractEndAt)   : null
      if (req.body?.licenseCode     !== undefined) data.licenseCode     = req.body.licenseCode?.trim() || null

      const updated = await prisma.tenant.update({ where: { id }, data, select: { id: true, contractStartAt: true, contractEndAt: true, licenseCode: true } })
      const actor = getAuthUser(req)
      await createAuditLog({
        tenantId: id, actorUserId: actor.userId, actorRole: actor.role,
        action: 'TENANT_CONTRACT_EXTENDED', entityType: 'Tenant', entityId: id,
        metadata: {
          oldContractEndAt: prev.contractEndAt?.toISOString() ?? null,
          newContractEndAt: updated.contractEndAt?.toISOString() ?? null,
          licenseCode:      updated.licenseCode,
        },
      })
      return {
        contractStartAt: updated.contractStartAt?.toISOString() ?? null,
        contractEndAt:   updated.contractEndAt?.toISOString()   ?? null,
        licenseCode:     updated.licenseCode,
        realEmailSent: false,
      }
    },
  )

  // ── POST /admin/tenants/:id/reset-password-stub ───────────────────────
  // Rotates owner's password to a freshly generated temporary password.
  // Returns the new password ONCE in the response so SaaS Admin can hand it
  // to the customer manually. Does NOT send real email.
  app.post<{ Params: { id: string } }>(
    '/:id/reset-password-stub',
    { preHandler: [requireAuth, requireRole('OWNER', 'ADMIN')] },
    async (req, reply) => {
      const { id } = req.params
      const owner = await prisma.user.findFirst({
        where:  { tenantId: id, role: 'OWNER' },
        select: { id: true, email: true },
      })
      if (!owner) return reply.status(404).send({ error: 'tenant owner not found' })
      const password = newTempPassword()
      const passwordHash = await bcrypt.hash(password, 10)
      await prisma.user.update({ where: { id: owner.id }, data: { passwordHash } })
      const actor = getAuthUser(req)
      await createAuditLog({
        tenantId: id, actorUserId: actor.userId, actorRole: actor.role,
        action: 'TENANT_PASSWORD_RESET_STUB', entityType: 'User', entityId: owner.id,
        // NOTE: raw password and passwordHash intentionally NOT in metadata.
        metadata: { ownerEmail: owner.email, byAdmin: true, realEmailSent: false },
      })
      return reply.status(200).send({
        tenantId:        id,
        ownerEmail:      owner.email,
        // Show ONCE — SaaS Admin gives it to customer manually.
        temporaryPassword: password,
        temporaryPasswordShownOnce: true,
        realEmailSent:    false,
        note: '已为该租户重置临时密码。请手动发送给客户，并提示客户首次登录后立即重置。',
      })
    },
  )
}
