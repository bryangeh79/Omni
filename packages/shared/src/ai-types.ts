// Shared AI provider/model types and allowlists.
// Centralized so API, worker, and ai-core all use the same values.

export type AiProvider =
  | 'OPENAI'
  | 'GEMINI'
  | 'DEEPSEEK'
  | 'PLATFORM_DEFAULT'
  | 'DRY_RUN'

export type ReplyLanguagePolicy = 'AUTO' | 'zh' | 'en' | 'ms'

export interface AiModelOption {
  model:    string
  label:    string
  context:  number    // approx max context tokens
}

export const AI_PROVIDERS: Record<AiProvider, { label: string; models: AiModelOption[] }> = {
  OPENAI: {
    label: 'OpenAI',
    models: [
      { model: 'gpt-4o-mini',  label: 'GPT-4o mini',  context: 128_000 },
      { model: 'gpt-4o',       label: 'GPT-4o',        context: 128_000 },
      { model: 'gpt-4.1-mini', label: 'GPT-4.1 mini',  context: 128_000 },
      { model: 'gpt-4.1',      label: 'GPT-4.1',       context: 128_000 },
    ],
  },
  GEMINI: {
    label: 'Google Gemini',
    models: [
      { model: 'gemini-1.5-flash',  label: 'Gemini 1.5 Flash',  context: 1_000_000 },
      { model: 'gemini-1.5-pro',    label: 'Gemini 1.5 Pro',    context: 2_000_000 },
      { model: 'gemini-2.0-flash',  label: 'Gemini 2.0 Flash',  context: 1_000_000 },
      { model: 'gemini-2.5-flash',  label: 'Gemini 2.5 Flash',  context: 1_000_000 },
      { model: 'gemini-2.5-pro',    label: 'Gemini 2.5 Pro',    context: 2_000_000 },
    ],
  },
  DEEPSEEK: {
    label: 'DeepSeek',
    models: [
      { model: 'deepseek-chat',      label: 'DeepSeek Chat',      context: 64_000 },
      { model: 'deepseek-reasoner',  label: 'DeepSeek Reasoner',  context: 64_000 },
    ],
  },
  PLATFORM_DEFAULT: {
    label: 'Platform Default',
    models: [
      { model: 'platform-default', label: 'Platform Default', context: 128_000 },
    ],
  },
  DRY_RUN: {
    label: 'Dry Run (no real API)',
    models: [
      { model: 'dry-run', label: 'Dry Run', context: 0 },
    ],
  },
}

/** Check if a provider+model combination is valid. */
export function isValidProviderModel(provider: string, model: string): boolean {
  const p = AI_PROVIDERS[provider as AiProvider]
  if (!p) return false
  return p.models.some((m) => m.model === model)
}

/** Get all valid models for a provider (as strings). */
export function getModelsForProvider(provider: string): string[] {
  const p = AI_PROVIDERS[provider as AiProvider]
  return p ? p.models.map((m) => m.model) : []
}

// ── Agent I/O types ───────────────────────────────────────────────────────────

export interface CustomerProfile {
  id:                 string
  name?:              string | null
  phone:              string
  languagePreference?: string | null
  stage:              string
  score:              number
  tags:               string[]
}

export interface MessageHistory {
  role:    'customer' | 'ai' | 'human' | 'system'
  content: string
}

export interface KnowledgeSnippet {
  question?: string | null
  answer:    string
  language:  string
  type:      string
}

export interface TenantAiConfig {
  aiProvider:          AiProvider
  model:               string
  persona?:            string | null
  goals:               string[]
  systemPrompt?:       string | null
  replyLanguagePolicy: ReplyLanguagePolicy
  temperature?:        number | null
  maxTokens?:          number | null
}

export interface AiAgentInput {
  tenantId:            string
  conversationId:      string
  customerId:          string
  messageId:           string
  messageBody:         string
  aiConfig:            TenantAiConfig
  customerProfile:     CustomerProfile
  conversationHistory: MessageHistory[]
  knowledgeContext:    KnowledgeSnippet[]
}

export interface AiAgentResult {
  reply:               string
  shouldHandoff:       boolean
  scoreAdjustment:     number
  suggestedTags:       string[]
  nextAction:          'CONTINUE' | 'HANDOFF'
  detectedLanguage:    string
  provider:            AiProvider | string
  model:               string
  inputTokensEstimate: number
  outputTokensEstimate: number
}
