import 'dotenv/config'
import './auth/types' // activate FastifyJWT type augmentation

import Fastify          from 'fastify'
import fastifyJwt       from '@fastify/jwt'
import fastifyCookie    from '@fastify/cookie'

import { registerRoutes }                  from './routes'
import { initRealtimeBus, closeRealtimeBus } from './realtime-bus'

export async function buildApp() {
  const app = Fastify({ logger: true })

  // ── JWT plugin ─────────────────────────────────────────────────────────────
  const jwtSecret = process.env.JWT_SECRET ?? process.env.APP_SECRET
  if (!jwtSecret) {
    throw new Error('JWT_SECRET or APP_SECRET must be set in environment')
  }
  await app.register(fastifyJwt, { secret: jwtSecret })

  // ── Cookie plugin (httpOnly auth tokens) ─────────────────────────────────
  // CSRF protection is provided by SameSite=Strict on all auth cookies.
  // SSE /realtime/events still requires ?token= (EventSource cannot set headers).
  await app.register(fastifyCookie)

  // ── Public routes (no auth required) ──────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', service: 'omni-api' }))

  // ── Realtime bus (Redis pub/sub; falls back to in-memory if Redis absent) ─────
  await initRealtimeBus()
  app.addHook('onClose', async () => { await closeRealtimeBus() })

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
