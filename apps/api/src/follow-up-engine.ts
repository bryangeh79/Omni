// Follow-up Rules Engine — Phase 9B
//
// Deterministic scenario-based scheduling. No real AI provider calls.
// No real WhatsApp sends in default mode (all outbound tasks are STUB_NOT_SENT).
//
// Safety rules (enforced here, not just documented):
// - Never schedule auto-send for CLOSED conversations.
// - Never schedule auto-send for HUMAN_HANDLING (only human-reminder tasks).
// - Never schedule auto-send for blacklisted customers.
// - Never schedule auto-send for customers tagged complaint/refund/unhappy.
// - Cancel entire chain when customer sends an inbound message.
// - Idempotent: no duplicate PENDING tasks for same conversation+scenario+step.

import { prisma, FollowUpStatus } from '@omni/db'
import { publishEvent }           from './realtime-bus'
import { REALTIME_EVENT_TYPES }   from '@omni/shared'

// ── Blocked tags — never auto-send to these customers ────────────────────────
const BLOCKED_TAGS = new Set(['complaint', 'refund', 'unhappy', 'blacklist', 'stop_contact'])

// ── Scenario step definitions ─────────────────────────────────────────────────
export interface StepDef {
  delayHours:      number
  requiresHuman:   boolean
  messageTemplate: string
}

export const SCENARIO_STEPS: Record<string, StepDef[]> = {
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

// ── Safety: check if customer has blocked tags ────────────────────────────────
async function isCustomerBlocked(customerId: string): Promise<boolean> {
  const tags = await prisma.customerTag.findMany({
    where: { customerId },
    select: { tag: true },
  })
  return tags.some((t) => BLOCKED_TAGS.has(t.tag.toLowerCase()))
}

// ── Schedule next step (or first step) for a scenario ────────────────────────
export async function scheduleFollowUp(
  tenantId:       string,
  conversationId: string,
  customerId:     string,
  scenario:       string,
  stepIndex:      number = 0,
  sourceRuleId?:  string,
): Promise<string | null> {
  const steps = SCENARIO_STEPS[scenario]
  if (!steps || stepIndex >= steps.length) return null

  // Guard: conversation must be open and not human-handling (unless human reminder)
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { status: true },
  })
  if (!conv) return null
  if (conv.status === 'CLOSED') return null

  const step = steps[stepIndex]!
  // For auto-send steps, skip HUMAN_HANDLING conversations
  if (!step.requiresHuman && conv.status === 'HUMAN_HANDLING') return null

  // Guard: do not schedule auto-send for blocked customers
  if (!step.requiresHuman && await isCustomerBlocked(customerId)) {
    console.log(`[follow-up-engine] Skipping — customer ${customerId} has blocked tags`)
    return null
  }

  // Idempotent: cancel if duplicate PENDING already exists
  const existing = await prisma.followUpTask.findFirst({
    where: { conversationId, scenario, stepIndex, status: FollowUpStatus.PENDING },
  })
  if (existing) {
    console.log(`[follow-up-engine] Duplicate task for conv=${conversationId} scenario=${scenario} step=${stepIndex} — skipping`)
    return existing.id
  }

  const dueAt = new Date(Date.now() + step.delayHours * 60 * 60 * 1000)
  const task = await prisma.followUpTask.create({
    data: {
      tenantId,
      conversationId,
      customerId,
      ruleId:          sourceRuleId,
      scenario,
      stepIndex,
      dueAt,
      requiresHuman:   step.requiresHuman,
      suggestedMessage: step.messageTemplate,
    },
  })

  publishEvent(tenantId, REALTIME_EVENT_TYPES.FOLLOWUP_CREATED, {
    taskId:         task.id,
    conversationId,
    customerId,
    scenario,
    stepIndex,
    dueAt:          dueAt.toISOString(),
    requiresHuman:  step.requiresHuman,
  })

  console.log(
    `[follow-up-engine] Scheduled task ${task.id} conv=${conversationId} scenario=${scenario} step=${stepIndex} due=${dueAt.toISOString()}`,
  )
  return task.id
}

// ── Cancel entire follow-up chain for a conversation ─────────────────────────
// Called when customer sends an inbound message.
export async function cancelFollowUpChain(
  conversationId: string,
  tenantId:        string,
  reason:          string = 'CUSTOMER_REPLIED',
): Promise<number> {
  const now = new Date()
  const result = await prisma.followUpTask.updateMany({
    where: { conversationId, status: FollowUpStatus.PENDING },
    data:  { status: FollowUpStatus.CANCELLED, cancelledAt: now, cancelledReason: reason },
  })

  if (result.count > 0) {
    publishEvent(tenantId, REALTIME_EVENT_TYPES.FOLLOWUP_UPDATED, {
      conversationId,
      cancelledCount: result.count,
      reason,
    })
    console.log(`[follow-up-engine] Cancelled ${result.count} tasks for conv=${conversationId} (${reason})`)
  }

  return result.count
}

// ── Complete a specific task ──────────────────────────────────────────────────
export async function completeFollowUpTask(
  taskId:   string,
  tenantId: string,
): Promise<boolean> {
  const existing = await prisma.followUpTask.findFirst({
    where: { id: taskId, tenantId, status: FollowUpStatus.PENDING },
  })
  if (!existing) return false

  await prisma.followUpTask.update({
    where: { id: taskId },
    data:  { status: FollowUpStatus.DONE, completedAt: new Date() },
  })

  publishEvent(tenantId, REALTIME_EVENT_TYPES.FOLLOWUP_UPDATED, {
    taskId,
    conversationId: existing.conversationId,
    status:        'DONE',
  })

  return true
}

// ── Cancel a specific task ────────────────────────────────────────────────────
export async function cancelFollowUpTask(
  taskId:   string,
  tenantId: string,
  reason:   string = 'MANUAL',
): Promise<boolean> {
  const existing = await prisma.followUpTask.findFirst({
    where: { id: taskId, tenantId, status: FollowUpStatus.PENDING },
  })
  if (!existing) return false

  await prisma.followUpTask.update({
    where: { id: taskId },
    data:  { status: FollowUpStatus.CANCELLED, cancelledAt: new Date(), cancelledReason: reason },
  })

  publishEvent(tenantId, REALTIME_EVENT_TYPES.FOLLOWUP_UPDATED, {
    taskId,
    conversationId: existing.conversationId,
    status:        'CANCELLED',
    reason,
  })

  return true
}
