'use client'

import { useEffect, useState } from 'react'
import { getToken, login, fetchProductionQa, type ProductionQaResult } from '@/lib/api'

const STATUS_CFG = {
  PASS:   { icon: '✓', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Pass' },
  FAIL:   { icon: '✕', bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     label: 'Fail' },
  WARN:   { icon: '!', bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   label: 'Warn' },
  MANUAL: { icon: '?', bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    label: 'Manual' },
}

const OVERALL_CFG = {
  PASS:                     { label: 'Ready',               color: 'text-emerald-800', bg: 'bg-emerald-100', border: 'border-emerald-300' },
  FAIL:                     { label: 'Issues Found',         color: 'text-red-800',     bg: 'bg-red-100',     border: 'border-red-300' },
  WARN:                     { label: 'Warnings',             color: 'text-amber-800',   bg: 'bg-amber-100',   border: 'border-amber-300' },
  MANUAL_REVIEW_NEEDED:     { label: 'Manual Review Needed', color: 'text-blue-800',    bg: 'bg-blue-100',    border: 'border-blue-300' },
}

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [slug, setSlug] = useState(''); const [email, setEmail] = useState(''); const [pass, setPass] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await login(slug, email, pass); onLogin() }
    catch (ex) { setErr(ex instanceof Error ? ex.message : 'Login failed') }
    finally { setBusy(false) }
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-gray-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-800 mb-3"><span className="text-white text-xl">🔍</span></div>
          <h1 className="text-2xl font-bold text-gray-900">Production QA</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to run launch checks</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400" placeholder="Tenant slug" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400" placeholder="Password" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? 'Signing in…' : 'Sign In'}</button>
      </form>
    </div>
  )
}

export default function ProductionQaPage() {
  const [authed,  setAuthed]  = useState(false)
  const [qa,      setQa]      = useState<ProductionQaResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [filterCat, setFilterCat] = useState('All')

  useEffect(() => {
    if (getToken()) { setAuthed(true); void runQa() }
  }, [])

  async function runQa() {
    setLoading(true); setError('')
    try { setQa(await fetchProductionQa()) }
    catch (e) { setError(e instanceof Error ? e.message : 'QA check failed') }
    finally { setLoading(false) }
  }

  if (!authed) return <LoginForm onLogin={() => { setAuthed(true); void runQa() }} />

  const overallCfg = qa ? (OVERALL_CFG[qa.overallStatus as keyof typeof OVERALL_CFG] ?? OVERALL_CFG.MANUAL_REVIEW_NEEDED) : null
  const categories = qa ? ['All', ...Array.from(new Set(qa.items.map(i => i.category)))] : ['All']
  const filtered   = qa?.items.filter(i => filterCat === 'All' || i.category === filterCat) ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center"><span className="text-white text-sm">🔍</span></div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Production QA Checklist</h1>
              {qa && <p className="text-xs text-gray-400">{qa.summary.passed}/{qa.summary.total} passed · {qa.summary.failed} failed · {qa.summary.manual} manual</p>}
            </div>
          </div>
          <nav className="flex items-center gap-3 text-xs">
            <a href="/launch-checklist" className="text-emerald-600 hover:text-emerald-800">Launch Checklist</a>
            <span className="text-gray-200">|</span>
            <a href="/settings" className="text-gray-400 hover:text-gray-700">Settings</a>
            <button onClick={() => { void runQa() }} disabled={loading} className="text-xs px-3 py-1.5 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50">{loading ? '…' : '↻ Re-run'}</button>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}

        {loading && !qa ? (
          <div className="text-center py-16 text-gray-400"><p className="text-4xl mb-3">⏳</p><p>Running QA checks…</p></div>
        ) : qa ? (
          <>
            {/* Overall status */}
            {overallCfg && (
              <div className={`rounded-2xl border p-5 flex items-center gap-4 ${overallCfg.bg} ${overallCfg.border}`}>
                <span className="text-3xl">{qa.overallStatus === 'PASS' ? '🟢' : qa.overallStatus === 'FAIL' ? '🔴' : qa.overallStatus === 'WARN' ? '🟡' : '🔵'}</span>
                <div>
                  <p className={`text-base font-bold ${overallCfg.color}`}>{overallCfg.label}</p>
                  <p className={`text-xs ${overallCfg.color} opacity-80`}>{qa.operatorNote}</p>
                </div>
                <div className="ml-auto flex gap-2 flex-wrap">
                  {[
                    { label: 'Pass',   count: qa.summary.passed,  color: 'bg-emerald-200 text-emerald-800' },
                    { label: 'Fail',   count: qa.summary.failed,   color: 'bg-red-200 text-red-800' },
                    { label: 'Warn',   count: qa.summary.warned,   color: 'bg-amber-200 text-amber-800' },
                    { label: 'Manual', count: qa.summary.manual,   color: 'bg-blue-200 text-blue-800' },
                  ].filter(s => s.count > 0).map(({ label, count, color }) => (
                    <span key={label} className={`text-xs font-bold px-2.5 py-1 rounded-full ${color}`}>{count} {label}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Category filter */}
            <div className="flex gap-2 flex-wrap">
              {categories.map(cat => (
                <button key={cat} onClick={() => setFilterCat(cat)}
                  className={`text-xs px-3 py-1.5 rounded-full transition-all ${filterCat === cat ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-slate-400'}`}>
                  {cat}
                </button>
              ))}
            </div>

            {/* Items */}
            <div className="space-y-2">
              {filtered.map(item => {
                const cfg = STATUS_CFG[item.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.MANUAL
                return (
                  <div key={item.id} className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
                    <div className="flex items-start gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${cfg.bg} ${cfg.text} border ${cfg.border}`}>{cfg.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>{item.category}</span>
                          <p className={`text-sm font-semibold ${cfg.text}`}>{item.label}</p>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{item.detail}</p>
                      </div>
                      {item.action && item.status !== 'PASS' && (
                        <a href={item.action} className="text-xs text-blue-600 hover:text-blue-800 flex-shrink-0">Fix →</a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-xs text-gray-400 text-center">Last run: {new Date(qa.asOf).toLocaleString()}</p>
          </>
        ) : null}
      </main>
    </div>
  )
}
