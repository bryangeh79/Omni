// Follow-up Task Processor — Phase 9B
//
// Polls for due FollowUpTask records every 2 minutes and processes them.
//
// Safety rules:
// - No real WhatsApp sends: outbound messages are STUB_NOT_SENT.
// - requiresHuman=true → creates a SYSTEM reminder message; does NOT send to customer.
// - requiresHuman=false → creates stub OUTBOUND message; sendStatus field is STUB_NOT_SENT.
// - Conversation must be open and not CLOSED before processing.
// - Does NOT process tasks for conversations already in HUMAN_HANDLING (for non-human steps).
// - After processing step N, schedules step N+1 if it exists.
// - Safe failure: DB writes succeed; realtime event is best-effort.

import { prisma, Direction, SenderType, FollowUpStatus } from '@omni/db'
import { workerPublishEvent }      from './realtime-publisher'
import { REALTIME_EVENT_TYPES }    from '@omni/shared'

const POLL_INTERVAL_MS = 2 * 60 * 1000  // 2 minutes

// Import SCENARIO_STEPS from a compatible location.
// The worker has @omni/shared but NOT @omni/api — copy step definitions here.
const SCENARIO_STEPS: Record<string, { delayHours: number; requiresHuman: boolean; messageTemplate: string }[]> = {
  PRICE_ASKED_NO_REPLY: [
    { delayHours: 2,   requiresHuman: false, messageTemplate: 'Hi! Just checking if you have any questions about the pricing we discussed? Happy to help.' },
    { delayHours: 24,  requiresHuman: false, messageTemplate: 'Hello! Following up on your price inquiry. Let us know if you have questions.' },
    { delayHours: 72,  requiresHuman: false, messageTemplate: 'Last follow-up — please reach out anytime if you would like to proceed or have any questions.' },
  ],
  CONSIDERING: [
    { delayHours: 24,  requiresHuman: false, messageTemplate: 'Hi! Still considering? Happy to answer any questions or offer more details.' },
    { delayHours: 72,  requiresHuman: false, messageTemplate: 'Hello! Just checking in. Is there anything we can help clarify for your decision?' },
    { delayHours: 168, requiresHuman: false, messageTemplate: 'Final follow-up — offer still stands. Reach out anytime.' },
  ],
  BOOKING_NOT_CONFIRMED: [
    { delayHours: 2,   requiresHuman: false, messageTemplate: "Hi! We noticed your appointment hasn't been confirmed yet. Would you like to confirm or reschedule?" },
    { delayHours: 24,  requiresHuman: false, messageTemplate: 'Friendly reminder — your appointment is coming up. Please confirm or let us know if you need to change it.' },
  ],
  HIGH_INTENT_UNHANDLED: [
    { delayHours: 0.5, requiresHuman: true,  messageTemplate: '[HUMAN REMINDER] High-intent customer waiting — please follow up within 30 min.' },
    { delayHours: 2,   requiresHuman: true,  messageTemplate: '[BOSS ALERT] High-intent customer unhandled for 2h — immediate attention required.' },
  ],
  LONG_NO_REPLY: [
    { delayHours: 24,  requiresHuman: false, messageTemplate: 'Hi! Just checking if you need anything. We are here to help.' },
    { delayHours: 72,  requiresHuman: false, messageTemplate: "Hello! We haven't heard from you in a while. Let us know if there is anything we can assist with." },
    { delayHours: 168, requiresHuman: false, messageTemplate: "Final message — feel free to reach out anytime when you're ready." },
  ],
}

const BLOCKED_TAGS = new Set(['complaint', 'refund', 'unhappy', 'blacklist', 'stop_contact'])

async function isCustomerBlocked(customerId: string): Promise<boolean> {
  const tags = await prisma.customerTag.findMany({
    where:  { customerId },
    select: { tag: true },
  })
  return tags.some((t) => BLOCKED_TAGS.has(t.tag.toLowerCase()))
}

async function processDueTasks(): Promise<void> {
  const now = new Date()
  const dueTasks = await prisma.followUpTask.findMany({
    where:   { status: FollowUpStatus.PENDING, dueAt: { lte: now } },
    include: { conversation: { select: { status: true, tenantId: true } } },
    take:    50,  // process max 50 per cycle to avoid timeout
    orderBy: { dueAt: 'asc' },
  })

  if (dueTasks.length === 0) return
  console.log(`[follow-up-processor] Processing ${dueTasks.length} due tasks`)

  for (const task of dueTasks) {
    try {
      await processTask(task)
    } catch (err) {
      console.error(`[follow-up-processor] Task ${task.id} failed:`, (err as Error).message)
    }
  }
}

