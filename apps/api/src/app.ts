import 'dotenv/config'
import './auth/types' // activate FastifyJWT type augmentation

import Fastify      from 'fastify'
import fastifyJwt   from '@fastify/jwt'

import { registerRoutes } from './routes'

export async function buildApp() {
  const app = Fastify({ logger: true })

  // ── JWT plugin ─────────────────────────────────────────────────────────────
  const jwtSecret = process.env.JWT_SECRET ?? process.env.APP_SECRET
  if (!jwtSecret) {
    throw new Error('JWT_SECRET or APP_SECRET must be set in environment')
  }
  await app.register(fastifyJwt, { secret: jwtSecret })

  // ── Public routes (no auth required) ──────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', service: 'omni-api' }))

  // ── All application routes ─────────────────────────────────────────────────
  await registerRoutes(app)

  return app
}

async function start() {
  const app = await buildApp()
  const port = Number(process.env.PORT_API ?? 43111)
  await app.listen({ port, host: '0.0.0.0' })
}

start().catch(console.error)
