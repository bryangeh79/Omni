// Knowledge Base routes — skeleton
import type { FastifyInstance } from 'fastify'

export async function knowledgeRoutes(app: FastifyInstance) {
  // GET  /knowledge               list items (type, language, search)
  app.get('/',    async () => ({ todo: 'Phase 3' }))

  // POST /knowledge               create item
  app.post('/',   async () => ({ todo: 'Phase 3' }))

  // PATCH /knowledge/:id          update
  app.patch('/:id', async () => ({ todo: 'Phase 3' }))

  // DELETE /knowledge/:id         delete
  app.delete('/:id', async () => ({ todo: 'Phase 3' }))

  // POST /knowledge/search        semantic / keyword search (Phase 3+)
  app.post('/search', async () => ({ todo: 'Phase 3' }))
}
