'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  login, clearToken, getToken, fetchBossToday, fetchBossMetrics, fetchBossPipeline,
  fetchChannelHealth, createRealtimeConnection, fetchOnboardingProgress,
  type BossToday, type BossMetrics, type ActionItem, type BossPipeline, type SseTransport,
  type ChannelHealth, type OnboardingProgress,
} from '@/lib/api'
import { stageLabel, channelTypeLabel } from '@/lib/enumLabels'

// SSE event types that should trigger a Boss refresh
const BOSS_REFRESH_EVENTS = new Set([
  'conversation.updated', 'conversation.message.created', 'conversation.handoff.updated',
  'followup.created', 'followup.updated', 'followup.due', 'customer.updated',
])

const STAGE_COLORS_HEX: Record<string, string> = {
  NEW: '#6b7280', INTERESTED: '#3b82f6', HIGH_INTENT: '#f97316',
  QUOTED: '#eab308', BOOKED: '#22c55e', WON: '#10b981', LOST: '#ef4444', AFTER_SALES: '#a855f7',
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [slug, setSlug]   = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass]   = useState('')
  const [err, setErr]     = useState('')
  const [busy, setBusy]   = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await login(slug, email, pass); onLogin() }
    catch (ex) { setErr(ex instanceof Error ? ex.message : '登录失败') }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 mb-3">
            <span className="text-white text-lg font-bold">O</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">老板工作台</h1>
          <p className="text-sm text-gray-400 mt-1">登录到您的 Omni 工作空间</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err === 'Failed to fetch' ? '无法连接到服务器，请检查 API 是否在运行' : err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="租户标识（可选 · 高级登录）" value={slug} onChange={e => setSlug(e.target.value)} />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  )
}

// ── Action badge ──────────────────────────────────────────────────────────────
const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'bg-red-50 border-red-200 text-red-700',
  high:   'bg-amber-50 border-amber-200 text-amber-700',
  normal: 'bg-blue-50 border-blue-200 text-blue-600',
}
const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high:   'bg-amber-400',
  normal: 'bg-blue-400',
}

