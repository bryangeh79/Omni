// Channel routes
import type { FastifyInstance } from 'fastify'

import { whatsappWebRoutes } from './whatsapp-web'

export async function channelRoutes(app: FastifyInstance) {
  // ── Generic channel endpoints ─────────────────────────────────────────────
  // GET  /channels               list tenant channels
  app.get('/',    async () => ({ todo: 'Phase 3 (requires auth)' }))

  // POST /channels               create channel (use type-specific endpoints for now)
  app.post('/',   async () => ({ todo: 'Phase 3 (requires auth)' }))

  // ── WhatsApp Web sub-router ───────────────────────────────────────────────
  // POST   /channels/whatsapp-web/connect
  // GET    /channels/whatsapp-web/:channelId/status
  // GET    /channels/whatsapp-web/:channelId/qr
  // POST   /channels/whatsapp-web/:channelId/disconnect
  await app.register(whatsappWebRoutes, { prefix: '/whatsapp-web' })
}
