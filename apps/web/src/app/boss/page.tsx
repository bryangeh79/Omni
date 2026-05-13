'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  login, clearToken, getToken, fetchBossToday, fetchBossMetrics,
  type BossToday, type BossMetrics, type ActionItem,
} from '@/lib/api'

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
    catch (ex) { setErr(ex instanceof Error ? ex.message : 'Login failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 mb-3">
            <span className="text-white text-lg font-bold">O</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Boss Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to your Omni workspace</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Tenant slug" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Password" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign In'}
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
          {action.link === '/inbox' ? 'Open Inbox →' : 'Open PWA →'}
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

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function BossDashboardPage() {
  const [authed,  setAuthed]  = useState(false)
  const [today,   setToday]   = useState<BossToday | null>(null)
  const [metrics, setMetrics] = useState<BossMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  useEffect(() => { setAuthed(!!getToken()) }, [])

  const load = useCallback(async () => {
    if (!getToken()) return
    setError(null)
    try {
      const [t, m] = await Promise.all([fetchBossToday(), fetchBossMetrics()])
      setToday(t); setMetrics(m); setLastRefresh(new Date())
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!authed) return
    load()
    // Refresh every 2 minutes
    const interval = setInterval(load, 120_000)
    return () => clearInterval(interval)
  }, [authed, load])

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
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">O</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Boss Dashboard</h1>
            {lastRefresh && (
              <p className="text-xs text-gray-400">Updated {lastRefresh.toLocaleTimeString()}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href="/inbox" className="text-xs text-blue-500 hover:text-blue-700 font-medium">Inbox →</a>
          <a href="/pwa" className="text-xs text-blue-500 hover:text-blue-700 font-medium">Mobile →</a>
          <button onClick={() => { clearToken(); setAuthed(false) }} className="text-xs text-gray-400 hover:text-gray-600">Sign out</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-3 text-sm flex items-center justify-between">
            {error}
            <button onClick={load} className="font-medium underline">Retry</button>
          </div>
        )}

        {loading && !t && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-3xl mb-2">⏳</p>
            <p className="text-sm">Loading your command center…</p>
          </div>
        )}

        {t && (
          <>
            {/* Date / summary bar */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </h2>
                <p className="text-sm text-gray-400">Tenant {t.tenantId.slice(0, 12)}…</p>
              </div>
              <button onClick={load} className="text-sm text-blue-500 hover:text-blue-700 font-medium">↻ Refresh</button>
            </div>

            {/* Urgent actions — if any */}
            {urgentActions.length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-red-600 uppercase tracking-wide mb-3">🚨 Urgent — Needs Immediate Action</h3>
                <div className="space-y-2">
                  {urgentActions.map((a, i) => <ActionCard key={i} action={a} />)}
                </div>
              </section>
            )}

            {/* Today stat cards */}
            <section>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Today at a Glance</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <StatCard label="Needs Human"      value={t.today.needHuman}           color={t.today.needHuman > 0 ? 'text-amber-600' : 'text-gray-900'} />
                <StatCard label="High Intent"      value={t.today.highIntentCustomers} color={t.today.highIntentCustomers > 0 ? 'text-orange-600' : 'text-gray-900'} />
                <StatCard label="New Customers"    value={t.today.newCustomers} />
                <StatCard label="Open Convs"       value={t.today.openConversations} />
                <StatCard label="Closed Today"     value={t.today.closedToday} />
                <StatCard label="AI Replies"       value={t.today.aiReplies} sub={`~$${t.today.aiCostUsd.toFixed(3)} USD`} />
              </div>
            </section>

            {/* Follow-up workload */}
            <section>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Follow-up Workload</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Overdue"          value={t.today.overdueFollowUps}       color={t.today.overdueFollowUps > 0 ? 'text-red-600' : 'text-gray-900'} />
                <StatCard label="Due Today"        value={t.today.dueFollowUpsToday}      color={t.today.dueFollowUpsToday > 0 ? 'text-amber-600' : 'text-gray-900'} />
                <StatCard label="Human Reminders"  value={t.today.humanRemindersPending}  color={t.today.humanRemindersPending > 0 ? 'text-orange-600' : 'text-gray-900'} />
                {m && <StatCard label="Total Pending" value={m.followUps.pending} />}
              </div>
            </section>

            {/* Urgent customers */}
            {t.urgentCustomers.length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Customers Needing Human Attention</h3>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">Customer</th>
                        <th className="text-left px-4 py-3 font-medium">Stage</th>
                        <th className="text-left px-4 py-3 font-medium">Score</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">Last Activity</th>
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
                              {c.customer.stage}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-700">{c.customer.score}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-amber-100 text-amber-700 rounded-lg px-2 py-0.5 font-medium">{c.status}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <a href="/inbox" className="text-xs text-blue-500 font-medium hover:text-blue-700">Open →</a>
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
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Recommended Actions</h3>
                <div className="space-y-2">
                  {[...highActions, ...normalActions].map((a, i) => <ActionCard key={i} action={a} />)}
                </div>
              </section>
            )}
          </>
        )}

        {/* 30-day metrics */}
        {m && (
          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">30-Day Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Customers"   value={m.customers.total} sub={`+${m.customers.new30d} this month`} />
              <StatCard label="High Intent"        value={m.customers.highIntent} sub="Score ≥ 60" color="text-orange-600" />
              <StatCard label="Conversations Closed" value={m.conversations.closed30d} sub={`${m.conversations.closedToday} today`} />
              <StatCard label="AI Replies (30d)"  value={m.usage30d.aiReplies} sub={`~$${m.usage30d.estimatedCostUsd.toFixed(2)} USD`} />
            </div>

            {/* Stage breakdown */}
            {Object.keys(m.customers.stageBreakdown).length > 0 && (
              <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Lead Stage Breakdown</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(m.customers.stageBreakdown).sort(([,a],[,b]) => b-a).map(([stage, count]) => (
                    <div key={stage} className={`text-sm rounded-xl px-3 py-1.5 font-medium ${STAGE_COLOR[stage] ?? 'bg-gray-100 text-gray-600'}`}>
                      {stage}: {count}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Quick links */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Quick Navigation</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { href: '/inbox',                  label: '💬 Operator Inbox',        sub: 'Web dashboard' },
              { href: '/pwa',                    label: '📱 Mobile PWA',             sub: 'On-the-go' },
              { href: '/admin/cost-calculator',  label: '💰 Cost Calculator',        sub: 'Internal planning' },
              { href: '/boss',                   label: '⚡ Boss Dashboard',          sub: 'This page' },
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
