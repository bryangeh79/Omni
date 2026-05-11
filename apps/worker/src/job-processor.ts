// Core inbound message job processor.
// Called by both the BullMQ consumer (long-running) and once.ts (drain mode).
// Safety: tenant-scoped DB access, no real WhatsApp send, no real LLM call.

import { prisma, Direction, SenderType } from '@omni/db'
import type { InboundMessageJobData } from '@omni/shared'

// AI stub reply content — clearly marked as placeholder, not a real AI reply.
// Phase 5: replace with AiAgentOrchestrator.process()
export const AI_STUB_CONTENT =
  '[AI_STUB] Reply generation pending. This message was written by the worker stub (Phase 4B). Real AI response: Phase 5.'

export async function processInboundMessageJob(
  data: InboundMessageJobData,
  jobId: string,
): Promise<void> {
  const { tenantId, conversationId, messageId } = data

  console.log(
    `[worker] Processing job=${jobId} conv=${conversationId} msg=${messageId} tenant=${tenantId}`,
  )

  // ── Safety: verify conversation belongs to this tenant ────────────────────
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
  })

  if (!conversation) {
    console.warn(`[worker] Job ${jobId}: conversation not found for tenant=${tenantId}, skipping`)
    return
  }

  // ── Skip if conversation is CLOSED or under HUMAN_HANDLING ───────────────
  if (conversation.status === 'CLOSED') {
    console.log(`[worker] Job ${jobId}: conversation CLOSED, no AI reply needed`)
    return
  }
  if (conversation.status === 'HUMAN_HANDLING') {
    console.log(`[worker] Job ${jobId}: conversation under HUMAN_HANDLING, AI skipped`)
    return
  }

  // ── Phase 4B stub: write AI reply placeholder to DB ───────────────────────
  // Phase 5+: call AiAgentOrchestrator.process() here, then write real reply.
  await prisma.message.create({
    data: {
      conversationId,
      direction:  Direction.OUTBOUND,
      senderType: SenderType.AI,
      content:    AI_STUB_CONTENT,
      isRead:     false,
    },
  })

  // ── Update conversation lastMessageAt ─────────────────────────────────────
  await prisma.conversation.update({
    where: { id: conversationId },
    data:  { lastMessageAt: new Date() },
  })

  console.log(`[worker] Job ${jobId}: AI stub reply written for conv=${conversationId}`)
  // NOTE: sendMessage() is NOT called — no real WhatsApp delivery in Phase 4B.
}
