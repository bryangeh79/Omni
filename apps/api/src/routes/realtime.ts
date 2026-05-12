// Real-time SSE endpoint — Phase 8A
//
// GET /realtime/events?token=<jwt>
//
// Accepts the JWT access token via:
//   - ?token= query param  (required for browser EventSource which cannot set headers)
//   - Authorization: Bearer <token> header  (for non-browser clients / curl)
//
// Events are tenant-scoped via the JWT tenantId claim.
// The underlying bus is process-scoped (in-memory EventEmitter).
// Worker-process AI reply events are NOT delivered here — see docs/REALTIME_EVENTS.md.

import type { FastifyInstance } from 'fastify'
import { subscribeToTenant } from '../realtime-bus'
import type { JwtTokenPayload } from '../auth/types'

export async function realtimeRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { token?: string } }>(
    '/events',
    async (req, reply) => {
      // -- Auth: accept token from query param or Authorization header --
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

      // -- Hijack the raw socket; Fastify will not touch the response lifecycle --
      reply.hijack()
      const raw = reply.raw
      raw.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache, no-transform',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',  // nginx proxy: disable buffering
      })

      let seq = 0
      const write = (eventType: string, data: Record<string, unknown>) => {
        if (!raw.writableEnded) {
          raw.write(
            `id: ${seq++}\nevent: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`,
          )
        }
      }

      // Confirm connection
      write('connected', { tenantId })

      // Subscribe to in-process tenant events
      const unsub = subscribeToTenant(tenantId, (event) => {
        write(event.type, { ...event.data, ts: event.ts })
      })

      // Keepalive comment every 30 s (prevents proxy/browser timeouts)
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

      // Hold the handler open until the client disconnects
      await new Promise<void>((resolve) => {
        req.raw.on('close', resolve)
        req.raw.on('error', resolve)
      })
    },
  )
}
