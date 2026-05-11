// Channel routes
import type { FastifyInstance } from 'fastify'
import { requireAuth, getAuthUser } from '../auth'
import { whatsappWebRoutes } from './whatsapp-web'

export async function channelRoutes(app: FastifyInstance) {
  // GET  /channels — list tenant channels
  app.get('/', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })

  // POST /channels — create channel (use type-specific sub-routes)
  app.post('/', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation — use /channels/whatsapp-web/connect', tenantId }
  })

  // WhatsApp Web sub-router (all routes are auth-protected inside whatsappWebRoutes)
  await app.register(whatsappWebRoutes, { prefix: '/whatsapp-web' })
}
