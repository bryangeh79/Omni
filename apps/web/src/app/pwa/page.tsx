'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  login, clearToken, getToken,
  fetchConversations, fetchConversation, fetchMessages, fetchCustomer,
  fetchBossToday,
  takeoverConversation, releaseAi, closeConversation, sendMessage,
  updateCustomerStage, setCustomerTags,
  fetchFollowUps, completeFollowUp, cancelFollowUp,
  createRealtimeConnection,
  type ConversationSummary, type ConversationDetail, type Message,
  type CustomerDetail, type FollowUpTask, type SseTransport, type BossToday,
} from '@/lib/api'
import { toChineseError } from '@/lib/errorText'
import {
  stageLabel,
  conversationStatusLabel,
  channelTypeLabel,
  followUpScenarioLabel,
} from '@/lib/enumLabels'

// ── Constants ─────────────────────────────────────────────────────────────────
const STAGES = ['NEW','INTERESTED','HIGH_INTENT','QUOTED','BOOKED','WON','LOST','AFTER_SALES'] as const

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

// ── Login Form ────────────────────────────────────────────────────────────────
function MobileLoginForm({ onLogin }: { onLogin: () => void }) {
  const [slug, setSlug]   = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass]   = useState('')
  const [err, setErr]     = useState('')
  const [busy, setBusy]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      await login(slug, email, pass)
      onLogin()
    } catch (ex) {
      setErr(toChineseError(ex, '登录失败'))
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4">
            <span className="text-white text-xl font-bold">O</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Omni</h1>
          <p className="text-sm text-gray-500 mt-1">客服工作台</p>
        </div>
        {err && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="租户标识"
            value={slug} onChange={(e) => setSlug(e.target.value)} required
          />
          <input
            type="email"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="邮箱"
            value={email} onChange={(e) => setEmail(e.target.value)} required
          />
          <input
            type="password"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="密码"
            value={pass} onChange={(e) => setPass(e.target.value)} required
          />
          <button
            type="submit" disabled={busy}
            className="w-full bg-blue-600 active:bg-blue-700 text-white rounded-xl py-3.5 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Conversation Card ─────────────────────────────────────────────────────────
function ConvCard({ conv, onTap }: { conv: ConversationSummary; onTap: () => void }) {
  const name = conv.customer.name ?? conv.customer.whatsappName ?? conv.customer.phone
  const ts = conv.lastMessageAt
    ? new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''

  const statusDot =
    conv.status === 'PENDING_HANDOFF' ? 'bg-amber-400' :
    conv.status === 'HUMAN_HANDLING'  ? 'bg-blue-500' :
    conv.status === 'CLOSED'          ? 'bg-gray-300' : 'bg-green-400'

  return (
    <button
      onClick={onTap}
      className="w-full text-left bg-white px-4 py-4 border-b border-gray-100 active:bg-gray-50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0 mt-0.5">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-semibold text-sm">
            {name.charAt(0).toUpperCase()}
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${statusDot}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between mb-0.5">
            <span className="text-sm font-semibold text-gray-900 truncate">{name}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
              {conv.unreadCount > 0 && (
                <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                  {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                </span>
              )}
              <span className="text-xs text-gray-400">{ts}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 truncate">{conv.lastMessage?.content ?? '暂无消息'}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${STAGE_COLORS[conv.customer.stage] ?? 'bg-gray-100 text-gray-600'}`}>
              {stageLabel(conv.customer.stage)}
            </span>
            {conv.needsHuman && (
              <span className="text-xs bg-amber-100 text-amber-700 rounded-md px-1.5 py-0.5 font-medium">
                需要人工
              </span>
            )}
            {conv.customer.score >= 60 && (
              <span className="text-xs bg-orange-50 text-orange-600 rounded-md px-1.5 py-0.5">
                评分 {conv.customer.score}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Message Bubble ────────────────────────────────────────────────────────────
function MsgBubble({ msg }: { msg: Message }) {
  const isOut    = msg.direction === 'OUTBOUND'
  const isSystem = msg.senderType === 'SYSTEM'
  const isAi     = msg.senderType === 'AI'
  const ts       = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (isSystem) {
    return (
      <div className="flex justify-center my-2 px-4">
        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">{msg.content}</span>
      </div>
    )
  }

  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} px-4 mb-2`}>
      <div className={`max-w-[78%] ${isOut ? 'items-end' : 'items-start'} flex flex-col`}>
        {isAi && <span className="text-xs text-purple-500 mb-0.5 px-1">AI 客服</span>}
        <div
          className={`px-3.5 py-2.5 text-sm rounded-2xl leading-relaxed ${
            isOut
              ? isAi
                ? 'bg-purple-100 text-purple-900 rounded-tr-sm'
                : 'bg-blue-500 text-white rounded-tr-sm'
              : 'bg-white border border-gray-200 text-gray-800 shadow-sm rounded-tl-sm'
          }`}
        >
          {msg.content}
        </div>
        <span className="text-xs text-gray-400 mt-0.5 px-1">{ts}</span>
      </div>
    </div>
  )
}

// ── Thread View (full-screen on mobile) ───────────────────────────────────────
function ThreadView({
  conv, messages, totalMessages, currentPage,
  onBack, onLoadOlder, onAction, onRefresh,
}: {
  conv:          ConversationDetail
  messages:      Message[]
  totalMessages: number
  currentPage:   number
  onBack:        () => void
  onLoadOlder:   () => void
  onAction:      (action: 'takeover' | 'release' | 'close') => void
  onRefresh:     () => void
}) {
  const [composer, setComposer] = useState('')
  const [sending,  setSending]  = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [showCustomer, setShowCustomer] = useState(false)
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null)
  const [stageEdit, setStageEdit] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [tagBusy, setTagBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const name = conv.customer.name ?? conv.customer.whatsappName ?? conv.customer.phone
  const canTakeover = conv.status !== 'HUMAN_HANDLING' && conv.status !== 'CLOSED'
  const canRelease  = conv.status === 'HUMAN_HANDLING'
  const isClosed    = conv.status === 'CLOSED'
  const hasOlder    = currentPage * 50 < totalMessages

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!composer.trim() || sending || isClosed) return
    setSending(true)
    try {
      await sendMessage(conv.id, composer.trim())
      setComposer('')
      onRefresh()
    } catch (ex) { alert(toChineseError(ex, '发送失败')) }
    finally { setSending(false) }
  }

  async function handleAction(action: 'takeover' | 'release' | 'close') {
    if (actionBusy) return
    if (action === 'close' && !confirm('确认关闭此对话？')) return
    setActionBusy(true)
    try { onAction(action) } finally { setActionBusy(false) }
  }

  async function loadCustomer() {
    if (customerDetail) { setShowCustomer(true); return }
    try {
      const c = await fetchCustomer(conv.customer.id)
      setCustomerDetail(c)
      setTagInput(c.tags.join(', '))
      setShowCustomer(true)
    } catch { /* ignore */ }
  }

  async function handleStageChange(stage: string) {
    if (!customerDetail) return
    try {
      const updated = await updateCustomerStage(conv.customer.id, stage)
      setCustomerDetail(updated)
      setStageEdit(false)
      onRefresh()
    } catch (ex) { alert(toChineseError(ex, '更新阶段失败')) }
  }

  async function handleTagsSave() {
    if (!customerDetail) return
    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean)
    setTagBusy(true)
    try {
      const res = await setCustomerTags(conv.customer.id, tags)
      setCustomerDetail(prev => prev ? { ...prev, tags: res.tags } : prev)
      onRefresh()
    } catch (ex) { alert(toChineseError(ex, '保存标签失败')) }
    finally { setTagBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-gray-50 flex flex-col z-20">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={onBack} className="text-blue-600 font-medium text-sm flex-shrink-0">← 返回</button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
          <p className="text-xs text-gray-500">{conversationStatusLabel(conv.status)} · {channelTypeLabel(conv.channel.type)}</p>
        </div>
        <button
          onClick={loadCustomer}
          className="text-xs text-blue-600 font-medium flex-shrink-0"
        >
          客户资料
        </button>
      </div>

      {/* Action bar */}
      {!isClosed && (
        <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-2 flex-shrink-0">
          {canTakeover && (
            <button
              onClick={() => handleAction('takeover')} disabled={actionBusy}
              title="暂停 AI 自动回复，由人工客服处理此对话"
              aria-label="人工接管对话"
              className="flex-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg py-2 text-xs font-semibold active:bg-amber-100"
            >
              人工接管
            </button>
          )}
          {canRelease && (
            <button
              onClick={() => handleAction('release')} disabled={actionBusy}
              title="恢复 AI 自动回复"
              aria-label="释放对话给 AI"
              className="flex-1 bg-green-50 text-green-700 border border-green-200 rounded-lg py-2 text-xs font-semibold active:bg-green-100"
            >
              释放给 AI
            </button>
          )}
          <button
            onClick={() => handleAction('close')} disabled={actionBusy}
            title="关闭后不可继续回复，除非重新开启"
            aria-label="关闭对话"
            className="px-3 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg py-2 text-xs font-medium active:bg-gray-100"
          >
            关闭
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3">
        {hasOlder && (
          <div className="flex justify-center mb-3">
            <button
              onClick={onLoadOlder}
              className="text-xs text-blue-600 bg-white border border-blue-200 rounded-full px-4 py-1.5"
            >
              加载更早消息
            </button>
          </div>
        )}
        {messages.map((msg) => <MsgBubble key={msg.id} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      {!isClosed ? (
        <form onSubmit={handleSend} className="bg-white border-t border-gray-100 px-3 py-3 flex items-end gap-2 flex-shrink-0 safe-bottom">
          <textarea
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(e) } }}
            placeholder="输入回复…"
            rows={2}
            className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-colors"
          />
          <button
            type="submit" disabled={sending || !composer.trim()}
            className="bg-blue-500 active:bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          >
            →
          </button>
        </form>
      ) : (
        <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 text-center text-xs text-gray-400 flex-shrink-0 safe-bottom">
          对话已关闭
        </div>
      )}

      {/* Customer profile overlay */}
      {showCustomer && customerDetail && (
        <div className="fixed inset-0 bg-black/30 z-30 flex items-end" onClick={() => setShowCustomer(false)}>
          <div
            className="bg-white w-full rounded-t-3xl p-6 max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="flex items-start gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xl font-bold">
                {name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="font-bold text-gray-900">{name}</h2>
                <p className="text-sm text-gray-500">{customerDetail.phone}</p>
                {customerDetail.company && <p className="text-sm text-gray-400">{customerDetail.company}</p>}
              </div>
            </div>

            {/* Stage selector */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">客户阶段</span>
                <button onClick={() => setStageEdit(!stageEdit)} className="text-xs text-blue-600">
                  {stageEdit ? '取消' : '编辑'}
                </button>
              </div>
              {stageEdit ? (
                <div className="grid grid-cols-2 gap-2">
                  {STAGES.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStageChange(s)}
                      className={`py-2 px-3 rounded-xl text-xs font-medium text-left ${customerDetail.stage === s ? 'ring-2 ring-blue-400' : ''} ${STAGE_COLORS[s] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {stageLabel(s)}
                    </button>
                  ))}
                </div>
              ) : (
                <span className={`inline-block px-3 py-1.5 rounded-xl text-sm font-medium ${STAGE_COLORS[customerDetail.stage] ?? 'bg-gray-100 text-gray-600'}`}>
                  {stageLabel(customerDetail.stage)}
                </span>
              )}
            </div>

            {/* Score */}
            <div className="mb-5">
              <span className="text-sm font-semibold text-gray-700 block mb-2">意向评分</span>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full"
                    style={{ width: `${customerDetail.score}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-700">{customerDetail.score}</span>
              </div>
            </div>

            {/* Tags */}
            <div className="mb-5">
              <span className="text-sm font-semibold text-gray-700 block mb-2">标签</span>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {customerDetail.tags.map((t) => (
                  <span key={t} className="bg-blue-50 text-blue-600 text-xs px-2.5 py-1 rounded-full">#{t}</span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="标签1, 标签2, 标签3"
                  className="flex-1 bg-gray-100 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  onClick={handleTagsSave} disabled={tagBusy}
                  className="bg-blue-500 text-white rounded-xl px-3 py-2 text-xs font-medium disabled:opacity-40"
                >
                  保存
                </button>
              </div>
            </div>

            {/* Notes */}
            {customerDetail.notes && (
              <div className="mb-5">
                <span className="text-sm font-semibold text-gray-700 block mb-2">备注</span>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">{customerDetail.notes}</p>
              </div>
            )}

            <button
              onClick={() => setShowCustomer(false)}
              className="w-full bg-gray-100 text-gray-700 rounded-2xl py-3 text-sm font-medium mt-2"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Follow-up Tab ─────────────────────────────────────────────────────────────
function FollowUpTab({ onOpenConversation }: { onOpenConversation: (id: string) => void }) {
  const [tasks,    setTasks]    = useState<FollowUpTask[]>([])
  const [overdue,  setOverdue]  = useState<FollowUpTask[]>([])
  const [loading,  setLoading]  = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [todayRes, overdueRes] = await Promise.all([
        fetchFollowUps({ today: true, status: 'PENDING' }),
        fetchFollowUps({ overdue: true }),
      ])
      setTasks(todayRes.data)
      setOverdue(overdueRes.data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleComplete(id: string) {
    setActionId(id)
    try { await completeFollowUp(id); await load() }
    catch (ex) { alert(toChineseError(ex, '操作失败')) }
    finally { setActionId(null) }
  }

  async function handleCancel(id: string) {
    setActionId(id)
    try { await cancelFollowUp(id); await load() }
    catch (ex) { alert(toChineseError(ex, '操作失败')) }
    finally { setActionId(null) }
  }

  const TaskCard = ({ task }: { task: FollowUpTask }) => {
    const name      = task.customer.name ?? task.customer.phone
    const isOverdue = new Date(task.dueAt) < new Date()
    const dueStr    = new Date(task.dueAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    return (
      <div className={`bg-white rounded-2xl border p-4 mb-3 ${isOverdue ? 'border-red-200' : 'border-gray-100'}`}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-sm font-semibold text-gray-900">{name}</p>
            <p className="text-xs text-gray-400">{followUpScenarioLabel(task.scenario)}</p>
          </div>
          <div className="text-right">
            {task.requiresHuman && (
              <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium block mb-1">
                需人工
              </span>
            )}
            <span className={`text-xs ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
              {isOverdue ? '已逾期 · ' : ''}{dueStr}
            </span>
          </div>
        </div>
        {task.suggestedMessage && (
          <p className="text-xs text-gray-500 italic mb-3 bg-gray-50 rounded-xl px-3 py-2 leading-relaxed">
            “{task.suggestedMessage}”
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => onOpenConversation(task.conversationId)}
            className="flex-1 bg-blue-50 text-blue-600 rounded-xl py-2 text-xs font-medium active:bg-blue-100"
          >
            打开对话
          </button>
          <button
            onClick={() => handleComplete(task.id)} disabled={actionId === task.id}
            className="flex-1 bg-green-50 text-green-700 rounded-xl py-2 text-xs font-medium active:bg-green-100 disabled:opacity-40"
          >
            已完成
          </button>
          <button
            onClick={() => handleCancel(task.id)} disabled={actionId === task.id}
            className="px-3 bg-gray-50 text-gray-500 rounded-xl py-2 text-xs active:bg-gray-100 disabled:opacity-40"
          >
            跳过
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="pb-24 px-4 pt-4">
        <h1 className="text-lg font-bold text-gray-900 mb-3">跟进任务</h1>
        <p className="text-xs text-gray-400 text-center py-8">加载中…</p>
      </div>
    )
  }

  const allTasks = [...overdue.filter(t => !tasks.some(t2 => t2.id === t.id)), ...tasks]

  return (
    <div className="pb-24 px-4 pt-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-gray-900">跟进任务</h1>
        <button onClick={load} className="text-xs text-blue-500">刷新</button>
      </div>

      {overdue.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-red-500 mb-2">
            已逾期（{overdue.length}）
          </p>
        </div>
      )}

      {allTasks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
          <p className="text-3xl mb-2">✓</p>
          <p className="text-sm font-medium">今日无跟进任务</p>
          <p className="text-xs mt-1 text-gray-300">全部已处理完毕，干得漂亮！</p>
        </div>
      ) : (
        allTasks.map(task => <TaskCard key={task.id} task={task} />)
      )}
    </div>
  )
}

// ── Boss Today Card ────────────────────────────────────────────────────────────
function BossTodayTab({ conversations, onSelect }: { conversations: ConversationSummary[]; onSelect: (id: string) => void }) {
  const [bossData, setBossData] = useState<BossToday | null>(null)

  // Fetch Boss API data on mount (non-blocking; falls back to conversation list)
  useEffect(() => {
    fetchBossToday().then(setBossData).catch(() => null)
  }, [])

  const data  = bossData?.today
  const urgent = conversations.filter(c => c.needsHuman)
  const highScore = conversations.filter(c => !c.needsHuman && c.customer.score >= 60)
  const recent = conversations.filter(c => !c.needsHuman && c.customer.score < 60).slice(0, 5)

  const Section = ({ title, items, badge }: { title: string; items: ConversationSummary[]; badge?: string }) => (
    items.length === 0 ? null : (
      <div className="mb-6">
        <div className="flex items-center gap-2 px-4 mb-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{title}</span>
          {badge && <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{badge}</span>}
        </div>
        {items.map(c => <ConvCard key={c.id} conv={c} onTap={() => onSelect(c.id)} />)}
      </div>
    )
  )

  return (
    <div className="pb-24">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold text-gray-900">老板今日</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats row — from Boss API when available, conversation list as fallback */}
      <div className="flex gap-3 px-4 py-3 overflow-x-auto">
        {[
          { label: '需要人工',     value: data?.needHuman           ?? urgent.length,        color: 'bg-amber-50 text-amber-700 border-amber-200' },
          { label: '高意向',       value: data?.highIntentCustomers ?? highScore.length,     color: 'bg-orange-50 text-orange-700 border-orange-200' },
          { label: '进行中',       value: data?.openConversations   ?? conversations.length, color: 'bg-blue-50 text-blue-700 border-blue-200' },
          ...(data ? [
            { label: '逾期跟进', value: data.overdueFollowUps,  color: data.overdueFollowUps > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-600 border-gray-200' },
            { label: '今日新增', value: data.newCustomers,      color: 'bg-green-50 text-green-700 border-green-200' },
          ] : []),
        ].map(({ label, value, color }) => (
          <div key={label} className={`flex-shrink-0 rounded-2xl border px-4 py-3 min-w-[100px] ${color}`}>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs font-medium mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Suggested actions from Boss API */}
      {bossData?.suggestedActions && bossData.suggestedActions.some(a => a.type !== 'ALL_CLEAR') && (
        <div className="px-4 mb-4">
          {bossData.suggestedActions.filter(a => a.priority === 'urgent' || a.priority === 'high').slice(0, 3).map((a, i) => (
            <div key={i} className={`mb-2 rounded-xl border px-3 py-2 text-xs font-medium ${a.priority === 'urgent' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              {a.label}
            </div>
          ))}
        </div>
      )}

      <Section title="需要人工" items={urgent} badge={urgent.length > 0 ? String(urgent.length) : undefined} />
      <Section title="高意向"   items={highScore} />
      <Section title="最新对话" items={recent} />

      {conversations.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">✓</p>
          <p className="text-sm font-medium">全部已处理 — 暂无待办对话</p>
        </div>
      )}
    </div>
  )
}

// ── Simple list tab ────────────────────────────────────────────────────────────
function ListTab({
  title, conversations, emptyMsg, onSelect,
}: {
  title:         string
  conversations: ConversationSummary[]
  emptyMsg:      string
  onSelect:      (id: string) => void
}) {
  return (
    <div className="pb-24">
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
      </div>
      {conversations.length === 0 ? (
        <div className="text-center py-16 text-gray-400 px-8">
          <p className="text-sm">{emptyMsg}</p>
        </div>
      ) : (
        conversations.map(c => <ConvCard key={c.id} conv={c} onTap={() => onSelect(c.id)} />)
      )}
    </div>
  )
}

// ── Bottom Navigation ─────────────────────────────────────────────────────────
type TabId = 'boss' | 'inbox' | 'human' | 'intent' | 'followup'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'boss',     label: '今日',     icon: '⚡' },
  { id: 'inbox',    label: '收件箱',   icon: '💬' },
  { id: 'human',    label: '人工',     icon: '🙋' },
  { id: 'intent',   label: '高意向',   icon: '🎯' },
  { id: 'followup', label: '跟进',     icon: '📅' },
]

// ── Main PWA ──────────────────────────────────────────────────────────────────
export default function PwaPage() {
  const [authed,      setAuthed]      = useState<boolean | null>(null)
  const [tab,         setTab]         = useState<TabId>('boss')
  const [allConvs,    setAllConvs]    = useState<ConversationSummary[]>([])
  const [humanConvs,  setHumanConvs]  = useState<ConversationSummary[]>([])
  const [intentConvs, setIntentConvs] = useState<ConversationSummary[]>([])
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [detail,      setDetail]      = useState<ConversationDetail | null>(null)
  const [messages,    setMessages]    = useState<Message[]>([])
  const [totalMsgs,   setTotalMsgs]   = useState(0)
  const [msgPage,     setMsgPage]     = useState(1)
  const [sseTransport, setSseTransport] = useState<SseTransport>('unknown')
  const sseRef    = useRef<EventSource | null>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setAuthed(!!getToken()) }, [])

  // Load all conversations for the current tab context
  const loadAll = useCallback(async () => {
    try {
      const [all, human, intent] = await Promise.all([
        fetchConversations('all'),
        fetchConversations('needs_human'),
        fetchConversations('high_intent'),
      ])
      setAllConvs(all.data)
      setHumanConvs(human.data)
      setIntentConvs(intent.data)
    } catch { /* ignore */ }
  }, [])

  const loadThread = useCallback(async (id: string, page = 1) => {
    try {
      const [det, msgs] = await Promise.all([
        fetchConversation(id),
        fetchMessages(id, page),
      ])
      setDetail(det)
      setMessages(msgs.data)
      setTotalMsgs(msgs.pagination.total)
      setMsgPage(page)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!authed) return
    loadAll()
  }, [authed, loadAll])

  useEffect(() => {
    if (selectedId) loadThread(selectedId, 1)
    else { setDetail(null); setMessages([]) }
  }, [selectedId, loadThread])

  // SSE
  useEffect(() => {
    if (!authed) return
    const src = createRealtimeConnection(
      (type, data) => {
        const cid = (data as { conversationId?: string; customerId?: string }).conversationId
        loadAll()
        if (cid && cid === selectedId) loadThread(cid)
      },
      (transport) => setSseTransport(transport),
    )
    if (src) {
      sseRef.current = src
      src.onerror = () => setSseTransport('unknown')
    }
    return () => { src?.close(); setSseTransport('unknown') }
  }, [authed, selectedId, loadAll, loadThread])

  // Debounced tab change load
  useEffect(() => {
    if (!authed) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(loadAll, 200)
  }, [authed, tab, loadAll])

  async function handleAction(action: 'takeover' | 'release' | 'close') {
    if (!selectedId) return
    try {
      if (action === 'takeover') await takeoverConversation(selectedId)
      else if (action === 'release') await releaseAi(selectedId)
      else await closeConversation(selectedId)
      await loadThread(selectedId)
      await loadAll()
    } catch (ex) { alert(toChineseError(ex, '操作失败')) }
  }

  async function handleLoadOlder() {
    if (!selectedId) return
    const nextPage = msgPage + 1
    try {
      const res = await fetchMessages(selectedId, nextPage)
      setMessages(prev => [...res.data, ...prev])
      setMsgPage(nextPage)
    } catch { /* ignore */ }
  }

  function handleLogout() {
    clearToken()
    sseRef.current?.close()
    setAuthed(false)
    setAllConvs([])
    setSelectedId(null)
    setDetail(null)
    setMessages([])
  }

  if (authed === null) return null
  if (!authed) return <MobileLoginForm onLogin={() => setAuthed(true)} />

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Thread view (full-screen overlay) */}
      {selectedId && detail && (
        <ThreadView
          conv={detail}
          messages={messages}
          totalMessages={totalMsgs}
          currentPage={msgPage}
          onBack={() => setSelectedId(null)}
          onLoadOlder={handleLoadOlder}
          onAction={handleAction}
          onRefresh={() => loadThread(selectedId)}
        />
      )}

      {/* Main PWA */}
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">O</span>
          </div>
          <span className="font-semibold text-gray-900 text-sm">Omni</span>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${sseTransport === 'redis' ? 'bg-green-400' : sseTransport === 'memory' ? 'bg-yellow-400' : 'bg-gray-300'}`}
            title={sseTransport === 'redis' ? '实时（Redis）' : sseTransport === 'memory' ? '实时（本地）' : '已断开'}
          />
          <button onClick={handleLogout} className="text-xs text-gray-400">退出登录</button>
        </div>
      </div>

      {/* Tab content */}
      {tab === 'boss' && (
        <BossTodayTab conversations={allConvs} onSelect={setSelectedId} />
      )}
      {tab === 'inbox' && (
        <ListTab
          title="对话收件箱"
          conversations={allConvs}
          emptyMsg="暂无进行中的对话"
          onSelect={setSelectedId}
        />
      )}
      {tab === 'human' && (
        <ListTab
          title="需要人工"
          conversations={humanConvs}
          emptyMsg="暂无需要人工介入的对话"
          onSelect={setSelectedId}
        />
      )}
      {tab === 'intent' && (
        <ListTab
          title="高意向客户"
          conversations={intentConvs.filter(c => c.customer.score >= 60)}
          emptyMsg="当前暂无高意向客户"
          onSelect={setSelectedId}
        />
      )}
      {tab === 'followup' && (
        <FollowUpTab onOpenConversation={setSelectedId} />
      )}

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex safe-bottom z-10">
        {TABS.map(({ id, label, icon }) => {
          const count =
            id === 'human'  ? humanConvs.length :
            id === 'inbox'  ? allConvs.length : 0
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
                tab === id ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              <span className="text-xl leading-none relative">
                {icon}
                {count > 0 && id !== 'inbox' && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold leading-none">
                    {count > 9 ? '9' : count}
                  </span>
                )}
              </span>
              <span className={`text-xs font-medium ${tab === id ? 'text-blue-600' : 'text-gray-400'}`}>{label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
