// Boss Dashboard routes
import type { FastifyInstance } from 'fastify'
import { requireAuth, getAuthUser } from '../auth'

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/today', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 4 implementation', tenantId }
  })

  app.get('/stats', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 4 implementation', tenantId }
  })
}
