'use client'

import { useEffect, useState } from 'react'
import { getToken, login, fetchLaunchChecklist, type LaunchChecklist, type ChecklistItem } from '@/lib/api'

// ── Status styles ─────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { icon: string; ring: string; bg: string; text: string; label: string }> = {
  DONE:    { icon: '✓', ring: 'ring-emerald-300', bg: 'bg-emerald-50',  text: 'text-emerald-700', label: 'Done' },
  PENDING: { icon: '○', ring: 'ring-amber-300',   bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Pending' },
  WARN:    { icon: '!', ring: 'ring-yellow-300',   bg: 'bg-yellow-50',  text: 'text-yellow-700',  label: 'Optional' },
  BLOCKED: { icon: '✕', ring: 'ring-red-200',     bg: 'bg-red-50',     text: 'text-red-700',     label: 'Blocked' },
  SKIP:    { icon: '–', ring: 'ring-gray-200',     bg: 'bg-gray-50',   text: 'text-gray-500',    label: 'Skip' },
}

const LAUNCH_STATUS_CFG = {
  NOT_READY:                    { label: 'Not Ready', bg: 'bg-red-100',     text: 'text-red-800',     border: 'border-red-200' },
  READY_FOR_STAGING:            { label: 'Ready for Staging', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' },
  READY_FOR_PRODUCTION_REVIEW:  { label: 'Ready for Production Review', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' },
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await login(slug, email, pass); onLogin() }
    catch (ex) { setErr(ex instanceof Error ? ex.message : 'Login failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-600 mb-3">
            <span className="text-white text-2xl">🚀</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Launch Checklist</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to view your launch readiness</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Tenant slug" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Password" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? 'Signing in…' : 'Sign In'}</button>
      </form>
    </div>
  )
}

// ── Checklist Item Card ───────────────────────────────────────────────────────
function ItemCard({ item }: { item: ChecklistItem }) {
  const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.WARN
  return (
    <div className={`rounded-2xl border p-4 ring-1 ${cfg.ring} ${cfg.bg} transition-all`}>
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ring-1 ${cfg.ring} ${cfg.bg} ${cfg.text}`}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className={`text-sm font-semibold ${cfg.text}`}>{item.label}</p>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text} border border-current border-opacity-20`}>{cfg.label}</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{item.detail}</p>
        </div>
        {item.action && item.status !== 'DONE' && item.status !== 'SKIP' && (
          <a href={item.action} className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-xl font-medium ${item.status === 'BLOCKED' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white border border-gray-200 text-gray-700 hover:border-emerald-300 hover:text-emerald-700'}`}>
            {item.status === 'BLOCKED' ? 'Operator' : 'Fix →'}
          </a>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LaunchChecklistPage() {
  const [authed,    setAuthed]    = useState(false)
  const [checklist, setChecklist] = useState<LaunchChecklist | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    if (getToken()) { setAuthed(true); void loadChecklist() }
  }, [])

  async function loadChecklist() {
    setLoading(true); setError('')
    try { setChecklist(await fetchLaunchChecklist()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Load failed') }
    finally { setLoading(false) }
  }

  if (!authed) return <LoginForm onLogin={() => { setAuthed(true); void loadChecklist() }} />

  const launchStatusKey = checklist?.launchStatus ?? 'NOT_READY'
  const launchCfg = LAUNCH_STATUS_CFG[launchStatusKey] ?? LAUNCH_STATUS_CFG.NOT_READY
  const summary = checklist?.summary

  const readyItems   = checklist?.items.filter(i => i.status === 'DONE') ?? []
  const actionItems  = checklist?.items.filter(i => i.status === 'PENDING' || i.status === 'BLOCKED') ?? []
  const warnItems    = checklist?.items.filter(i => i.status === 'WARN') ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-lg">🚀</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Launch Checklist</h1>
              {checklist && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${launchCfg.bg} ${launchCfg.text} ${launchCfg.border}`}>
                  {launchCfg.label}
                </span>
              )}
            </div>
          </div>
          <nav className="flex items-center gap-3 text-xs">
            <a href="/channels/setup" className="text-emerald-600 hover:text-emerald-800">Channel Setup</a>
            <span className="text-gray-200">|</span>
            <a href="/boss" className="text-gray-400 hover:text-gray-600">Dashboard</a>
            <button onClick={() => { void loadChecklist() }} disabled={loading} className="text-xs px-3 py-1.5 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50">
              {loading ? '…' : '↻ Refresh'}
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}

        {loading && !checklist ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">⏳</p>
            <p className="text-sm">Loading checklist…</p>
          </div>
        ) : checklist ? (
          <>
            {/* Launch status banner */}
            <div className={`rounded-2xl border p-5 ${launchCfg.bg} ${launchCfg.border}`}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{launchStatusKey === 'NOT_READY' ? '🔴' : launchStatusKey === 'READY_FOR_STAGING' ? '🟡' : '🟢'}</span>
                <div>
                  <h2 className={`text-base font-bold ${launchCfg.text}`}>{launchCfg.label}</h2>
                  <p className={`text-xs ${launchCfg.text} opacity-80`}>{checklist.launchNote}</p>
                </div>
              </div>
              {summary && (
                <div className="flex gap-3 mt-3 flex-wrap">
                  {[
                    { label: 'Done',    count: summary.done,    color: 'bg-emerald-200 text-emerald-800' },
                    { label: 'Pending', count: summary.pending, color: 'bg-amber-200 text-amber-800' },
                    { label: 'Warning', count: summary.warn,    color: 'bg-yellow-200 text-yellow-800' },
                    { label: 'Blocked', count: summary.blocked, color: 'bg-red-200 text-red-800' },
                  ].map(({ label, count, color }) => count > 0 && (
                    <span key={label} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${color}`}>
                      {count} {label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Safety notice */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-xs text-blue-700">
              <strong>Real sending is disabled by default.</strong> <code>OMNI_ENABLE_REAL_META_SEND</code> and <code>OMNI_ALLOW_WA_SESSION</code> are <strong>OFF</strong> by default. An operator must explicitly enable them to go live.
            </div>

            {/* Needs action */}
            {actionItems.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-bold text-gray-700">Needs Action Before Live</h2>
                {actionItems.map(item => <ItemCard key={item.key} item={item} />)}
              </section>
            )}

            {/* Ready */}
            {readyItems.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-bold text-gray-700">Ready Now</h2>
                {readyItems.map(item => <ItemCard key={item.key} item={item} />)}
              </section>
            )}

            {/* Optional/warn */}
            {warnItems.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-bold text-gray-700">Optional / Recommended</h2>
                {warnItems.map(item => <ItemCard key={item.key} item={item} />)}
              </section>
            )}

            {/* Quick actions */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h2 className="text-sm font-bold text-gray-800 mb-3">Quick Actions</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  { href: '/onboarding',            label: 'Onboarding Wizard', icon: '🧙' },
                  { href: '/knowledge',              label: 'Knowledge Base',    icon: '🧠' },
                  { href: '/channels/setup',         label: 'Channel Setup',     icon: '💬' },
                  { href: '/channels/setup/meta-webhook', label: 'Meta Webhook', icon: '🔗' },
                  { href: '/inbox',                  label: 'Inbox',             icon: '📥' },
                  { href: '/boss',                   label: 'Boss Dashboard',    icon: '📊' },
                ].map(({ href, label, icon }) => (
                  <a key={href} href={href}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-xs font-medium text-gray-700 hover:text-emerald-700">
                    <span>{icon}</span>{label}
                  </a>
                ))}
              </div>
            </div>

            {/* Channel paths */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <h3 className="text-xs font-bold text-gray-700 mb-2">📱 WA Web Path</h3>
                <ul className="space-y-1.5 text-xs text-gray-600">
                  <li className="flex items-center gap-1.5"><span className="text-gray-400">→</span>Select WA_WEB channel type</li>
                  <li className="flex items-center gap-1.5"><span className="text-gray-400">→</span>Operator sets OMNI_ALLOW_WA_SESSION=true</li>
                  <li className="flex items-center gap-1.5"><span className="text-gray-400">→</span>QR scan session (Phase 14)</li>
                  <li className="flex items-center gap-1.5"><span className="text-amber-500">!</span>Session stability best-effort</li>
                </ul>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <h3 className="text-xs font-bold text-gray-700 mb-2">🏢 Meta API Path</h3>
                <ul className="space-y-1.5 text-xs text-gray-600">
                  <li className="flex items-center gap-1.5"><span className="text-gray-400">→</span>Select META_WA_BUSINESS type</li>
                  <li className="flex items-center gap-1.5"><span className="text-gray-400">→</span>Configure webhook in Meta App</li>
                  <li className="flex items-center gap-1.5"><span className="text-gray-400">→</span>Save encrypted credentials</li>
                  <li className="flex items-center gap-1.5"><span className="text-gray-400">→</span>Operator sets OMNI_ENABLE_REAL_META_SEND=true</li>
                </ul>
              </div>
            </div>

            {/* Safety defaults */}
            <div className="bg-gray-100 rounded-2xl px-5 py-4 text-xs text-gray-500">
              <p className="font-bold text-gray-600 mb-1">Current Safety State</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'WA Session',   value: checklist.safety.realWaSessionEnabled },
                  { label: 'Meta Send',    value: checklist.safety.realMetaSendEnabled },
                  { label: 'AI Provider',  value: checklist.safety.aiProviderEnabled },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between bg-white rounded-xl px-3 py-2">
                    <span>{label}</span>
                    <span className={`font-bold ${value ? 'text-red-600' : 'text-emerald-600'}`}>{value ? 'ON' : 'OFF'}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
