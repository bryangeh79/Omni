// Message routes
import type { FastifyInstance } from 'fastify'
import { requireAuth, getAuthUser } from '../auth'

export async function messageRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })

  app.post('/send', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })

  // Inbound webhook from channel adapters — no auth (called internally by adapter, not frontend)
  app.post('/webhook/:channelId', async () => ({ todo: 'Phase 2 — internal webhook' }))
}
