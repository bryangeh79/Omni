// Real OpenAI Chat Completions provider (Phase 5C).
// Uses native fetch — no additional SDK required.
//
// SAFETY RULES:
//   - apiKey MUST NOT be logged or returned.
//   - DB write is the caller's responsibility; this function returns a result only.
//   - sendMessage() is NEVER called here.

import type { AiAgentInput, AiAgentResult } from '@omni/shared'
import { buildSystemPrompt, buildKnowledgeContext } from './prompt-builder'

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const TIMEOUT_MS      = 30_000

// ── Allowed models ────────────────────────────────────────────────────────────

const ALLOWED_MODELS = new Set(['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'])

// TODO Phase 6: real cost calculation (verify current pricing first)
// INPUT_COST_PER_1M:  { 'gpt-4o-mini': 0.15, 'gpt-4o': 2.50, 'gpt-4.1-mini': 0.15, 'gpt-4.1': 2.00 }
// OUTPUT_COST_PER_1M: { 'gpt-4o-mini': 0.60, 'gpt-4o': 10.00, 'gpt-4.1-mini': 0.60, 'gpt-4.1': 8.00 }

// ── Message builder ───────────────────────────────────────────────────────────

function buildOpenAiMessages(
  input: AiAgentInput,
): Array<{ role: string; content: string }> {
  const systemPrompt = buildSystemPrompt({
    config:        input.aiConfig,
    customerName:  input.customerProfile.name ?? undefined,
    customerStage: input.customerProfile.stage,
    customerScore: input.customerProfile.score,
  })

  const kbCtx = buildKnowledgeContext(input.knowledgeContext)

  const fullSystem = [
    systemPrompt,
    kbCtx !== '(no relevant knowledge base entries found)'
      ? `\n## Knowledge Base:\n${kbCtx}`
      : '',
    '\n## Response Format:',
    'Respond ONLY with a JSON object. Example:',
    '{"reply":"your reply here","shouldHandoff":false,"confidence":0.9}',
    'No text outside the JSON.',
  ].filter(Boolean).join('\n')

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: fullSystem },
  ]

  // Conversation history (last N messages)
  for (const msg of input.conversationHistory) {
    if      (msg.role === 'customer') messages.push({ role: 'user',      content: msg.content })
    else if (msg.role === 'ai')       messages.push({ role: 'assistant', content: msg.content })
    // Skip 'system' and 'human' messages (internal events)
  }

  // Current user message
  messages.push({ role: 'user', content: input.messageBody })

  return messages
}

// ── OpenAI API call ───────────────────────────────────────────────────────────

interface OpenAiChoice {
  message: { content: string }
}
interface OpenAiUsage {
  prompt_tokens: number
  completion_tokens: number
}
interface OpenAiResponse {
  choices?: OpenAiChoice[]
  usage?:   OpenAiUsage
  error?:   { message?: string; code?: string }
}

/** Keyword lists reused from DryRunProvider — same logic for shouldHandoff fallback. */
const HANDOFF_SIGNAL = ['human', 'agent', '人工', '客服', 'refund', 'complaint', '退款', '投诉']
const PRICE_SIGNAL   = ['price', 'pricing', 'package', '价格', '套餐', 'harga']
const DEMO_SIGNAL    = ['demo', 'appointment', 'schedule', '预约']
const BUY_SIGNAL     = ['buy', 'purchase', 'payment', '购买', '支付', 'beli', 'bayar']

function keywordShouldHandoff(text: string): boolean {
  const t = text.toLowerCase()
  return HANDOFF_SIGNAL.some((k) => t.includes(k))
}
function keywordScoreAdj(body: string): number {
  const t = body.toLowerCase()
  if (HANDOFF_SIGNAL.some((k) => t.includes(k))) return 0
  let adj = 0
  if (PRICE_SIGNAL.some((k) => t.includes(k)))  adj += 20
  if (DEMO_SIGNAL.some((k)  => t.includes(k)))  adj += 25
  if (BUY_SIGNAL.some((k)   => t.includes(k)))  adj += 30
  return adj
}
function detectLang(text: string): string {
  if (/[一-鿿]/.test(text)) return 'zh'
  if (/\b(saya|awak|anda|boleh|ini|itu|tak)\b/.test(text.toLowerCase())) return 'ms'
  return 'en'
}

