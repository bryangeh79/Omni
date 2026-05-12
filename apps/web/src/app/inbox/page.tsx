'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  login, clearToken, getToken,
  fetchConversations, fetchConversation, fetchMessages,
  takeoverConversation, releaseAi, sendMessage,
  createRealtimeConnection,
  type ConversationSummary, type ConversationDetail, type Message, type ConversationFilter,
} from '@/lib/api'

// ── Login Form ────────────────────────────────────────────────────────────────
function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [slug,  setSlug]  = useState('')
  const [email, setEmail] = useState('')
  const [pass,  setPass]  = useState('')
  const [err,   setErr]   = useState('')
  const [busy,  setBusy]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      await login(slug, email, pass)
      onLogin()
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-8 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold text-gray-800">Omni — Sign In</h1>
        {err && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{err}</p>}
        <input
          className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Tenant slug"
          value={slug} onChange={(e) => setSlug(e.target.value)} required
        />
        <input
          type="email"
          className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)} required
        />
        <input
          type="password"
          className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Password"
          value={pass} onChange={(e) => setPass(e.target.value)} required
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}

// ── Conversation List Item ────────────────────────────────────────────────────
function ConvItem({
  conv,
  selected,
  onClick,
}: {
  conv: ConversationSummary
  selected: boolean
  onClick: () => void
}) {
  const name = conv.customer.name ?? conv.customer.whatsappName ?? conv.customer.phone
  const preview = conv.lastMessage?.content ?? ''
  const ts = conv.lastMessageAt
    ? new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''

  const statusColor =
    conv.status === 'PENDING_HANDOFF' ? 'bg-amber-400' :
    conv.status === 'HUMAN_HANDLING'  ? 'bg-blue-400' :
    conv.status === 'CLOSED'          ? 'bg-gray-300' :
                                        'bg-green-400'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
        selected ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-800 truncate">{name}</span>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <span className={`w-2 h-2 rounded-full ${statusColor}`} title={conv.status} />
          {conv.unreadCount > 0 && (
            <span className="bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {conv.unreadCount}
            </span>
          )}
          <span className="text-xs text-gray-400">{ts}</span>
        </div>
      </div>
      <p className="text-xs text-gray-500 truncate">{preview}</p>
      {conv.needsHuman && (
        <span className="text-xs bg-amber-100 text-amber-700 rounded px-1 mt-1 inline-block">
          Needs human
        </span>
      )}
    </button>
  )
}

