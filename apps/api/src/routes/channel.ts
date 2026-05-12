// Channel routes
import type { FastifyInstance } from 'fastify'
import { requireAuth, getAuthUser } from '../auth'
import { whatsappWebRoutes } from './whatsapp-web'
import { metaChannelRoutes } from './meta-channel'

export async function channelRoutes(app: FastifyInstance) {
  // GET  /channels — list all tenant channels across types
  app.get('/', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })

  // POST /channels — create channel (use type-specific sub-routes)
  app.post('/', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'use /channels/whatsapp-web/connect or /channels/meta', tenantId }
  })

  // WhatsApp Web sub-router
  await app.register(whatsappWebRoutes, { prefix: '/whatsapp-web' })

  // Meta WhatsApp Business Platform sub-router (Phase 7A)
  await app.register(metaChannelRoutes, { prefix: '/meta' })
}
