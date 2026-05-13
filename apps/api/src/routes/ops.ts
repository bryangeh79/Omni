// Production Ops endpoints — Phase 10B
//
// GET /ops/health  — detailed readiness check for deployment / load balancers
//   - DB reachable
//   - Redis status
//   - Realtime mode
//   - Env safety flags (boolean only — no raw values, no secrets)
//   - Queue connectivity
//
// GET /health remains the lightweight liveness check (already in app.ts).
// GET /ops/health is for readiness (k8s readinessProbe, deployment checks).

import type { FastifyInstance } from 'fastify'
import { prisma }                from '@omni/db'
import { isRealtimeRedisLive }   from '../realtime-bus'
import { isRealMetaSendEnabled } from '../meta-send-guard'

// Queue connectivity check (ioredis ping on BullMQ Redis connection)
async function checkRedisQueueHealth(): Promise<{ ok: boolean; latencyMs: number | null }> {
  try {
    const IORedis = (await import('ioredis')).default
    const url     = process.env.REDIS_URL ?? 'redis://localhost:43114'
    const client  = new IORedis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck:     false,
      lazyConnect:          true,
      connectTimeout:       2000,
    })
    client.on('error', () => { /* suppress noise */ })
    const t0    = Date.now()
    await client.connect()
    const pong  = await client.ping()
    const ms    = Date.now() - t0
    await client.quit().catch(() => null)
    return { ok: pong === 'PONG', latencyMs: ms }
  } catch {
    return { ok: false, latencyMs: null }
  }
}

async function checkDbHealth(): Promise<{ ok: boolean; latencyMs: number | null }> {
  try {
    const t0 = Date.now()
    await prisma.$queryRaw`SELECT 1`
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch {
    return { ok: false, latencyMs: null }
  }
}

export async function opsRoutes(app: FastifyInstance) {

  // ── GET /ops/health ──────────────────────────────────────────────────────
  // Readiness check — safe for external monitoring without auth.
  // Returns HTTP 200 if all critical checks pass, 503 otherwise.
  // No secrets exposed — only boolean flags and latency numbers.
  app.get('/health', async (_req, reply) => {
    const [db, redis] = await Promise.all([checkDbHealth(), checkRedisQueueHealth()])

    const realtimeMode = isRealtimeRedisLive() ? 'redis-pubsub' : 'in-memory-fallback'

    // Safety flags — boolean only, no raw env values
    const safetyFlags = {
      realMetaSendEnabled:  isRealMetaSendEnabled(),   // should be false in production until ready
      waSessionEnabled:     process.env.OMNI_ALLOW_WA_SESSION === 'true',
      jwtConfigured:        !!(process.env.JWT_SECRET ?? process.env.APP_SECRET),
      dbConfigured:         !!process.env.DATABASE_URL,
      redisConfigured:      !!process.env.REDIS_URL,
    }

    const allHealthy = db.ok && redis.ok
    const status     = allHealthy ? 'healthy' : 'degraded'

    reply.status(allHealthy ? 200 : 503)
    return {
      status,
      timestamp:    new Date().toISOString(),
      service:      'omni-api',
      checks: {
        database:     { ok: db.ok,    latencyMs: db.latencyMs },
        redis:        { ok: redis.ok, latencyMs: redis.latencyMs },
        realtimeBus:  { ok: true,     mode: realtimeMode },
      },
      safetyFlags,
    }
  })

  // ── GET /ops/version ─────────────────────────────────────────────────────
  // Returns build/version metadata. No secrets.
  app.get('/version', async () => ({
    service:     'omni-api',
    phase:       '10B',
    nodeVersion: process.version,
    uptime:      Math.round(process.uptime()),
  }))
}
