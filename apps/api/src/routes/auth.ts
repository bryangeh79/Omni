// Auth routes — skeleton
import type { FastifyInstance } from 'fastify'

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login  { email, password } → { accessToken, refreshToken }
  app.post('/login', async () => ({ todo: 'Phase 1' }))

  // POST /auth/refresh  { refreshToken } → { accessToken }
  app.post('/refresh', async () => ({ todo: 'Phase 1' }))

  // POST /auth/logout
  app.post('/logout', async () => ({ todo: 'Phase 1' }))
}
