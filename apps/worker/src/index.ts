// Omni Worker — entry point
// Phase 2B: process-message stub wired in.
// Phase 3+: implement Redis queue consumers.

import { workerStub_processInbound } from './process-message'

export async function startWorker() {
  console.log('[omni-worker] Worker started')
  console.log('[omni-worker] Phase 2B stub — real queue consumers in Phase 3')
  // Expose stub for direct call by API (no Redis queue yet)
  // Phase 3: connect to Redis, register BullMQ consumers
}

export { workerStub_processInbound }

startWorker().catch(console.error)
