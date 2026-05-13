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

// ── Onboarding Wizard (Phase 11B) ─────────────────────────────────────────────
export interface OnboardingStatus {
  tenantId:       string
  hasStarted:     boolean
  status:         string | null
  completedSteps: number
  companyName:    string | null
  industry:       string | null
  goalsCount:     number
  hasPreview:     boolean
  enabledAt:      string | null
}

export interface OnboardingPreview {
  aiPersona:         { name: string; tone: string; focus: string; company: string }
  welcomeMessage:    string
  faqCategories:     string[]
  leadStages:        string[]
  recommendedTags:   string[]
  followUpScenarios: string[]
  generationMode:    string
  note:              string
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

export async function generateOnboardingPreview(): Promise<{ preview: OnboardingPreview; saved: boolean }> {
  return apiFetch<{ preview: OnboardingPreview; saved: boolean }>('/onboarding/generate-preview', { method: 'POST' })
}

export async function enableOnboarding(): Promise<{ enabled: boolean; status: string; note: string }> {
  return apiFetch<{ enabled: boolean; status: string; note: string }>('/onboarding/enable', { method: 'POST' })
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
