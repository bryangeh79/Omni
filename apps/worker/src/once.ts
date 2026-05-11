// Worker drain mode — process all currently pending jobs and exit cleanly.
// Used for smoke testing and manual one-off processing.
// Does NOT wait for new jobs.

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import IORedis from 'ioredis'
import { Queue, Worker } from 'bullmq'
import { QUEUE_NAMES } from '@omni/shared'
import type { InboundMessageJobData } from '@omni/shared'
import { processInboundMessageJob } from './job-processor'

const REDIS_URL  = process.env.REDIS_URL ?? 'redis://localhost:43114'
const TIMEOUT_MS = 30_000

async function main(): Promise<void> {
  // BullMQ requires separate connections for Queue and Worker
  const queueConn  = new IORedis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false })
  const workerConn = new IORedis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false })

  const queue = new Queue<InboundMessageJobData>(QUEUE_NAMES.INBOUND_MESSAGES, { connection: queueConn })

  const counts = await queue.getJobCounts('waiting', 'active', 'delayed')
  const pending = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0)

  console.log(`[worker:once] Pending jobs — waiting:${counts.waiting} active:${counts.active} delayed:${counts.delayed}`)

  if (pending === 0) {
    console.log('[worker:once] No pending jobs. Exiting.')
    await queue.close()
    await queueConn.quit()
    await workerConn.quit()
    return
  }

  let processed = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const cleanup = async (exitCode: number) => {
    if (timer) clearTimeout(timer)
    await worker.close()
    await queue.close()
    await queueConn.quit()
    await workerConn.quit()
    console.log(`[worker:once] Finished. Processed ${processed} job(s). Exit ${exitCode}.`)
    process.exit(exitCode)
  }

  const checkDone = async () => {
    const current = await queue.getJobCounts('waiting', 'active', 'delayed')
    const remaining = (current.waiting ?? 0) + (current.active ?? 0) + (current.delayed ?? 0)
    if (remaining === 0) await cleanup(0)
  }

  const worker = new Worker<InboundMessageJobData>(
    QUEUE_NAMES.INBOUND_MESSAGES,
    async (job) => {
      await processInboundMessageJob(job.data, job.id ?? 'unknown')
      processed++
    },
    { connection: workerConn, concurrency: 1 },
  )

  worker.on('completed', checkDone)
  worker.on('failed',    checkDone)
  worker.on('error',     (err) => console.error('[worker:once] error:', err.message))

  // Safety timeout — exit after TIMEOUT_MS even if stuck
  timer = setTimeout(async () => {
    console.error('[worker:once] Timeout reached — forcing exit')
    await cleanup(1)
  }, TIMEOUT_MS)
}

main().catch(async (err) => {
  console.error('[worker:once] Fatal:', err)
  process.exit(1)
})
