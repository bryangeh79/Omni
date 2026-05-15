'use client'
// Round-9C: SaaS Admin Platform AI Settings (foundation only).
//
// Tenant-facing UI is intentionally clean and does NOT expose any AI
// provider / model / API key fields. All AI configuration is owned by
// SaaS Admin / platform operators. This page is the foundation entry
// point. The actual key vault, model selection, and cost controls are
// platform-internal and surfaced read-only here.

import { useEffect, useState } from 'react'
import { getToken, login } from '@/lib/api'

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [slug, setSlug] = useState(''); const [email, setEmail] = useState(''); const [pass, setPass] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await login(slug, email, pass); onLogin() } catch (ex) { setErr(ex instanceof Error ? ex.message : '登录失败') } finally { setBusy(false) }
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-gray-900 text-center">平台 AI 设置 · SaaS Admin</h1>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="租户标识" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  )
}

export default function AdminAiSettingsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  useEffect(() => { setAuthed(!!getToken()) }, [])
  if (authed === null) return null
  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">平台 AI 设置 · SaaS Admin</h1>
            <p className="text-xs text-gray-400">仅 SaaS Admin / 平台运维可见 · 不向租户暴露</p>
          </div>
          <a href="/admin/tenants" className="text-xs text-blue-600 hover:text-blue-700">← 租户管理</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-800 space-y-1">
          <p><strong>⚠ 内部页面：</strong>本页仅展示平台 AI 集成的<strong>只读状态</strong>。真实 API Key、provider key、私钥<strong>绝不显示</strong>在任何前端响应中。</p>
          <p><strong>租户隔离：</strong>普通租户使用平台托管 AI 服务，不能 / 不需要自带 API Key。</p>
        </div>

        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">平台 AI Provider</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <Field label="当前 Provider" value="（保留 — 由平台运维配置；不暴露明文 key）" />
            <Field label="默认模型" value="（保留 — 由平台运维配置）" />
            <Field label="API Key 状态" value="hasApiKey: —  ·  apiKeyLast4: —" />
            <Field label="允许租户自带 API Key" value="否" tone="danger" />
            <Field label="OMNI_ENABLE_ONBOARDING_AI" value="（运维 env flag · 默认 false · 不向租户暴露）" />
            <Field label="真实 AI provider 调用" value="false（当前为确定性 stub 模式）" tone="ok" />
          </div>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            <strong>说明：</strong>Omni 当前采用<strong>平台托管 AI 服务</strong>商业模式。平台运维统一管理 provider / 模型 / 成本 / 速率限制 / Vault 加密；租户配额扣费通过 Round-9A 的 quota engine 计算（FAQ 生成 + AI 回复）。真实 provider 调用尚未接入；当前所有 AI 生成均为 deterministic stub。
          </p>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">成本 / 用量</h2>
          <ul className="text-xs text-gray-700 space-y-1">
            <li>• 用量记录写入 `UsageRecord` 表（按日聚合 llmTokens / llmCostUsd / messages）。</li>
            <li>• 配额扣费通过 `TenantBillingState.monthlyUsage` + `purchasedCredits` 计算（Round-9A）。</li>
            <li>• 成本估算见 `/admin/cost-calculator`（内部预算规划工具）。</li>
          </ul>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">关联工具</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <a href="/admin/cost-calculator" className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">成本计算器</a>
            <a href="/audit?action=BILLING_AI_SMART_REPLY_TOGGLED" className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">AI Smart Reply 切换审计</a>
            <a href="/admin/tenants" className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200">租户管理</a>
          </div>
        </section>

        <p className="text-[11px] text-gray-400">
          后续 Round 计划：接入真实 OpenAI / Gemini / DeepSeek provider（env flag `OMNI_ENABLE_ONBOARDING_AI=true` 守门）、Vault-encrypted key rotation、按 tenant cost meter。当前页为占位 foundation。
        </p>
      </main>
    </div>
  )
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'danger' }) {
  const color = tone === 'ok' ? 'text-emerald-700' : tone === 'danger' ? 'text-red-700' : 'text-gray-800'
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-sm font-mono mt-0.5 ${color}`}>{value}</p>
    </div>
  )
}
