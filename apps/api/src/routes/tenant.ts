// Tenant routes — skeleton
import type { FastifyInstance } from 'fastify'

export async function tenantRoutes(app: FastifyInstance) {
  // GET  /tenants/me         current tenant settings
  app.get('/me', async () => ({ todo: 'Phase 1' }))

  // PATCH /tenants/me        update name, defaultLanguage, plan
  app.patch('/me', async () => ({ todo: 'Phase 1' }))

  // GET  /tenants/me/users   list users
  app.get('/me/users', async () => ({ todo: 'Phase 1' }))

  // POST /tenants/me/users   invite user
  app.post('/me/users', async () => ({ todo: 'Phase 1' }))
}
