// Auth routes — login, refresh, logout, me
import type { FastifyInstance } from 'fastify'

import {
  findActiveUserByEmail,
  isTenantActive,
  verifyPassword,
  issueAccessToken,
  issueRefreshToken,
  requireAuth,
  getAuthUser,
} from '../auth'
import type { JwtTokenPayload } from '../auth'

export async function authRoutes(app: FastifyInstance) {

  // POST /auth/login
  // Body: { email: string, password: string }
  // Returns: { accessToken, refreshToken, user: { id, email, role, tenantId } }
  app.post<{
    Body: { email?: string; password?: string }
  }>('/login', async (req, reply) => {
    const { email, password } = req.body ?? {}

    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password are required' })
    }

    const user = await findActiveUserByEmail(email)
    if (!user) {
      // Constant-time rejection — don't leak whether email exists
      await new Promise((r) => setTimeout(r, 300))
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    if (!(await isTenantActive(user.tenantId))) {
      return reply.status(403).send({ error: 'Tenant is inactive' })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const tokenUser = { id: user.id, tenantId: user.tenantId, role: user.role, email: user.email }
    const accessToken  = issueAccessToken(app, tokenUser)
    const refreshToken = issueRefreshToken(app, tokenUser)

    // Tokens not logged — never put in logs or error messages
    return reply.status(200).send({
      accessToken,
      refreshToken,
      user: {
        id:       user.id,
        email:    user.email,
        role:     user.role,
        tenantId: user.tenantId,
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
