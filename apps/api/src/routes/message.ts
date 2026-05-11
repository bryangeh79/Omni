// Message routes — skeleton
import type { FastifyInstance } from 'fastify'

export async function messageRoutes(app: FastifyInstance) {
  // GET  /messages?conversationId=    list messages in a conversation
  app.get('/', async () => ({ todo: 'Phase 2' }))

  // POST /messages/send               human agent sends message
  app.post('/send', async () => ({ todo: 'Phase 2' }))

  // POST /messages/webhook/:channelId  inbound webhook from channel adapters
  app.post('/webhook/:channelId', async () => ({ todo: 'Phase 2' }))
}
