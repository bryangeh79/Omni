// In-memory realtime event bus for tenant-scoped SSE (Phase 8A).
//
// LIMITATION: process-scoped only. Events are NOT shared across API instances.
// For multi-instance deployments, replace with Redis pub/sub (Phase 8B+).
//
// Events from the worker process (AI replies) are NOT published here because
// the worker runs in a separate Node.js process. Clients should reconnect on
// SSE close to re-fetch latest state, or use Redis pub/sub in a later phase.

import { EventEmitter } from 'events'

export interface RealtimeEvent {
  type: string
  data: Record<string, unknown>
  ts:   string
}

// One EventEmitter for the whole process; events keyed by `t:${tenantId}`.
const bus = new EventEmitter()
bus.setMaxListeners(500)  // allow many concurrent SSE connections

/**
 * Publish an event to all SSE clients subscribed to this tenant.
 * Never include raw secrets, tokens, or encrypted blobs in `data`.
 */
export function publishEvent(tenantId: string, type: string, data: Record<string, unknown>): void {
  const event: RealtimeEvent = { type, data, ts: new Date().toISOString() }
  bus.emit(`t:${tenantId}`, event)
}

/** Subscribe to all events for a tenant. Returns an unsubscribe function. */
export function subscribeToTenant(
  tenantId: string,
  handler: (e: RealtimeEvent) => void,
): () => void {
  bus.on(`t:${tenantId}`, handler)
  return () => bus.off(`t:${tenantId}`, handler)
}
