// Realtime event bus — Phase 8B: Redis pub/sub with in-memory fallback.
//
// Architecture:
//   Publisher (pub): dedicated IORedis connection — PUBLISH commands
//   Subscriber (sub): dedicated IORedis connection — PSUBSCRIBE mode
//   localBus:        in-process EventEmitter — Redis PMESSAGE → localBus → SSE handler
//
// Cross-process flow (normal, Redis available):
//   API publishEvent()  → Redis PUBLISH → Redis → API sub PMESSAGE → localBus → SSE
//   Worker publish      → Redis PUBLISH → Redis → API sub PMESSAGE → localBus → SSE
//
// Fallback (Redis unavailable):
//   API publishEvent()  → localBus (API process only, no cross-process delivery)
//   Worker events will NOT reach API SSE — acceptable degraded mode, documented.
//
// No secrets, tokens, or encrypted blobs may appear in event payloads.

import { EventEmitter } from 'events'
import IORedis            from 'ioredis'
import {
  REALTIME_CHANNEL_PREFIX,
  REALTIME_CHANNEL_PATTERN,
  tenantFromChannel,
} from '@omni/shared'
import type { RealtimeEvent } from '@omni/shared'

// Re-export for callers that previously imported from here
export type { RealtimeEvent }

// In-process dispatch: Redis PMESSAGE events are routed here → SSE handlers
const localBus = new EventEmitter()
localBus.setMaxListeners(500)

let _pub: IORedis | null = null
let _sub: IORedis | null = null
let _live = false   // true iff both connections are up and subscribed

/** Returns true if Redis pub/sub is operational. */
export function isRealtimeRedisLive(): boolean { return _live }

// ── Init / Close ──────────────────────────────────────────────────────────────

/**
 * Connect to Redis for pub/sub.  Call once from app startup.
 * Safe to call when Redis is unavailable — falls back to in-memory only.
 */
export async function initRealtimeBus(): Promise<void> {
  const url  = process.env.REDIS_URL ?? 'redis://localhost:43114'
  const base = {
    maxRetriesPerRequest: null as null,
    enableReadyCheck:     false,
    lazyConnect:          true,
    // Phase 10B: retry more aggressively for runtime reconnects.
    // Startup uses a 4 s race() below; this strategy handles post-connect drops.
    retryStrategy: (times: number) => {
      if (times > 30) return null  // stop retrying after ~2.5 min
      return Math.min(times * 500, 5_000)
    },
  }

  try {
    _pub = new IORedis(url, base)
    _sub = new IORedis(url, base)

    _pub.on('error', (err: Error) => {
      if (_live) console.warn(`[realtime-bus] Redis pub error: ${err.message}`)
      _live = false
    })
    _sub.on('error', (err: Error) => {
      if (_live) console.warn(`[realtime-bus] Redis sub error: ${err.message}`)
      _live = false
    })

    // Phase 10B: on pub ready (reconnect), update _live flag
    _pub.on('ready', () => {
      if (!_live) {
        console.log('[realtime-bus] Redis pub reconnected')
        // Re-enable _live only when both pub+sub are ready
        if (_sub?.status === 'ready') _live = true
      }
    })

    // Phase 10B: on sub ready (reconnect), re-psubscribe and restore _live
    _sub.on('ready', async () => {
      if (!_live) {
        console.log('[realtime-bus] Redis sub reconnected — re-subscribing to pattern')
        try {
          await _sub!.psubscribe(REALTIME_CHANNEL_PATTERN)
          if (_pub?.status === 'ready') {
            _live = true
            console.log('[realtime-bus] Pattern re-subscribed — realtime restored')
          }
        } catch (err) {
          console.warn(`[realtime-bus] Pattern re-subscribe failed: ${(err as Error).message}`)
        }
      }
    })

    // Connect with a 4 s timeout so startup doesn't hang if Redis is absent
    await Promise.race([
      Promise.all([_pub.connect(), _sub.connect()]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis connect timeout (4s)')), 4_000),
      ),
    ])

    // Route Redis PMESSAGE to localBus keyed by tenantId
    _sub.on('pmessage', (_pattern: string, channel: string, message: string) => {
      try {
        const tenantId = tenantFromChannel(channel)
        if (!tenantId) return
        const event = JSON.parse(message) as RealtimeEvent
        localBus.emit(`t:${tenantId}`, event)
      } catch { /* ignore malformed messages */ }
    })

    await _sub.psubscribe(REALTIME_CHANNEL_PATTERN)
    _live = true
    console.log(`[realtime-bus] Redis pub/sub ready (${url.replace(/:[^:@]+@/, ':***@')})`)
    console.log(`[realtime-bus] Subscribed to pattern: ${REALTIME_CHANNEL_PATTERN}`)
  } catch (err) {
    _live = false
    console.warn(
      `[realtime-bus] Redis unavailable — using in-memory fallback: ${(err as Error).message}`,
    )
    _pub?.disconnect()
    _sub?.disconnect()
    _pub = null
    _sub = null
  }
}

/** Gracefully close Redis connections. Call from Fastify onClose hook. */
export async function closeRealtimeBus(): Promise<void> {
  _live = false
  await Promise.allSettled([_pub?.quit(), _sub?.quit()])
  _pub = null
  _sub = null
}

// ── Publish ───────────────────────────────────────────────────────────────────

/**
 * Publish a realtime event.
 * - If Redis is live: PUBLISH to Redis channel → distributed to all API instances + worker.
 * - If Redis is down: emit locally (in-process SSE clients only).
 *
 * Never include secrets, tokens, or encrypted blobs in `data`.
 */
export function publishEvent(
  tenantId: string,
  type:     string,
  data:     Record<string, unknown>,
): void {
  const event: RealtimeEvent = { type, data, ts: new Date().toISOString() }

  if (_live && _pub) {
    const channel = `${REALTIME_CHANNEL_PREFIX}${tenantId}`
    _pub.publish(channel, JSON.stringify(event)).catch((err: Error) => {
      // Redis publish failed mid-flight; fall back to local delivery
      console.warn(`[realtime-bus] Redis publish failed, local fallback: ${err.message}`)
      localBus.emit(`t:${tenantId}`, event)
    })
    // Do NOT also emit locally: Redis PMESSAGE via sub connection will deliver to localBus.
    // Double-emit would cause duplicate SSE frames for same-instance clients.
  } else {
    // In-memory fallback: works for in-process clients; worker events not delivered.
    localBus.emit(`t:${tenantId}`, event)
  }
}

// ── Subscribe ─────────────────────────────────────────────────────────────────

/**
 * Register an SSE handler for a tenant.  Returns an unsubscribe function.
 * Works regardless of Redis state — delivery path is always via localBus.
 */
export function subscribeToTenant(
  tenantId: string,
  handler:  (e: RealtimeEvent) => void,
): () => void {
  localBus.on(`t:${tenantId}`, handler)
  return () => localBus.off(`t:${tenantId}`, handler)
}
