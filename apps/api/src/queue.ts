// BullMQ Queue — API side (enqueue only).
// Worker side is in apps/worker/src/consumer.ts.
// Redis connection uses REDIS_URL from env (default: redis://localhost:43114).

import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { QUEUE_NAMES, JOB_NAMES } from '@omni/shared'
import type { InboundMessageJobData } from '@omni/shared'

let _redisConn: IORedis | null = null
let _inboundQueue: Queue<InboundMessageJobData> | null = null

function getRedisConn(): IORedis {
  if (!_redisConn) {
    _redisConn = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:43114', {
      maxRetriesPerRequest: null, // required by BullMQ blocking commands
      enableReadyCheck:     false,
    })
    _redisConn.on('error', (err) => {
      // Log but don't crash — API should remain up if Redis is temporarily unavailable
      console.error('[queue] Redis connection error:', err.message)
    })
  }
  return _redisConn
}

function getInboundQueue(): Queue<InboundMessageJobData> {
  if (!_inboundQueue) {
    _inboundQueue = new Queue<InboundMessageJobData>(
      QUEUE_NAMES.INBOUND_MESSAGES,
      { connection: getRedisConn() },
    )
  }
  return _inboundQueue
}

/**
 * Enqueue an inbound message for async worker processing.
 * Non-throwing: if Redis is unavailable, logs the error and returns gracefully.
 * The DB write in message-router.ts has already succeeded at this point.
 */
export async function enqueueInboundMessage(data: InboundMessageJobData): Promise<void> {
  try {
    const q = getInboundQueue()
    await q.add(JOB_NAMES.PROCESS_INBOUND_MESSAGE, data, {
      attempts: 3,
      backoff:  { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail:     { count: 100 },
    })
    console.log(`[queue] Enqueued ${JOB_NAMES.PROCESS_INBOUND_MESSAGE} for conv=${data.conversationId}`)
  } catch (err) {
    // Non-fatal: DB write is already done; worker will miss this job but system keeps running
    console.error('[queue] Failed to enqueue inbound message job (Redis unavailable?):', (err as Error).message)
  }
}
