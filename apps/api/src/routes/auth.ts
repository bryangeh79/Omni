// Auth routes — login, refresh, logout, me
//
// Phase 10A: Two auth modes supported:
//   Bearer mode (default): tokens in JSON body, Authorization header for API calls.
//   Cookie mode (mode=cookie): httpOnly SameSite=Strict cookies set on response.
//
// Backward compatible: Bearer mode is unchanged; all existing clients/tests still work.
// SSE /realtime/events always requires ?token= (EventSource cannot set headers).

import type { FastifyInstance } from 'fastify'

import {
  findActiveUserByTenantSlugAndEmail,
  verifyPassword,
  issueAccessToken,
  issueRefreshToken,
  requireAuth,
  getAuthUser,
} from '../auth'
import {
  COOKIE_ACCESS,
  COOKIE_REFRESH,
  authCookieOptions,
} from '../auth/middleware'
import type { JwtTokenPayload } from '../auth'

// Access token: 15 min; refresh: 7 days (match JWT expiry)
const ACCESS_MAX_AGE  = 15 * 60
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60

export async function authRoutes(app: FastifyInstance) {

  // POST /auth/login
  // Body:  { tenantSlug, email, password }
  // Query: ?mode=cookie  →  set httpOnly cookies instead of returning tokens in body
  //
  // Bearer mode (default): returns { accessToken, refreshToken, user }
  // Cookie mode:           sets omni_at + omni_rt httpOnly cookies, returns { user, cookieMode: true }
  app.post<{
    Body:        { tenantSlug?: string; email?: string; password?: string }
    Querystring: { mode?: string }
  }>('/login', async (req, reply) => {
    const { tenantSlug, email, password } = req.body ?? {}
    const cookieMode = req.query.mode === 'cookie'

    if (!tenantSlug || !email || !password) {
      return reply.status(400).send({ error: 'tenantSlug, email, and password are required' })
    }

    const user = await findActiveUserByTenantSlugAndEmail(tenantSlug, email)
    if (!user) {
      await new Promise((r) => setTimeout(r, 300))
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const tokenUser   = { id: user.id, tenantId: user.tenantId, role: user.role, email: user.email }
    const accessToken  = issueAccessToken(app, tokenUser)
    const refreshToken = issueRefreshToken(app, tokenUser)

    const userPayload = {
      id:         user.id,
      email:      user.email,
      role:       user.role,
      tenantId:   user.tenantId,
      tenantSlug: user.tenantSlug,
    }

    if (cookieMode) {
      // Set httpOnly cookies — CSRF protection via SameSite=Strict
      reply.setCookie(COOKIE_ACCESS,  accessToken,  authCookieOptions(ACCESS_MAX_AGE))
      reply.setCookie(COOKIE_REFRESH, refreshToken, authCookieOptions(REFRESH_MAX_AGE))
      return reply.status(200).send({ user: userPayload, cookieMode: true })
    }

    // Bearer mode: return tokens in body (backward compatible)
    return reply.status(200).send({ accessToken, refreshToken, user: userPayload })
  })

  // POST /auth/refresh
  // Bearer mode: Body { refreshToken: string } → returns { accessToken }
  // Cookie mode: ?mode=cookie, reads omni_rt cookie → sets new omni_at cookie
  app.post<{
    Body:        { refreshToken?: string }
    Querystring: { mode?: string }
  }>('/refresh', async (req, reply) => {
    const cookieMode = req.query.mode === 'cookie'

    let rawRefreshToken: string | undefined

    if (cookieMode) {
      rawRefreshToken = (req.cookies as Record<string, string | undefined>)?.[COOKIE_REFRESH]
      if (!rawRefreshToken) {
        return reply.status(400).send({ error: 'No refresh cookie found — re-login required' })
      }
    } else {
      rawRefreshToken = req.body?.refreshToken
      if (!rawRefreshToken) {
        return reply.status(400).send({ error: 'refreshToken is required' })
      }
    }

    let payload: JwtTokenPayload
    try {
      payload = app.jwt.verify<JwtTokenPayload>(rawRefreshToken)
    } catch {
      if (cookieMode) reply.clearCookie(COOKIE_REFRESH, { path: '/' })
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

    if (cookieMode) {
      reply.setCookie(COOKIE_ACCESS, newAccessToken, authCookieOptions(ACCESS_MAX_AGE))
      return { cookieMode: true }
    }

    return { accessToken: newAccessToken }
  })

  // POST /auth/logout
  // Always clears cookies if present; returns 200.
  app.post('/logout', { preHandler: requireAuth }, async (_req, reply) => {
    // Clear cookies regardless of mode (safe to clear even if they weren't set)
    reply.clearCookie(COOKIE_ACCESS,  { path: '/' })
    reply.clearCookie(COOKIE_REFRESH, { path: '/' })
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

  // GET /auth/cookie-mode-info — returns info about cookie vs Bearer modes
  // Public endpoint; no secrets exposed.
  app.get('/cookie-mode-info', async () => ({
    modes: {
      bearer: {
        description: 'Pass JWT via Authorization: Bearer <token> header',
        loginParam:  'none (default)',
        useCase:     'Server-to-server, CLI, smoke tests, EventSource ?token=',
      },
      cookie: {
        description: 'JWT stored in httpOnly SameSite=Strict cookies',
        loginParam:  '?mode=cookie on POST /auth/login',
        useCase:     'Browser PWA / dashboard sessions',
        csrfProtection: 'SameSite=Strict',
        note:        'SSE /realtime/events still requires ?token= (EventSource limitation)',
      },
    },
  }))
}
