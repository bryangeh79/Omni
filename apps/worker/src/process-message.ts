// Worker message processor — Phase 2B stub.
// Phase 3: replace with real AI Agent Orchestrator call.

import { prisma, Direction, SenderType } from '@omni/db'

export interface InboundJobPayload {
  messageId:      string
  conversationId: string
  tenantId:       string
  customerId:     string
  body:           string
}

export async function workerStub_processInbound(
  payload: InboundJobPayload,
): Promise<void> {
  console.log(
    `[worker] processing inbound — ` +
    `tenant=${payload.tenantId} ` +
    `conv=${payload.conversationId} ` +
    `msg=${payload.messageId}`,
  )

  // Phase 3: call AiAgentOrchestrator.process() here

  // Stub AI reply (only if OMNI_WORKER_CREATE_STUB_REPLY=true)
  if (process.env.OMNI_WORKER_CREATE_STUB_REPLY === 'true') {
    await prisma.message.create({
      data: {
        conversationId: payload.conversationId,
        direction:      Direction.OUTBOUND,
        senderType:     SenderType.AI,
        content:        '[STUB AI REPLY] Phase 3 not yet implemented.',
        isRead:         false,
      },
    })
    console.log(`[worker] stub AI reply written for conv=${payload.conversationId}`)
  }
}
