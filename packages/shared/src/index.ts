// Shared types, constants, and utilities
// Used across apps/api, apps/worker, apps/web, packages/*

// ── Lead scoring bands ────────────────────────────────────────────────────────
export const SCORE_BANDS = {
  NORMAL:      { min: 0,  max: 29,  label: 'Normal' },
  INTERESTED:  { min: 30, max: 59,  label: 'Interested' },
  HIGH_INTENT: { min: 60, max: 79,  label: 'High Intent' },
  URGENT:      { min: 80, max: 100, label: 'Urgent' },
} as const

export function getScoreBand(score: number) {
  if (score >= 80) return SCORE_BANDS.URGENT
  if (score >= 60) return SCORE_BANDS.HIGH_INTENT
  if (score >= 30) return SCORE_BANDS.INTERESTED
  return SCORE_BANDS.NORMAL
}

// ── Supported languages ───────────────────────────────────────────────────────
export const SUPPORTED_LANGUAGES = ['zh', 'en', 'ms'] as const
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]

// ── Customer tags ─────────────────────────────────────────────────────────────
export const CUSTOMER_TAGS = [
  'new_customer', 'old_customer', 'high_intent', 'price_inquiry',
  'quoted', 'booked', 'waiting_reply', 'needs_follow_up',
  'needs_human', 'complaint', 'after_sales', 'technical_issue',
  'payment_issue', 'won', 'lost', 'blacklist',
] as const
export type CustomerTag = typeof CUSTOMER_TAGS[number]

// ── Pagination helper ─────────────────────────────────────────────────────────
export interface PaginatedResult<T> {
  data:    T[]
  total:   number
  page:    number
  perPage: number
}

// ── Queue types ───────────────────────────────────────────────────────────────
export { QUEUE_NAMES, JOB_NAMES } from './queue-types'
export type { QueueName, InboundMessageJobData, FollowUpEvaluationJobData } from './queue-types'

// ── API Key Vault ─────────────────────────────────────────────────────────────
export {
  isVaultConfigured, encryptApiKey, decryptApiKey, extractLast4, validateKeyShape,
  KEY_PROVIDERS,
} from './api-key-vault'
export type { KeyProvider } from './api-key-vault'

// ── AI types ──────────────────────────────────────────────────────────────────
export { AI_PROVIDERS, isValidProviderModel, getModelsForProvider } from './ai-types'
export type {
  AiProvider, ReplyLanguagePolicy, AiModelOption,
  TenantAiConfig, CustomerProfile, MessageHistory, KnowledgeSnippet,
  AiAgentInput, AiAgentResult,
} from './ai-types'
