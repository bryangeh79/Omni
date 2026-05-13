// Follow-up Scenario Mapper — Phase 10B
//
// Deterministic (no AI provider calls) mapping from:
//   - AI result (shouldHandoff, scoreAdjustment, reply)
//   - Recent message content patterns
//   - Customer metadata (stage, score, tags)
//
// to a FollowUpScenario key (or null if no follow-up needed).
//
// Safety rules:
//   - No external API calls — purely deterministic keyword/rule matching.
//   - Blocked tags (complaint/refund/blacklist) → null (no follow-up).
//   - CLOSED conversations → null.
//   - HUMAN_HANDLING → only HIGH_INTENT_UNHANDLED (human reminder type), no auto-send.
//   - Deduplication is the caller's responsibility (scheduleFollowUp is idempotent).

import type { AiAgentResult } from '@omni/shared'

const BLOCKED_TAGS = new Set(['complaint', 'refund', 'unhappy', 'blacklist', 'stop_contact'])

// ── Keyword banks ─────────────────────────────────────────────────────────────
const PRICE_KEYWORDS = [
  'price', 'pricing', 'cost', 'how much', 'berapa', 'harga', 'package', 'plan', 'fee',
  'quote', 'quotation', 'estimate', 'cheapest', 'affordable',
]

const CONSIDERING_KEYWORDS = [
  'consider', 'think about', 'maybe', 'perhaps', 'later', 'not sure', 'pending',
  'nak fikir', 'tengok dulu', 'let me check', 'need to discuss', 'will get back',
]

const BOOKING_KEYWORDS = [
  'book', 'appointment', 'schedule', 'reserve', 'slot', 'confirm', 'meeting',
  'date', 'timing', 'available', 'when can',
]

function containsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some((kw) => lower.includes(kw))
}

// ── Input types ────────────────────────────────────────────────────────────────
export interface ScenarioMapperInput {
  conversationStatus:  string
  customerTags:        string[]
  customerStage:       string
  customerScore:       number
  recentInboundText:   string   // last inbound message content (or '' if none)
  aiResult:            Pick<AiAgentResult, 'shouldHandoff' | 'scoreAdjustment'>
  lastHumanHandledAt?: Date     // if set, human already acted recently
}

// ── Mapper ────────────────────────────────────────────────────────────────────
/**
 * Map conversation/AI/customer context to a follow-up scenario key.
 * Returns null if no follow-up should be scheduled.
 *
 * This is deterministic — it makes no AI provider calls.
 */
export function mapToFollowUpScenario(input: ScenarioMapperInput): string | null {
  // ── Safety guards ──────────────────────────────────────────────────────────
  if (input.conversationStatus === 'CLOSED') return null

  const hasBlockedTag = input.customerTags.some((t) => BLOCKED_TAGS.has(t.toLowerCase()))
  if (hasBlockedTag) return null

  const text = input.recentInboundText.toLowerCase()

  // ── HIGH_INTENT_UNHANDLED — human reminder (requiresHuman=true) ─────────────
  // Triggered when score is very high (≥ 80) and AI decided to handoff but
  // no human has handled it yet.
  if (
    input.aiResult.shouldHandoff &&
    input.customerScore >= 80 &&
    input.conversationStatus !== 'HUMAN_HANDLING'
  ) {
    return 'HIGH_INTENT_UNHANDLED'
  }

  // Skip auto-send scenarios for conversations in HUMAN_HANDLING
  if (input.conversationStatus === 'HUMAN_HANDLING') return null

  // ── PRICE_ASKED_NO_REPLY — customer mentioned price/cost in last message ────
  if (text && containsKeyword(text, PRICE_KEYWORDS)) {
    return 'PRICE_ASKED_NO_REPLY'
  }

  // ── BOOKING_NOT_CONFIRMED — customer mentioned booking/appointment ──────────
  if (text && containsKeyword(text, BOOKING_KEYWORDS)) {
    return 'BOOKING_NOT_CONFIRMED'
  }

  // ── CONSIDERING — customer seems to be delaying / thinking ─────────────────
  if (text && containsKeyword(text, CONSIDERING_KEYWORDS)) {
    return 'CONSIDERING'
  }

  // ── HIGH_INTENT by score (not handoff-triggered) ───────────────────────────
  // If customer stage is HIGH_INTENT or QUOTED and score >= 60, nurture with
  // CONSIDERING follow-up if AI didn't decide handoff.
  if (
    !input.aiResult.shouldHandoff &&
    input.customerScore >= 60 &&
    ['HIGH_INTENT', 'QUOTED'].includes(input.customerStage)
  ) {
    return 'CONSIDERING'
  }

  // No matching scenario
  return null
}
