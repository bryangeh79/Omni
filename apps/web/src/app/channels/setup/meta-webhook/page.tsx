'use client'

import { useEffect, useState } from 'react'
import {
  getToken, login,
  fetchMetaWebhookStatus, saveMetaWebhookDraft, testMetaWebhookStub,
  type MetaWebhookStatus,
} from '@/lib/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:43111'

const STEPS = [
  {
    num:   1,
    title: '创建 Meta 应用',
    desc:  '前往 developers.facebook.com → 我的应用 → 创建应用 → 选择「商业」类型。',
  },
  {
    num:   2,
    title: '添加 WhatsApp 产品',
    desc:  '在 Meta 应用中点击「添加产品」→ WhatsApp，关联您的 WhatsApp 商业账号（WABA）。',
  },
  {
    num:   3,
    title: '获取 Phone Number ID',
    desc:  '在应用 Dashboard → WhatsApp → 入门指南中复制 Phone Number ID 与 WABA ID。',
  },
  {
    num:   4,
    title: '配置 Webhook',
    desc:  '在 WhatsApp → Configuration → Webhook 中填入回调 URL 和自定义的校验 token。',
  },
  {
    num:   5,
    title: '订阅 Webhook 事件',
    desc:  '订阅 messages 字段。这样 Meta 才会推送入站消息事件给您。',
  },
  {
    num:   6,
    title: '保存凭据',
    desc:  '返回「渠道设置」页保存 WABA ID、Phone Number ID 与 Access Token。',
  },
]

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
    catch (ex) { setErr(ex instanceof Error ? ex.message : '登录失败') }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-3">
            <span className="text-white text-2xl">🔗</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Meta Webhook 配置</h1>
          <p className="text-sm text-gray-400 mt-1">登录以配置您的 Webhook</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="租户标识（可选 · 高级登录）" value={slug} onChange={e => setSlug(e.target.value)} />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  )
}

