// Real-time SSE endpoint — Phase 8B: Redis pub/sub
//
// GET /realtime/events?token=<jwt>
//   Subscribes to Redis tenant channel; streams SSE to client.
//   Falls back to in-process EventEmitter if Redis is unavailable.
//
// GET /realtime/status
//   Returns Redis pub/sub health (no auth required — safe, no secrets).
//
// JWT accepted via:
//   - ?token= query param  (required for browser EventSource)
//   - Authorization: Bearer <token> header  (non-browser clients)

import type { FastifyInstance } from 'fastify'
import { subscribeToTenant, isRealtimeRedisLive } from '../realtime-bus'
import type { JwtTokenPayload } from '../auth/types'

export async function realtimeRoutes(app: FastifyInstance) {

  // ── GET /realtime/status — Redis health (public, no secrets) ──────────────
  app.get('/status', async () => ({
    redisLive:  isRealtimeRedisLive(),
    mode:       isRealtimeRedisLive() ? 'redis-pubsub' : 'in-memory-fallback',
    limitation: isRealtimeRedisLive()
      ? null
      : 'Redis unavailable: events are in-process only; worker AI reply events not delivered',
  }))

  // ── GET /realtime/events — SSE stream ─────────────────────────────────────
  app.get<{ Querystring: { token?: string } }>(
    '/events',
    async (req, reply) => {
      // Auth: ?token= for browser EventSource (cannot set headers); Bearer for others
      const rawToken =
        (req.query as { token?: string }).token ??
        req.headers.authorization?.replace(/^Bearer\s+/i, '')

      if (!rawToken) {
        return reply.status(401).send({
          error: 'Provide ?token=<access_jwt> or Authorization: Bearer <token>',
        })
      }

      let payload: JwtTokenPayload
      try {
        payload = app.jwt.verify<JwtTokenPayload>(rawToken)
      } catch {
        return reply.status(401).send({ error: 'Invalid or expired token' })
      }
      if (payload.type !== 'access') {
        return reply.status(401).send({ error: 'Access token required (not refresh)' })
      }

      const { tenantId } = payload

      // Hijack raw socket — Fastify will not manage this response lifecycle
      reply.hijack()
      const raw = reply.raw
      raw.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache, no-transform',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',  // disable nginx proxy buffering
      })

      let seq = 0
      const write = (eventType: string, data: Record<string, unknown>) => {
        if (!raw.writableEnded) {
          raw.write(`id: ${seq++}\nevent: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
        }
      }

      // Confirm connection and expose transport mode (no secrets)
      write('connected', {
        tenantId,
        transport: isRealtimeRedisLive() ? 'redis' : 'memory',
      })

      // Subscribe: localBus receives events from Redis PMESSAGE or in-process publishEvent()
      const unsub = subscribeToTenant(tenantId, (event) => {
        write(event.type, { ...event.data, ts: event.ts })
      })

      // Keepalive comment every 30 s (prevents proxy / browser timeout)
      const heartbeat = setInterval(() => {
        if (raw.writableEnded) { clearInterval(heartbeat); return }
        raw.write(':heartbeat\n\n')
      }, 30_000)

      // Cleanup on client disconnect
      req.raw.on('close', () => {
        clearInterval(heartbeat)
        unsub()
        if (!raw.writableEnded) raw.end()
      })

      // Hold handler open until client disconnects
      await new Promise<void>((resolve) => {
        req.raw.on('close', resolve)
        req.raw.on('error', resolve)
      })
    },
  )
}
