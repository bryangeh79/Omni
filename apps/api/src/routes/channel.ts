// Channel routes — skeleton
import type { FastifyInstance } from 'fastify'

export async function channelRoutes(app: FastifyInstance) {
  // GET  /channels               list tenant channels
  app.get('/',    async () => ({ todo: 'Phase 2' }))

  // POST /channels               create channel config
  app.post('/',   async () => ({ todo: 'Phase 2' }))

  // GET  /channels/:id/qr        WhatsApp Web — get QR code for scan
  app.get('/:id/qr', async () => ({ todo: 'Phase 2' }))

  // GET  /channels/:id/status    connection status
  app.get('/:id/status', async () => ({ todo: 'Phase 2' }))

  // DELETE /channels/:id         disconnect + remove channel
  app.delete('/:id', async () => ({ todo: 'Phase 2' }))
}
