// Real Google Gemini generateContent provider (Phase 5D).
// Uses native fetch — no additional SDK required.
//
// SAFETY RULES:
//   - apiKey MUST NOT be logged or returned.
//   - DB write is the caller's responsibility; this function returns a result only.
//   - sendMessage() is NEVER called here.

import type { AiAgentInput, AiAgentResult } from '@omni/shared'
import { buildSystemPrompt, buildKnowledgeContext } from './prompt-builder'
import { keywordShouldHandoff, keywordScoreAdj, detectLang } from './provider-utils'

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS      = 30_000

const ALLOWED_MODELS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
])

// ── Message builder ───────────────────────────────────────────────────────────

interface GeminiPart    { text: string }
interface GeminiContent { role: string; parts: GeminiPart[] }

interface GeminiRequest {
  system_instruction: { parts: GeminiPart[] }
  contents:           GeminiContent[]
  generationConfig: {
    temperature:      number
    maxOutputTokens:  number
    responseMimeType: string
  }
}

function buildGeminiRequest(input: AiAgentInput): GeminiRequest {
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

  // Gemini uses 'user' / 'model' roles; consecutive same-role messages are merged.
  const contents: GeminiContent[] = []

  for (const msg of input.conversationHistory) {
    const role = msg.role === 'customer' ? 'user' : msg.role === 'ai' ? 'model' : null
    if (!role) continue
    const last = contents[contents.length - 1]
    if (last && last.role === role) {
      last.parts.push({ text: msg.content })
    } else {
      contents.push({ role, parts: [{ text: msg.content }] })
    }
  }

  // Current user message — append to last user turn or add new
  const lastInHistory = contents[contents.length - 1]
  if (lastInHistory?.role === 'user') {
    lastInHistory.parts.push({ text: input.messageBody })
  } else {
    contents.push({ role: 'user', parts: [{ text: input.messageBody }] })
  }

  return {
    system_instruction: { parts: [{ text: fullSystem }] },
    contents,
    generationConfig: {
      temperature:      input.aiConfig.temperature ?? 0.7,
      maxOutputTokens:  input.aiConfig.maxTokens   ?? 800,
      responseMimeType: 'application/json',
    },
  }
}

// ── Response types ────────────────────────────────────────────────────────────

interface GeminiCandidate { content: { parts: Array<{ text: string }> } }
interface GeminiUsage     { promptTokenCount: number; candidatesTokenCount: number }
interface GeminiResponse  {
  candidates?:    GeminiCandidate[]
  usageMetadata?: GeminiUsage
  error?:         { code?: number; message?: string; status?: string }
}

function buildProviderErrorResult(model: string, statusCode: number, errorMsg: string): AiAgentResult {
  const code = statusCode === 401 || statusCode === 403 ? 'INVALID_KEY'
             : statusCode === 429                       ? 'RATE_LIMITED'
             : 'API_ERROR'
  return {
    reply:                `[PROVIDER_ERROR: GEMINI ${code}] ${errorMsg}`,
    shouldHandoff:        true,
    scoreAdjustment:      0,
    suggestedTags:        ['needs_human'],
    nextAction:           'HANDOFF',
    detectedLanguage:     'en',
    provider:             'GEMINI',
    model,
    inputTokensEstimate:  0,
    outputTokensEstimate: 0,
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Call Google Gemini generateContent.
 * apiKey MUST NOT be logged. Result is returned to caller only (no DB/WA write here).
 */
export async function callGemini(
  apiKey: string,
  model: string,
  input: AiAgentInput,
): Promise<AiAgentResult> {
  if (!ALLOWED_MODELS.has(model)) {
    return buildProviderErrorResult(model, 0, `Model ${model} not in allowed list`)
  }

  const url        = `${GEMINI_BASE_URL}/${model}:generateContent`
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-goog-api-key': apiKey,  // key used only here, never logged
      },
      body:   JSON.stringify(buildGeminiRequest(input)),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const isTimeout = (err as Error).name === 'AbortError'
    console.error(`[gemini] ${isTimeout ? 'Timeout' : 'Fetch error'}: ${(err as Error).message}`)
    return buildProviderErrorResult(model, isTimeout ? 408 : 0,
      isTimeout ? 'Request timed out' : 'Network error')
  }
  clearTimeout(timer)

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`
    try {
      const errJson = await response.json() as GeminiResponse
      errMsg = errJson.error?.message?.slice(0, 120) ?? errMsg
      console.error(`[gemini] API error ${response.status}: ${errMsg}`)
    } catch { /* ignore parse error */ }
    return buildProviderErrorResult(model, response.status, errMsg)
  }

  let data: GeminiResponse
  try {
    data = await response.json() as GeminiResponse
  } catch {
    return buildProviderErrorResult(model, 0, 'Failed to parse API response')
  }

  const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const usage      = data.usageMetadata

  let reply         = rawContent
  let shouldHandoff = false

  try {
    const parsed = JSON.parse(rawContent) as Record<string, unknown>
    reply         = String(parsed.reply ?? rawContent)
    shouldHandoff = parsed.shouldHandoff === true
  } catch {
    shouldHandoff = keywordShouldHandoff(rawContent)
  }

  const inputTok  = usage?.promptTokenCount      ?? Math.ceil(input.messageBody.split(/\s+/).length * 1.5 + 500)
  const outputTok = usage?.candidatesTokenCount   ?? 100

  return {
    reply,
    shouldHandoff,
    scoreAdjustment:  keywordScoreAdj(input.messageBody),
    suggestedTags:    shouldHandoff ? ['needs_human'] : [],
    nextAction:       shouldHandoff ? 'HANDOFF' : 'CONTINUE',
    detectedLanguage: detectLang(reply || input.messageBody),
    provider:         'GEMINI',
    model,
    inputTokensEstimate:  inputTok,
    outputTokensEstimate: outputTok,
  }
}
