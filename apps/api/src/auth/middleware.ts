// Fastify auth middleware — requireAuth preHandler and role helpers.
//
// Phase 10A: Accepts JWT from either:
//   1. Authorization: Bearer <token>  (all clients, smoke tests, SSE)
//   2. omni_at httpOnly cookie        (browser cookie-mode login)
//
// Order: Bearer header is checked first; cookie is fallback.
// This keeps existing Bearer-based smoke tests working without change.

import type { FastifyReply, FastifyRequest } from 'fastify'
import type { JwtTokenPayload } from './types'

/** Cookie names for httpOnly auth tokens (Phase 10A). */
export const COOKIE_ACCESS  = 'omni_at'
export const COOKIE_REFRESH = 'omni_rt'

/** Cookie options factory — httpOnly, SameSite=Strict, Secure in production. */
export function authCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   maxAgeSeconds,
  }
}

/**
 * preHandler: verify JWT access token and attach req.user.
 * Checks Authorization header first, then omni_at cookie.
 */
export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // ── 1. Try Bearer header (primary, backward-compatible) ──────────────────
  const bearerHeader = req.headers.authorization
  if (bearerHeader?.startsWith('Bearer ') || bearerHeader?.startsWith('bearer ')) {
    try {
      await req.jwtVerify()
      const user = req.user as JwtTokenPayload
      if (user.type !== 'access') {
        return reply.status(401).send({ error: 'Invalid token type — use access token' })
      }
      return  // authenticated via Bearer
    } catch {
      return reply.status(401).send({ error: 'Unauthorized — invalid Bearer token' })
    }
  }

  // ── 2. Try omni_at httpOnly cookie (browser cookie-mode) ─────────────────
  const cookieToken = (req.cookies as Record<string, string | undefined>)?.[COOKIE_ACCESS]
  if (cookieToken) {
    try {
      const payload = req.server.jwt.verify<JwtTokenPayload>(cookieToken)
      if (payload.type !== 'access') {
        return reply.status(401).send({ error: 'Invalid token type — use access token' })
      }
      ;(req as FastifyRequest & { user: JwtTokenPayload }).user = payload
      return  // authenticated via cookie
    } catch {
      // Expired or tampered cookie — clear it
      reply.clearCookie(COOKIE_ACCESS, { path: '/' })
      return reply.status(401).send({ error: 'Unauthorized — access token cookie expired' })
    }
  }

  // ── 3. No credentials ──────────────────────────────────────────────────────
  return reply.status(401).send({ error: 'Unauthorized — provide Bearer token or log in with cookie mode' })
}

/**
 * preHandler factory: requireAuth + role check.
 */
export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(req, reply)
    if (reply.sent) return
    const user = req.user as JwtTokenPayload
    if (!roles.includes(user.role)) {
      return reply.status(403).send({ error: 'Forbidden — insufficient role' })
    }
  }
}

/** Convenience getter — call after requireAuth has run. */
export function getAuthUser(req: FastifyRequest): JwtTokenPayload {
  return req.user as JwtTokenPayload
}
