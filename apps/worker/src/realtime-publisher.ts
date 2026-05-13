// Worker realtime publisher — Phase 8B
//
// Publishes tenant-scoped events to Redis after AI DB writes so the
// API SSE clients receive live updates without polling.
//
// Design:
// - Singleton IORedis connection; created lazily on first use.
// - Non-throwing: a Redis failure must never interrupt a DB write.
// - Events follow the same wire format as the API realtime bus.
// - No secrets in payloads.

import IORedis from 'ioredis'
import { getTenantChannel } from '@omni/shared'
import type { RealtimeEvent } from '@omni/shared'

let _pub: IORedis | null = null
let _pubReady = false

function getPub(): IORedis {
  if (!_pub) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:43114'
    _pub = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck:     false,
      lazyConnect:          true,
      retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 500, 2000)),
    })
    _pub.on('ready', () => {
      _pubReady = true
      console.log('[worker/realtime] Redis publisher connected')
    })
    _pub.on('error', (err: Error) => {
      _pubReady = false
      console.warn(`[worker/realtime] Redis publisher error: ${err.message}`)
    })
    // Kick off connection in the background; first publish will wait until ready
    _pub.connect().catch((err: Error) => {
      console.warn(`[worker/realtime] Redis connect failed: ${err.message}`)
    })
  }
  return _pub
}

/**
 * Publish a realtime event from the worker process.
 * Safe to call without awaiting: DB writes must not be gated on this.
 * Logs a warning if Redis is unavailable; never throws.
 */
export async function workerPublishEvent(
  tenantId: string,
  type:     string,
  data:     Record<string, unknown>,
): Promise<void> {
  try {
    const event: RealtimeEvent = { type, data, ts: new Date().toISOString() }
    const channel = getTenantChannel(tenantId)
    const client  = getPub()
    await client.publish(channel, JSON.stringify(event))
  } catch (err) {
    // Non-fatal: DB write already succeeded; SSE clients will miss this event
    console.warn(
      `[worker/realtime] Event publish failed (Redis unavailable?): ${(err as Error).message}`,
    )
  }
}

/** Gracefully close the publisher connection on worker shutdown. */
export async function closeWorkerPublisher(): Promise<void> {
  _pubReady = false
  await _pub?.quit().catch(() => null)
  _pub = null
}

/** Exposed for testing: is the publisher Redis connection alive? */
export function isWorkerPublisherReady(): boolean {
  return _pubReady
}
