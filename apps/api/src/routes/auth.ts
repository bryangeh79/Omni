// Auth routes — login, refresh, logout, me
import type { FastifyInstance } from 'fastify'

import {
  findActiveUserByTenantSlugAndEmail,
  verifyPassword,
  issueAccessToken,
  issueRefreshToken,
  requireAuth,
  getAuthUser,
} from '../auth'
import type { JwtTokenPayload } from '../auth'

export async function authRoutes(app: FastifyInstance) {

  // POST /auth/login
  // Body: { tenantSlug, email, password }
  // Returns: { accessToken, refreshToken, user: { id, email, role, tenantId } }
  //
  // SaaS rule: tenantSlug is required so that the same email address in
  // different tenants authenticates into the correct tenant.
  // All auth failures return the same generic 401 to prevent enumeration attacks.
  app.post<{
    Body: { tenantSlug?: string; email?: string; password?: string }
  }>('/login', async (req, reply) => {
    const { tenantSlug, email, password } = req.body ?? {}

    if (!tenantSlug || !email || !password) {
      return reply.status(400).send({
        error: 'tenantSlug, email, and password are required',
      })
    }

    // Tenant-scoped lookup — same generic error for all failures to prevent enumeration
    const user = await findActiveUserByTenantSlugAndEmail(tenantSlug, email)
    if (!user) {
      // Constant-time delay to resist timing attacks on non-existent accounts
      await new Promise((r) => setTimeout(r, 300))
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const tokenUser = { id: user.id, tenantId: user.tenantId, role: user.role, email: user.email }
    const accessToken  = issueAccessToken(app, tokenUser)
    const refreshToken = issueRefreshToken(app, tokenUser)

    // Tokens never logged
    return reply.status(200).send({
      accessToken,
      refreshToken,
      user: {
        id:         user.id,
        email:      user.email,
        role:       user.role,
        tenantId:   user.tenantId,
        tenantSlug: user.tenantSlug,
      },
    })
  })

  // POST /auth/refresh
  // Body: { refreshToken: string }
  // Returns: { accessToken }
  app.post<{
    Body: { refreshToken?: string }
  }>('/refresh', async (req, reply) => {
    const { refreshToken } = req.body ?? {}
    if (!refreshToken) {
      return reply.status(400).send({ error: 'refreshToken is required' })
    }

    let payload: JwtTokenPayload
    try {
      payload = app.jwt.verify<JwtTokenPayload>(refreshToken)
    } catch {
      return reply.status(401).send({ error: 'Invalid or expired refresh token' })
    }

    if (payload.type !== 'refresh') {
      return reply.status(401).send({ error: 'Token is not a refresh token' })
    }

    const newAccessToken = issueAccessToken(app, {
      id:       payload.userId,
      tenantId: payload.tenantId,
      role:     payload.role,
      email:    payload.email,
    })

    return { accessToken: newAccessToken }
  })

  // POST /auth/logout (stateless stub — client should discard tokens)
  app.post('/logout', { preHandler: requireAuth }, async (_req, reply) => {
    // Phase 4+: add server-side token revocation (Redis blocklist)
    return reply.status(200).send({ message: 'Logged out — discard tokens on client' })
  })

  // GET /auth/me
  app.get('/me', { preHandler: requireAuth }, async (req) => {
    const user = getAuthUser(req)
    return {
      userId:   user.userId,
      email:    user.email,
      role:     user.role,
      tenantId: user.tenantId,
    }
  })
}
