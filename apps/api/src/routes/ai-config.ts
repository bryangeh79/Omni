// AI Config routes
import type { FastifyInstance } from 'fastify'
import { requireAuth, getAuthUser } from '../auth'

export async function aiConfigRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })

  app.put('/', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })

  app.post('/test', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })
}
