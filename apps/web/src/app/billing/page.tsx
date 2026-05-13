'use client'

import { useEffect, useState } from 'react'
import { getToken, login, fetchBillingPlans, fetchUsageSummary, selectPlanDraft, type BillingPlan, type UsageSummary } from '@/lib/api'

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-3"><span className="text-white text-xl">💳</span></div>
          <h1 className="text-2xl font-bold text-gray-900">Billing & Plans</h1>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="Tenant slug" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="Password" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? 'Signing in…' : 'Sign In'}</button>
      </form>
    </div>
  )
}

function PlanCard({ plan, current, onSelect, selecting }: { plan: BillingPlan; current: string; onSelect: (id: string) => void; selecting: boolean }) {
  const isActive = current === plan.id
  return (
    <div className={`rounded-2xl border-2 p-5 transition-all ${isActive ? 'border-blue-500 bg-blue-50' : plan.recommended ? 'border-blue-200 bg-white' : 'border-gray-200 bg-white'}`}>
      {plan.recommended && <div className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full inline-block mb-2">Most Popular</div>}
      {isActive && <div className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-block mb-2">Current Plan</div>}
      <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
      <p className="text-2xl font-bold text-blue-700 my-2">RM{plan.priceRm}<span className="text-sm font-normal text-gray-400">/{plan.period}</span></p>
      <ul className="space-y-1.5 mb-4">
        {plan.features.map((f, i) => (
          <li key={i} className="text-xs text-gray-700 flex gap-1.5"><span className="text-emerald-500 flex-shrink-0">✓</span>{f}</li>
        ))}
      </ul>
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-3 space-y-1">
        <p className="text-xs text-amber-700">⚠ {plan.metaApiFeeNote}</p>
        <p className="text-xs text-amber-700">{plan.noBroadcastNote}</p>
      </div>
      <button
        onClick={() => onSelect(plan.id)}
        disabled={selecting || isActive}
        className={`w-full rounded-xl py-2 text-sm font-bold transition-all disabled:opacity-50 ${isActive ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
      >
        {isActive ? 'Current Plan' : selecting ? 'Saving…' : 'Select Plan (Draft)'}
      </button>
    </div>
  )
}

export default function BillingPage() {
  const [authed,   setAuthed]   = useState(false)
  const [plans,    setPlans]    = useState<{ plans: BillingPlan[]; currentPlan: string; boundary: Record<string,string>; paymentGateway: string } | null>(null)
  const [usage,    setUsage]    = useState<UsageSummary | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [notice,   setNotice]   = useState('')
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (getToken()) { setAuthed(true); void load() }
  }, [])

  async function load() {
    try {
      const [p, u] = await Promise.all([fetchBillingPlans(), fetchUsageSummary().catch(() => null)])
      setPlans(p); if (u) setUsage(u)
    } catch { /* ignore */ }
  }

  async function handleSelect(planId: string) {
    setSelecting(true); setError('')
    try {
      await selectPlanDraft(planId)
      setNotice(`Plan "${planId}" saved as draft. No real charge applied.`)
      setTimeout(() => setNotice(''), 4000)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Select failed') }
    finally { setSelecting(false) }
  }

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center"><span className="text-white text-sm">💳</span></div>
            <div><h1 className="text-base font-bold text-gray-900">Billing & Plans</h1><p className="text-xs text-gray-400">Current plan: {plans?.currentPlan ?? '…'}</p></div>
          </div>
          <nav className="flex items-center gap-3 text-xs">
            <a href="/settings" className="text-gray-400 hover:text-gray-700">Settings</a>
            <span className="text-gray-200">|</span>
            <a href="/team" className="text-indigo-600 hover:text-indigo-800">Team</a>
            <span className="text-gray-200">|</span>
            <a href="/production-qa" className="text-emerald-600 hover:text-emerald-800">QA Checklist</a>
            <span className="text-gray-200">|</span>
            <a href="/boss" className="text-gray-400 hover:text-gray-700">Dashboard</a>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {error  && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}
        {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-5 py-3 text-sm">{notice}</div>}

        {/* No real charge notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-800 space-y-1">
          <p><strong>Planning Mode:</strong> Plan selection is a draft preference. No real payment gateway is configured. No charges will occur until payment integration is completed.</p>
          <p><strong>RBAC:</strong> Only OWNER or ADMIN can select a plan. MANAGER/AGENT/VIEWER have read-only access to billing.</p>
        </div>

        {/* Usage summary */}
        {usage && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">This Month Usage ({usage.period})</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'AI Replies',   value: usage.usage.aiRepliesThisMonth.toLocaleString() },
                { label: 'Customers',    value: usage.usage.customers.toLocaleString() },
                { label: 'KB Items',     value: usage.usage.activeKnowledgeItems.toLocaleString() },
                { label: 'Est. AI Cost', value: `RM ${usage.usage.estimatedCostRm}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-base font-bold text-gray-800 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-600 mt-2">{usage.metaFeeNote}</p>
          </div>
        )}

        {/* Plan cards */}
        {plans && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.plans.map(plan => (
              <PlanCard key={plan.id} plan={plan} current={plans.currentPlan} onSelect={handleSelect} selecting={selecting} />
            ))}
          </div>
        )}

        {/* Boundaries */}
        {plans && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Important Boundaries</h2>
            <div className="space-y-2">
              {Object.entries(plans.boundary).map(([key, value]) => (
                <div key={key} className="flex items-start gap-2 text-xs">
                  <span className="text-amber-500 font-bold flex-shrink-0">⚠</span>
                  <span className="text-gray-700">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