// ── Main Meta Webhook Page ─────────────────────────────────────────────────────
export default function MetaWebhookPage() {
  const [authed,      setAuthed]      = useState<boolean | null>(null)
  const [status,      setStatus]      = useState<MetaWebhookStatus | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [saving,      setSaving]      = useState(false)
  const [testing,     setTesting]     = useState(false)
  const [testResult,  setTestResult]  = useState<{ testResult: string; note: string } | null>(null)
  const [verifyHint,  setVerifyHint]  = useState('')
  const [notice,      setNotice]      = useState('')
  const [error,       setError]       = useState('')

  useEffect(() => {
    if (getToken()) { setAuthed(true); void loadStatus() }
  }, [])

  async function loadStatus() {
    try {
      const s = await fetchMetaWebhookStatus()
      setStatus(s)
      if (typeof s.stepCompleted === 'number') setCurrentStep(s.stepCompleted)
    } catch { /* ignore */ }
  }

  function notify(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 3000) }

  async function handleMarkStep(step: number) {
    setSaving(true); setError('')
    try {
      await saveMetaWebhookDraft({
        stepCompleted:      step,
        webhookSubscribed:  step >= 4,
        verifyTokenHint:    verifyHint || undefined,
      })
      setCurrentStep(step); await loadStatus(); notify(`步骤 ${step} 已标记完成`)
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败') }
    finally { setSaving(false) }
  }

  async function handleTest() {
    setTesting(true); setError(''); setTestResult(null)
    try {
      const r = await testMetaWebhookStub(); setTestResult(r)
    } catch (e) { setError(e instanceof Error ? e.message : '测试失败') }
    finally { setTesting(false) }
  }

  if (authed === null) return null

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  const webhookCallbackUrl = `${API_BASE}/webhook/meta`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-xs font-bold">WH</span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">Meta Webhook 配置向导</h1>
              <p className="text-xs text-gray-400">配置 Meta WhatsApp 商业平台 webhook</p>
            </div>
          </div>
          <nav className="flex items-center gap-3 text-xs">
            <a href="/channels/setup" className="text-blue-600 hover:text-blue-800">← 渠道设置</a>
            <span className="text-gray-200">|</span>
            <a href="/launch-checklist" className="text-gray-500 hover:text-gray-700">上线清单</a>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {error  && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}
        {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-5 py-3 text-sm">{notice}</div>}

        {/* Safety notice (tenant-facing business copy) */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800">
          <strong>默认安全：</strong>本向导仅协助配置 Meta 应用 Dashboard，不会发起任何真实 Meta API 调用。Meta 官方 API 需要完成企业认证和平台配置后才能启用 — <a href="/activation-guide" className="font-medium underline">联系服务商激活</a>。
        </div>

        {/* Webhook callback URL */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Webhook 回调 URL</h2>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <code className="text-sm text-blue-700 font-mono flex-1 break-all">{webhookCallbackUrl}</code>
            <button
              onClick={() => { void navigator.clipboard.writeText(webhookCallbackUrl); notify('已复制') }}
              className="text-xs text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5"
            >
              复制
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">请在 Meta 应用 Dashboard → WhatsApp → Configuration → Webhook 中填入此 URL。</p>
        </div>

        {/* Verify token section */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Verify Token（校验令牌）</h2>
            {status?.verifyTokenSet && <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">已设置 ✓{status.verifyTokenLast4 ? `（****${status.verifyTokenLast4}）` : ''}</span>}
          </div>
          <p className="text-xs text-gray-500">使用任意随机字符串作为 verify token。同时填入 Meta 应用 Dashboard，并在此保存末四位用于参考。</p>
          <div className="flex gap-2">
            <input
              type="password"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="输入 verify token（仅保存末四位）"
              value={verifyHint}
              onChange={e => setVerifyHint(e.target.value)}
              autoComplete="off"
            />
            <button
              onClick={() => {
                if (!verifyHint) return
                void saveMetaWebhookDraft({ verifyTokenHint: verifyHint })
                  .then(() => { setVerifyHint(''); notify('verify token 已保存（末四位）'); void loadStatus() })
              }}
              disabled={!verifyHint || saving}
              className="px-4 bg-blue-600 text-white rounded-xl text-xs font-semibold disabled:opacity-50 hover:bg-blue-700"
            >
              保存
            </button>
          </div>
          <p className="text-xs text-gray-400">仅末四位保存到数据库，原始 token 不会写入日志或返回。</p>
        </div>

        {/* Step-by-step guide */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">配置步骤</h2>
          <div className="space-y-3">
            {STEPS.map((step) => {
              const done = currentStep >= step.num
              return (
                <div key={step.num} className={`rounded-2xl border p-4 transition-all ${done ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                      {done ? '✓' : step.num}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-semibold ${done ? 'text-emerald-800' : 'text-gray-800'}`}>{step.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{step.desc}</p>
                      {step.num === 4 && (
                        <p className="text-xs text-blue-700 mt-1 font-mono">回调 URL：{webhookCallbackUrl}</p>
                      )}
                    </div>
                    {!done && (
                      <button
                        onClick={() => { void handleMarkStep(step.num) }}
                        disabled={saving || (step.num > 1 && currentStep < step.num - 1)}
                        className="flex-shrink-0 text-xs px-3 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 font-medium"
                      >
                        标记完成
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Credential checklist */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">凭据检查清单</h2>
          <div className="space-y-2">
            {[
              { label: 'WABA ID（WhatsApp 商业账号 ID）', done: status?.credentialStatus !== 'NONE' },
              { label: 'Phone Number ID', done: status?.credentialStatus !== 'NONE' },
              { label: 'Access Token（已加密）', done: status?.credentialStatus === 'ENCRYPTED_STORED' },
              { label: 'Verify Token（末四位已保存）', done: !!status?.verifyTokenSet },
              { label: 'Webhook 已订阅', done: !!status?.webhookSubscribed },
            ].map(({ label, done }) => (
              <div key={label} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${done ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {done ? '✓' : '○'}
                </span>
                <span className={`text-xs ${done ? 'text-emerald-700' : 'text-gray-600'}`}>{label}</span>
                {!done && <a href="/channels/setup" className="ml-auto text-xs text-blue-600 hover:text-blue-700">前往配置 →</a>}
              </div>
            ))}
          </div>
        </div>

        {/* Test button */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Webhook 安全演练</h3>
              <p className="text-xs text-gray-500 mt-0.5">验证配置状态 — 不会发起真实 Meta API 调用</p>
            </div>
            <button onClick={() => { void handleTest() }} disabled={testing} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium px-4 py-2 rounded-xl disabled:opacity-50">
              {testing ? '测试中…' : '运行安全演练'}
            </button>
          </div>
          {testResult && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-amber-800">{testResult.testResult}</span>
                <span className="text-xs text-amber-600">— 未调用 Meta API</span>
              </div>
              <p className="text-xs text-amber-700">{testResult.note}</p>
            </div>
          )}
        </div>

        {/* Safety footer (tenant-facing business copy) */}
        <div className="bg-gray-100 rounded-2xl px-5 py-4 text-xs text-gray-500 space-y-1">
          <p className="font-semibold text-gray-600">Meta API 安全说明：</p>
          <p>• 本页不会发起任何 Meta API 调用。</p>
          <p>• Meta 官方 API 真实发送默认<strong>不开启</strong>，需完成平台认证与审核后开启。</p>
          <p>• Verify token：仅保存末四位，绝不返回。</p>
          <p>• Access token：经强加密保存，绝不返回。</p>
        </div>
      </main>
    </div>
  )
}
