// AI Config routes — skeleton
import type { FastifyInstance } from 'fastify'

export async function aiConfigRoutes(app: FastifyInstance) {
  // GET  /ai-config       get tenant AI config
  app.get('/',  async () => ({ todo: 'Phase 3' }))

  // PUT  /ai-config       upsert persona, goals, systemPrompt, model
  app.put('/',  async () => ({ todo: 'Phase 3' }))

  // POST /ai-config/test  send a test message through the AI agent
  app.post('/test', async () => ({ todo: 'Phase 3' }))
}
