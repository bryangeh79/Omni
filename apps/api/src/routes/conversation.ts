// Conversation routes — skeleton
import type { FastifyInstance } from 'fastify'

export async function conversationRoutes(app: FastifyInstance) {
  // GET  /conversations               list (status, assignee, channel…)
  app.get('/',    async () => ({ todo: 'Phase 2' }))

  // GET  /conversations/:id           detail + messages
  app.get('/:id', async () => ({ todo: 'Phase 2' }))

  // POST /conversations/:id/takeover  human takes over from AI
  app.post('/:id/takeover', async () => ({ todo: 'Phase 2' }))

  // POST /conversations/:id/release   release back to AI
  app.post('/:id/release', async () => ({ todo: 'Phase 2' }))

  // POST /conversations/:id/close
  app.post('/:id/close', async () => ({ todo: 'Phase 2' }))
}
