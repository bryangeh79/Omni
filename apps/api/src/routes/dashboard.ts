// Boss Dashboard routes — skeleton
import type { FastifyInstance } from 'fastify'

export async function dashboardRoutes(app: FastifyInstance) {
  // GET /dashboard/today
  // Returns: new customers, high intent, needs human, pending follow-up,
  //          overdue replies, price asked not closed, booked, won, AI saved time, action recommendations
  app.get('/today', async () => ({ todo: 'Phase 4' }))

  // GET /dashboard/stats?from=&to=   date range summary
  app.get('/stats', async () => ({ todo: 'Phase 4' }))
}
