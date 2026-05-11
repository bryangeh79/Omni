// Worker stub — called by message-router during Phase 2B.
// Phase 3+: replace with real Redis queue enqueue.

export interface InboundJobPayload {
  messageId:      string
  conversationId: string
  tenantId:       string
  customerId:     string
  body:           string
}

export async function workerStub_processInbound(payload: InboundJobPayload): Promise<void> {
  // Phase 2B stub: log the job. No real queue, no real AI call.
  console.log(
    `[worker-stub] inbound message queued — ` +
    `tenant=${payload.tenantId} ` +
    `conv=${payload.conversationId} ` +
    `msg=${payload.messageId}`,
  )
  // Phase 3: enqueue to Redis (BullMQ/ioredis) for AI Agent processing
}
