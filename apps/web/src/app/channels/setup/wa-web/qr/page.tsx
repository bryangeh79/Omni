'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  getToken, login,
  fetchWaWebStatus, fetchWaWebSessionStatus, requestWaWebQr,
  type WaWebStatus,
} from '@/lib/api'

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-teal-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-600 mb-3">
            <span className="text-white text-2xl">📱</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">WA Web QR Setup</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to manage your WhatsApp connection</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-400" placeholder="租户标识" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-400" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-400" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  )
}

// ── Main QR Staging Page ──────────────────────────────────────────────────────
export default function WaWebQrPage() {
  const [authed,     setAuthed]     = useState(false)
  const [status,     setStatus]     = useState<WaWebStatus | null>(null)
  const [sessStatus, setSessStatus] = useState<{ sessionStatus: string; hasSessionRef: boolean; channelIsActive: boolean; lastUpdatedAt: string | null } | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [qrResult,   setQrResult]   = useState<{ blocked: boolean; note: string; nextStep?: string } | null>(null)
  const [requesting, setRequesting] = useState(false)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const [s, sess] = await Promise.all([
        fetchWaWebStatus(),
        fetchWaWebSessionStatus().catch(() => null),
      ])
      setStatus(s)
      if (sess) setSessStatus({ sessionStatus: sess.sessionStatus, hasSessionRef: sess.hasSessionRef, channelIsActive: sess.channelIsActive, lastUpdatedAt: sess.lastUpdatedAt })
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (getToken()) { setAuthed(true); void loadStatus() }
  }, [loadStatus])

  async function handleRequestQr() {
    setRequesting(true); setError('')
    try {
      const r = await requestWaWebQr()
      setQrResult({ blocked: r.blocked, note: r.note, nextStep: r.nextStep })
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed') }
    finally { setRequesting(false) }
  }

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  const isBlocked = !status?.waSessionAllowed
  const isConnected = sessStatus?.sessionStatus === 'CONNECTED' || sessStatus?.channelIsActive

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-sm">📱</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">WA Web QR Staging</h1>
              <p className="text-xs text-gray-400">
                {loading ? 'Loading…' : isConnected ? '● Connected' : isBlocked ? '● Blocked (default safe)' : '● Not connected'}
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-3 text-xs">
            <a href="/channels/setup" className="text-green-600 hover:text-green-800">← Channel Setup</a>
            <span className="text-gray-200">|</span>
            <a href="/launch-checklist" className="text-emerald-600 hover:text-emerald-800">🚀 Launch Checklist</a>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-6 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}

        {/* Safety state banner */}
        <div className={`rounded-2xl border p-4 ${isBlocked ? 'bg-amber-50 border-amber-200' : isConnected ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{isBlocked ? '🔒' : isConnected ? '✅' : '⚙️'}</span>
            <div>
              <p className={`text-sm font-bold ${isBlocked ? 'text-amber-800' : isConnected ? 'text-emerald-800' : 'text-blue-800'}`}>
                {isBlocked ? 'Session Blocked (Safe Default)' : isConnected ? 'WhatsApp Session Connected' : 'Session Not Started'}
              </p>
              <p className={`text-xs mt-0.5 ${isBlocked ? 'text-amber-700' : isConnected ? 'text-emerald-700' : 'text-blue-700'}`}>
                {isBlocked
                  ? 'OMNI_ALLOW_WA_SESSION is not set — no WhatsApp session will start. This is the safe default.'
                  : isConnected
                    ? 'WhatsApp Web session is active. Monitor via /inbox.'
                    : 'OMNI_ALLOW_WA_SESSION is enabled. Use the steps below to start a session.'}
              </p>
            </div>
          </div>
        </div>

        {/* Session status */}
        {sessStatus && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Session Status</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Session',    value: sessStatus.sessionStatus },
                { label: 'Has Ref',    value: sessStatus.hasSessionRef ? 'Yes' : 'No' },
                { label: 'Channel',    value: sessStatus.channelIsActive ? 'Active' : 'Inactive' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-sm font-semibold text-gray-700 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
            {sessStatus.lastUpdatedAt && <p className="text-xs text-gray-400 mt-2">Updated: {new Date(sessStatus.lastUpdatedAt).toLocaleString()}</p>}
          </div>
        )}

        {/* Operator steps */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">
            {isBlocked ? 'How to Enable WA Web Session' : 'QR Session Flow'}
          </h2>
          <div className="space-y-3">
            {[
              {
                num: 1, title: 'Enable WA Web Session Flag',
                desc: 'Operator sets OMNI_ALLOW_WA_SESSION=true in .env and restarts the API process.',
                done: !isBlocked,
                blocked: isBlocked,
                isOperator: true,
              },
              {
                num: 2, title: 'Create a WA Web Channel',
                desc: 'POST /channels/whatsapp-web/connect — creates a channel and starts the QR session.',
                done: !!sessStatus?.hasSessionRef,
                blocked: isBlocked,
              },
              {
                num: 3, title: 'Get QR Code',
                desc: 'GET /channels/whatsapp-web/:channelId/qr — poll until QR is available, then display.',
                done: sessStatus?.sessionStatus === 'CONNECTED',
                blocked: isBlocked || !sessStatus?.hasSessionRef,
              },
              {
                num: 4, title: 'Scan QR with WhatsApp App',
                desc: 'Open WhatsApp mobile → Settings → Linked Devices → Link a Device → scan QR.',
                done: isConnected ?? false,
                blocked: isBlocked,
              },
              {
                num: 5, title: 'Verify Connection',
                desc: 'Session becomes CONNECTED. Test by sending a message from the Inbox.',
                done: isConnected ?? false,
                blocked: isBlocked,
              },
            ].map(step => (
              <div key={step.num} className={`rounded-xl border p-4 flex items-start gap-3 ${step.done ? 'bg-emerald-50 border-emerald-200' : step.blocked ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${step.done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {step.done ? '✓' : step.num}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${step.done ? 'text-emerald-800' : 'text-gray-800'}`}>{step.title}</p>
                    {step.isOperator && <span className="text-xs bg-orange-50 border border-orange-200 text-orange-600 px-1.5 py-0.5 rounded-full">Operator action</span>}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Request QR button */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h3 className="text-sm font-bold text-gray-800">Request QR Session (Guarded)</h3>
          <p className="text-xs text-gray-500">This button checks readiness and provides operator instructions. No real session is started from this page.</p>
          <button
            onClick={() => { void handleRequestQr() }}
            disabled={requesting}
            className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-50"
          >
            {requesting ? 'Checking…' : 'Check QR Readiness'}
          </button>
          {qrResult && (
            <div className={`rounded-xl border px-4 py-3 space-y-2 ${qrResult.blocked ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
              <p className={`text-xs font-bold ${qrResult.blocked ? 'text-amber-800' : 'text-blue-800'}`}>
                {qrResult.blocked ? '🔒 Blocked (Safe Default)' : 'ℹ️ Operator Path'}
              </p>
              <p className="text-xs text-gray-700">{qrResult.note}</p>
              {qrResult.nextStep && (
                <p className="text-xs text-blue-700 font-mono">Next step: {qrResult.nextStep}</p>
              )}
            </div>
          )}
        </div>

        {/* Real send disabled badge */}
        <div className="bg-gray-100 rounded-2xl px-5 py-4 text-xs text-gray-500 space-y-1">
          <p className="font-bold text-gray-600">Safety Defaults</p>
          <p>• <code>OMNI_ALLOW_WA_SESSION=false</code> — no WhatsApp session started by default</p>
          <p>• No raw QR payload, session tokens, or session content returned from this page</p>
          <p>• This page never starts a Chromium or WhatsApp Web session</p>
          <p>• <strong>No broadcast/ads/bulk sending</strong> — Omni is 1:1 AI customer service only</p>
        </div>
      </main>
    </div>
  )
}
