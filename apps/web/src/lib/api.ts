// Omni API client — web dashboard (Phase 8A → 11B)
// Uses localStorage for JWT storage (dev/Phase-8A only; replace with httpOnly cookie in prod)

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:43111'
const TOKEN_KEY = 'omni_access_token'

// ── Auth storage ──────────────────────────────────────────────────────────────
export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// ── Base fetch ────────────────────────────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const tok = token ?? getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...(init.headers as Record<string, string> ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface LoginResult {
  accessToken:  string
  refreshToken: string
  user: { id: string; email: string; role: string; tenantId: string }
}

export interface ConversationSummary {
  id:             string
  status:         string
  needsHuman:     boolean
  unreadCount:    number
  lastMessageAt:  string | null
  assignedUserId: string | null
  customer: {
    id:           string
    name:         string | null
    phone:        string
    whatsappName: string | null
    stage:        string
    score:        number
    tags:         string[]
  }
  channel: { id: string; type: string; displayName: string | null }
  lastMessage: {
    id:         string
    content:    string
    direction:  string
    senderType: string
    createdAt:  string
  } | null
}

export interface ConversationDetail extends ConversationSummary {
  messages:     Message[]
  messageCount: number
}

export interface Message {
  id:             string
  conversationId: string
  direction:      string
  senderType:     string
  content:        string
  isRead:         boolean
  createdAt:      string
}

