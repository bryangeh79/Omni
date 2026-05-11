// Usage / Cost routes
import type { FastifyInstance } from 'fastify'
import { requireAuth, getAuthUser } from '../auth'

export async function usageRoutes(app: FastifyInstance) {
  app.get('/summary', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 6 implementation', tenantId }
  })

  app.get('/daily', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 6 implementation', tenantId }
  })
}
