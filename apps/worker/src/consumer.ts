// BullMQ Worker consumer — long-running mode.
// Import and start via apps/worker/src/index.ts.

import IORedis from 'ioredis'
import { Worker } from 'bullmq'
import { QUEUE_NAMES } from '@omni/shared'
import type { InboundMessageJobData } from '@omni/shared'
import { processInboundMessageJob } from './job-processor'

export function createInboundWorker(redisUrl: string): Worker<InboundMessageJobData> {
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck:     false,
  })

  connection.on('error', (err) =>
    console.error('[worker:redis] Connection error:', err.message),
  )

  const worker = new Worker<InboundMessageJobData>(
    QUEUE_NAMES.INBOUND_MESSAGES,
    async (job) => processInboundMessageJob(job.data, job.id ?? 'unknown'),
    { connection, concurrency: 2 },
  )

  worker.on('completed', (job) =>
    console.log(`[worker] Job ${job.id} completed`),
  )
  worker.on('failed', (job, err) =>
    console.error(`[worker] Job ${job?.id} failed:`, err.message),
  )
  worker.on('error', (err) =>
    console.error('[worker] Worker error:', err.message),
  )

  return worker
}
