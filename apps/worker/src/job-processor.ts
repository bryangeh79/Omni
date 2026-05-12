// Core inbound message job processor — Phase 5A.
// Uses AiAgentOrchestrator (dry-run mode) instead of hardcoded stub.
// Safety: tenant-scoped DB access, no real WhatsApp send, no real LLM call.

import { prisma, Direction, SenderType } from '@omni/db'
import type { InboundMessageJobData } from '@omni/shared'
import { aiOrchestrator } from '@omni/ai-core'
import { buildJobContext } from './context-builder'

export async function processInboundMessageJob(
  data: InboundMessageJobData,
  jobId: string,
): Promise<void> {
  const { tenantId, conversationId, customerId, messageId } = data

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

  if (conversation.status === 'CLOSED') {
    console.log(`[worker] Job ${jobId}: conversation CLOSED, no AI reply`)
    return
  }
  if (conversation.status === 'HUMAN_HANDLING') {
    console.log(`[worker] Job ${jobId}: HUMAN_HANDLING, AI skipped`)
    return
  }

  // ── Build agent context from DB ───────────────────────────────────────────
  // messageBody may not be in the job payload for older jobs; load from DB
  let messageBody = ''
  try {
    const msg = await prisma.message.findUnique({ where: { id: messageId } })
    messageBody = msg?.content ?? ''
  } catch {
    messageBody = ''
  }

  const agentInput = await buildJobContext({
    tenantId, conversationId, customerId, messageId, messageBody,
  })

  // ── Call AiAgentOrchestrator (dry-run in Phase 5A) ────────────────────────
  const result = await aiOrchestrator.process(agentInput)

  console.log(
    `[worker] Job ${jobId}: shouldHandoff=${result.shouldHandoff} ` +
    `scoreAdj=${result.scoreAdjustment} lang=${result.detectedLanguage}`,
  )

  // ── Write AI reply to DB ──────────────────────────────────────────────────
  await prisma.message.create({
    data: {
      conversationId,
      direction:  Direction.OUTBOUND,
      senderType: SenderType.AI,
      content:    result.reply,
      isRead:     false,
    },
  })

  // ── Update conversation status / lastMessageAt ────────────────────────────
  await prisma.conversation.update({
    where: { id: conversationId },
    data:  {
      lastMessageAt: new Date(),
      // Auto-escalate if AI says handoff needed
      ...(result.shouldHandoff && conversation.status === 'AI_HANDLING'
        ? { status: 'PENDING_HANDOFF' }
        : {}),
    },
  })

  // ── Update customer score if adjusted ────────────────────────────────────
  if (result.scoreAdjustment !== 0) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    })
    if (customer) {
      const newScore = Math.min(100, Math.max(0, customer.score + result.scoreAdjustment))
      await prisma.customer.update({
        where: { id: customerId },
        data:  { score: newScore },
      })
    }
  }

  // ── Write usage/cost placeholder ──────────────────────────────────────────
  // UsageRecord uses date-based unique key; safe to upsert
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  await prisma.usageRecord.upsert({
    where:  { tenantId_date: { tenantId, date: today } },
    create: {
      tenantId,
      date:         today,
      llmTokens:    result.inputTokensEstimate + result.outputTokensEstimate,
      llmCostUsd:   0,  // DRY_RUN has no real cost
      messages:     1,
    },
    update: {
      llmTokens: { increment: result.inputTokensEstimate + result.outputTokensEstimate },
      messages:  { increment: 1 },
    },
  })

  console.log(`[worker] Job ${jobId}: AI dry-run reply written for conv=${conversationId}`)
  // NOTE: sendMessage() NOT called — no real WhatsApp delivery in Phase 5A.
}
