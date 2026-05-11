// Omni Worker — entry point skeleton
// Phase 2+: implement job consumers.

// Jobs to implement:
// - follow-up scheduler (send follow-up message after delay trigger)
// - lead score recalculation
// - handoff timeout alert (notify agent if handoff pending too long)
// - usage metering flush

export async function startWorker() {
  console.log('[omni-worker] Worker started (stub — Phase 2)')
  // Phase 2: connect to Redis queue, register job handlers
}

startWorker().catch(console.error)
