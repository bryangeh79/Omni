// Message Router — normalize inbound envelope → DB write → BullMQ enqueue.
// Enforces tenant isolation via scopeToTenant().

import { prisma, scopeToTenant, Direction, SenderType } from '@omni/db'
import type { InboundEnvelope } from '@omni/channel-adapters'

import { enqueueInboundMessage } from './queue'
import { publishEvent }         from './realtime-bus'
import { cancelFollowUpChain }  from './follow-up-engine'

export interface RouterResult {
  customerId:        string
  conversationId:    string
  messageId:         string
  isNewCustomer:     boolean
  isNewConversation: boolean
}

export async function routeInboundMessage(
  envelope: InboundEnvelope,
  tenantId: string,
): Promise<RouterResult> {
  const db = scopeToTenant(prisma, tenantId)

  // ── 1. Find or create Customer (by tenantId + phone) ─────────────────────
  let isNewCustomer = false
  let customer = await db.customers.byPhone(envelope.from)
  if (!customer) {
    customer = await db.customers.create({
      phone:         envelope.from,
      isBlacklisted: false,
    })
    isNewCustomer = true
  }

  // ── 2. Find or create open Conversation ──────────────────────────────────
  let isNewConversation = false
  const openConv = await prisma.conversation.findFirst({
    where: {
      tenantId,
      channelId:  envelope.channelId,
      customerId: customer.id,
      status: { in: ['AI_HANDLING', 'HUMAN_HANDLING', 'PENDING_HANDOFF'] },
    },
    orderBy: { lastMessageAt: 'desc' },
  })

  let conversation = openConv
  if (!conversation) {
    conversation = await db.conversations.create({
      channelId:  envelope.channelId,
      customerId: customer.id,
      status:     'AI_HANDLING',
    })
    isNewConversation = true
  }

  // ── 3. Write inbound Message to DB ────────────────────────────────────────
  const message = await db.messages.create({
    conversationId:   conversation.id,
    direction:        Direction.INBOUND,
    senderType:       SenderType.CUSTOMER,
    content:          envelope.body,
    channelMessageId: envelope.externalId,
    detectedLanguage: null,
  })

  // ── 4. Update conversation.lastMessageAt ──────────────────────────────────
  await prisma.conversation.update({
    where: { id: conversation.id },
    data:  { lastMessageAt: new Date() },
  })

  // ── 5. Cancel pending follow-up chain — customer replied ─────────────────────
  // Non-fatal: do not block the message write pipeline on follow-up cancel.
  cancelFollowUpChain(conversation.id, tenantId, 'CUSTOMER_REPLIED').catch((err) => {
    console.warn('[message-router] Follow-up cancel failed (non-fatal):', (err as Error).message)
  })

  // ── 6. Publish real-time events (API-process SSE subscribers) ───────────────
  // Worker-process AI reply events cannot be published here (separate process).
  // Clients should reconnect / refetch on SSE close until Phase 8B Redis pub/sub.
  publishEvent(tenantId, 'conversation.message.created', {
    conversationId: conversation.id,
    messageId:      message.id,
    direction:      'INBOUND',
    senderType:     'CUSTOMER',
  })
  publishEvent(tenantId, 'conversation.updated', {
    conversationId: conversation.id,
    lastMessageAt:  new Date().toISOString(),
  })

  // ── 6. Enqueue for async worker processing (BullMQ) ───────────────────────
  // Non-fatal if Redis is unavailable — DB write already succeeded.
  await enqueueInboundMessage({
    tenantId,
    channelId:      envelope.channelId,
    conversationId: conversation.id,
    customerId:     customer.id,
    messageId:      message.id,
    createdAt:      new Date().toISOString(),
  })

  return {
    customerId:        customer.id,
    conversationId:    conversation.id,
    messageId:         message.id,
    isNewCustomer,
    isNewConversation,
  }
}
