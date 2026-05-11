// Customer / CRM routes — skeleton
import type { FastifyInstance } from 'fastify'

export async function customerRoutes(app: FastifyInstance) {
  // GET  /customers          list with filters (stage, score, tag, language…)
  app.get('/',    async () => ({ todo: 'Phase 3' }))

  // GET  /customers/:id      full customer card
  app.get('/:id', async () => ({ todo: 'Phase 3' }))

  // POST /customers          create
  app.post('/',   async () => ({ todo: 'Phase 3' }))

  // PATCH /customers/:id     update (stage, score, owner, notes…)
  app.patch('/:id', async () => ({ todo: 'Phase 3' }))

  // POST /customers/:id/tags
  app.post('/:id/tags', async () => ({ todo: 'Phase 3' }))

  // DELETE /customers/:id/tags/:tag
  app.delete('/:id/tags/:tag', async () => ({ todo: 'Phase 3' }))
}
