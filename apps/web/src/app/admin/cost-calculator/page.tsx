'use client'

import { useState } from 'react'
import { getToken, estimateCost, type CostEstimate } from '@/lib/api'

const PACKAGES = [
  { name: 'Starter',  priceRm: 199 },
  { name: 'Pro',      priceRm: 499 },
  { name: 'Business', priceRm: 999 },
]

function Field({ label, value, onChange, min, max, step, suffix }: {
  label: string; value: number; onChange: (n: number) => void;
  min?: number; max?: number; step?: number; suffix?: string
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number" value={value} min={min} max={max} step={step ?? 1}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400"
        />
        {suffix && <span className="text-sm text-gray-400 flex-shrink-0">{suffix}</span>}
      </div>
    </div>
  )
}

function ResultRow({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: 'green' | 'red' | 'blue' }) {
  const colors = { green: 'text-emerald-600', red: 'text-red-600', blue: 'text-blue-600' }
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm text-gray-700">{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
      <span className={`text-sm font-bold ${highlight ? colors[highlight] : 'text-gray-900'}`}>{value}</span>
    </div>
  )
}

export default function CostCalculatorPage() {
  const isLoggedIn = !!getToken()
  const [inputs, setInputs] = useState({
    tenantCount:              10,
    activeCustomersPerTenant: 100,
    avgAiRepliesPerCustomer:  5,
    aiCostPer1kRepliesUsd:    0.08,
    metaConversationFeeUsd:   0.04,
    serverCostUsdPerMonthBase: 100,
    serverCostUsdPerTenant:   5,
    supportCostUsdPerMonthBase: 50,
    selectedPackageName:      'Pro',
    targetGrossMarginPct:     60,
  })
  const [result, setResult] = useState<CostEstimate | null>(null)
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState('')

  const set = (k: keyof typeof inputs) => (v: number) => setInputs(prev => ({ ...prev, [k]: v }))

  async function calculate() {
    if (!isLoggedIn) { setError('Sign in first to use the calculator.'); return }
    setError(''); setBusy(true)
    try {
      const r = await estimateCost(inputs as unknown as Record<string, unknown>)
      setResult(r)
    } catch (e) { setError(e instanceof Error ? e.message : 'Calculation failed') }
    finally { setBusy(false) }
  }

  const r = result

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">O</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Cost Calculator</h1>
            <p className="text-xs text-gray-400">Internal pricing planner — not customer-facing</p>
          </div>
        </div>
        <a href="/boss" className="text-xs text-blue-500 hover:text-blue-700 font-medium">← Boss Dashboard</a>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {!isLoggedIn && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl px-5 py-3 text-sm mb-6">
            You need to be signed in (OWNER or ADMIN role) to run calculations.
            <a href="/inbox" className="ml-2 underline font-medium">Sign in via Inbox →</a>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inputs */}
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-800 mb-4">Business Parameters</h2>
              <div className="space-y-4">
                <Field label="Tenant / client count"       value={inputs.tenantCount}              onChange={set('tenantCount')}              min={1} />
                <Field label="Active customers per tenant" value={inputs.activeCustomersPerTenant}  onChange={set('activeCustomersPerTenant')}  min={1} />
                <Field label="Avg AI replies per customer" value={inputs.avgAiRepliesPerCustomer}   onChange={set('avgAiRepliesPerCustomer')}   min={0} />
                <Field label="Target gross margin"         value={inputs.targetGrossMarginPct}      onChange={set('targetGrossMarginPct')}      min={0} max={95} step={5} suffix="%" />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-800 mb-1">AI + Meta Costs</h2>
              <p className="text-xs text-gray-400 mb-4">Verify with provider pricing pages before any billing decisions</p>
              <div className="space-y-4">
                <Field label="AI cost per 1,000 replies"       value={inputs.aiCostPer1kRepliesUsd}   onChange={set('aiCostPer1kRepliesUsd')}   min={0} step={0.01} suffix="USD" />
                <Field label="Meta conversation fee (per conv)" value={inputs.metaConversationFeeUsd}  onChange={set('metaConversationFeeUsd')}  min={0} step={0.001} suffix="USD" />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-800 mb-4">Infrastructure Costs</h2>
              <div className="space-y-4">
                <Field label="Server base cost / month"      value={inputs.serverCostUsdPerMonthBase}  onChange={set('serverCostUsdPerMonthBase')}  min={0} suffix="USD" />
                <Field label="Server cost per tenant"        value={inputs.serverCostUsdPerTenant}     onChange={set('serverCostUsdPerTenant')}     min={0} step={0.5} suffix="USD" />
                <Field label="Support cost / month"          value={inputs.supportCostUsdPerMonthBase} onChange={set('supportCostUsdPerMonthBase')} min={0} suffix="USD" />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-800 mb-4">Package</h2>
              <div className="grid grid-cols-3 gap-2">
                {PACKAGES.map(pkg => (
                  <button
                    key={pkg.name}
                    onClick={() => setInputs(p => ({ ...p, selectedPackageName: pkg.name }))}
                    className={`py-3 rounded-xl border text-sm font-semibold transition-colors ${
                      inputs.selectedPackageName === pkg.name
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div>{pkg.name}</div>
                    <div className={`text-xs mt-0.5 ${inputs.selectedPackageName === pkg.name ? 'text-blue-100' : 'text-gray-400'}`}>RM {pkg.priceRm}</div>
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

            <button
              onClick={calculate} disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-3.5 text-sm font-bold disabled:opacity-50"
            >
              {busy ? 'Calculating…' : 'Calculate Estimate'}
            </button>
          </div>

          {/* Results */}
          <div>
            {!r ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
                <p className="text-3xl mb-2">💰</p>
                <p className="text-sm font-medium">Enter your parameters and click Calculate</p>
                <p className="text-xs mt-1 text-gray-300">All figures are estimates — verify before pricing decisions</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Recommendation */}
                <div className={`rounded-2xl border p-5 ${r.revenue.grossMarginPct >= 50 ? 'bg-emerald-50 border-emerald-200' : r.revenue.grossMarginPct >= 20 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                  <h3 className="text-sm font-bold text-gray-800 mb-1">Recommendation</h3>
                  <p className="text-sm text-gray-700">{r.recommendation.advice}</p>
                  <p className="text-xs text-gray-500 mt-1">Break-even: RM {r.recommendation.breakEvenRmPerTenant}/tenant · Min price: RM {r.recommendation.suggestedMinPriceRm}/tenant</p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">AI Cost</h3>
                  <ResultRow label="Total AI replies"  value={r.ai.totalReplies.toLocaleString()} />
                  <ResultRow label="AI cost (USD)"    value={`$${r.ai.totalAiCostUsd.toFixed(2)}`} />
                  <ResultRow label="AI cost (MYR)"    value={`RM ${r.ai.totalAiCostRm.toFixed(2)}`} />
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-1">Meta WhatsApp Fees</h3>
                  <p className="text-xs text-gray-400 mb-3">{r.meta.note}</p>
                  <ResultRow label="Est. conversations"    value={r.meta.estimatedConversations.toLocaleString()} />
                  <ResultRow label="Meta fees (USD)"      value={`$${r.meta.totalMetaCostUsd.toFixed(2)}`} />
                  <ResultRow label="Meta fees (MYR)"      value={`RM ${r.meta.totalMetaCostRm.toFixed(2)}`} />
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">Total Cost vs Revenue</h3>
                  <ResultRow label="Total cost (MYR)"         value={`RM ${r.totals.totalCostRm.toFixed(2)}`} />
                  <ResultRow label="Cost per tenant (MYR)"    value={`RM ${r.totals.costPerTenantRm.toFixed(2)}`} />
                  <ResultRow label="Revenue at selected pkg"  value={`RM ${r.revenue.totalRevenueRm.toFixed(2)}`} highlight="blue" />
                  <ResultRow
                    label="Gross profit (MYR)"
                    value={`RM ${r.revenue.grossProfitRm.toFixed(2)}`}
                    highlight={r.revenue.grossProfitRm >= 0 ? 'green' : 'red'}
                  />
                  <ResultRow
                    label="Gross margin"
                    value={`${r.revenue.grossMarginPct.toFixed(1)}%`}
                    highlight={r.revenue.grossMarginPct >= 50 ? 'green' : r.revenue.grossMarginPct >= 20 ? undefined : 'red'}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