function buildProviderErrorResult(
  model: string,
  statusCode: number,
  errorMsg: string,
): AiAgentResult {
  const code = statusCode === 401 ? 'INVALID_KEY' : statusCode === 429 ? 'RATE_LIMITED' : 'API_ERROR'
  return {
    reply:                `[PROVIDER_ERROR: OPENAI ${code}] ${errorMsg}`,
    shouldHandoff:        true,
    scoreAdjustment:      0,
    suggestedTags:        ['needs_human'],
    nextAction:           'HANDOFF',
    detectedLanguage:     'en',
    provider:             'OPENAI',
    model,
    inputTokensEstimate:  0,
    outputTokensEstimate: 0,
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Call OpenAI Chat Completions.
 * apiKey MUST NOT be logged. Result is returned to caller only (no DB/WA write here).
 */
export async function callOpenAi(
  apiKey: string,
  model: string,
  input: AiAgentInput,
): Promise<AiAgentResult> {
  if (!ALLOWED_MODELS.has(model)) {
    return buildProviderErrorResult(model, 0, `Model ${model} not in allowed list`)
  }

  const messages = buildOpenAiMessages(input)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(OPENAI_CHAT_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,  // key used only here, never logged
      },
      body: JSON.stringify({
        model,
        messages,
        temperature:     input.aiConfig.temperature    ?? 0.7,
        max_tokens:      input.aiConfig.maxTokens      ?? 800,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const isTimeout = (err as Error).name === 'AbortError'
    console.error(`[openai] ${isTimeout ? 'Timeout' : 'Fetch error'}: ${(err as Error).message}`)
    return buildProviderErrorResult(model, isTimeout ? 408 : 0,
      isTimeout ? 'Request timed out' : 'Network error')
  }
  clearTimeout(timer)

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`
    try {
      const errJson = await response.json() as OpenAiResponse
      // Never log apiKey; log only error message (no key in OpenAI error bodies)
      errMsg = errJson.error?.message?.slice(0, 120) ?? errMsg
      console.error(`[openai] API error ${response.status}: ${errMsg}`)
    } catch { /* ignore parse error */ }
    return buildProviderErrorResult(model, response.status, errMsg)
  }

  let data: OpenAiResponse
  try {
    data = await response.json() as OpenAiResponse
  } catch {
    return buildProviderErrorResult(model, 0, 'Failed to parse API response')
  }

  const rawContent = data.choices?.[0]?.message?.content ?? ''
  const usage      = data.usage

  let reply          = rawContent
  let shouldHandoff  = false

  try {
    const parsed = JSON.parse(rawContent) as Record<string, unknown>
    reply         = String(parsed.reply ?? rawContent)
    shouldHandoff = parsed.shouldHandoff === true
  } catch {
    // JSON parse failed — use raw text + keyword heuristic
    shouldHandoff = keywordShouldHandoff(rawContent)
  }

  const inputTok  = usage?.prompt_tokens     ?? Math.ceil(input.messageBody.split(/\s+/).length * 1.5 + 500)
  const outputTok = usage?.completion_tokens ?? 100
  // Cost: TODO Phase 6 — estimate below is approximate; verify before billing
  // const estimatedCostUsd = (inputTok / 1_000_000) * (INPUT_COST_PER_1M[model] ?? 0)
  //                        + (outputTok / 1_000_000) * (OUTPUT_COST_PER_1M[model] ?? 0)

  return {
    reply,
    shouldHandoff,
    scoreAdjustment:  keywordScoreAdj(input.messageBody),
    suggestedTags:    shouldHandoff ? ['needs_human'] : [],
    nextAction:       shouldHandoff ? 'HANDOFF' : 'CONTINUE',
    detectedLanguage: detectLang(reply || input.messageBody),
    provider:         'OPENAI',
    model,
    inputTokensEstimate:  inputTok,
    outputTokensEstimate: outputTok,
  }
}
