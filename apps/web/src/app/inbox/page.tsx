'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  login, clearToken, getToken,
  fetchConversations, fetchConversation, fetchMessages,
  takeoverConversation, releaseAi, sendMessage, closeConversation,
  updateCustomerStage, setCustomerTags,
  createRealtimeConnection,
  type ConversationSummary, type ConversationDetail, type Message, type ConversationFilter,
  type SseTransport,
} from '@/lib/api'
import { toChineseError } from '@/lib/errorText'

const STAGES = ['NEW','INTERESTED','HIGH_INTENT','QUOTED','BOOKED','WON','LOST','AFTER_SALES'] as const

// Stage / status / channel / sender enum → 中文 label
const STAGE_LABEL: Record<string, string> = {
  NEW: '新客户', INTERESTED: '已确认需求', HIGH_INTENT: '高意向',
  QUOTED: '已报价', BOOKED: '已预约', WON: '已成交', LOST: '已流失', AFTER_SALES: '售后',
}
const STATUS_LABEL: Record<string, string> = {
  AI_HANDLING:     'AI 处理中',
  PENDING_HANDOFF: '待人工接管',
  HUMAN_HANDLING:  '人工处理中',
  CLOSED:          '已关闭',
}
// Reserved for future use in message bubble metadata
const _SENDER_LABEL: Record<string, string> = {
  AI:          'AI 客服',
  HUMAN_AGENT: '人工客服',
  CUSTOMER:    '客户',
  SYSTEM:      '系统',
}
const _DIRECTION_LABEL: Record<string, string> = {
  INBOUND:  '客户消息',
  OUTBOUND: '已发送',
}
void _SENDER_LABEL; void _DIRECTION_LABEL;

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
      setErr(toChineseError(ex, '登录失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-8 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold text-gray-800">登录到 Omni</h1>
        {err && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{err}</p>}
        <input
          className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="租户标识"
          value={slug} onChange={(e) => setSlug(e.target.value)} required
        />
        <input
          type="email"
          className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="邮箱"
          value={email} onChange={(e) => setEmail(e.target.value)} required
        />
        <input
          type="password"
          className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="密码"
          value={pass} onChange={(e) => setPass(e.target.value)} required
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? '登录中…' : '登录'}
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
          <span className={`w-2 h-2 rounded-full ${statusColor}`} title={STATUS_LABEL[conv.status] ?? conv.status} />
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
          需要人工
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
  const ts         = new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const label      = isAi ? 'AI 客服' : msg.senderType === 'HUMAN_AGENT' ? '我' : ''

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

const STAGE_COLORS: Record<string, string> = {
  NEW:         'bg-gray-100 text-gray-600',
  INTERESTED:  'bg-blue-100 text-blue-700',
  HIGH_INTENT: 'bg-orange-100 text-orange-700',
  QUOTED:      'bg-yellow-100 text-yellow-700',
  BOOKED:      'bg-green-100 text-green-700',
  WON:         'bg-emerald-100 text-emerald-700',
  LOST:        'bg-red-100 text-red-700',
  AFTER_SALES: 'bg-purple-100 text-purple-700',
}

// ── Customer Card ─────────────────────────────────────────────────────────────
function CustomerCard({
  detail, onCustomerChanged,
}: {
  detail:            ConversationDetail
  onCustomerChanged: () => void
}) {
  const c    = detail.customer
  const name = c.name ?? c.whatsappName ?? c.phone
  const [editStage, setEditStage] = useState(false)
  const [tagInput,  setTagInput]  = useState(c.tags.join(', '))
  const [localTags, setLocalTags] = useState<string[]>(c.tags)
  const [busy,      setBusy]      = useState(false)

  async function handleStageChange(stage: string) {
    setBusy(true)
    try {
      await updateCustomerStage(c.id, stage)
      setEditStage(false)
      onCustomerChanged()
    } catch (ex) { alert(toChineseError(ex, '更新阶段失败')) }
    finally { setBusy(false) }
  }

  async function handleTagsSave() {
    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean)
    setBusy(true)
    try {
      const res = await setCustomerTags(c.id, tags)
      setLocalTags(res.tags)
      onCustomerChanged()
    } catch (ex) { alert(toChineseError(ex, '保存标签失败')) }
    finally { setBusy(false) }
  }

  return (
    <div className="p-4 space-y-3 overflow-y-auto h-full">
      <h3 className="font-semibold text-gray-800 text-sm">{name}</h3>
      <p className="text-xs text-gray-500">{c.phone}</p>

      {/* Stage with edit */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 font-medium">客户阶段</span>
          <button
            onClick={() => setEditStage(!editStage)}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            {editStage ? '取消' : '编辑'}
          </button>
        </div>
        {editStage ? (
          <div className="flex flex-wrap gap-1">
            {STAGES.map((s) => (
              <button
                key={s}
                disabled={busy}
                onClick={() => handleStageChange(s)}
                className={`text-xs rounded px-2 py-0.5 font-medium cursor-pointer transition-opacity ${STAGE_COLORS[s] ?? 'bg-gray-100 text-gray-600'} ${c.stage === s ? 'ring-2 ring-offset-1 ring-blue-400' : 'opacity-60 hover:opacity-100'}`}
              >
                {STAGE_LABEL[s] ?? s}
              </button>
            ))}
          </div>
        ) : (
          <span className={`text-xs rounded px-2 py-0.5 font-medium ${STAGE_COLORS[c.stage] ?? 'bg-gray-100 text-gray-600'}`}>
            {STAGE_LABEL[c.stage] ?? c.stage}
          </span>
        )}
      </div>

      <div className="text-xs text-gray-500">
        意向评分：<span className="font-medium text-gray-700">{c.score}</span>
      </div>

      {/* Tags with edit */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 font-medium">标签</span>
        </div>
        <div className="flex flex-wrap gap-1 mb-1.5">
          {localTags.map((tag) => (
            <span key={tag} className="text-xs bg-blue-50 text-blue-600 rounded px-2 py-0.5">#{tag}</span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="标签1, 标签2"
            className="flex-1 border rounded text-xs px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={handleTagsSave} disabled={busy}
            className="text-xs bg-blue-500 text-white rounded px-2 py-1 disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>

      <div className="border-t pt-3 space-y-1 text-xs text-gray-500">
        <div><span className="font-medium">渠道：</span>{detail.channel.type}</div>
        <div><span className="font-medium">对话状态：</span>{STATUS_LABEL[detail.status] ?? detail.status}</div>
        {detail.assignedUserId && (
          <div><span className="font-medium">负责人：</span>{detail.assignedUserId.slice(0, 8)}…</div>
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
  const [msgPage,       setMsgPage]       = useState(1)
  const [totalMsgs,     setTotalMsgs]     = useState(0)
  const [composer,      setComposer]      = useState('')
  const [sending,       setSending]       = useState(false)
  const [actionBusy,    setActionBusy]    = useState(false)
  const [sseStatus,     setSseStatus]     = useState<'disconnected' | 'connected'>('disconnected')
  const [sseTransport,  setSseTransport]  = useState<SseTransport>('unknown')
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
      setListError(toChineseError(e, '加载对话列表失败'))
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
      const [det, msgs] = await Promise.all([fetchConversation(id), fetchMessages(id, 1)])
      setDetail(det)
      setMessages(msgs.data)
      setTotalMsgs(msgs.pagination.total)
      setMsgPage(1)
    } catch (e) {
      setThreadError(toChineseError(e, '加载对话失败'))
    }
  }, [])

  useEffect(() => {
    if (selectedId) loadThread(selectedId)
    else { setDetail(null); setMessages([]); setMsgPage(1); setTotalMsgs(0) }
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
        // Refresh list on any conversation-level event
        loadList()
        // Refresh thread if it's the currently open conversation
        if (convId && convId === selectedId) {
          loadThread(convId)
        }
      },
      (transport) => {
        setSseStatus('connected')
        setSseTransport(transport)
      },
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
      alert(toChineseError(e, '接管失败'))
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
      alert(toChineseError(e, '释放 AI 失败'))
    } finally { setActionBusy(false) }
  }

  async function handleClose() {
    if (!selectedId || actionBusy) return
    if (!confirm('确认关闭此对话？此操作不可撤销。')) return
    setActionBusy(true)
    try {
      await closeConversation(selectedId)
      await loadThread(selectedId)
      await loadList()
    } catch (e) {
      alert(toChineseError(e, '关闭对话失败'))
    } finally { setActionBusy(false) }
  }

  async function handleLoadOlder() {
    if (!selectedId) return
    const nextPage = msgPage + 1
    try {
      const res = await fetchMessages(selectedId, nextPage)
      setMessages((prev) => [...res.data, ...prev])
      setMsgPage(nextPage)
    } catch { /* ignore */ }
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
      alert(toChineseError(e, '发送失败'))
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
    { key: 'all',         label: '全部' },
    { key: 'needs_human', label: '需要人工' },
    { key: 'ai_handling', label: 'AI 处理中' },
    { key: 'high_intent', label: '高意向' },
  ]

  const canTakeover = detail && detail.status !== 'HUMAN_HANDLING' && detail.status !== 'CLOSED'
  const canRelease  = detail && detail.status === 'HUMAN_HANDLING'

  return (
    <div className="flex h-screen bg-gray-100 text-sm overflow-hidden">
      {/* ── Left panel: conversation list ── */}
      <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-700">对话收件箱</span>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${sseStatus === 'connected' ? (sseTransport === 'redis' ? 'bg-green-400' : 'bg-yellow-400') : 'bg-gray-300'}`}
                title={
                  sseStatus === 'connected'
                    ? sseTransport === 'redis'
                      ? '实时（Redis pub/sub）'
                      : '实时（本地内存 — Worker 事件可能延迟）'
                    : '已断开'
                }
              />
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                退出
              </button>
            </div>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索客户姓名 / 手机号…"
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
            <p className="text-xs text-gray-400 px-4 py-4 text-center">暂无对话</p>
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
            请选择左侧对话开始处理
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <div>
                <span className="font-medium text-gray-800">
                  {detail
                    ? (detail.customer.name ?? detail.customer.whatsappName ?? detail.customer.phone)
                    : '…'}
                </span>
                {detail && (
                  <span className="ml-2 text-xs text-gray-400">{STATUS_LABEL[detail.status] ?? detail.status}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canTakeover && (
                  <button
                    onClick={handleTakeover}
                    disabled={actionBusy}
                    className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded disabled:opacity-50"
                  >
                    人工接管
                  </button>
                )}
                {canRelease && (
                  <button
                    onClick={handleReleaseAi}
                    disabled={actionBusy}
                    className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded disabled:opacity-50"
                  >
                    释放给 AI
                  </button>
                )}
                {detail && detail.status !== 'CLOSED' && (
                  <button
                    onClick={handleClose}
                    disabled={actionBusy}
                    className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded disabled:opacity-50"
                  >
                    关闭对话
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {threadError && <p className="text-xs text-red-500 mb-2">{threadError}</p>}
              {/* Load older messages */}
              {msgPage * 50 < totalMsgs && (
                <div className="flex justify-center mb-3">
                  <button
                    onClick={handleLoadOlder}
                    className="text-xs text-blue-600 hover:text-blue-700 bg-white border border-blue-200 rounded-full px-4 py-1"
                  >
                    加载更早消息
                  </button>
                </div>
              )}
              {messages.map((msg) => <MsgBubble key={msg.id} msg={msg} />)}
              <div ref={bottomRef} />
            </div>

            {/* Composer — disabled if closed */}
            {detail?.status === 'CLOSED' ? (
              <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 text-center text-xs text-gray-400">
                对话已关闭 — 不可回复
              </div>
            ) : (
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
                placeholder="输入回复…（Enter 发送，Shift+Enter 换行）"
                rows={2}
                className="flex-1 border rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                type="submit"
                disabled={sending || !composer.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 flex-shrink-0"
              >
                {sending ? '发送中…' : '发送'}
              </button>
            </form>
            )}
          </>
        )}
      </div>

      {/* ── Right panel: customer card ── */}
      <div className="w-64 flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
        {detail ? (
          <CustomerCard detail={detail} onCustomerChanged={() => selectedId && loadThread(selectedId)} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-xs p-4">
            选择一条对话以查看客户详情
          </div>
        )}
      </div>
    </div>
  )
}
