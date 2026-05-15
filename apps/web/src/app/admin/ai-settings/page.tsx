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
  // Round-9H-2 fields
  corePromptOverride:       string | null
  hasCorePromptOverride:    boolean
  corePromptOverrideLength: number
  updatedAt:               string | null
  updatedByUserId:         string | null
}

// Round-9H-2: an internal label so SaaS Admin operators can correlate prompt
// behavior with deployment history. The platform default prompt itself is
// fetched live from GET /admin/ai-settings (response.platformCorePromptDefault).
const PLATFORM_CORE_PROMPT_VERSION = 'platform-core-v1'
// Backend treats overrides <32 chars as "clear / revert to default".
const CORE_PROMPT_MIN_LENGTH = 32

// Round-9F: mirror of backend PROVIDER_MODELS so the UI can render
// cost-effective defaults + a friendly label per model. Fallback table —
// the live source of truth is `models` in the GET response.
const PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek（推荐 · 高性价比）' },
  { value: 'openai',   label: 'OpenAI' },
  { value: 'gemini',   label: 'Gemini' },
  { value: 'other',    label: '其他（自定义）' },
] as const

const MODEL_LABELS: Record<string, string> = {
  'deepseek-chat':         'deepseek-chat（推荐：高性价比 / 客服 / FAQ）',
  'deepseek-reasoner':     'deepseek-reasoner（复杂推理 / 成本较高）',
  'gpt-4o-mini':           'gpt-4o-mini（推荐：高性价比 / 客服）',
  'gpt-4.1-mini':          'gpt-4.1-mini（新一代 mini / 可选）',
  'gpt-4.1':               'gpt-4.1（高质量 / 成本较高）',
  'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite（推荐：最低成本 / 高量）',
  'gemini-2.5-flash':      'gemini-2.5-flash（平衡质量与速度）',
  'gemini-2.5-pro':        'gemini-2.5-pro（高质量 / 成本较高）',
}
const PROVIDER_MODELS_FALLBACK: Record<string, { default: string; supported: string[] }> = {
  deepseek: { default: 'deepseek-chat',         supported: ['deepseek-chat', 'deepseek-reasoner'] },
  openai:   { default: 'gpt-4o-mini',           supported: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1'] },
  gemini:   { default: 'gemini-2.5-flash-lite', supported: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'] },
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
  // Round-9F: default to deepseek (cost-effective tier) on a fresh form.
  const [provider,     setProvider]     = useState<string>('deepseek')
  const [defaultModel, setDefaultModel] = useState('deepseek-chat')
  const [customModel,  setCustomModel]  = useState('')
  const [apiKey,       setApiKey]       = useState('')
  const [enabled,      setEnabled]      = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [testing,      setTesting]      = useState(false)
  const [testResult,   setTestResult]   = useState<string>('')
  const [testOk,       setTestOk]       = useState<boolean | null>(null)
  // Live catalogue from GET response; falls back to the local mirror.
  const [models,       setModels]       = useState<Record<string, { default: string; supported: string[] }>>(PROVIDER_MODELS_FALLBACK)
  // Round-9H-2: platform core AI prompt state.
  const [platformCorePromptDefault, setPlatformCorePromptDefault] = useState<string>('')
  const [overrideDraft,             setOverrideDraft]             = useState<string>('')
  const [savingPrompt,              setSavingPrompt]              = useState(false)
  const [clearingPrompt,            setClearingPrompt]            = useState(false)
  const [promptNotice,              setPromptNotice]              = useState<string>('')
  const [promptError,               setPromptError]               = useState<string>('')

  // Round-9F: when provider changes, snap model to that provider's default if
  // the current selection is not in the new provider's supported list.
  function onProviderChange(next: string) {
    setProvider(next)
    if (next === 'other') {
      setDefaultModel('')  // user must type a custom model
      return
    }
    const cfg = models[next]
    if (cfg && (!defaultModel || !cfg.supported.includes(defaultModel))) {
      setDefaultModel(cfg.default)
    }
  }

  async function load() {
    setLoading(true); setError('')
    try {
      const body = await adminFetch('/admin/ai-settings') as {
        settings: AiSettingsView
        models?: Record<string, { default: string; supported: string[] }>
        platformCorePromptDefault?: string
      }
      setView(body.settings)
      if (body.models) setModels(body.models)
      if (body.platformCorePromptDefault) setPlatformCorePromptDefault(body.platformCorePromptDefault)
      const p = body.settings.provider ?? 'deepseek'
      setProvider(p)
      const m = body.settings.defaultModel ?? (body.models?.[p]?.default ?? PROVIDER_MODELS_FALLBACK[p]?.default ?? '')
      setDefaultModel(m)
      if (p === 'other' && body.settings.defaultModel) setCustomModel(body.settings.defaultModel)
      setEnabled(body.settings.enabled)
      // Round-9H-2: prefill override editor from server.
      setOverrideDraft(body.settings.corePromptOverride ?? '')
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
    finally { setLoading(false) }
  }

  // Round-9H-2: save / clear platform Core AI Prompt override.
  async function handleSaveOverride() {
    setSavingPrompt(true); setPromptError(''); setPromptNotice('')
    try {
      const override = overrideDraft.trim()
      if (override.length === 0) {
        setPromptError(`请填写自定义 Prompt 内容（至少 ${CORE_PROMPT_MIN_LENGTH} 字符），或点击「恢复平台默认」清除 override。`)
        return
      }
      if (override.length < CORE_PROMPT_MIN_LENGTH) {
        setPromptError(`自定义 Prompt 内容过短（少于 ${CORE_PROMPT_MIN_LENGTH} 字符），保存后会被视为清除并回退到平台默认。请补充内容或直接「恢复平台默认」。`)
        return
      }
      await adminFetch('/admin/ai-settings', { method: 'POST', body: JSON.stringify({ corePromptOverride: override }) })
      setPromptNotice('自定义 Core Prompt 已保存。普通租户不会看到，也不会编辑此内容。')
      setTimeout(() => setPromptNotice(''), 4000)
      await load()
    } catch (e) { setPromptError(e instanceof Error ? e.message : '保存失败') }
    finally { setSavingPrompt(false) }
  }
  async function handleClearOverride() {
    if (!confirm('清除自定义 Core Prompt 并恢复平台默认 Prompt？此操作只影响平台统一 AI 客服规则；普通租户不可见。')) return
    setClearingPrompt(true); setPromptError(''); setPromptNotice('')
    try {
      // Sending an empty string is treated as "clear" by backend (< 32 chars).
      await adminFetch('/admin/ai-settings', { method: 'POST', body: JSON.stringify({ corePromptOverride: '' }) })
      setOverrideDraft('')
      setPromptNotice('已恢复平台默认 Core Prompt。')
      setTimeout(() => setPromptNotice(''), 4000)
      await load()
    } catch (e) { setPromptError(e instanceof Error ? e.message : '清除失败') }
    finally { setClearingPrompt(false) }
  }
  useEffect(() => {
    const ok = !!getToken()
    setAuthed(ok)
    if (ok) void load()
  }, [])

  async function handleSave() {
    setSaving(true); setError(''); setNotice('')
    try {
      const modelToSend = provider === 'other' ? customModel.trim() : defaultModel
      const payload: Record<string, unknown> = {
        provider,
        defaultModel: modelToSend || undefined,
        enabled,
      }
      if (apiKey.trim()) payload.apiKey = apiKey.trim()
      await adminFetch('/admin/ai-settings', { method: 'POST', body: JSON.stringify(payload) })
      setApiKey('')  // clear the form field — never echoed back
      setNotice('设置已保存。API Key 只显示最后 4 位，不会回显原文。')
      setTimeout(() => setNotice(''), 4000)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败') }
    finally { setSaving(false) }
  }
  async function handleTest() {
    setTesting(true); setError(''); setTestResult(''); setTestOk(null)
    try {
      // Round-9F: send an explicit `{}` body so Fastify's JSON body-parser does
      // not reject a POST without body as 400 "Bad Request".
      const r = await adminFetch('/admin/ai-settings/test-connection-stub', {
        method: 'POST',
        body:   JSON.stringify({}),
      }) as { ok: boolean; messageZh?: string; note?: string }
      setTestOk(!!r.ok)
      setTestResult(r.messageZh ?? r.note ?? (r.ok ? '测试通过。' : '测试未通过。'))
    } catch (e) { setError(e instanceof Error ? e.message : '测试失败') }
    finally { setTesting(false) }
  }

  if (authed === null) return null
  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">平台 AI 设置</h1>
            <p className="text-xs text-gray-500 mt-0.5">平台统一管理 AI Provider 与 API Key，普通租户无需填写。</p>
          </div>
          <a href="/admin/tenants" className="text-xs text-blue-600 hover:text-blue-700">← 租户管理</a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {error  && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}
        {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-5 py-3 text-sm">{notice}</div>}

        {/* Round-9F Section 1: simple status card with friendly badges */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">当前 AI 服务</h2>
          {loading && !view ? (
            <p className="text-xs text-gray-400">加载中…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <StatusRow label="当前 Provider"    value={view?.provider ? (PROVIDERS.find(p => p.value === view.provider)?.label ?? view.provider) : '— 未设置'} />
              <StatusRow label="默认模型"         value={view?.defaultModel ?? '— 未设置'} />
              <StatusRow
                label="API Key 状态"
                value={view?.hasApiKey ? `已保存 ****${view.apiKeyLast4 ?? ''}` : '未保存'}
                badge={view?.hasApiKey ? { label: '已保存', tone: 'green' } : { label: '未保存', tone: 'amber' }}
              />
              <StatusRow
                label="AI 服务"
                value={view?.enabled ? '已启用' : '未启用'}
                badge={view?.enabled ? { label: '已启用', tone: 'green' } : { label: '未启用', tone: 'gray' }}
              />
              <StatusRow label="租户自带 Key" value="不允许" badge={{ label: '不允许', tone: 'gray' }} />
            </div>
          )}
          <p className="text-[11px] text-gray-500">
            API Key 只由平台保存，保存后只显示最后 4 位，普通租户不可见。
            {view?.updatedAt && <span className="ml-2 text-gray-400">最近更新：{new Date(view.updatedAt).toLocaleString('zh-CN')}</span>}
          </p>
        </section>

        {/* Round-9F Section 2: edit form */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">编辑设置</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">AI Provider</label>
              <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" value={provider} onChange={e => onProviderChange(e.target.value)}>
                {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">默认模型</label>
              {provider !== 'other' ? (
                <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400" value={defaultModel} onChange={e => setDefaultModel(e.target.value)}>
                  {(models[provider]?.supported ?? PROVIDER_MODELS_FALLBACK[provider]?.supported ?? []).map(m => (
                    <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
                  ))}
                </select>
              ) : (
                <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-400" placeholder="输入自定义模型名称，例如：my-custom-model" value={customModel} onChange={e => setCustomModel(e.target.value)} />
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-gray-600 block mb-1">API Key</label>
              <input type="password" autoComplete="new-password" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-400" placeholder={view?.hasApiKey ? `已保存 API Key：****${view.apiKeyLast4 ?? ''}（输入新 Key 覆盖；留空保持不变）` : '输入 API Key（至少 8 字符）'} value={apiKey} onChange={e => setApiKey(e.target.value)} />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input type="checkbox" id="r9f-enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
              <label htmlFor="r9f-enabled" className="text-xs text-gray-700">启用平台 AI 服务（未启用时所有 AI 生成走安全 stub 模式）</label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleSave} disabled={saving} title="保存平台 AI 设置" aria-label="保存设置" className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-xl disabled:opacity-50">{saving ? '保存中…' : '保存设置'}</button>
            <button onClick={handleTest} disabled={testing} title="本地 stub 测试连接" aria-label="测试连接" className="bg-slate-700 hover:bg-slate-800 text-white text-sm px-4 py-2 rounded-xl disabled:opacity-50">{testing ? '测试中…' : '测试连接'}</button>
            <button onClick={() => { void load() }} title="刷新当前状态" aria-label="刷新" className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-xl">刷新</button>
          </div>
          {testResult && (
            <p className={`text-xs rounded-lg px-3 py-2 ${testOk ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {testOk ? '✅ ' : '⚠ '}{testResult}
            </p>
          )}
        </section>

        {/* Round-9H-2: 平台核心 AI Prompt management — SaaS Admin only */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">平台核心 AI Prompt</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  状态：平台托管
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  Starter / Pro 租户不能编辑完整 Prompt
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                  当前模式：{view?.hasCorePromptOverride ? '使用平台自定义 Prompt' : '使用平台默认 Prompt'}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
                  版本：{PLATFORM_CORE_PROMPT_VERSION}
                </span>
                {view?.hasCorePromptOverride && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                    自定义 Prompt 长度：{view.corePromptOverrideLength}
                  </span>
                )}
              </div>
            </div>
          </div>

          {promptError  && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-2 text-xs">{promptError}</div>}
          {promptNotice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-2 text-xs">{promptNotice}</div>}

          {/* Default prompt preview (collapsible) */}
          {platformCorePromptDefault && (
            <details className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <summary className="text-xs font-semibold text-gray-700 cursor-pointer">查看平台默认 Core Prompt（仅 SaaS Admin 可见）</summary>
              <pre className="mt-2 whitespace-pre-wrap leading-relaxed text-[11px] text-gray-700 max-h-72 overflow-auto font-mono">{platformCorePromptDefault}</pre>
              <p className="text-[10px] text-gray-400 mt-1.5">↑ 普通租户不可见。请勿截图分享给租户。</p>
            </details>
          )}

          {/* Override editor */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">自定义 Core Prompt（留空 / &lt;{CORE_PROMPT_MIN_LENGTH} 字符 = 使用平台默认）</label>
            <textarea
              rows={10}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-400 resize-y leading-relaxed"
              placeholder={`输入完整的 Core Prompt 覆盖平台默认；建议参考默认 Prompt 的结构（目标 / 回复规则 / 优先使用 / 不能 / 安全提醒）。\n至少 ${CORE_PROMPT_MIN_LENGTH} 字符。\n留空或过短将自动回退到平台默认。`}
              value={overrideDraft}
              onChange={e => setOverrideDraft(e.target.value)}
            />
            <p className="text-[10px] text-gray-400 mt-1">长度：{overrideDraft.length} 字符 · 最低 {CORE_PROMPT_MIN_LENGTH}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleSaveOverride} disabled={savingPrompt} title="保存自定义 Core Prompt" aria-label="保存自定义 Core Prompt" className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-xl disabled:opacity-50">{savingPrompt ? '保存中…' : '保存自定义 Prompt'}</button>
            <button onClick={handleClearOverride} disabled={clearingPrompt || !view?.hasCorePromptOverride} title="清除自定义 Prompt，恢复平台默认" aria-label="恢复平台默认 Prompt" className="bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 text-sm px-4 py-2 rounded-xl disabled:opacity-50">{clearingPrompt ? '清除中…' : '恢复平台默认'}</button>
            <button onClick={() => { void load() }} title="刷新当前 Prompt 状态" aria-label="刷新" className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-xl">刷新</button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[11px] text-amber-800 space-y-0.5">
            <p>⚠ 此设置只影响平台统一 AI 客服规则。<strong>普通租户不会看到，也不能编辑完整 Prompt。</strong></p>
            <p>⚠ 请不要在 Prompt 内填写 API Key、密码、Token 或任何敏感资料 — 即使后端会自动 scrub，也建议在源头避免。</p>
            <p>⚠ 此 Prompt 当前**不会**被发送到任何真实 AI provider（foundation 阶段）。仅作为 `globalSystemPrompt` 在 onboarding 预览中本地拼接。</p>
          </div>
        </section>

        {/* Round-9F Section 3: collapsible safety + advanced notes */}
        <details className="bg-white rounded-2xl border border-gray-100 p-4 text-xs text-gray-600">
          <summary className="font-medium text-gray-700 cursor-pointer">安全说明 / 高级说明</summary>
          <div className="mt-3 space-y-1.5 leading-relaxed">
            <p>• 普通租户不会看到或填写 API Key。</p>
            <p>• 保存后只显示最后 4 位，原始 API Key 不会回显在任何前端响应或审计日志。</p>
            <p>• 测试连接不会发送客户资料，也不会调用真实 AI provider — 当前为本地 stub 检查。</p>
            <p>• 真实 provider 调用必须等 Vault 加密与 env flag <code>OMNI_ENABLE_ONBOARDING_AI=true</code> 完成后才启用。</p>
            <p>• 用量记录写入 <code>UsageRecord</code>；租户配额扣费通过 <code>TenantBillingState.monthlyUsage</code> + <code>purchasedCredits</code> 计算。</p>
            <p>• 成本估算工具见 <a href="/admin/cost-calculator" className="text-blue-600 hover:text-blue-700">成本计算器</a>。</p>
          </div>
        </details>
      </main>
    </div>
  )
}

function StatusRow({ label, value, badge }: { label: string; value: string; badge?: { label: string; tone: 'green' | 'amber' | 'gray' } }) {
  const badgeStyle = badge && {
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    gray:  'bg-gray-100 text-gray-600',
  }[badge.tone]
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-sm text-gray-800 mt-0.5 truncate">{value}</p>
      </div>
      {badge && <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeStyle}`}>{badge.label}</span>}
    </div>
  )
}
