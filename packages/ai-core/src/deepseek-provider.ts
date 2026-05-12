// Real DeepSeek Chat Completions provider (Phase 5D).
// OpenAI-compatible API — uses native fetch, no additional SDK.
//
// SAFETY RULES:
//   - apiKey MUST NOT be logged or returned.
//   - DB write is the caller's responsibility; this function returns a result only.
//   - sendMessage() is NEVER called here.

import type { AiAgentInput, AiAgentResult } from '@omni/shared'
import { buildSystemPrompt, buildKnowledgeContext } from './prompt-builder'
import { keywordShouldHandoff, keywordScoreAdj, detectLang } from './provider-utils'

const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/v1/chat/completions'
const TIMEOUT_MS        = 30_000

const ALLOWED_MODELS   = new Set(['deepseek-chat', 'deepseek-reasoner'])
// deepseek-reasoner does NOT support response_format json_object
const JSON_MODE_MODELS = new Set(['deepseek-chat'])

// ── Message builder (OpenAI-compatible format) ────────────────────────────────

function buildMessages(input: AiAgentInput): Array<{ role: string; content: string }> {
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

  for (const msg of input.conversationHistory) {
    if      (msg.role === 'customer') messages.push({ role: 'user',      content: msg.content })
    else if (msg.role === 'ai')       messages.push({ role: 'assistant', content: msg.content })
  }

  messages.push({ role: 'user', content: input.messageBody })
  return messages
}

// ── Response types ────────────────────────────────────────────────────────────

interface DeepSeekChoice  { message: { content: string } }
interface DeepSeekUsage   { prompt_tokens: number; completion_tokens: number }
interface DeepSeekResponse {
  choices?: DeepSeekChoice[]
  usage?:   DeepSeekUsage
  error?:   { message?: string; code?: string }
}

function buildProviderErrorResult(model: string, statusCode: number, errorMsg: string): AiAgentResult {
  const code = statusCode === 401 ? 'INVALID_KEY'
             : statusCode === 429 ? 'RATE_LIMITED'
             : 'API_ERROR'
  return {
    reply:                `[PROVIDER_ERROR: DEEPSEEK ${code}] ${errorMsg}`,
    shouldHandoff:        true,
    scoreAdjustment:      0,
    suggestedTags:        ['needs_human'],
    nextAction:           'HANDOFF',
    detectedLanguage:     'en',
    provider:             'DEEPSEEK',
    model,
    inputTokensEstimate:  0,
    outputTokensEstimate: 0,
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Call DeepSeek Chat Completions (OpenAI-compatible endpoint).
 * apiKey MUST NOT be logged. Result is returned to caller only (no DB/WA write here).
 */
export async function callDeepSeek(
  apiKey: string,
  model: string,
  input: AiAgentInput,
): Promise<AiAgentResult> {
  if (!ALLOWED_MODELS.has(model)) {
    return buildProviderErrorResult(model, 0, `Model ${model} not in allowed list`)
  }

  const requestBody: Record<string, unknown> = {
    model,
    messages:    buildMessages(input),
    temperature: input.aiConfig.temperature ?? 0.7,
    max_tokens:  input.aiConfig.maxTokens   ?? 800,
  }
  // JSON mode only for deepseek-chat; deepseek-reasoner does not support it
  if (JSON_MODE_MODELS.has(model)) {
    requestBody.response_format = { type: 'json_object' }
  }

  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(DEEPSEEK_CHAT_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,  // key used only here, never logged
      },
      body:   JSON.stringify(requestBody),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const isTimeout = (err as Error).name === 'AbortError'
    console.error(`[deepseek] ${isTimeout ? 'Timeout' : 'Fetch error'}: ${(err as Error).message}`)
    return buildProviderErrorResult(model, isTimeout ? 408 : 0,
      isTimeout ? 'Request timed out' : 'Network error')
  }
  clearTimeout(timer)

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`
    try {
      const errJson = await response.json() as DeepSeekResponse
      errMsg = errJson.error?.message?.slice(0, 120) ?? errMsg
      console.error(`[deepseek] API error ${response.status}: ${errMsg}`)
    } catch { /* ignore parse error */ }
    return buildProviderErrorResult(model, response.status, errMsg)
  }

  let data: DeepSeekResponse
  try {
    data = await response.json() as DeepSeekResponse
  } catch {
    return buildProviderErrorResult(model, 0, 'Failed to parse API response')
  }

  const rawContent = data.choices?.[0]?.message?.content ?? ''
  const usage      = data.usage

  let reply         = rawContent
  let shouldHandoff = false

  try {
    const parsed = JSON.parse(rawContent) as Record<string, unknown>
    reply         = String(parsed.reply ?? rawContent)
    shouldHandoff = parsed.shouldHandoff === true
  } catch {
    shouldHandoff = keywordShouldHandoff(rawContent)
  }

  const inputTok  = usage?.prompt_tokens     ?? Math.ceil(input.messageBody.split(/\s+/).length * 1.5 + 500)
  const outputTok = usage?.completion_tokens ?? 100

  return {
    reply,
    shouldHandoff,
    scoreAdjustment:  keywordScoreAdj(input.messageBody),
    suggestedTags:    shouldHandoff ? ['needs_human'] : [],
    nextAction:       shouldHandoff ? 'HANDOFF' : 'CONTINUE',
    detectedLanguage: detectLang(reply || input.messageBody),
    provider:         'DEEPSEEK',
    model,
    inputTokensEstimate:  inputTok,
    outputTokensEstimate: outputTok,
  }
}
