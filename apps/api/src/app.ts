// Omni API Server — entry point skeleton
// Full implementation in Phase 1.

import Fastify from 'fastify'
import { registerRoutes } from './routes'

export async function buildApp() {
  const app = Fastify({ logger: true })

  // Health check (no auth required)
  app.get('/health', async () => ({ status: 'ok', service: 'omni-api' }))

  await registerRoutes(app)

  return app
}

async function start() {
  const app = await buildApp()
  const port = Number(process.env.PORT_API ?? 43111)
  await app.listen({ port, host: '0.0.0.0' })
}

start().catch(console.error)
