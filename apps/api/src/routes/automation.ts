// Automation (follow-up + handoff rules) routes — skeleton
import type { FastifyInstance } from 'fastify'

export async function automationRoutes(app: FastifyInstance) {
  // GET  /automation/follow-up-rules
  app.get('/follow-up-rules', async () => ({ todo: 'Phase 3' }))

  // POST /automation/follow-up-rules
  app.post('/follow-up-rules', async () => ({ todo: 'Phase 3' }))

  // PATCH /automation/follow-up-rules/:id
  app.patch('/follow-up-rules/:id', async () => ({ todo: 'Phase 3' }))

  // GET  /automation/handoff-rules
  app.get('/handoff-rules', async () => ({ todo: 'Phase 3' }))

  // POST /automation/handoff-rules
  app.post('/handoff-rules', async () => ({ todo: 'Phase 3' }))
}
