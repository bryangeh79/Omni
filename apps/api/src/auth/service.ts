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
  email:        string
  passwordHash: string
  role:         string
  name:         string
  isActive:     boolean
}

export async function findActiveUserByEmail(email: string): Promise<AuthUser | null> {
  const user = await prisma.user.findFirst({ where: { email, isActive: true } })
  if (!user) return null
  return {
    id:           user.id,
    tenantId:     user.tenantId,
    email:        user.email,
    passwordHash: user.passwordHash,
    role:         user.role,
    name:         user.name,
    isActive:     user.isActive,
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
