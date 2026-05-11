// Usage / Cost routes — skeleton
import type { FastifyInstance } from 'fastify'

export async function usageRoutes(app: FastifyInstance) {
  // GET /usage/summary?month=YYYY-MM   monthly token + cost summary
  app.get('/summary', async () => ({ todo: 'Phase 6' }))

  // GET /usage/daily?from=&to=          daily breakdown
  app.get('/daily', async () => ({ todo: 'Phase 6' }))
}
