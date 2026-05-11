// Automation routes
import type { FastifyInstance } from 'fastify'
import { requireAuth, getAuthUser } from '../auth'

export async function automationRoutes(app: FastifyInstance) {
  app.get('/follow-up-rules',  { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })

  app.post('/follow-up-rules', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })

  app.patch('/follow-up-rules/:id', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })

  app.get('/handoff-rules',    { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })

  app.post('/handoff-rules',   { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })
}
