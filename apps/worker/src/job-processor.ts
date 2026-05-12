// Core inbound message job processor — Phase 5C.
// Decrypts tenant API key when available; calls real OpenAI if configured.
// Safety: no WhatsApp send, no raw key logging, tenant-scoped DB access.

import { prisma, Direction, SenderType } from '@omni/db'
import type { InboundMessageJobData } from '@omni/shared'
import { decryptApiKey, isVaultConfigured } from '@omni/shared'
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
    console.log(`[worker] Job ${jobId}: CLOSED, no AI reply`)
    return
  }
  if (conversation.status === 'HUMAN_HANDLING') {
    console.log(`[worker] Job ${jobId}: HUMAN_HANDLING, AI skipped`)
    return
  }

  // ── Load message body from DB ─────────────────────────────────────────────
  let messageBody = ''
  try {
    const msg = await prisma.message.findUnique({ where: { id: messageId } })
    messageBody = msg?.content ?? ''
  } catch { messageBody = '' }

  // ── Build agent context ───────────────────────────────────────────────────
  const agentInput = await buildJobContext({
    tenantId, conversationId, customerId, messageId, messageBody,
  })

  // ── Resolve API key (decrypt only if needed) ──────────────────────────────
  // Key is decrypted here, used ONLY for the provider call, never logged or returned.
  let apiKey: string | undefined

  const aiCfg = agentInput.aiConfig
  const isRealProvider = ['OPENAI', 'GEMINI', 'DEEPSEEK'].includes(aiCfg.aiProvider)

  if (isRealProvider && aiCfg.aiProvider === 'OPENAI') {
    const dbConfig = await prisma.aiConfig.findUnique({ where: { tenantId } })
    if (dbConfig?.useTenantApiKey && dbConfig.apiKeyRef && isVaultConfigured()) {
      try {
        apiKey = decryptApiKey(dbConfig.apiKeyRef)
        // Key exists — will be passed to orchestrator, not logged
      } catch {
        console.error(`[worker] Job ${jobId}: key decryption failed — using fallback`)
      }
    }
  }

  // ── Call AI orchestrator ──────────────────────────────────────────────────
  const result = await aiOrchestrator.process(agentInput, {
    hasKey: !!apiKey,
    apiKey,  // undefined for dry-run; decrypted string for real call (not logged)
  })

  console.log(
    `[worker] Job ${jobId}: provider=${result.provider} shouldHandoff=${result.shouldHandoff} ` +
    `scoreAdj=${result.scoreAdjustment} tokens=${result.inputTokensEstimate}+${result.outputTokensEstimate}`,
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

  // ── Update conversation ───────────────────────────────────────────────────
  await prisma.conversation.update({
    where: { id: conversationId },
    data:  {
      lastMessageAt: new Date(),
      ...(result.shouldHandoff && conversation.status === 'AI_HANDLING'
        ? { status: 'PENDING_HANDOFF' } : {}),
    },
  })

  // ── Update customer score ─────────────────────────────────────────────────
  if (result.scoreAdjustment !== 0) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } })
    if (customer) {
      await prisma.customer.update({
        where: { id: customerId },
        data:  { score: Math.min(100, Math.max(0, customer.score + result.scoreAdjustment)) },
      })
    }
  }

  // ── Write usage record ────────────────────────────────────────────────────
  // Cost = 0 for now; real pricing TODO Phase 6
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  await prisma.usageRecord.upsert({
    where:  { tenantId_date: { tenantId, date: today } },
    create: {
      tenantId,
      date:         today,
      llmTokens:    result.inputTokensEstimate + result.outputTokensEstimate,
      llmCostUsd:   0,
      messages:     1,
    },
    update: {
      llmTokens: { increment: result.inputTokensEstimate + result.outputTokensEstimate },
      messages:  { increment: 1 },
    },
  })

  console.log(`[worker] Job ${jobId}: reply written for conv=${conversationId}`)
  // NOTE: sendMessage() is NOT called — no real WhatsApp delivery.
}
