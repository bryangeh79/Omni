import 'dotenv/config'
import './auth/types' // activate FastifyJWT type augmentation

import Fastify          from 'fastify'
import fastifyJwt       from '@fastify/jwt'
import fastifyCookie    from '@fastify/cookie'
import fastifyCors      from '@fastify/cors'

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

  // ── CORS (browser dashboard at :43110 needs cross-origin to API :43111) ──
  // Origin allowlist is env-driven; defaults cover local dev only.
  const corsOrigins = (process.env.OMNI_CORS_ORIGINS ?? 'http://localhost:43110,http://127.0.0.1:43110')
    .split(',').map(s => s.trim()).filter(Boolean)
  await app.register(fastifyCors, {
    origin: corsOrigins,
    credentials: true,
  })

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
