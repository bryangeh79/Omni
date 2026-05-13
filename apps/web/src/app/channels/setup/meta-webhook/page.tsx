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
    title: 'Create Meta App',
    desc:  'Go to developers.facebook.com → My Apps → Create App → Business type.',
  },
  {
    num:   2,
    title: 'Add WhatsApp Product',
    desc:  'Inside your Meta App, click "Add Product" → WhatsApp. Connect your WhatsApp Business Account (WABA).',
  },
  {
    num:   3,
    title: 'Get Phone Number ID',
    desc:  'In App Dashboard → WhatsApp → Getting Started, copy your Phone Number ID and WABA ID.',
  },
  {
    num:   4,
    title: 'Configure Webhook',
    desc:  `Under WhatsApp → Configuration → Webhook, enter your callback URL and a verify token you choose.`,
  },
  {
    num:   5,
    title: 'Subscribe Webhook Fields',
    desc:  'Subscribe to: messages. This lets Meta send you incoming message events.',
  },
  {
    num:   6,
    title: 'Save Credentials',
    desc:  'Go back to Channel Setup and save your WABA ID, Phone Number ID, and Access Token.',
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
    catch (ex) { setErr(ex instanceof Error ? ex.message : 'Login failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-3">
            <span className="text-white text-2xl">🔗</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Meta Webhook Setup</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to configure your webhook</p>
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

// ── Main Meta Webhook Page ─────────────────────────────────────────────────────
export default function MetaWebhookPage() {
  const [authed,      setAuthed]      = useState(false)
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
      setCurrentStep(step); await loadStatus(); notify(`Step ${step} marked complete`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  async function handleTest() {
    setTesting(true); setError(''); setTestResult(null)
    try {
      const r = await testMetaWebhookStub(); setTestResult(r)
    } catch (e) { setError(e instanceof Error ? e.message : 'Test failed') }
    finally { setTesting(false) }
  }

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  const webhookCallbackUrl = `${API_BASE}/webhook/meta`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-sm">🔗</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Meta Webhook Setup Wizard</h1>
              <p className="text-xs text-gray-400">Configure Meta WhatsApp Business Platform webhook</p>
            </div>
          </div>
          <nav className="flex items-center gap-3 text-xs">
            <a href="/channels/setup" className="text-blue-600 hover:text-blue-800">← Channel Setup</a>
            <span className="text-gray-200">|</span>
            <a href="/launch-checklist" className="text-gray-400 hover:text-gray-600">Launch Checklist</a>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {error  && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}
        {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-5 py-3 text-sm">{notice}</div>}

        {/* Safety notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800">
          <strong>Safe by default:</strong> This wizard guides Meta App Dashboard configuration. No Meta API calls are made from this page. Real webhook delivery requires <code>OMNI_ENABLE_REAL_META_SEND=true</code>.
        </div>

        {/* Webhook callback URL */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">Your Webhook Callback URL</h2>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <code className="text-sm text-blue-700 font-mono flex-1 break-all">{webhookCallbackUrl}</code>
            <button
              onClick={() => { void navigator.clipboard.writeText(webhookCallbackUrl); notify('Copied!') }}
              className="text-xs text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">Enter this URL in the Meta App Dashboard → WhatsApp → Configuration → Webhook.</p>
        </div>

        {/* Verify token section */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800">Verify Token</h2>
            {status?.verifyTokenSet && <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Set ✓{status.verifyTokenLast4 ? ` (****${status.verifyTokenLast4})` : ''}</span>}
          </div>
          <p className="text-xs text-gray-500">Choose any random string. Enter it in Meta App Dashboard AND save the last 4 chars here for reference.</p>
          <div className="flex gap-2">
            <input
              type="password"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Enter verify token (only last 4 stored)"
              value={verifyHint}
              onChange={e => setVerifyHint(e.target.value)}
              autoComplete="off"
            />
            <button
              onClick={() => {
                if (!verifyHint) return
                void saveMetaWebhookDraft({ verifyTokenHint: verifyHint })
                  .then(() => { setVerifyHint(''); notify('Verify token hint saved'); void loadStatus() })
              }}
              disabled={!verifyHint || saving}
              className="px-4 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-blue-700"
            >
              Save
            </button>
          </div>
          <p className="text-xs text-gray-400">Only the last 4 characters are stored. The raw token is never returned or logged.</p>
        </div>

        {/* Step-by-step guide */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Setup Steps</h2>
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
                        <p className="text-xs text-blue-700 mt-1 font-mono">Callback URL: {webhookCallbackUrl}</p>
                      )}
                    </div>
                    {!done && (
                      <button
                        onClick={() => { void handleMarkStep(step.num) }}
                        disabled={saving || (step.num > 1 && currentStep < step.num - 1)}
                        className="flex-shrink-0 text-xs px-3 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 font-medium"
                      >
                        Mark Done
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
          <h2 className="text-sm font-bold text-gray-800 mb-3">Credential Checklist</h2>
          <div className="space-y-2">
            {[
              { label: 'WABA ID (WhatsApp Business Account ID)', done: status?.credentialStatus !== 'NONE' },
              { label: 'Phone Number ID', done: status?.credentialStatus !== 'NONE' },
              { label: 'Access Token (encrypted)', done: status?.credentialStatus === 'ENCRYPTED_STORED' },
              { label: 'Verify Token (hint saved)', done: !!status?.verifyTokenSet },
              { label: 'Webhook Subscribed', done: !!status?.webhookSubscribed },
            ].map(({ label, done }) => (
              <div key={label} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${done ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {done ? '✓' : '○'}
                </span>
                <span className={`text-xs ${done ? 'text-emerald-700' : 'text-gray-600'}`}>{label}</span>
                {!done && <a href="/channels/setup" className="ml-auto text-xs text-blue-500 hover:text-blue-700">Configure →</a>}
              </div>
            ))}
          </div>
        </div>

        {/* Test button */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Test Webhook (Stub)</h3>
              <p className="text-xs text-gray-500 mt-0.5">Verify setup state — no real Meta API call</p>
            </div>
            <button onClick={() => { void handleTest() }} disabled={testing} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium px-4 py-2 rounded-xl disabled:opacity-50">
              {testing ? 'Testing…' : 'Run Stub Test'}
            </button>
          </div>
          {testResult && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-800">{testResult.testResult}</span>
                <span className="text-xs text-amber-600">— Meta API NOT called</span>
              </div>
              <p className="text-xs text-amber-700">{testResult.note}</p>
            </div>
          )}
        </div>

        {/* Safety footer */}
        <div className="bg-gray-100 rounded-2xl px-5 py-4 text-xs text-gray-500 space-y-1">
          <p><strong>Meta API Safety:</strong></p>
          <p>• No Meta APIs are called from this page</p>
          <p>• <code>OMNI_ENABLE_REAL_META_SEND=false</code> by default</p>
          <p>• Verify token: only last 4 chars stored, never returned</p>
          <p>• Access token: AES-256-GCM encrypted, never returned</p>
        </div>
      </main>
    </div>
  )
}
