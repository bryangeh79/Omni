// DryRunProvider — returns deterministic output without any external API calls.
// Used in Phase 5A and for testing. Safe for all environments.

import type { AiProviderClient } from './provider-interface'
import type { AiAgentInput, AiAgentResult } from '@omni/shared'

// ── Keyword signal maps ────────────────────────────────────────────────────────

const HUMAN_KEYWORDS = [
  'human', 'person', 'agent', 'speak to', 'talk to', 'call me',
  'real person', 'customer service', 'support staff',
  // Chinese equivalents
  '人工', '真人', '客服', '转人工',
  // Malay equivalents
  'manusia', 'orang', 'ejen',
]

const HANDOFF_KEYWORDS = [
  'refund', 'complaint', 'scam', 'cheated', 'fraud', 'billing issue',
  'payment failed', 'overcharged', 'lawsuit', 'legal',
  // Chinese
  '退款', '投诉', '骗', '诈骗', '账单问题',
  // Malay
  'bayar balik', 'aduan', 'penipuan',
]

const PRICE_KEYWORDS     = ['price', 'pricing', 'package', 'plan', 'subscription', '价格', '套餐', 'harga', 'pakej']
const DEMO_KEYWORDS      = ['demo', 'appointment', 'schedule', 'book', 'meet', '预约', '演示', 'demo', 'temujanji']
const PURCHASE_KEYWORDS  = ['buy', 'purchase', 'order', 'payment', 'pay now', '购买', '支付', 'beli', 'bayar']

export class DryRunProvider implements AiProviderClient {
  readonly provider = 'DRY_RUN' as const
  readonly model    = 'dry-run' as const

  async complete(input: AiAgentInput): Promise<AiAgentResult> {
    const body  = input.messageBody.toLowerCase()
    const score = input.customerProfile.score ?? 0

    // ── Handoff decision ─────────────────────────────────────────────────────
    const wantsHuman    = HUMAN_KEYWORDS.some((k) => body.includes(k))
    const isComplaint   = HANDOFF_KEYWORDS.some((k) => body.includes(k))
    const isUrgentScore = score >= 80
    const noKb          = input.knowledgeContext.length === 0
    const priceQuery    = noKb && PRICE_KEYWORDS.some((k) => body.includes(k))
    const shouldHandoff = wantsHuman || isComplaint || isUrgentScore || priceQuery

    // ── Score adjustment ─────────────────────────────────────────────────────
    let scoreAdjustment = 0
    if (!isComplaint) {
      if (PRICE_KEYWORDS.some((k) => body.includes(k)))    scoreAdjustment += 20
      if (DEMO_KEYWORDS.some((k) => body.includes(k)))     scoreAdjustment += 25
      if (PURCHASE_KEYWORDS.some((k) => body.includes(k))) scoreAdjustment += 30
    }

    // ── Reply text ───────────────────────────────────────────────────────────
    let kbContext = ''
    if (input.knowledgeContext.length > 0) {
      const top = input.knowledgeContext[0]
      kbContext = top?.answer ? `Based on our knowledge base: ${top.answer.slice(0, 120)}` : ''
    }

    const providerLabel = `${input.aiConfig.aiProvider}/${input.aiConfig.model}`
    const reply = shouldHandoff
      ? `[AI_DRY_RUN] Transferring to a human agent. (${providerLabel})`
      : `[AI_DRY_RUN] ${kbContext || 'Thank you for your message. Our AI is reviewing your inquiry.'} (${providerLabel})`

    // ── Suggested tags ───────────────────────────────────────────────────────
    const suggestedTags: string[] = []
    if (shouldHandoff)                              suggestedTags.push('needs_human')
    if (PRICE_KEYWORDS.some((k) => body.includes(k))) suggestedTags.push('price_inquiry')

    // ── Detected language ────────────────────────────────────────────────────
    // Very simple heuristic: check for CJK codepoints
    const hasCjk = /[一-鿿]/.test(input.messageBody)
    const hasMalay = /\b(saya|awak|anda|boleh|tak|ini|itu)\b/.test(body)
    const detectedLanguage = hasCjk ? 'zh' : hasMalay ? 'ms' : 'en'

    return {
      reply,
      shouldHandoff,
      scoreAdjustment,
      suggestedTags,
      nextAction:           shouldHandoff ? 'HANDOFF' : 'CONTINUE',
      detectedLanguage,
      provider:             'DRY_RUN',
      model:                'dry-run',
      inputTokensEstimate:  Math.ceil(input.messageBody.split(/\s+/).length * 1.5 + 500),
      outputTokensEstimate: 80,
    }
  }
}
