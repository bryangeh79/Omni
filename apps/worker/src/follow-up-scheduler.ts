// Follow-up Scheduler — worker-side thin wrapper (Phase 10B)
//
// The API has the full follow-up engine (apps/api/src/follow-up-engine.ts).
// The worker cannot import from apps/api directly.
// This file duplicates the minimal scheduling logic needed in the worker.
//
// Keeps the step definitions and idempotency checks consistent with the engine.
// TODO (Phase 11): move SCENARIO_STEPS to @omni/shared to avoid duplication.

import { prisma, FollowUpStatus } from '@omni/db'

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

export async function scheduleFollowUp(
  tenantId:       string,
  conversationId: string,
  customerId:     string,
  scenario:       string,
  stepIndex       = 0,
): Promise<string | null> {
  const steps = SCENARIO_STEPS[scenario]
  if (!steps || stepIndex >= steps.length) return null

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { status: true },
  })
  if (!conv || conv.status === 'CLOSED') return null

  const step = steps[stepIndex]!
  if (!step.requiresHuman && conv.status === 'HUMAN_HANDLING') return null

  // Blocked tag check
  if (!step.requiresHuman) {
    const tags = await prisma.customerTag.findMany({ where: { customerId }, select: { tag: true } })
    if (tags.some((t) => BLOCKED_TAGS.has(t.tag.toLowerCase()))) return null
  }

  // Idempotent: skip if duplicate PENDING already exists
  const existing = await prisma.followUpTask.findFirst({
    where: { conversationId, scenario, stepIndex, status: FollowUpStatus.PENDING },
  })
  if (existing) return existing.id

  const dueAt = new Date(Date.now() + step.delayHours * 60 * 60 * 1000)
  const task  = await prisma.followUpTask.create({
    data: {
      tenantId,
      conversationId,
      customerId,
      scenario,
      stepIndex,
      dueAt,
      requiresHuman:    step.requiresHuman,
      suggestedMessage: step.messageTemplate,
    },
  })

  return task.id
}
