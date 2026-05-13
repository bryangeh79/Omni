// Shared realtime event contract — used by API and Worker.
// No runtime dependencies; pure types and constants.

/** Redis channel prefix for tenant-scoped pub/sub. */
export const REALTIME_CHANNEL_PREFIX = 'omni:realtime:tenant:'

/** Pattern string for Redis PSUBSCRIBE (matches all tenant channels). */
export const REALTIME_CHANNEL_PATTERN = `${REALTIME_CHANNEL_PREFIX}*`

/** Derive the Redis channel name for a tenant. */
export function getTenantChannel(tenantId: string): string {
  return `${REALTIME_CHANNEL_PREFIX}${tenantId}`
}

/** Extract tenantId from a tenant channel name. Returns '' if malformed. */
export function tenantFromChannel(channel: string): string {
  if (!channel.startsWith(REALTIME_CHANNEL_PREFIX)) return ''
  return channel.slice(REALTIME_CHANNEL_PREFIX.length)
}

/** Canonical realtime event type strings. */
export const REALTIME_EVENT_TYPES = {
  MESSAGE_CREATED:      'conversation.message.created',
  CONVERSATION_UPDATED: 'conversation.updated',
  HANDOFF_UPDATED:      'conversation.handoff.updated',
  CUSTOMER_UPDATED:     'customer.updated',
  AI_REPLY_CREATED:     'ai.reply.created',
  WORKER_JOB_FAILED:    'worker.job.failed',
  FOLLOWUP_CREATED:     'followup.created',
  FOLLOWUP_UPDATED:     'followup.updated',
  FOLLOWUP_DUE:         'followup.due',
} as const

export type RealtimeEventType = typeof REALTIME_EVENT_TYPES[keyof typeof REALTIME_EVENT_TYPES]

/**
 * Wire format for realtime events published via Redis or in-memory.
 * MUST NOT contain secrets, tokens, encrypted blobs, or raw credentials.
 */
export interface RealtimeEvent {
  type: string                    // one of REALTIME_EVENT_TYPES values
  data: Record<string, unknown>   // safe payload — no secrets
  ts:   string                    // ISO-8601 timestamp
}