export interface ConversationListResponse {
  data:       ConversationSummary[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export interface MessageListResponse {
  data:       Message[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type ConversationFilter = 'all' | 'needs_human' | 'ai_handling' | 'high_intent'

export interface CustomerDetail {
  id:           string
  tenantId:     string
  name:         string | null
  phone:        string
  whatsappName: string | null
  company:      string | null
  stage:        string
  score:        number
  tags:         string[]
  notes:        string | null
  nextFollowUpAt: string | null
  conversationCount: number
  lastMessageAt: string | null
  recentConversations: { id: string; status: string; lastMessageAt: string | null }[]
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Bearer mode: tokens returned in body, stored in localStorage. */
export async function login(tenantSlug: string, email: string, password: string): Promise<LoginResult> {
  const result = await apiFetch<LoginResult>('/auth/login', {
    method: 'POST',
    body:   JSON.stringify({ tenantSlug, email, password }),
  })
  setToken(result.accessToken)
  return result
}

/**
 * Cookie mode: httpOnly SameSite=Strict cookies set by server.
 * No token stored in localStorage; browser sends cookies automatically.
 * SSE /realtime/events still needs getToken() for ?token= param.
 */
export async function loginCookieMode(
  tenantSlug: string,
  email: string,
  password: string,
): Promise<{ user: LoginResult['user']; cookieMode: true }> {
  return apiFetch<{ user: LoginResult['user']; cookieMode: true }>(
    '/auth/login?mode=cookie',
    {
      method:      'POST',
      body:        JSON.stringify({ tenantSlug, email, password }),
      credentials: 'include',  // send/receive cookies
    },
  )
}

/** Refresh via cookie (no localStorage). */
export async function refreshCookie(): Promise<{ cookieMode: true }> {
  return apiFetch<{ cookieMode: true }>('/auth/refresh?mode=cookie', {
    method:      'POST',
    credentials: 'include',
  })
}

export async function getMe(): Promise<LoginResult['user']> {
  return apiFetch<LoginResult['user']>('/auth/me')
}

// ── Conversations ─────────────────────────────────────────────────────────────
export async function fetchConversations(
  filter: ConversationFilter = 'all',
  q?: string,
): Promise<ConversationListResponse> {
  const params = new URLSearchParams({ pageSize: '30', sort: 'lastMessageAt' })
  if (filter === 'needs_human') params.set('handoff', 'true')
  if (filter === 'ai_handling') params.set('status', 'AI_HANDLING')
  if (filter === 'high_intent') params.set('status', 'AI_HANDLING')  // refined by score in UI
  if (q?.trim()) params.set('q', q.trim())
  return apiFetch<ConversationListResponse>(`/conversations?${params}`)
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
  return apiFetch<ConversationDetail>(`/conversations/${id}`)
}

export async function fetchMessages(id: string, page = 1): Promise<MessageListResponse> {
  return apiFetch<MessageListResponse>(`/conversations/${id}/messages?page=${page}&pageSize=50`)
}

// ── Actions ───────────────────────────────────────────────────────────────────
export async function takeoverConversation(id: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/conversations/${id}/takeover`, { method: 'POST' })
}

export async function releaseAi(id: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/conversations/${id}/release-ai`, { method: 'POST' })
}

export async function sendMessage(conversationId: string, body: string): Promise<Message & { sendStatus: string }> {
  return apiFetch<Message & { sendStatus: string }>('/messages/send', {
    method: 'POST',
    body:   JSON.stringify({ conversationId, body }),
  })
}

// ── Customer actions ──────────────────────────────────────────────────────────
export async function fetchCustomer(id: string): Promise<CustomerDetail> {
  return apiFetch<CustomerDetail>(`/customers/${id}`)
}

export async function updateCustomerStage(id: string, stage: string): Promise<CustomerDetail> {
  return apiFetch<CustomerDetail>(`/customers/${id}/stage`, {
    method: 'PATCH',
    body:   JSON.stringify({ stage }),
  })
}

export async function setCustomerTags(id: string, tags: string[]): Promise<{ customerId: string; tags: string[] }> {
  return apiFetch<{ customerId: string; tags: string[] }>(`/customers/${id}/tags`, {
    method: 'PATCH',
    body:   JSON.stringify({ tags }),
  })
}

export async function addCustomerTag(id: string, tag: string): Promise<{ customerId: string; tags: string[] }> {
  return apiFetch<{ customerId: string; tags: string[] }>(`/customers/${id}/tags`, {
    method: 'POST',
    body:   JSON.stringify({ tag }),
  })
}

export async function removeCustomerTag(id: string, tag: string): Promise<{ customerId: string; tags: string[] }> {
  return apiFetch<{ customerId: string; tags: string[] }>(`/customers/${id}/tags/${encodeURIComponent(tag)}`, {
    method: 'DELETE',
  })
}

// ── Follow-up tasks ───────────────────────────────────────────────────────────
export interface FollowUpTask {
  id:              string
  tenantId:        string
  conversationId:  string
  customerId:      string
  scenario:        string
  stepIndex:       number
  dueAt:           string
  status:          'PENDING' | 'DONE' | 'CANCELLED' | 'SKIPPED'
  requiresHuman:   boolean
  suggestedMessage: string | null
  cancelledReason: string | null
  customer: {
    id:    string
    name:  string | null
    phone: string
    stage: string
    score: number
  }
  conversation: {
    id:      string
    status:  string
    channelId: string
  }
}

export interface FollowUpListResponse {
  data:       FollowUpTask[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export async function fetchFollowUps(params?: {
  today?:         boolean
  overdue?:       boolean
  requiresHuman?: boolean
  status?:        string
}): Promise<FollowUpListResponse> {
  const p = new URLSearchParams({ pageSize: '50' })
  if (params?.today)         p.set('today', 'true')
  if (params?.overdue)       p.set('overdue', 'true')
  if (params?.requiresHuman !== undefined) p.set('requiresHuman', String(params.requiresHuman))
  if (params?.status)        p.set('status', params.status)
  return apiFetch<FollowUpListResponse>(`/follow-ups?${p}`)
}

export async function completeFollowUp(id: string): Promise<{ taskId: string; status: string }> {
  return apiFetch<{ taskId: string; status: string }>(`/follow-ups/${id}/complete`, { method: 'POST' })
}

export async function cancelFollowUp(id: string): Promise<{ taskId: string; status: string }> {
  return apiFetch<{ taskId: string; status: string }>(`/follow-ups/${id}/cancel`, { method: 'POST' })
}

// ── Conversation close ────────────────────────────────────────────────────────
export async function closeConversation(id: string): Promise<{ conversationId: string; status: string }> {
  return apiFetch<{ conversationId: string; status: string }>(`/conversations/${id}/close`, { method: 'POST' })
}

// ── Boss Dashboard (Phase 11A) ────────────────────────────────────────────────
export interface ActionItem {
  priority:    'urgent' | 'high' | 'normal'
  type:        string
  label:       string
  count?:      number
  hint?:       string
  link?:       string
}

export interface BossToday {
  tenantId:       string
  asOf:           string
  today: {
    newCustomers:          number
    needHuman:             number
    highIntentCustomers:   number
    overdueFollowUps:      number
    dueFollowUpsToday:     number
    humanRemindersPending: number
    openConversations:     number
    closedToday:           number
    aiReplies:             number
    aiCostUsd:             number
  }
  urgentCustomers: {
    conversationId: string
    status:         string
    lastMessageAt:  string | null
    customer:       { id: string; name: string | null; phone: string; stage: string; score: number }
  }[]
  suggestedActions: ActionItem[]
}

export interface BossMetrics {
  tenantId: string
  asOf:     string
  customers: { total: number; new30d: number; highIntent: number; stageBreakdown: Record<string, number> }
  conversations: { open: number; pendingHandoff: number; closedToday: number; closed30d: number }
  followUps: { pending: number; overdue: number; completed30d: number }
  usage30d: { aiReplies: number; llmTokens: number; estimatedCostUsd: number }
}

export async function fetchBossToday(): Promise<BossToday> {
  return apiFetch<BossToday>('/boss/today')
}

export async function fetchBossMetrics(): Promise<BossMetrics> {
  return apiFetch<BossMetrics>('/boss/metrics')
}

// ── Boss Pipeline + Agents (Phase 11B) ───────────────────────────────────────
export interface PipelineFunnelItem {
  stage:            string
  count:            number
  overdueFollowUps: number
  pendingFollowUps: number
}

export interface BossPipeline {
  tenantId:  string
  range:     string
  asOf:      string
  funnel:    PipelineFunnelItem[]
  summary: {
    totalLeads:         number
    newSince:           number
    wonSince:           number
    lostSince:          number
    highIntentNoOwner:  number
    pipelineHealthPct:  number
    note:               string
  }
}

export interface AgentStats {
  userId:            string
  name:              string
  email:             string
  role:              string
  openConversations: number
  closedLast30d:     number
  handledLast30d:    number
}

export interface BossAgents {
  tenantId:   string
  agents:     AgentStats[]
  unassigned: number
}

export async function fetchBossPipeline(range?: string): Promise<BossPipeline> {
  const q = range ? `?range=${range}` : ''
  return apiFetch<BossPipeline>(`/boss/pipeline${q}`)
}

export async function fetchBossAgents(): Promise<BossAgents> {
  return apiFetch<BossAgents>('/boss/agents')
}

// ── Onboarding Wizard (Phase 11B → 12A) ──────────────────────────────────────
export interface OnboardingStatus {
  tenantId:        string
  hasStarted:      boolean
  status:          string | null
  completedSteps:  number
  companyName:     string | null
  industry:        string | null
  goalsCount:      number
  hasPreview:      boolean
  enabledAt:       string | null
  generationMode:  string | null
  ingestedKbCount: number
}

export interface FaqSample { question: string; answer: string }
export interface ScoringRule { trigger: string; adjustment: number; description: string }

export interface OnboardingPreview {
  aiPersona:           { name: string; tone: string; focus: string; company: string }
  globalSystemPrompt:  string
  welcomeMessage:      string
  faqCategories:       string[]
  faqSamples:          FaqSample[]
  leadStages:          string[]
  recommendedTags:     string[]
  followUpScenarios:   string[]
  handoffTriggers:     string[]
  scoringRules:        ScoringRule[]
  missingInfoWarnings: string[]
  replyLanguagePolicy: string
  generatedAt:         string
  generationMode:      'DETERMINISTIC_TEMPLATE' | 'AI_GENERATED' | 'AI_FALLBACK'
  note:                string
  ingestedAt?:         string
  ingestedKbCount?:    number
}

export async function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  return apiFetch<OnboardingStatus>('/onboarding/status')
}

export async function saveOnboardingDraft(data: Record<string, unknown>): Promise<{ saved: boolean }> {
  return apiFetch<{ saved: boolean }>('/onboarding/draft', {
    method: 'POST',
    body:   JSON.stringify(data),
  })
}

export async function generateOnboardingPreview(
  mode?: 'deterministic' | 'ai',
): Promise<{ preview: OnboardingPreview; saved: boolean }> {
  const q = mode ? `?mode=${mode}` : ''
  return apiFetch<{ preview: OnboardingPreview; saved: boolean }>(
    `/onboarding/generate-preview${q}`,
    { method: 'POST' },
  )
}

export async function ingestOnboardingMaterials(): Promise<{
  ingested:    boolean
  alreadyDone: boolean
  count:       number
  tenantId:    string
}> {
  return apiFetch('/onboarding/ingest-materials', { method: 'POST' })
}

export async function enableOnboarding(): Promise<{ enabled: boolean; status: string; note: string }> {
  return apiFetch<{ enabled: boolean; status: string; note: string }>('/onboarding/enable', { method: 'POST' })
}

// ── Round-8: Product Intelligence + Sales Config Generator ───────────────────
export interface ProductSetupInput {
  productId?:            string
  productName:           string
  productCategory?:      string
  suitableCustomers?:    string
  sellingPoints?:        string
  pricing?:              string
  purchaseFlow?:         string
  requiredCustomerInfo?: string
  handoffConditions?:    string
  extraNotes?:           string
  pastedMaterialText?:   string
  referenceUrl?:         string
  uploadedFile?:         { filename?: string; sizeBytes?: number; mimeType?: string; extractedText?: string }
  desiredFaqCount?:      number
}

export interface FaqDraft {
  id:           string
  question:     string
  answer:       string
  category:     string
  productName:  string
  isSelected:   boolean
  source:       'generated_draft'
}

export interface SalesScript           { title: string; scenario: string; script: string; tone: 'friendly' | 'professional' | 'concise' }
export interface QualificationQuestion { question: string; purpose: string }
export interface LeadScoringRuleDraft  { trigger: string; adjustment: number; description: string }
export interface FollowUpRuleDraft     { scenario: string; delay: string; message: string; description: string }
export interface HandoffRuleDraft      { trigger: string; description: string }

export interface ProductProfile {
  summary:           string
  suitableCustomers: string
  sellingPoints:     string
  pricing:           string
  purchaseFlow:      string
  restrictions:      string
  afterSales:        string
  aiReplyBoundary:   string
}

export interface ProductSalesConfig {
  productId:              string
  productName:            string
  generatedAt:            string
  mode:                   'deterministic_stub'
  productProfile:         ProductProfile
  faqDrafts:              FaqDraft[]
  salesScripts:           SalesScript[]
  qualificationQuestions: QualificationQuestion[]
  suggestedTags:          string[]
  leadScoringRules:       LeadScoringRuleDraft[]
  followUpRules:          FollowUpRuleDraft[]
  handoffRules:           HandoffRuleDraft[]
  summary: {
    faqCount:           number
    pricingFaqCount:    number
    handoffFaqCount:    number
    objectionFaqCount:  number
    processFaqCount:    number
    missingFields:      string[]
    hasPricing:         boolean
    hasPurchaseFlow:    boolean
    hasUploadedFile:    boolean
    hasReferenceUrl:    boolean
    materialCharCount:  number
    coverageNote:       string
  }
}

export type ProductSetupStatus =
  | 'PENDING_INPUT'
  | 'PENDING_GENERATION'
  | 'GENERATED'
  | 'FAQ_SAVED'
  | 'ENABLED'

export interface ProductSetupRecord extends ProductSetupInput {
  productId:     string
  productName:   string
  salesConfig?:  ProductSalesConfig
  status?:       ProductSetupStatus
  lastUpdatedAt?: string
}

export async function generateProductSalesConfig(
  input: ProductSetupInput,
): Promise<{ config: ProductSalesConfig; tenantId: string; mode: string; realAiProviderCalled: false; note: string }> {
  return apiFetch('/onboarding/products/generate-sales-config', {
    method: 'POST',
    body:   JSON.stringify(input),
  })
}

export async function saveProductSalesConfig(
  products: ProductSetupRecord[],
): Promise<{ saved: boolean; productCount: number; draftId: string; updatedAt: string }> {
  return apiFetch('/onboarding/products/save-sales-config', {
    method: 'POST',
    body:   JSON.stringify({ products }),
  })
}

export async function saveFaqToKnowledge(
  productName: string,
  faqs: Array<{ question: string; answer: string; category?: string; language?: string }>,
): Promise<{ saved: number; skippedDuplicates: number; knowledgeItemIds: string[]; productName: string; note: string }> {
  return apiFetch('/onboarding/products/save-faq-to-knowledge', {
    method: 'POST',
    body:   JSON.stringify({ productName, faqs }),
  })
}

// ── Round-9A: Quota + AI Smart Reply + Add-ons ───────────────────────────────
export interface QuotaCounter           { included: number; used: number; remaining: number; overLimit: boolean }
export interface QuotaCounterWithCredits extends QuotaCounter {
  monthlyIncluded:  number
  monthlyUsed:      number
  monthlyRemaining: number
  purchasedCredits: number
  totalRemaining:   number
}
export interface QuotaSummary {
  plan: {
    id:                  string
    name:                string
    priceRm:             number
    period:              'monthly'
    metaApiFeeIncluded:  false
    metaApiFeeNote:      string
    visibleRoles:        string[]
    aiSmartReplyDefault: boolean
    launchCommitmentOffer?: {
      priceRm:           number
      period:            'monthly'
      commitmentMonths:  number
      upfront:           number
      originalSixMonth:  number
      savings:           number
      note:              string
    }
  }
  aiSmartReplyEnabled: boolean
  whatsapp:    QuotaCounter
  products:    QuotaCounter
  faq:         QuotaCounterWithCredits
  aiReply:     QuotaCounterWithCredits
  teamUsers:   QuotaCounter
  warnings:    string[]
  cta:         { productExpansion?: string; faqCredits?: string; aiReplyCredits?: string }
  addOns:      Array<{ id: string; kind: string; tier: string; priceRm: number; recurring: string; slots?: number; credits?: number; label: string; validMonths?: number }>
  recommendedAddOnIds: string[]
  metaApiFeeNote: string
}

export async function fetchQuotaSummary(): Promise<QuotaSummary> {
  return apiFetch<QuotaSummary>('/billing/quota-summary')
}

export async function setAiSmartReply(enabled: boolean): Promise<{ aiSmartReplyEnabled: boolean }> {
  return apiFetch('/billing/ai-smart-reply', { method: 'POST', body: JSON.stringify({ enabled }) })
}

export async function createPurchaseIntent(addOnId: string): Promise<{ intentId: string; addOn: { id: string; label: string; priceRm: number; recurring: string }; status: 'pending'; charged: false; note: string }> {
  return apiFetch('/billing/purchase-intent', { method: 'POST', body: JSON.stringify({ addOnId }) })
}

export async function processStubPaymentEvent(args: { intentId: string; externalEventId: string; status: 'success' | 'failed' | 'pending'; note?: string }): Promise<{ applied: boolean; status: string; ledgerEntryId: string; alreadyProcessed: boolean; note: string }> {
  return apiFetch('/billing/payment-event', { method: 'POST', body: JSON.stringify(args) })
}

export async function fetchPlanDefinitions(): Promise<{
  plans: Record<string, unknown>
  addOns: QuotaSummary['addOns']
  recommendedAddOnIds: Record<string, string[]>
  metaApiFeeNote: string
}> {
  return apiFetch('/billing/plan-definitions')
}

// ── Knowledge Base (Phase 12A) ────────────────────────────────────────────────
export interface KnowledgeItem {
  id:        string
  tenantId:  string
  type:      'GLOBAL_FAQ' | 'PRODUCT_FAQ' | 'KNOWLEDGE_CHUNK'
  question:  string | null
  answer:    string
  language:  string
  isActive:  boolean
  createdAt: string
  updatedAt: string
}

export interface KnowledgeListResponse {
  data:       KnowledgeItem[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export async function fetchKnowledgeItems(params?: {
  type?:     string
  page?:     number
  q?:        string
  isActive?: boolean
}): Promise<KnowledgeListResponse> {
  const p = new URLSearchParams({ pageSize: '50' })
  if (params?.type)                        p.set('type', params.type)
  if (params?.page)                        p.set('page', String(params.page))
  if (params?.q)                           p.set('q', params.q)
  if (params?.isActive !== undefined)      p.set('isActive', String(params.isActive))
  return apiFetch<KnowledgeListResponse>(`/knowledge?${p}`)
}

export async function createKnowledgeItem(data: {
  type:       string
  question?:  string
  answer:     string
  language?:  string
}): Promise<KnowledgeItem> {
  return apiFetch<KnowledgeItem>('/knowledge', {
    method: 'POST',
    body:   JSON.stringify(data),
  })
}

export async function updateKnowledgeItem(id: string, data: {
  type?:      string
  question?:  string | null
  answer?:    string
  language?:  string
  isActive?:  boolean
}): Promise<KnowledgeItem> {
  return apiFetch<KnowledgeItem>(`/knowledge/${id}`, {
    method: 'PATCH',
    body:   JSON.stringify(data),
  })
}

export async function deleteKnowledgeItem(id: string): Promise<{ id: string; isActive: boolean }> {
  return apiFetch<{ id: string; isActive: boolean }>(`/knowledge/${id}`, { method: 'DELETE' })
}

// ── Channel Setup (Phase 12B) ─────────────────────────────────────────────────
export interface ChannelSetupStatus {
  tenantId:             string
  channelType:          string | null
  displayName:          string | null
  phoneLast4:           string | null
  setupStatus:          string
  credentialStatus:     string
  credentialLast4:      string | null
  testStatus:           string
  lastTestAt:           string | null
  realWaSessionEnabled: boolean
  realMetaSendEnabled:  boolean
  activationNotes:      string | null
  createdAt:            string
  updatedAt:            string
}

export interface ChannelSetupTestResult {
  tenantId:               string
  testResult:             'STUB' | 'OK' | 'FAILED'
  connected:              boolean
  realWaSessionEnabled:   boolean
  realMetaSendEnabled:    boolean
  metaApiCalled:          boolean
  whatsappSessionStarted: boolean
  testedAt:               string
  setupStatus:            string
  note:                   string
}

export interface CredentialsStatus {
  tenantId:         string
  credentialStatus: string
  credentialLast4:  string | null
  setupStatus:      string
  channelType:      string | null
  vaultConfigured:  boolean
  hasStoredRef:     boolean
  note:             string
}

export interface ActivationResult {
  tenantId:             string
  activated:            boolean
  blocked:              boolean
  missingConditions?:   string[]
  blockers?:            string[]
  setupStatus:          string
  realWaSessionEnabled: boolean
  realMetaSendEnabled:  boolean
  note:                 string
}

export async function fetchChannelSetupStatus(): Promise<ChannelSetupStatus> {
  return apiFetch<ChannelSetupStatus>('/channels/setup/status')
}

export async function saveChannelSetupDraft(data: {
  channelType?: string
  displayName?: string
  phoneNumber?: string
}): Promise<ChannelSetupStatus & { saved: boolean; note: string }> {
  return apiFetch('/channels/setup/save-draft', {
    method: 'POST',
    body:   JSON.stringify(data),
  })
}

export async function testChannelSetup(channelType?: string): Promise<ChannelSetupTestResult> {
  return apiFetch<ChannelSetupTestResult>('/channels/setup/test', {
    method: 'POST',
    body:   JSON.stringify({ channelType }),
  })
}

export async function saveCredentialsDraft(data: {
  wabaId?:        string
  phoneNumberId?: string
  accessToken?:   string
  metaAppSecret?: string
  channelType?:   string
}): Promise<{
  saved:            boolean
  credentialStatus: string
  credentialLast4:  string | null
  setupStatus:      string
  vaultConfigured:  boolean
  note:             string
}> {
  return apiFetch('/channels/setup/credentials-draft', {
    method: 'POST',
    body:   JSON.stringify(data),
  })
}

export async function fetchCredentialsStatus(): Promise<CredentialsStatus> {
  return apiFetch<CredentialsStatus>('/channels/setup/credentials-status')
}

export async function clearCredentials(): Promise<{ cleared: boolean; credentialStatus: string; setupStatus: string }> {
  return apiFetch('/channels/setup/credentials', { method: 'DELETE' })
}

export async function requestActivation(): Promise<ActivationResult> {
  return apiFetch<ActivationResult>('/channels/setup/request-activation', { method: 'POST' })
}

export async function confirmActivation(): Promise<ActivationResult & { realSessionStarted: boolean; realSendEnabled: boolean }> {
  return apiFetch('/channels/setup/confirm-activation', { method: 'POST' })
}

// ── Meta Webhook Setup (Phase 13B) ────────────────────────────────────────────
export interface MetaWebhookStatus {
  tenantId:            string
  channelType:         string | null
  credentialStatus:    string
  webhookSubscribed:   boolean
  verifyTokenSet:      boolean
  verifyTokenLast4:    string | null
  stepCompleted:       number
  webhookCallbackNote: string
  realMetaSendEnabled: boolean
  note:                string
}

export async function fetchMetaWebhookStatus(): Promise<MetaWebhookStatus> {
  return apiFetch<MetaWebhookStatus>('/channels/setup/meta-webhook/status')
}

export async function saveMetaWebhookDraft(data: {
  webhookSubscribed?: boolean
  verifyTokenHint?:   string
  stepCompleted?:     number
  wabaId?:            string
  phoneNumberId?:     string
}): Promise<{ saved: boolean; stepCompleted: number; webhookSubscribed: boolean; verifyTokenSet: boolean; verifyTokenLast4: string | null; note: string }> {
  return apiFetch('/channels/setup/meta-webhook/save-draft', {
    method: 'POST',
    body:   JSON.stringify(data),
  })
}

export async function testMetaWebhookStub(): Promise<{ testResult: string; metaApiCalled: boolean; webhookVerified: boolean; note: string }> {
  return apiFetch('/channels/setup/meta-webhook/test-stub', { method: 'POST' })
}

// ── Launch Checklist (Phase 13B) ──────────────────────────────────────────────
export interface ChecklistItem {
  key:    string
  label:  string
  status: 'DONE' | 'PENDING' | 'WARN' | 'BLOCKED' | 'SKIP'
  action: string | null
  detail: string
}

export interface LaunchChecklist {
  tenantId:    string
  launchStatus: 'NOT_READY' | 'READY_FOR_STAGING' | 'READY_FOR_PRODUCTION_REVIEW'
  launchNote:  string
  items:       ChecklistItem[]
  summary:     { done: number; pending: number; warn: number; blocked: number; skip: number }
  safety: {
    realWaSessionEnabled: boolean
    realMetaSendEnabled:  boolean
    aiProviderEnabled:    boolean
    realSendActive:       boolean
  }
}

export async function fetchLaunchChecklist(): Promise<LaunchChecklist> {
  return apiFetch<LaunchChecklist>('/channels/setup/launch-checklist')
}

// ── Test Message Stub (Phase 13B) ─────────────────────────────────────────────
export async function testMessageStub(data: {
  toPhone:     string
  message:     string
  channelType?: string
}): Promise<{
  tenantId:        string
  sendStatus:      'STUB_NOT_SENT'
  toPhoneMasked:   string
  channelType:     string
  messagePreview:  string
  wouldSendLength: number
  realSent:        boolean
  metaApiCalled:   boolean
  waSessionUsed:   boolean
  blockedReason:   string
  channelReady:    boolean
  note:            string
}> {
  return apiFetch('/channels/setup/test-message-stub', {
    method: 'POST',
    body:   JSON.stringify(data),
  })
}

// ── Phase 14A: WA Web Guarded Activation ─────────────────────────────────────
export interface WaWebStatus {
  tenantId:            string
  channelType:         string | null
  setupStatus:         string
  waSessionAllowed:    boolean
  sessionStatus:       string
  channelExists:       boolean
  channelIsActive:     boolean
  qrAvailable:         boolean
  missingConditions:   string[]
  realSessionStarted:  boolean
  note:                string
}

export async function fetchWaWebStatus(): Promise<WaWebStatus> {
  return apiFetch<WaWebStatus>('/channels/setup/wa-web/status')
}

export async function requestWaWebQr(): Promise<{
  tenantId:             string
  qrIssued:             boolean
  blocked:              boolean
  missingConditions?:   string[]
  implementationStatus?: string
  realSessionStarted:   boolean
  note:                 string
  nextStep?:            string
}> {
  return apiFetch('/channels/setup/wa-web/request-qr', { method: 'POST' })
}

export async function fetchWaWebSessionStatus(): Promise<{
  tenantId:         string
  waSessionAllowed: boolean
  channelExists:    boolean
  channelIsActive:  boolean
  hasSessionRef:    boolean
  sessionStatus:    string
  lastUpdatedAt:    string | null
  realSessionData:  boolean
  note:             string
}> {
  return apiFetch('/channels/setup/wa-web/session-status')
}

export async function disconnectWaWeb(): Promise<{
  tenantId:      string
  disconnected:  boolean
  channelFound?: boolean
  channelId?:    string
  note:          string
}> {
  return apiFetch('/channels/setup/wa-web/disconnect', { method: 'POST' })
}

// ── Phase 14A: Meta Live Webhook Guardrails ───────────────────────────────────
export interface MetaLiveStatus {
  tenantId:           string
  liveStatus:         string
  metaSendAllowed:    boolean
  credentialStatus:   string
  webhookSubscribed:  boolean
  verifyTokenSet:     boolean
  missingConditions:  string[]
  realMetaApiCalled:  boolean
  note:               string
}

export async function fetchMetaLiveStatus(): Promise<MetaLiveStatus> {
  return apiFetch<MetaLiveStatus>('/channels/setup/meta-webhook/live-status')
}

export async function requestMetaLiveTest(): Promise<{
  tenantId:          string
  testInitiated:     boolean
  blocked:           boolean
  missingConditions: string[]
  realMetaApiCalled: boolean
  note:              string
}> {
  return apiFetch('/channels/setup/meta-webhook/request-live-test', { method: 'POST' })
}

export async function confirmMetaLiveTest(): Promise<{
  tenantId:          string
  confirmed:         boolean
  blocked:           boolean
  realMetaApiCalled: boolean
  realSendEnabled:   boolean
  note:              string
}> {
  return apiFetch('/channels/setup/meta-webhook/confirm-live-test', { method: 'POST' })
}

// ── Phase 14A: Channel Health ─────────────────────────────────────────────────
export interface ChannelHealth {
  tenantId:         string
  asOf:             string
  lastCheckedAt:    string
  channelType:      string | null
  setupStatus:      string
  credentialStatus: string
  healthLevel:      'OK' | 'WARN' | 'BLOCKED' | 'UNKNOWN'
  liveStatus:       string
  realSendEnabled:  boolean
  nextAction?:      string
  links:            { channelSetup: string; launchChecklist: string; waWebQr: string; metaWebhook: string }
}

export async function fetchChannelHealth(): Promise<ChannelHealth> {
  return apiFetch<ChannelHealth>('/boss/channel-health')
}

// ── Phase 14B: QR State + Start Guarded + Staging Readiness ──────────────────
export interface WaWebQrState {
  tenantId:          string
  qrAvailable:       boolean
  qrPending:         boolean
  sessionActive:     boolean
  waSessionAllowed:  boolean
  channelType:       string | null
  setupStatus:       string
  missingConditions: string[]
  realSessionStarted:boolean
  note:              string
  operatorSteps:     string[]
}

export async function fetchWaWebQrState(): Promise<WaWebQrState> {
  return apiFetch<WaWebQrState>('/channels/setup/wa-web/qr-state')
}

export async function startWaWebGuarded(): Promise<{
  tenantId:             string
  started:              boolean
  blocked:              boolean
  missingConditions?:   string[]
  implementationStatus?: string
  realSessionStarted:   boolean
  note:                 string
  nextStep?:            string
}> {
  return apiFetch('/channels/setup/wa-web/start-guarded', { method: 'POST' })
}

export interface StagingReadiness {
  tenantId:    string
  stagingMode: {
    waWebQrReady:                boolean
    metaLiveTestReady:           boolean
    readyForManualActivationReview: boolean
    onboardingComplete:          boolean
    knowledgeBaseReady:          boolean
    channelConfigured:           boolean
    credentialsSaved:            boolean
    stubTestCompleted:           boolean
    activationRequested:         boolean
  }
  flags: {
    realSendDisabled:  boolean
    waSessionAllowed:  boolean
    metaSendAllowed:   boolean
  }
  stagingStatus: 'NOT_READY' | 'PARTIALLY_READY' | 'READY_FOR_MANUAL_ACTIVATION_REVIEW'
  stagingNote:   string
}

export async function fetchStagingReadiness(): Promise<StagingReadiness> {
  return apiFetch<StagingReadiness>('/channels/setup/staging-readiness')
}

// ── Phase 15A: Settings ───────────────────────────────────────────────────────
export interface SettingsOverview {
  tenantId:   string
  company:    { name: string | null; slug: string | null; plan: string; isActive: boolean; defaultLanguage: string; memberSince: string | null }
  onboarding: { status: string | null; companyName: string | null; industry: string | null; goalsCount: number; businessHours: string | null; hasPreview: boolean; enabledAt: string | null }
  knowledgeBase: { activeItems: number; ready: boolean }
  channel:    { type: string | null; setupStatus: string; credentialStatus: string; activeChannels: number; channels: { id: string; type: string; displayName: string }[] }
  safety:     { realSendEnabled: boolean; waSessionAllowed: boolean; metaSendAllowed: boolean; realSendDisabled: boolean }
  team:       { userCount: number; users: { id: string; name: string | null; email: string; role: string }[]; rbacNote: string }
  links:      Record<string, string>
}

export async function fetchSettingsOverview(): Promise<SettingsOverview> {
  return apiFetch<SettingsOverview>('/settings/overview')
}

export async function updateCompanyProfile(data: {
  companyName?:   string
  industry?:      string
  businessHours?: string
  website?:       string
  serviceArea?:   string
}): Promise<{ saved: boolean; companyName: string | null; industry: string | null }> {
  return apiFetch('/settings/company-profile', {
    method: 'PATCH',
    body:   JSON.stringify(data),
  })
}

// ── Phase 15A: Billing ────────────────────────────────────────────────────────
export interface BillingPlan {
  id:             string
  name:           string
  priceRm:        number
  period:         string
  channels:       number
  users:          number
  features:       string[]
  limits:         { aiRepliesPerMonth: number; customersPerMonth: number; knowledgeItems: number }
  metaApiFeeNote: string
  ordinaryWaNote: string
  noBroadcastNote:string
  recommended:    boolean
}

export interface UsageSummary {
  tenantId:    string
  period:      string
  currentPlan: string
  usage: {
    aiRepliesThisMonth:   number
    llmTokensThisMonth:   number
    estimatedCostUsd:     number
    estimatedCostRm:      number
    customers:            number
    activeKnowledgeItems: number
  }
  planLimits:  { aiRepliesPerMonth: number; customersPerMonth: number; knowledgeItems: number }
  metaFeeNote: string
}

export async function fetchBillingPlans(): Promise<{
  tenantId:       string
  currentPlan:    string
  plans:          BillingPlan[]
  boundary:       Record<string, string>
  paymentGateway: string
  note:           string
}> {
  return apiFetch('/billing/plans')
}

export async function fetchUsageSummary(): Promise<UsageSummary> {
  return apiFetch<UsageSummary>('/billing/usage-summary')
}

export async function selectPlanDraft(planId: string): Promise<{
  saved:          boolean
  selectedPlan:   string
  priceRm:        number
  charged:        boolean
  paymentGateway: string
  note:           string
}> {
  return apiFetch('/billing/select-plan-draft', {
    method: 'POST',
    body:   JSON.stringify({ planId }),
  })
}

// ── Phase 15B: Team Management ───────────────────────────────────────────────
export interface TeamMember {
  id:        string
  name:      string | null
  email:     string
  role:      string
  isActive:  boolean
  createdAt: string
}

export interface TeamMembersResponse {
  tenantId: string
  total:    number
  active:   number
  members:  TeamMember[]
}

export async function fetchTeamMembers(): Promise<TeamMembersResponse> {
  return apiFetch<TeamMembersResponse>('/team/members')
}

export async function inviteDraft(data: {
  email: string
  name?:  string
  role?:  string
}): Promise<{
  tenantId:  string
  invited:   { email: string; name: string | null; role: string }
  emailSent: false
  stub:      boolean
  note:      string
  action:    string
}> {
  return apiFetch('/team/invite-draft', {
    method: 'POST',
    body:   JSON.stringify(data),
  })
}

export async function updateMemberRole(id: string, role: string): Promise<{ saved: boolean; tenantId: string; user: TeamMember }> {
  return apiFetch(`/team/members/${id}/role`, {
    method: 'PATCH',
    body:   JSON.stringify({ role }),
  })
}

export async function updateMemberStatus(id: string, isActive: boolean): Promise<{ saved: boolean; tenantId: string; user: TeamMember }> {
  return apiFetch(`/team/members/${id}/status`, {
    method: 'PATCH',
    body:   JSON.stringify({ isActive }),
  })
}

// ── Phase 15A: Production QA ──────────────────────────────────────────────────
export interface QaItem {
  id:       string
  category: string
  label:    string
  status:   'PASS' | 'FAIL' | 'WARN' | 'MANUAL'
  detail:   string
  action?:  string
}

export interface ProductionQaResult {
  tenantId:      string
  asOf:          string
  overallStatus: string
  summary:       { passed: number; failed: number; warned: number; manual: number; total: number }
  items:         QaItem[]
  operatorNote:  string
}

export async function fetchProductionQa(): Promise<ProductionQaResult> {
  return apiFetch<ProductionQaResult>('/production-qa/checklist')
}

// ── Cost Calculator (Phase 11A) ───────────────────────────────────────────────
export interface CostEstimate {
  ai:             { totalReplies: number; totalAiCostUsd: number; totalAiCostRm: number }
  meta:           { estimatedConversations: number; totalMetaCostUsd: number; totalMetaCostRm: number; note: string }
  infrastructure: { serverCostUsd: number; supportCostUsd: number }
  totals:         { totalCostUsd: number; totalCostRm: number; costPerTenantRm: number }
  revenue:        { selectedPackage: string; packagePriceRm: number; totalRevenueRm: number; grossProfitRm: number; grossMarginPct: number }
  recommendation: { breakEvenRmPerTenant: number; suggestedMinPriceRm: number; advice: string }
  packages:       { name: string; priceRm: number; maxAgents: number; maxCustomers: number }[]
}

export async function fetchCostDefaults(): Promise<{ defaults: Record<string, number>; packages: { name: string; priceRm: number; features: readonly string[] }[] }> {
  return apiFetch('/admin/cost-calculator/defaults')
}

export async function estimateCost(input: Record<string, unknown>): Promise<CostEstimate> {
  return apiFetch<CostEstimate>('/admin/cost-calculator/estimate', {
    method: 'POST',
    body:   JSON.stringify(input),
  })
}

// ── Push notifications (Phase 10A stubs) ─────────────────────────────────────
export async function fetchVapidPublicKey(): Promise<{ publicKey: string | null; pushEnabled: boolean }> {
  return apiFetch<{ publicKey: string | null; pushEnabled: boolean }>('/notifications/vapid-public-key')
}

export async function subscribePushNotifications(subscription: {
  endpoint: string
  keys: { p256dh: string; auth: string }
}): Promise<{ subscribed: boolean; pushEnabled: boolean }> {
  return apiFetch<{ subscribed: boolean; pushEnabled: boolean }>('/notifications/subscribe', {
    method: 'POST',
    body:   JSON.stringify(subscription),
  })
}

export async function sendTestNotification(title?: string, body?: string): Promise<{ sent: boolean; stub: boolean }> {
  return apiFetch<{ sent: boolean; stub: boolean }>('/notifications/test', {
    method: 'POST',
    body:   JSON.stringify({ title, body }),
  })
}

export async function fetchNotificationStatus(): Promise<{ pushEnabled: boolean; activeSubscriptions: number }> {
  return apiFetch<{ pushEnabled: boolean; activeSubscriptions: number }>('/notifications/status')
}

// ── Audit Logs (Phase 15C) ────────────────────────────────────────────────────
export interface AuditLog {
  id:           string
  tenantId:     string
  actorUserId:  string | null
  actorRole:    string | null
  action:       string
  entityType:   string
  entityId:     string | null
  // Phase 18B: metadataJson removed from response. Use safeMetadata (whitelisted)
  // and summary (deterministic human-readable string) instead.
  safeMetadata: Record<string, unknown>
  summary:      string
  ip:           string | null
  createdAt:    string
}

export interface AuditLogsResponse {
  tenantId:   string
  pagination: { total: number; page: number; pageSize: number; pages: number }
  logs:       AuditLog[]
}

export async function fetchAuditLogs(params?: {
  page?:       number
  pageSize?:   number
  action?:     string
  entityType?: string
}): Promise<AuditLogsResponse> {
  const q = new URLSearchParams()
  if (params?.page)       q.set('page',       String(params.page))
  if (params?.pageSize)   q.set('pageSize',   String(params.pageSize))
  if (params?.action)     q.set('action',     params.action)
  if (params?.entityType) q.set('entityType', params.entityType)
  const qs = q.toString() ? `?${q}` : ''
  return apiFetch<AuditLogsResponse>(`/audit/logs${qs}`)
}

export async function createDemoAuditEvent(): Promise<{ created: boolean; action: string; stub: boolean }> {
  return apiFetch<{ created: boolean; action: string; stub: boolean }>('/audit/demo-event', { method: 'POST' })
}

// ── Tenant Self-service Signup (Phase 17A) ────────────────────────────────────
export interface SignupInput {
  businessName:      string
  slug:              string
  ownerName:         string
  ownerEmail:        string
  password:          string
  industry:          string
  channelPreference: string
  primaryGoal:       string
}

export interface SignupResult {
  tenantId:                   string
  slug:                       string
  businessName:               string
  ownerUserId:                string
  ownerEmail:                 string
  accessToken:                string
  refreshToken:               string
  emailVerificationRequired:  boolean
  emailVerificationMode:      string
  emailSent:                  boolean
  nextRoute:                  string
  onboardingDraftCreated:     boolean
  channelDraftCreated:        boolean
  starterKbCreated:           boolean
  safety: {
    realSendEnabled:    boolean
    broadcastEnabled:   boolean
    realMetaSendEnabled: boolean
    waSessionEnabled:   boolean
  }
  note: string
}

export async function tenantSignup(input: SignupInput): Promise<SignupResult> {
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:43111'
  const res = await fetch(`${API}/tenants/signup`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<SignupResult>
}

// ── SSE transport mode (from connected event) ─────────────────────────────────
export type SseTransport = 'redis' | 'memory' | 'unknown'

// ── SSE connection factory ────────────────────────────────────────────────────
export function createRealtimeConnection(
  onEvent: (type: string, data: Record<string, unknown>) => void,
  onConnect?: (transport: SseTransport) => void,
): EventSource | null {
  const token = getToken()
  if (!token || typeof EventSource === 'undefined') return null
  const src = new EventSource(`${API_BASE}/realtime/events?token=${encodeURIComponent(token)}`)

  src.addEventListener('connected', (e: MessageEvent) => {
    try {
      const payload = JSON.parse(e.data) as { transport?: string }
      onConnect?.((payload.transport as SseTransport) ?? 'unknown')
    } catch {
      onConnect?.('unknown')
    }
  })

  const eventTypes = [
    'conversation.message.created',
    'conversation.updated',
    'conversation.handoff.updated',
    'customer.updated',
    'ai.reply.created',   // Phase 8B: worker AI reply events
    'worker.job.failed',  // Phase 8B: worker failure notification
    'followup.created',   // Phase 9B: follow-up task scheduled
    'followup.updated',   // Phase 9B: follow-up task completed/cancelled
    'followup.due',       // Phase 9B: follow-up task processed by worker
  ]
  eventTypes.forEach((type) => {
    src.addEventListener(type, (e: MessageEvent) => {
      try { onEvent(type, JSON.parse(e.data) as Record<string, unknown>) }
      catch { /* ignore malformed */ }
    })
  })
  return src
}
