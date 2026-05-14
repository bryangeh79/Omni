'use client'

import { useEffect, useState } from 'react'
import { getToken, login, fetchBillingPlans, fetchUsageSummary, selectPlanDraft, type BillingPlan, type UsageSummary } from '@/lib/api'
import { planLabel, planPeriodLabel } from '@/lib/enumLabels'
import { toChineseError } from '@/lib/errorText'

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [slug, setSlug] = useState(''); const [email, setEmail] = useState(''); const [pass, setPass] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await login(slug, email, pass); onLogin() }
    catch (ex) { setErr(ex instanceof Error ? ex.message : '登录失败') }
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
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="租户标识" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  )
}

function PlanCard({ plan, current, onSelect, selecting }: { plan: BillingPlan; current: string; onSelect: (id: string) => void; selecting: boolean }) {
  const isActive = current === plan.id
  return (
    <div className={`rounded-2xl border-2 p-5 transition-all ${isActive ? 'border-blue-500 bg-blue-50' : plan.recommended ? 'border-blue-200 bg-white' : 'border-gray-200 bg-white'}`}>
      {plan.recommended && <div className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full inline-block mb-2">最受欢迎</div>}
      {isActive && <div className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-block mb-2">当前套餐</div>}
      <h3 className="text-lg font-bold text-gray-900" title={plan.id}>{planLabel(plan.id) || plan.name}</h3>
      <p className="text-2xl font-bold text-blue-700 my-2">RM{plan.priceRm}<span className="text-sm font-normal text-gray-400">/{planPeriodLabel(plan.period)}</span></p>
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
        title={isActive ? '当前已选中此套餐' : '仅记录套餐草稿，不会触发真实扣款'}
        aria-label={`选择套餐 ${planLabel(plan.id)}`}
        className={`w-full rounded-xl py-2 text-sm font-semibold transition-all disabled:opacity-50 ${isActive ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
      >
        {isActive ? '当前套餐' : selecting ? '保存中…' : '选择套餐（草稿）'}
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
      setNotice(`套餐「${planLabel(planId)}」已保存为草稿，不会触发真实扣费。`)
      setTimeout(() => setNotice(''), 4000)
      await load()
    } catch (e) { setError(toChineseError(e, '选择套餐失败')) }
    finally { setSelecting(false) }
  }

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center"><span className="text-white text-xs font-bold">$</span></div>
            <div><h1 className="text-base font-semibold text-gray-900">套餐与计费</h1><p className="text-xs text-gray-400" title={plans?.currentPlan ?? ''}>当前套餐：{plans ? planLabel(plans.currentPlan) : '…'}</p></div>
          </div>
          <nav className="flex items-center gap-3 text-xs">
            <a href="/settings" className="text-gray-500 hover:text-gray-700">设置</a>
            <span className="text-gray-200">|</span>
            <a href="/team" className="text-indigo-600 hover:text-indigo-800">团队</a>
            <span className="text-gray-200">|</span>
            <a href="/production-qa" className="text-emerald-600 hover:text-emerald-800">QA 清单</a>
            <span className="text-gray-200">|</span>
            <a href="/boss" className="text-gray-500 hover:text-gray-700">工作台</a>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {error  && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}
        {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-5 py-3 text-sm">{notice}</div>}

        {/* No real charge notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-800 space-y-1">
          <p><strong>规划模式：</strong>套餐选择仅为草稿偏好。尚未配置真实支付网关，完成支付集成前不会产生任何扣费。</p>
          <p><strong>权限：</strong>仅 OWNER 或 ADMIN 可选择套餐。MANAGER / AGENT / VIEWER 为只读权限。</p>
        </div>

        {/* Usage summary */}
        {usage && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">本月用量（{usage.period}）</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'AI 回复数',  value: usage.usage.aiRepliesThisMonth.toLocaleString() },
                { label: '客户数',     value: usage.usage.customers.toLocaleString() },
                { label: '知识条目',   value: usage.usage.activeKnowledgeItems.toLocaleString() },
                { label: 'AI 估算成本', value: `RM ${usage.usage.estimatedCostRm}` },
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
            <h2 className="text-sm font-semibold text-gray-700 mb-3">重要边界</h2>
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
