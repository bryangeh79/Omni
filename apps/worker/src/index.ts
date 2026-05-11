// Omni Worker — long-running entry point.
// Phase 4B: BullMQ consumer for inbound message processing.

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { createInboundWorker } from './consumer'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:43114'

async function startWorker(): Promise<void> {
  console.log('[omni-worker] Starting...')
  console.log(`[omni-worker] Redis: ${REDIS_URL.replace(/:[^:@]+@/, ':***@')}`)

  const worker = createInboundWorker(REDIS_URL)
  await worker.waitUntilReady()

  console.log('[omni-worker] Ready — consuming from queue omni:inbound-messages')
  console.log('[omni-worker] Phase 4B: AI stub mode (no real LLM, no real WhatsApp send)')

  // Graceful shutdown on SIGTERM/SIGINT
  const shutdown = async (signal: string) => {
    console.log(`[omni-worker] Received ${signal}, shutting down gracefully...`)
    await worker.close()
    console.log('[omni-worker] Shutdown complete')
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

startWorker().catch((err) => {
  console.error('[omni-worker] Fatal error:', err)
  process.exit(1)
})

export { workerStub_processInbound } from './process-message'
