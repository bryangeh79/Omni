// AI provider/model pricing table and cost calculation helper.
// Phase 6: internal cost foundation only. Do NOT use for customer billing enforcement.
//
// IMPORTANT:
//   - All prices are approximate. isEstimate=true means verify before use in any billing.
//   - null cost fields mean pricing is unconfirmed — calculateAiCostUsd returns null.
//   - This file is internal infrastructure. Package pricing is NOT enforced here.
//   - WhatsApp / Meta official message fees are SEPARATE from AI costs.

export interface AiModelPricing {
  provider:                 string
  model:                    string
  inputCostPer1MTokensUsd:  number | null  // null = unknown; verify before billing
  outputCostPer1MTokensUsd: number | null
  currency:                 'USD'
  isEstimate:               boolean        // true = approximate; cross-check provider pricing page
  sourceNote?:              string
  lastVerifiedAt?:          string         // YYYY-MM approximate
}

// ── Pricing table ─────────────────────────────────────────────────────────────
// Sources: provider pricing pages (approximate as of date noted).
// Always verify current rates before using in billing calculations.

export const AI_MODEL_PRICING: AiModelPricing[] = [
  // ── OpenAI ──────────────────────────────────────────────────────────────────
  {
    provider: 'OPENAI', model: 'gpt-4o-mini',
    inputCostPer1MTokensUsd: 0.15, outputCostPer1MTokensUsd: 0.60,
    currency: 'USD', isEstimate: false,
    sourceNote: 'openai.com/api/pricing', lastVerifiedAt: '2025-04',
  },
  {
    provider: 'OPENAI', model: 'gpt-4o',
    inputCostPer1MTokensUsd: 2.50, outputCostPer1MTokensUsd: 10.00,
    currency: 'USD', isEstimate: false,
    sourceNote: 'openai.com/api/pricing', lastVerifiedAt: '2025-04',
  },
  {
    provider: 'OPENAI', model: 'gpt-4.1-mini',
    inputCostPer1MTokensUsd: 0.40, outputCostPer1MTokensUsd: 1.60,
    currency: 'USD', isEstimate: true,
    sourceNote: 'openai.com/api/pricing (verify current rate)', lastVerifiedAt: '2025-04',
  },
  {
    provider: 'OPENAI', model: 'gpt-4.1',
    inputCostPer1MTokensUsd: 2.00, outputCostPer1MTokensUsd: 8.00,
    currency: 'USD', isEstimate: true,
    sourceNote: 'openai.com/api/pricing (verify current rate)', lastVerifiedAt: '2025-04',
  },

  // ── Google Gemini ────────────────────────────────────────────────────────────
  {
    provider: 'GEMINI', model: 'gemini-1.5-flash',
    inputCostPer1MTokensUsd: 0.075, outputCostPer1MTokensUsd: 0.30,
    currency: 'USD', isEstimate: true,
    sourceNote: 'ai.google.dev/pricing (standard tier ≤128K ctx; verify current rate)', lastVerifiedAt: '2025-04',
  },
  {
    provider: 'GEMINI', model: 'gemini-1.5-pro',
    inputCostPer1MTokensUsd: 1.25, outputCostPer1MTokensUsd: 5.00,
    currency: 'USD', isEstimate: true,
    sourceNote: 'ai.google.dev/pricing (verify current rate)', lastVerifiedAt: '2025-04',
  },
  {
    provider: 'GEMINI', model: 'gemini-2.0-flash',
    inputCostPer1MTokensUsd: 0.10, outputCostPer1MTokensUsd: 0.40,
    currency: 'USD', isEstimate: true,
    sourceNote: 'ai.google.dev/pricing (approximate; verify current rate)', lastVerifiedAt: '2025-04',
  },
  {
    provider: 'GEMINI', model: 'gemini-2.5-flash',
    inputCostPer1MTokensUsd: null, outputCostPer1MTokensUsd: null,
    currency: 'USD', isEstimate: true,
    sourceNote: 'Pricing unconfirmed — check ai.google.dev/pricing before any billing use',
  },
  {
    provider: 'GEMINI', model: 'gemini-2.5-pro',
    inputCostPer1MTokensUsd: null, outputCostPer1MTokensUsd: null,
    currency: 'USD', isEstimate: true,
    sourceNote: 'Pricing unconfirmed — check ai.google.dev/pricing before any billing use',
  },

  // ── DeepSeek ─────────────────────────────────────────────────────────────────
  {
    provider: 'DEEPSEEK', model: 'deepseek-chat',
    inputCostPer1MTokensUsd: 0.27, outputCostPer1MTokensUsd: 1.10,
    currency: 'USD', isEstimate: true,
    sourceNote: 'platform.deepseek.com/api-docs (V3 cache-miss rate; verify current rate)', lastVerifiedAt: '2025-04',
  },
  {
    provider: 'DEEPSEEK', model: 'deepseek-reasoner',
    inputCostPer1MTokensUsd: 0.55, outputCostPer1MTokensUsd: 2.19,
    currency: 'USD', isEstimate: true,
    sourceNote: 'platform.deepseek.com/api-docs (R1 cache-miss rate; verify current rate)', lastVerifiedAt: '2025-04',
  },
]

// ── Lookup ────────────────────────────────────────────────────────────────────

export function getModelPricing(provider: string, model: string): AiModelPricing | undefined {
  return AI_MODEL_PRICING.find((p) => p.provider === provider && p.model === model)
}

// ── Cost calculator ───────────────────────────────────────────────────────────

/**
 * Calculate the estimated AI cost in USD for a single call.
 * Returns null if pricing is unknown or unconfirmed for this model.
 * Round to 6 decimal places to preserve sub-cent precision.
 */
export function calculateAiCostUsd(params: {
  provider:     string
  model:        string
  inputTokens:  number
  outputTokens: number
}): number | null {
  const { provider, model, inputTokens, outputTokens } = params
  const pricing = getModelPricing(provider, model)
  if (!pricing) return null
  if (pricing.inputCostPer1MTokensUsd === null || pricing.outputCostPer1MTokensUsd === null) return null

  const raw = (inputTokens  / 1_000_000) * pricing.inputCostPer1MTokensUsd
            + (outputTokens / 1_000_000) * pricing.outputCostPer1MTokensUsd

  return Math.round(raw * 1_000_000) / 1_000_000
}