// ── Message Bubble ────────────────────────────────────────────────────────────
function MsgBubble({ msg }: { msg: Message }) {
  const isOutbound = msg.direction === 'OUTBOUND'
  const isSystem   = msg.senderType === 'SYSTEM'
  const isAi       = msg.senderType === 'AI'
  const ts         = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const label      = isAi ? 'AI' : msg.senderType === 'HUMAN_AGENT' ? 'You' : ''

  if (isSystem) {
    return (
      <div className="text-center my-2">
        <span className="text-xs text-gray-400 bg-gray-100 rounded px-2 py-0.5">{msg.content}</span>
      </div>
    )
  }

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[70%] ${isOutbound ? 'items-end' : 'items-start'} flex flex-col`}>
        {label && <span className="text-xs text-gray-400 mb-0.5 px-1">{label}</span>}
        <div
          className={`rounded-2xl px-4 py-2 text-sm ${
            isOutbound
              ? isAi
                ? 'bg-purple-100 text-purple-900 rounded-tr-sm'
                : 'bg-blue-500 text-white rounded-tr-sm'
              : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
          }`}
        >
          {msg.content}
        </div>
        <span className="text-xs text-gray-400 mt-0.5 px-1">{ts}</span>
      </div>
    </div>
  )
}

// ── Customer Card ─────────────────────────────────────────────────────────────
function CustomerCard({ detail }: { detail: ConversationDetail }) {
  const c   = detail.customer
  const name = c.name ?? c.whatsappName ?? c.phone

  const stageColors: Record<string, string> = {
    NEW: 'bg-gray-100 text-gray-600',
    INTERESTED: 'bg-blue-100 text-blue-700',
    HIGH_INTENT: 'bg-orange-100 text-orange-700',
    QUOTED: 'bg-yellow-100 text-yellow-700',
    BOOKED: 'bg-green-100 text-green-700',
    WON: 'bg-emerald-100 text-emerald-700',
    LOST: 'bg-red-100 text-red-700',
    AFTER_SALES: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="p-4 space-y-3">
      <h3 className="font-semibold text-gray-800 text-sm">{name}</h3>
      <p className="text-xs text-gray-500">{c.phone}</p>

      <div className="flex flex-wrap gap-1">
        <span className={`text-xs rounded px-2 py-0.5 font-medium ${stageColors[c.stage] ?? 'bg-gray-100 text-gray-600'}`}>
          {c.stage}
        </span>
        <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">
          Score: {c.score}
        </span>
      </div>

      {c.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {c.tags.map((tag) => (
            <span key={tag} className="text-xs bg-blue-50 text-blue-600 rounded px-2 py-0.5">
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="border-t pt-3 space-y-1 text-xs text-gray-500">
        <div><span className="font-medium">Channel:</span> {detail.channel.type}</div>
        <div><span className="font-medium">Status:</span> {detail.status}</div>
        {detail.assignedUserId && (
          <div><span className="font-medium">Assigned:</span> {detail.assignedUserId.slice(0, 8)}...</div>
        )}
      </div>
    </div>
  )
}

// ── Main Inbox ────────────────────────────────────────────────────────────────
export default function InboxPage() {
  const [authed,        setAuthed]        = useState(false)
  const [filter,        setFilter]        = useState<ConversationFilter>('all')
  const [search,        setSearch]        = useState('')
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [detail,        setDetail]        = useState<ConversationDetail | null>(null)
  const [messages,      setMessages]      = useState<Message[]>([])
  const [composer,      setComposer]      = useState('')
  const [sending,       setSending]       = useState(false)
  const [actionBusy,    setActionBusy]    = useState(false)
  const [sseStatus,     setSseStatus]     = useState<'disconnected' | 'connected'>('disconnected')
  const [listError,     setListError]     = useState<string | null>(null)
  const [threadError,   setThreadError]   = useState<string | null>(null)

  const sseRef      = useRef<EventSource | null>(null)
  const bottomRef   = useRef<HTMLDivElement | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Check auth on mount
  useEffect(() => {
    setAuthed(!!getToken())
  }, [])

  // Load conversation list whenever filter or search changes
  const loadList = useCallback(async () => {
    setListError(null)
    try {
      const res = await fetchConversations(filter, search)
      setConversations(res.data)
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [filter, search])

  useEffect(() => {
    if (!authed) return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(loadList, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [authed, filter, search, loadList])

  // Load thread when selected conversation changes
  const loadThread = useCallback(async (id: string) => {
    setThreadError(null)
    try {
      const [det, msgs] = await Promise.all([fetchConversation(id), fetchMessages(id)])
      setDetail(det)
      setMessages(msgs.data)
    } catch (e) {
      setThreadError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    if (selectedId) loadThread(selectedId)
    else { setDetail(null); setMessages([]) }
  }, [selectedId, loadThread])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // SSE connection
  useEffect(() => {
    if (!authed) return
    const src = createRealtimeConnection(
      (type, data) => {
        const convId = (data as { conversationId?: string }).conversationId
        if (!convId) return
        // Refresh list on any conversation event
        loadList()
        // Refresh thread if it's the open conversation
        if (convId === selectedId) {
          loadThread(convId)
        }
      },
      () => setSseStatus('connected'),
    )
    if (src) {
      sseRef.current = src
      src.onerror = () => setSseStatus('disconnected')
    }
    return () => { src?.close(); setSseStatus('disconnected') }
  }, [authed, selectedId, loadList, loadThread])

  // Actions
  async function handleTakeover() {
    if (!selectedId || actionBusy) return
    setActionBusy(true)
    try {
      await takeoverConversation(selectedId)
      await loadThread(selectedId)
      await loadList()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally { setActionBusy(false) }
  }

  async function handleReleaseAi() {
    if (!selectedId || actionBusy) return
    setActionBusy(true)
    try {
      await releaseAi(selectedId)
      await loadThread(selectedId)
      await loadList()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally { setActionBusy(false) }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId || !composer.trim() || sending) return
    setSending(true)
    try {
      const msg = await sendMessage(selectedId, composer.trim())
      setMessages((prev) => [...prev, msg])
      setComposer('')
      await loadList()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Send failed')
    } finally { setSending(false) }
  }

  function handleLogout() {
    clearToken()
    sseRef.current?.close()
    setAuthed(false)
    setConversations([])
    setSelectedId(null)
    setDetail(null)
    setMessages([])
  }

  if (!authed) {
    return <LoginForm onLogin={() => setAuthed(true)} />
  }

  const FILTERS: { key: ConversationFilter; label: string }[] = [
    { key: 'all',         label: 'All' },
    { key: 'needs_human', label: 'Needs Human' },
    { key: 'ai_handling', label: 'AI Handling' },
    { key: 'high_intent', label: 'High Intent' },
  ]

  const canTakeover = detail && detail.status !== 'HUMAN_HANDLING' && detail.status !== 'CLOSED'
  const canRelease  = detail && detail.status === 'HUMAN_HANDLING'

  return (
    <div className="flex h-screen bg-gray-100 text-sm overflow-hidden">
      {/* ── Left panel: conversation list ── */}
      <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-700">Inbox</span>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${sseStatus === 'connected' ? 'bg-green-400' : 'bg-gray-300'}`}
                title={sseStatus === 'connected' ? 'Real-time connected' : 'Polling mode'}
              />
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Sign out
              </button>
            </div>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers..."
            className="w-full border rounded px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="flex gap-1 flex-wrap">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  filter === key
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listError && (
            <p className="text-xs text-red-500 px-4 py-2">{listError}</p>
          )}
          {conversations.length === 0 && !listError && (
            <p className="text-xs text-gray-400 px-4 py-4 text-center">No conversations</p>
          )}
          {conversations.map((conv) => (
            <ConvItem
              key={conv.id}
              conv={conv}
              selected={conv.id === selectedId}
              onClick={() => setSelectedId(conv.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Center: thread ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a conversation
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <div>
                <span className="font-medium text-gray-800">
                  {detail
                    ? (detail.customer.name ?? detail.customer.whatsappName ?? detail.customer.phone)
                    : '...'}
                </span>
                {detail && (
                  <span className="ml-2 text-xs text-gray-400">{detail.status}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canTakeover && (
                  <button
                    onClick={handleTakeover}
                    disabled={actionBusy}
                    className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded disabled:opacity-50"
                  >
                    Take Over
                  </button>
                )}
                {canRelease && (
                  <button
                    onClick={handleReleaseAi}
                    disabled={actionBusy}
                    className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded disabled:opacity-50"
                  >
                    Release to AI
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {threadError && <p className="text-xs text-red-500 mb-2">{threadError}</p>}
              {messages.map((msg) => <MsgBubble key={msg.id} msg={msg} />)}
              <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <form
              onSubmit={handleSend}
              className="bg-white border-t border-gray-200 px-4 py-3 flex items-end gap-2"
            >
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(e) }
                }}
                placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                rows={2}
                className="flex-1 border rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                type="submit"
                disabled={sending || !composer.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 flex-shrink-0"
              >
                {sending ? '...' : 'Send'}
              </button>
            </form>
          </>
        )}
      </div>

      {/* ── Right panel: customer card ── */}
      <div className="w-64 flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
        {detail ? (
          <CustomerCard detail={detail} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-xs p-4">
            Select a conversation to see customer details
          </div>
        )}
      </div>
    </div>
  )
}