async function processTask(task: {
  id:              string
  tenantId:        string
  conversationId:  string
  customerId:      string
  scenario:        string
  stepIndex:       number
  requiresHuman:   boolean
  suggestedMessage: string | null
  conversation:    { status: string; tenantId: string }
}): Promise<void> {
  const { tenantId, conversationId, customerId, scenario, stepIndex, requiresHuman } = task

  // Safety: skip CLOSED conversations
  if (task.conversation.status === 'CLOSED') {
    await prisma.followUpTask.update({
      where: { id: task.id },
      data:  { status: FollowUpStatus.SKIPPED, cancelledReason: 'CONVERSATION_CLOSED', cancelledAt: new Date() },
    })
    return
  }

  // Safety: skip auto-send for HUMAN_HANDLING (unless requiresHuman task)
  if (!requiresHuman && task.conversation.status === 'HUMAN_HANDLING') {
    await prisma.followUpTask.update({
      where: { id: task.id },
      data:  { status: FollowUpStatus.SKIPPED, cancelledReason: 'HUMAN_HANDLING', cancelledAt: new Date() },
    })
    return
  }

  // Safety: skip auto-send for blocked customers
  if (!requiresHuman && await isCustomerBlocked(customerId)) {
    await prisma.followUpTask.update({
      where: { id: task.id },
      data:  { status: FollowUpStatus.CANCELLED, cancelledReason: 'CUSTOMER_BLOCKED', cancelledAt: new Date() },
    })
    console.log(`[follow-up-processor] Task ${task.id} skipped — customer has blocked tags`)
    return
  }

  const messageContent = task.suggestedMessage ?? '[Follow-up]'

  if (requiresHuman) {
    // Human reminder: create SYSTEM message visible to operators — NOT sent to customer
    await prisma.message.create({
      data: {
        conversationId,
        direction:  Direction.OUTBOUND,
        senderType: SenderType.SYSTEM,
        content:    `[FOLLOW-UP REMINDER] ${messageContent}`,
        isRead:     false,
      },
    })
  } else {
    // Customer-facing follow-up: create stub OUTBOUND message — NOT delivered (no real send)
    await prisma.message.create({
      data: {
        conversationId,
        direction:  Direction.OUTBOUND,
        senderType: SenderType.SYSTEM,
        content:    `[FOLLOW-UP STUB — NOT SENT] ${messageContent}`,
        isRead:     false,
      },
    })
  }

  // Mark task as DONE
  await prisma.followUpTask.update({
    where: { id: task.id },
    data:  { status: FollowUpStatus.DONE, completedAt: new Date() },
  })

  // Publish realtime event
  await workerPublishEvent(tenantId, REALTIME_EVENT_TYPES.FOLLOWUP_DUE, {
    taskId:         task.id,
    conversationId,
    scenario,
    stepIndex,
    requiresHuman,
  })

  await workerPublishEvent(tenantId, REALTIME_EVENT_TYPES.CONVERSATION_UPDATED, {
    conversationId,
    lastMessageAt: new Date().toISOString(),
  })

  // Schedule next step if available
  const steps = SCENARIO_STEPS[scenario]
  const nextStep = steps?.[stepIndex + 1]
  if (nextStep) {
    const nextDue = new Date(Date.now() + nextStep.delayHours * 60 * 60 * 1000)
    // Idempotent: skip if already exists
    const existingNext = await prisma.followUpTask.findFirst({
      where: { conversationId, scenario, stepIndex: stepIndex + 1, status: FollowUpStatus.PENDING },
    })
    if (!existingNext) {
      const nextTask = await prisma.followUpTask.create({
        data: {
          tenantId,
          conversationId,
          customerId,
          scenario,
          stepIndex:       stepIndex + 1,
          dueAt:           nextDue,
          requiresHuman:   nextStep.requiresHuman,
          suggestedMessage: nextStep.messageTemplate,
        },
      })
      await workerPublishEvent(tenantId, REALTIME_EVENT_TYPES.FOLLOWUP_CREATED, {
        taskId:         nextTask.id,
        conversationId,
        scenario,
        stepIndex:      stepIndex + 1,
        dueAt:          nextDue.toISOString(),
        requiresHuman:  nextStep.requiresHuman,
      })
    }
  }

  console.log(
    `[follow-up-processor] Task ${task.id} processed (${requiresHuman ? 'human-reminder' : 'stub-send'}) conv=${conversationId}`,
  )
}

// ── Public: start/stop interval ───────────────────────────────────────────────

let _interval: ReturnType<typeof setInterval> | null = null

export function startFollowUpProcessor(): void {
  if (_interval) return
  console.log(`[follow-up-processor] Started — polling every ${POLL_INTERVAL_MS / 1000}s`)
  // Run immediately on start, then every POLL_INTERVAL_MS
  processDueTasks().catch((err) => console.error('[follow-up-processor] Initial poll failed:', err))
  _interval = setInterval(() => {
    processDueTasks().catch((err) => console.error('[follow-up-processor] Poll failed:', err))
  }, POLL_INTERVAL_MS)
}

export function stopFollowUpProcessor(): void {
  if (_interval) {
    clearInterval(_interval)
    _interval = null
    console.log('[follow-up-processor] Stopped')
  }
}
