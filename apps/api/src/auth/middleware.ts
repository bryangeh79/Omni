// Fastify auth middleware — requireAuth preHandler and role helpers.

import type { FastifyReply, FastifyRequest } from 'fastify'
import type { JwtTokenPayload } from './types'

/**
 * preHandler: verify JWT access token and attach req.user.
 * Usage: { preHandler: requireAuth }
 */
export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await req.jwtVerify()
    const user = req.user as JwtTokenPayload
    if (user.type !== 'access') {
      return reply.status(401).send({ error: 'Invalid token type — use access token' })
    }
  } catch {
    return reply.status(401).send({ error: 'Unauthorized — valid Bearer token required' })
  }
}

/**
 * preHandler factory: requireAuth + role check.
 * Usage: { preHandler: requireRole('OWNER', 'ADMIN') }
 */
export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(req, reply)
    if (reply.sent) return // requireAuth already replied
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
