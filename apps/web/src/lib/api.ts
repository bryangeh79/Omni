// Omni API client — web dashboard (Phase 8A → 9A)
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
export async function login(tenantSlug: string, email: string, password: string): Promise<LoginResult> {
  const result = await apiFetch<LoginResult>('/auth/login', {
    method: 'POST',
    body:   JSON.stringify({ tenantSlug, email, password }),
  })
  setToken(result.accessToken)
  return result
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

// ── Conversation close ────────────────────────────────────────────────────────
export async function closeConversation(id: string): Promise<{ conversationId: string; status: string }> {
  return apiFetch<{ conversationId: string; status: string }>(`/conversations/${id}/close`, { method: 'POST' })
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
    'ai.reply.created',      // Phase 8B: worker AI reply events
    'worker.job.failed',     // Phase 8B: worker failure notification
  ]
  eventTypes.forEach((type) => {
    src.addEventListener(type, (e: MessageEvent) => {
      try { onEvent(type, JSON.parse(e.data) as Record<string, unknown>) }
      catch { /* ignore malformed */ }
    })
  })
  return src
}