function ActionCard({ action }: { action: ActionItem }) {
  const style = PRIORITY_STYLE[action.priority] ?? PRIORITY_STYLE.normal
  const dot   = PRIORITY_DOT[action.priority]   ?? PRIORITY_DOT.normal
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${style}`}>
      <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{action.label}</p>
        {action.hint && <p className="text-xs mt-0.5 opacity-75">{action.hint}</p>}
      </div>
      {action.link && (
        <a href={action.link} className="text-xs font-medium underline underline-offset-2 flex-shrink-0">
          {action.link === '/inbox' ? '打开收件箱 →' : '打开手机端 →'}
        </a>
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

// ── Stage badge ───────────────────────────────────────────────────────────────
const STAGE_COLOR: Record<string, string> = {
  NEW: 'bg-gray-100 text-gray-600', INTERESTED: 'bg-blue-100 text-blue-700',
  HIGH_INTENT: 'bg-orange-100 text-orange-700', QUOTED: 'bg-yellow-100 text-yellow-700',
  BOOKED: 'bg-green-100 text-green-700', WON: 'bg-emerald-100 text-emerald-700',
  LOST: 'bg-red-100 text-red-700', AFTER_SALES: 'bg-purple-100 text-purple-700',
}

// ── Pipeline section ──────────────────────────────────────────────────────────
function PipelineSection({ pipeline }: { pipeline: BossPipeline }) {
  const maxCount = Math.max(...pipeline.funnel.map(f => f.count), 1)
  const VISIBLE = ['NEW','INTERESTED','HIGH_INTENT','QUOTED','BOOKED','WON','LOST']
  const visible = pipeline.funnel.filter(f => VISIBLE.includes(f.stage))

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">成交管道</h3>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pipeline.summary.pipelineHealthPct >= 50 ? 'bg-emerald-100 text-emerald-700' : pipeline.summary.pipelineHealthPct >= 20 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
          管道健康度 {pipeline.summary.pipelineHealthPct}%
        </span>
      </div>

      {/* Funnel bars */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="space-y-2.5">
          {visible.map((item) => (
            <div key={item.stage} className="flex items-center gap-3">
              <div className="w-24 text-xs font-medium text-gray-600 flex-shrink-0" title={item.stage}>{stageLabel(item.stage)}</div>
              <div className="flex-1 bg-gray-50 rounded-full h-7 overflow-hidden relative">
                <div
                  className="h-full rounded-full flex items-center px-3 transition-all"
                  style={{
                    width: `${Math.max(5, (item.count / maxCount) * 100)}%`,
                    backgroundColor: STAGE_COLORS_HEX[item.stage] ?? '#6b7280',
                    opacity: 0.85,
                  }}
                >
                  <span className="text-white text-xs font-bold">{item.count > 0 ? item.count : ''}</span>
                </div>
              </div>
              <div className="w-14 text-right text-xs text-gray-500 flex-shrink-0">
                {item.count}
                {item.overdueFollowUps > 0 && (
                  <span className="ml-1 text-red-500 font-bold">↑{item.overdueFollowUps}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-50 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div><span className="text-gray-400">新增（{pipeline.range}）</span><br /><span className="font-semibold text-gray-800">{pipeline.summary.newSince}</span></div>
          <div><span className="text-gray-400">成交（{pipeline.range}）</span><br /><span className="font-semibold text-emerald-600">{pipeline.summary.wonSince}</span></div>
          <div><span className="text-gray-400">流失（{pipeline.range}）</span><br /><span className="font-semibold text-red-600">{pipeline.summary.lostSince}</span></div>
          <div><span className="text-gray-400">高意向（无负责人）</span><br /><span className={`font-semibold ${pipeline.summary.highIntentNoOwner > 0 ? 'text-orange-600' : 'text-gray-800'}`}>{pipeline.summary.highIntentNoOwner}</span></div>
        </div>

        <p className="mt-3 text-xs text-gray-400 italic">{pipeline.summary.note}</p>
        <p className="text-xs text-gray-300 mt-1">↑ 红色数字代表逾期跟进数 · 条形长度越长代表该阶段客户越多</p>
      </div>
    </section>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function BossDashboardPage() {
  const [authed,    setAuthed]    = useState<boolean | null>(null)
  const [today,     setToday]     = useState<BossToday | null>(null)
  const [metrics,   setMetrics]   = useState<BossMetrics | null>(null)
  const [pipeline,  setPipeline]  = useState<BossPipeline | null>(null)
  const [pipeRange, setPipeRange] = useState<'today' | '7d' | '30d'>('30d')
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [sseTransport,   setSseTransport]   = useState<SseTransport>('unknown')
  const [channelHealth,  setChannelHealth]  = useState<ChannelHealth | null>(null)
  // Round-9D: surface a continue-setup card when activation journey is incomplete.
  const [progress,       setProgress]        = useState<OnboardingProgress | null>(null)
  const sseRef = useRef<EventSource | null>(null)

  useEffect(() => { setAuthed(!!getToken()) }, [])

  const load = useCallback(async (currentRange?: string) => {
    if (!getToken()) return
    setError(null)
    try {
      const range = currentRange ?? pipeRange
      const [t, m, p] = await Promise.all([fetchBossToday(), fetchBossMetrics(), fetchBossPipeline(range)])
      setToday(t); setMetrics(m); setPipeline(p); setLastRefresh(new Date())
      // Load channel health in background (non-blocking)
      fetchChannelHealth().then(setChannelHealth).catch(() => null)
      // Round-9D: load activation progress (non-blocking)
      fetchOnboardingProgress().then(setProgress).catch(() => null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [pipeRange])

  useEffect(() => {
    if (!authed) return
    load()
    // Fallback polling every 2 minutes
    const interval = setInterval(() => load(), 120_000)
    return () => clearInterval(interval)
  }, [authed, load])

  // SSE realtime refresh
  useEffect(() => {
    if (!authed) return
    const src = createRealtimeConnection(
      (type) => {
        if (BOSS_REFRESH_EVENTS.has(type)) {
          load()
        }
      },
      (transport) => setSseTransport(transport),
    )
    if (src) {
      sseRef.current = src
      src.onerror = () => setSseTransport('unknown')
    }
    return () => { src?.close(); setSseTransport('unknown') }
  }, [authed, load])

  if (authed === null) return null

  if (!authed) return <LoginForm onLogin={() => { setAuthed(true); load() }} />

  const t = today
  const m = metrics
  const urgentActions = t?.suggestedActions.filter(a => a.priority === 'urgent') ?? []
  const highActions   = t?.suggestedActions.filter(a => a.priority === 'high') ?? []
  const normalActions = t?.suggestedActions.filter(a => a.priority === 'normal') ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
            <span className="text-white text-sm font-bold">O</span>
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900 tracking-tight">老板工作台</h1>
            <p className="text-xs text-gray-400 leading-tight">今日重点、成交机会与客服跟进状态{lastRefresh && ` · 更新于 ${lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${sseTransport === 'redis' ? 'bg-green-400' : sseTransport === 'memory' ? 'bg-yellow-400' : 'bg-gray-300'}`}
              title={sseTransport === 'redis' ? '实时（Redis）' : sseTransport === 'memory' ? '实时（本地）' : '轮询模式'}
            />
            <span className="text-xs text-gray-400">{sseTransport !== 'unknown' ? '实时' : '轮询'}</span>
          </div>
          <a href="/inbox" className="text-xs text-blue-600 hover:text-blue-700 font-medium">收件箱 →</a>
          <a href="/pwa" className="text-xs text-blue-600 hover:text-blue-700 font-medium">手机端 →</a>
          <button onClick={() => { clearToken(); setAuthed(false); sseRef.current?.close() }} className="text-xs text-gray-400 hover:text-gray-600">退出</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-3 text-sm flex items-center justify-between">
            <span>{error === 'Failed to fetch' ? '无法连接到服务器，请检查 API 是否在运行' : error}</span>
            <button onClick={() => { void load() }} className="font-medium underline">重试</button>
          </div>
        )}

        {/* Round-9D: incomplete-setup continue-setup card (only shown when journey is incomplete) */}
        {progress && !progress.isComplete && (
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-blue-100 uppercase tracking-wide">一键开通进度</p>
                <h2 className="text-xl font-bold mt-1">您的 Omni AI 客服还差 {progress.totalCount - progress.completedCount} 步即可上线</h2>
                <p className="text-xs text-blue-100 mt-1.5">完成 6 步后，提交上线申请，服务商审核通过即可正式启动 AI 客服。</p>
              </div>
              <a href={progress.nextActionHref} className="bg-white text-blue-700 hover:bg-blue-50 text-xs font-semibold px-4 py-2 rounded-xl whitespace-nowrap">{progress.nextActionLabel} →</a>
            </div>
            <div className="w-full h-2 bg-blue-800/40 rounded-full overflow-hidden mt-4">
              <div className="h-full bg-white transition-all" style={{ width: `${progress.percent}%` }} />
            </div>
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-xs mt-3">
              {progress.steps.map(s => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span className={`w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] flex-shrink-0 ${s.completed ? 'bg-emerald-400 text-emerald-900' : 'bg-white/20 text-white/80'}`}>{s.completed ? '✓' : '·'}</span>
                  <span className={s.completed ? 'opacity-80 line-through' : ''}>{s.title}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <a href="/onboarding" className="bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg font-medium">继续开通</a>
              <a href="/knowledge" className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg">查看知识库</a>
              <a href="/channels/setup" className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg">连接 WhatsApp</a>
            </div>
          </div>
        )}

        {loading && !t && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-3xl mb-2">⏳</p>
            <p className="text-sm">正在加载工作台数据…</p>
          </div>
        )}

        {t && (
          <>
            {/* Date / summary bar */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
                  {new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">租户 {t.tenantId.slice(0, 12)}…</p>
              </div>
              <button onClick={() => { void load() }} className="text-sm text-blue-600 hover:text-blue-700 font-medium">↻ 刷新</button>
            </div>

            {/* Urgent actions — if any */}
            {urgentActions.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-red-600 mb-3 flex items-center gap-1.5">
                  <span>🚨</span><span>紧急处理 — 需要立即跟进</span>
                </h3>
                <div className="space-y-2">
                  {urgentActions.map((a, i) => <ActionCard key={i} action={a} />)}
                </div>
              </section>
            )}

            {/* Today stat cards */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">今日概览</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <StatCard label="需要人工"   value={t.today.needHuman}           color={t.today.needHuman > 0 ? 'text-amber-600' : 'text-gray-900'} />
                <StatCard label="高意向"     value={t.today.highIntentCustomers} color={t.today.highIntentCustomers > 0 ? 'text-orange-600' : 'text-gray-900'} />
                <StatCard label="新客户"     value={t.today.newCustomers} />
                <StatCard label="进行中对话" value={t.today.openConversations} />
                <StatCard label="今日已关闭" value={t.today.closedToday} />
                <StatCard label="AI 回复数"  value={t.today.aiReplies} sub={`约 $${t.today.aiCostUsd.toFixed(3)} USD`} />
              </div>
            </section>

            {/* Follow-up workload */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">跟进工作量</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="逾期跟进"   value={t.today.overdueFollowUps}       color={t.today.overdueFollowUps > 0 ? 'text-red-600' : 'text-gray-900'} />
                <StatCard label="今日到期"   value={t.today.dueFollowUpsToday}      color={t.today.dueFollowUpsToday > 0 ? 'text-amber-600' : 'text-gray-900'} />
                <StatCard label="人工提醒"   value={t.today.humanRemindersPending}  color={t.today.humanRemindersPending > 0 ? 'text-orange-600' : 'text-gray-900'} />
                {m && <StatCard label="待处理总数" value={m.followUps.pending} />}
              </div>
            </section>

            {/* Urgent customers */}
            {t.urgentCustomers.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">需要人工介入的客户</h3>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">客户</th>
                        <th className="text-left px-4 py-3 font-medium">阶段</th>
                        <th className="text-left px-4 py-3 font-medium">评分</th>
                        <th className="text-left px-4 py-3 font-medium">状态</th>
                        <th className="text-left px-4 py-3 font-medium">最近活动</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {t.urgentCustomers.map((c) => (
                        <tr key={c.conversationId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {c.customer.name ?? c.customer.phone}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${STAGE_COLOR[c.customer.stage] ?? 'bg-gray-100 text-gray-600'}`}>
                              {stageLabel(c.customer.stage)}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-700">{c.customer.score}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-amber-100 text-amber-700 rounded-lg px-2 py-0.5 font-medium">{c.status}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <a href="/inbox" className="text-xs text-blue-600 font-medium hover:text-blue-700">打开 →</a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* High + normal actions */}
            {(highActions.length > 0 || normalActions.length > 0) && (
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">今日建议动作</h3>
                <div className="space-y-2">
                  {[...highActions, ...normalActions].map((a, i) => <ActionCard key={i} action={a} />)}
                </div>
              </section>
            )}
          </>
        )}

        {/* Pipeline section */}
        {pipeline && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">成交管道 — 时间范围</h3>
              <div className="flex gap-1">
                {([
                  { v: 'today', label: '今日' },
                  { v: '7d',    label: '近 7 日' },
                  { v: '30d',   label: '近 30 日' },
                ] as const).map(({ v, label }) => (
                  <button
                    key={v}
                    onClick={() => { setPipeRange(v); load(v) }}
                    className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${pipeRange === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <PipelineSection pipeline={pipeline} />
          </section>
        )}

        {/* 30-day metrics */}
        {m && (
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">近 30 日趋势</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="客户总数"     value={m.customers.total} sub={`本月新增 +${m.customers.new30d}`} />
              <StatCard label="高意向客户"   value={m.customers.highIntent} sub="评分 ≥ 60" color="text-orange-600" />
              <StatCard label="已关闭对话"   value={m.conversations.closed30d} sub={`今日 ${m.conversations.closedToday}`} />
              <StatCard label="AI 回复（30 日）" value={m.usage30d.aiReplies} sub={`约 $${m.usage30d.estimatedCostUsd.toFixed(2)} USD`} />
            </div>

            {/* Stage breakdown */}
            {Object.keys(m.customers.stageBreakdown).length > 0 && (
              <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <p className="text-sm font-semibold text-gray-700 mb-3">客户阶段分布</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(m.customers.stageBreakdown).sort(([,a],[,b]) => b-a).map(([stage, count]) => (
                    <div key={stage} className={`text-sm rounded-xl px-3 py-1.5 font-medium ${STAGE_COLOR[stage] ?? 'bg-gray-100 text-gray-600'}`} title={stage}>
                      {stageLabel(stage)}：{count}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Channel Health */}
        {channelHealth && (
          <section className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">渠道健康度</h3>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                channelHealth.healthLevel === 'OK'      ? 'bg-emerald-50 text-emerald-700' :
                channelHealth.healthLevel === 'WARN'    ? 'bg-amber-50 text-amber-700' :
                channelHealth.healthLevel === 'BLOCKED' ? 'bg-red-50 text-red-700' :
                'bg-gray-100 text-gray-500'
              }`}>
                {channelHealth.healthLevel === 'OK' ? '● 正常' : channelHealth.healthLevel === 'WARN' ? '● 警告' : '● 阻塞'}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              {[
                { label: '渠道类型',  value: channelHealth.channelType ? channelTypeLabel(channelHealth.channelType) : '—' },
                { label: '配置状态',  value: channelHealth.setupStatus },
                { label: '上线状态',  value: channelHealth.liveStatus.replace(/_/g, ' ') },
                { label: '真实发送',  value: channelHealth.realSendEnabled ? '已开启' : '已关闭（安全）' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className={`text-sm font-semibold mt-0.5 ${value === '已开启' ? 'text-red-600' : 'text-gray-700'}`}>{value}</p>
                </div>
              ))}
            </div>
            {channelHealth.nextAction && (
              <p className="text-xs text-gray-500 mb-2 italic">{channelHealth.nextAction}</p>
            )}
            <div className="flex gap-2 text-xs flex-wrap">
              <a href="/channels/setup" className="bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-xl hover:bg-green-100 font-medium">渠道设置 →</a>
              <a href="/launch-checklist" className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-xl hover:bg-emerald-100 font-medium">🚀 上线清单 →</a>
              {channelHealth.channelType === 'WA_WEB' && (
                <a href="/channels/setup/wa-web/qr" className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-xl hover:bg-blue-100 font-medium">📱 二维码扫码 →</a>
              )}
              {channelHealth.channelType === 'META_WA_BUSINESS' && (
                <a href="/channels/setup/meta-webhook" className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-xl hover:bg-indigo-100 font-medium">🔗 Meta Webhook →</a>
              )}
            </div>
            {channelHealth.lastCheckedAt && (
              <p className="text-xs text-gray-400 mt-2">最近检查：{new Date(channelHealth.lastCheckedAt).toLocaleTimeString('zh-CN')}</p>
            )}
          </section>
        )}

        {/* Quick links */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">快速导航</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { href: '/inbox',                  label: '💬 对话收件箱',  sub: 'Web 工作台' },
              { href: '/pwa',                    label: '📱 手机工作台',  sub: '移动办公' },
              { href: '/onboarding',             label: '🧙 上线向导',    sub: '一键启动配置' },
              { href: '/knowledge',              label: '🧠 知识库',      sub: 'FAQ 与内容' },
              { href: '/channels/setup',         label: '💬 渠道设置',    sub: 'WA / Meta 配置' },
              { href: '/launch-checklist',       label: '🚀 上线清单',    sub: '准备度检查' },
              { href: '/settings',               label: '⚙️ 设置',        sub: '账户与 AI 配置' },
              { href: '/billing',                label: '💳 套餐与计费',  sub: 'RM199/499/999+' },
              { href: '/production-qa',          label: '🔍 生产 QA',     sub: '上线准备度' },
              { href: '/admin/cost-calculator',  label: '💰 成本计算器',  sub: '内部预算规划' },
            ].map(({ href, label, sub }) => (
              <a key={href} href={href} className="group rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50 p-4 transition-colors">
                <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-700">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
              </a>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
