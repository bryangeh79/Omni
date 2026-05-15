// Auth service — password verification and token issuance.

import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'
import { prisma } from '@omni/db'
import type { JwtTokenPayload } from './types'

const SALT_ROUNDS = 10

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export interface AuthUser {
  id:           string
  tenantId:     string
  tenantSlug:   string
  email:        string
  passwordHash: string
  role:         string
  name:         string
  isActive:     boolean
}

/**
 * SaaS-safe user lookup: tenant slug + email (tenant-scoped).
 *
 * Returns null for any of these (caller must give the same generic error):
 *   - tenant slug not found
 *   - tenant inactive
 *   - user not found in that tenant
 *   - user inactive
 *
 * Never leaks whether a tenant or user exists to the caller.
 */
export async function findActiveUserByTenantSlugAndEmail(
  tenantSlug: string,
  email: string,
): Promise<AuthUser | null> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } })
  if (!tenant || !tenant.isActive) return null

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email, isActive: true },
  })
  if (!user) return null

  return {
    id:           user.id,
    tenantId:     user.tenantId,
    tenantSlug:   tenant.slug,
    email:        user.email,
    passwordHash: user.passwordHash,
    role:         user.role,
    name:         user.name,
    isActive:     user.isActive,
  }
}

/**
 * @deprecated Use findActiveUserByTenantSlugAndEmail for SaaS-safe login.
 * Kept for internal/admin use only — not for login endpoints.
 */
export async function findActiveUserByEmail(email: string): Promise<AuthUser | null> {
  const user = await prisma.user.findFirst({ where: { email, isActive: true } })
  if (!user) return null
  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } })
  return {
    id:           user.id,
    tenantId:     user.tenantId,
    tenantSlug:   tenant?.slug ?? '',
    email:        user.email,
    passwordHash: user.passwordHash,
    role:         user.role,
    name:         user.name,
    isActive:     user.isActive,
  }
}

/**
 * Round-9D: email-only login resolver.
 *
 * Product decision: one email belongs to one tenant. If the email matches
 * exactly one active (tenant + user), return it. If it matches multiple
 * (legacy data), return ambiguous=true and a safe error is shown to the
 * caller — never leak how many or which tenants.
 */
export async function findUniqueActiveUserByEmail(
  email: string,
): Promise<{ user: AuthUser | null; ambiguous: boolean }> {
  const users = await prisma.user.findMany({
    where: { email, isActive: true },
    select: { id: true, tenantId: true, email: true, passwordHash: true, role: true, name: true, isActive: true },
    take: 2,
  })
  if (users.length === 0) return { user: null, ambiguous: false }
  if (users.length > 1)   return { user: null, ambiguous: true }
  const u = users[0]
  const tenant = await prisma.tenant.findUnique({ where: { id: u.tenantId } })
  if (!tenant || !tenant.isActive) return { user: null, ambiguous: false }
  return {
    user: {
      id:           u.id,
      tenantId:     u.tenantId,
      tenantSlug:   tenant.slug,
      email:        u.email,
      passwordHash: u.passwordHash,
      role:         u.role,
      name:         u.name,
      isActive:     u.isActive,
    },
    ambiguous: false,
  }
}

export async function isTenantActive(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  return tenant?.isActive ?? false
}

// Issue short-lived access token (default 15m)
export function issueAccessToken(
  app: FastifyInstance,
  user: { id: string; tenantId: string; role: string; email: string },
): string {
  const payload: JwtTokenPayload = {
    userId:   user.id,
    tenantId: user.tenantId,
    role:     user.role,
    email:    user.email,
    type:     'access',
  }
  return app.jwt.sign(payload, { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m' })
}

// Issue longer-lived refresh token (default 7d)
export function issueRefreshToken(
  app: FastifyInstance,
  user: { id: string; tenantId: string; role: string; email: string },
): string {
  const payload: JwtTokenPayload = {
    userId:   user.id,
    tenantId: user.tenantId,
    role:     user.role,
    email:    user.email,
    type:     'refresh',
  }
  return app.jwt.sign(payload, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d' })
}
