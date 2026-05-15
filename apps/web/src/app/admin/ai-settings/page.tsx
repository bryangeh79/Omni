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
// Round-9E: page-local fetch helper so this admin-only page stays self-
// contained and we never accidentally surface the raw apiKey type via the
// shared client surface.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:43111'

interface AiSettingsView {
  provider:                string | null
  defaultModel:            string | null
  hasApiKey:               boolean
  apiKeyLast4:             string | null
  enabled:                 boolean
  allowTenantProvidedKeys: boolean
  updatedAt:               string | null
  updatedByUserId:         string | null
}

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
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="租户标识（可选 · 高级登录）" value={slug} onChange={e => setSlug(e.target.value)} />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  )
}

async function adminFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const tok = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...(init.headers as Record<string, string> ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export default function AdminAiSettingsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [view,   setView]   = useState<AiSettingsView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [notice,  setNotice]  = useState('')
  // Form state — apiKey is a write-only field; never populated from the server.
  const [provider,     setProvider]     = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const [apiKey,       setApiKey]       = useState('')
  const [enabled,      setEnabled]      = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [testing,      setTesting]      = useState(false)
  const [testResult,   setTestResult]   = useState<string>('')

  async function load() {
    setLoading(true); setError('')
    try {
      const body = await adminFetch('/admin/ai-settings') as { settings: AiSettingsView }
      setView(body.settings)
      setProvider(body.settings.provider ?? '')
      setDefaultModel(body.settings.defaultModel ?? '')
      setEnabled(body.settings.enabled)
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
    finally { setLoading(false) }
  }
  useEffect(() => {
    const ok = !!getToken()
    setAuthed(ok)
    if (ok) void load()
  }, [])

  async function handleSave() {
    setSaving(true); setError(''); setNotice('')
    try {
      const payload: Record<string, unknown> = {
        provider: provider || undefined,
        defaultModel: defaultModel || undefined,
        enabled,
      }
      if (apiKey.trim()) payload.apiKey = apiKey.trim()
      await adminFetch('/admin/ai-settings', { method: 'POST', body: JSON.stringify(payload) })
      setApiKey('')  // clear the form field — never echoed back
      setNotice('设置已保存。原始 API Key 不会在任何响应或审计日志中回显。')
      setTimeout(() => setNotice(''), 4000)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败') }
    finally { setSaving(false) }
  }
  async function handleTest() {
    setTesting(true); setError(''); setTestResult('')
    try {
      const r = await adminFetch('/admin/ai-settings/test-connection-stub', { method: 'POST' }) as { ok: boolean; note: string }
      setTestResult(`${r.ok ? '✅' : '⚠'} ${r.note}`)
    } catch (e) { setError(e instanceof Error ? e.message : '测试失败') }
    finally { setTesting(false) }
  }

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

        {error  && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}
        {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-5 py-3 text-sm">{notice}</div>}

        {/* Current state */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">当前状态</h2>
          {loading && !view ? <p className="text-xs text-gray-400">加载中…</p> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <Field label="当前 Provider"   value={view?.provider ?? '—（未设置）'} />
              <Field label="默认模型"        value={view?.defaultModel ?? '—（未设置）'} />
              <Field label="API Key 状态"    value={`hasApiKey: ${view?.hasApiKey ? '是' : '否'}  ·  apiKeyLast4: ${view?.apiKeyLast4 ?? '—'}`} tone={view?.hasApiKey ? 'ok' : undefined} />
              <Field label="启用 AI 服务"    value={view?.enabled ? '已启用' : '未启用'} tone={view?.enabled ? 'ok' : undefined} />
              <Field label="允许租户自带 API Key" value="否（产品决策）" tone="danger" />
              <Field label="真实 AI provider 调用" value="false（当前为确定性 stub 模式）" tone="ok" />
            </div>
          )}
          <p className="text-[11px] text-gray-500">最近更新：{view?.updatedAt ? new Date(view.updatedAt).toLocaleString('zh-CN') : '—'}</p>
        </section>

        {/* Edit form */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">编辑设置</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Provider</label>
              <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={provider} onChange={e => setProvider(e.target.value)}>
                <option value="">请选择…</option>
                <option value="openai">openai</option>
                <option value="gemini">gemini</option>
                <option value="deepseek">deepseek</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">默认模型</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="例如：gpt-4o-mini / gemini-1.5-flash" value={defaultModel} onChange={e => setDefaultModel(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-gray-600 block mb-1">API Key（写入一次；不会回显）</label>
              <input type="password" autoComplete="new-password" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder={view?.hasApiKey ? `已保存 API Key：****${view.apiKeyLast4 ?? ''}（输入新 Key 覆盖；留空保持不变）` : '输入 API Key（至少 8 字符）'} value={apiKey} onChange={e => setApiKey(e.target.value)} />
              <p className="text-[10px] text-gray-400 mt-1">真实 API Key 不会在前端回显，也不会写入审计日志的明文。请确认环境为 SaaS Admin 平台运维浏览器。</p>
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input type="checkbox" id="r9e-enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
              <label htmlFor="r9e-enabled" className="text-xs text-gray-700">启用平台 AI 服务（未启用时所有 AI 生成仍走 stub 模式）</label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 rounded-xl disabled:opacity-50">{saving ? '保存中…' : '保存设置'}</button>
            <button onClick={handleTest} disabled={testing} className="bg-slate-700 hover:bg-slate-800 text-white text-xs px-4 py-2 rounded-xl disabled:opacity-50">{testing ? '测试中…' : '测试连接（本地 stub）'}</button>
            <button onClick={() => { void load() }} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-4 py-2 rounded-xl">刷新</button>
          </div>
          {testResult && <p className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{testResult}</p>}
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
