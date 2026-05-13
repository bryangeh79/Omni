'use client'

import { useEffect, useState } from 'react'
import {
  getToken, login,
  fetchChannelSetupStatus, saveChannelSetupDraft, testChannelSetup,
  type ChannelSetupStatus, type ChannelSetupTestResult,
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
    catch (ex) { setErr(ex instanceof Error ? ex.message : 'Login failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-teal-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-600 mb-3">
            <span className="text-white text-2xl">💬</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Channel Setup</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to configure your WhatsApp channel</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-400" placeholder="Tenant slug" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-400" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-400" placeholder="Password" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? 'Signing in…' : 'Sign In'}</button>
      </form>
    </div>
  )
}

// ── Channel Option Card ───────────────────────────────────────────────────────
function ChannelCard({
  type, icon, title, tagline, pros, cons, boundary, selected, onSelect,
}: {
  type:     string
  icon:     string
  title:    string
  tagline:  string
  pros:     string[]
  cons:     string[]
  boundary: string
  selected: boolean
  onSelect: (type: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(type)}
      className={`text-left rounded-2xl border-2 p-6 transition-all w-full ${selected ? 'border-green-500 bg-green-50 shadow-md' : 'border-gray-200 bg-white hover:border-green-300 hover:shadow-sm'}`}
    >
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl ${selected ? 'bg-green-200' : 'bg-gray-100'}`}>
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            {selected && <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Selected</span>}
          </div>
          <p className="text-sm text-gray-500 mb-3">{tagline}</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Pros</p>
              <ul className="space-y-1">
                {pros.map((p, i) => <li key={i} className="text-xs text-gray-700 flex gap-1.5"><span className="text-green-500">✓</span>{p}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Cons</p>
              <ul className="space-y-1">
                {cons.map((c, i) => <li key={i} className="text-xs text-gray-700 flex gap-1.5"><span className="text-amber-500">·</span>{c}</li>)}
              </ul>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <p className="text-xs text-amber-700"><strong>Boundary:</strong> {boundary}</p>
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Main Channel Setup Page ───────────────────────────────────────────────────
export default function ChannelSetupPage() {
  const [authed,      setAuthed]      = useState(false)
  const [status,      setStatus]      = useState<ChannelSetupStatus | null>(null)
  const [selected,    setSelected]    = useState<string>('')
  const [displayName, setDisplayName] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [testing,     setTesting]     = useState(false)
  const [testResult,  setTestResult]  = useState<ChannelSetupTestResult | null>(null)
  const [error,       setError]       = useState('')
  const [saved,       setSaved]       = useState(false)

  useEffect(() => {
    if (getToken()) {
      setAuthed(true)
      void fetchChannelSetupStatus().then(s => {
        setStatus(s)
        if (s.channelType) setSelected(s.channelType)
        if (s.displayName) setDisplayName(s.displayName)
      }).catch(() => null)
    }
  }, [])

  async function handleSaveDraft() {
    if (!selected) { setError('Select a channel type first'); return }
    setSaving(true); setError('')
    try {
      await saveChannelSetupDraft({ channelType: selected, displayName: displayName || undefined })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  async function handleTest() {
    setTesting(true); setError(''); setTestResult(null)
    try {
      const result = await testChannelSetup(selected || undefined)
      setTestResult(result)
    } catch (e) { setError(e instanceof Error ? e.message : 'Test failed') }
    finally { setTesting(false) }
  }

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-lg">💬</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Channel Setup</h1>
              <p className="text-xs text-gray-400">Configure your WhatsApp connection method</p>
            </div>
          </div>
          <nav className="flex items-center gap-3 text-xs">
            <a href="/onboarding" className="text-green-600 hover:text-green-800">← Onboarding</a>
            <span className="text-gray-200">|</span>
            <a href="/knowledge" className="text-gray-400 hover:text-gray-600">Knowledge Base</a>
            <span className="text-gray-200">|</span>
            <a href="/boss" className="text-gray-400 hover:text-gray-600">Dashboard</a>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}

        {/* Intro */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Choose Your WhatsApp Channel</h2>
          <p className="text-sm text-gray-500">
            Omni supports two methods to receive and reply to WhatsApp messages. Choose the one that fits your business stage and technical readiness.
          </p>
          <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
            <strong>Safe by default:</strong> Selecting a channel type here saves a draft only. Real WhatsApp connection requires separate credential setup and explicit enable flags. No messages will be sent from this screen.
          </div>
        </div>

        {/* Channel options */}
        <div className="space-y-4">
          <ChannelCard
            type="WA_WEB"
            icon="📱"
            title="WhatsApp Web / Business App"
            tagline="Connect via WhatsApp Web — quick start, lower barrier, no Meta platform approval needed."
            pros={[
              'Fast to start — no Meta approval',
              'Works with standard WA or WA Business app',
              'Lower cost to trial',
              'Suitable for small teams',
            ]}
            cons={[
              'Not official Meta Business Platform',
              'Phone must remain connected',
              'No template messages',
              'Stability depends on WA Web session',
            ]}
            boundary="Ordinary WhatsApp only. Not for mass marketing or broadcast. Session stability is best-effort. WhatsApp ToS applies."
            selected={selected === 'WA_WEB'}
            onSelect={setSelected}
          />

          <ChannelCard
            type="META_WA_BUSINESS"
            icon="🏢"
            title="Meta WhatsApp Business Platform (Official API)"
            tagline="Official Meta Cloud API — enterprise-grade, verified business, template messages."
            pros={[
              'Official Meta-approved channel',
              'Template messages for proactive outreach',
              'No phone session dependency',
              'Scales with message volume',
            ]}
            cons={[
              'Requires Meta business verification',
              'Template messages need approval',
              'Per-conversation fee applies',
              'More setup steps required',
            ]}
            boundary="Enterprise use. Message fees are passed through as credits — not bundled blindly. No broadcast/ads/bulk sending in current product scope."
            selected={selected === 'META_WA_BUSINESS'}
            onSelect={setSelected}
          />
        </div>

        {/* Display name input */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <h3 className="text-sm font-bold text-gray-800">Channel Details</h3>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">Display Name (optional)</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-400"
              placeholder="e.g. Sunshine Property WhatsApp"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">Used for reference only. Phone number configuration is separate.</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => { void handleSaveDraft() }}
              disabled={saving || !selected}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50 transition-all"
            >
              {saving ? 'Saving…' : saved ? '✓ Draft Saved' : 'Save Draft'}
            </button>
            <button
              onClick={() => { void handleTest() }}
              disabled={testing}
              className="px-5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-3 text-sm font-medium disabled:opacity-50 transition-all"
            >
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔒</span>
              <span className="text-sm font-bold text-amber-800">Stub Test Result</span>
              <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{testResult.testResult}</span>
            </div>
            <p className="text-xs text-amber-700">{testResult.note}</p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {[
                { label: 'WA Session Started', value: testResult.whatsappSessionStarted },
                { label: 'Meta API Called',     value: testResult.metaApiCalled },
                { label: 'Real Send Enabled',   value: testResult.realMetaSendEnabled },
                { label: 'Connected',           value: testResult.connected },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between bg-white rounded-xl px-3 py-2 border border-amber-100">
                  <span className="text-xs text-gray-600">{label}</span>
                  <span className={`text-xs font-bold ${value ? 'text-red-600' : 'text-emerald-600'}`}>{value ? 'YES' : 'NO'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next steps */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-3">
          <h3 className="text-sm font-bold text-gray-800">Next Steps</h3>
          <div className="space-y-2">
            {[
              { step: '1', label: 'Complete onboarding wizard', link: '/onboarding', done: true },
              { step: '2', label: 'Choose channel type (this page)', link: '/channels/setup', done: !!selected },
              { step: '3', label: 'Configure credentials in Settings → Channels', link: '#', done: false },
              { step: '4', label: 'Enable channel with explicit flag', link: '#', done: false },
              { step: '5', label: 'Test live with a real message', link: '#', done: false },
            ].map(({ step, label, link, done }) => (
              <a key={step} href={link} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${done ? 'border-emerald-200 bg-emerald-50' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {done ? '✓' : step}
                </span>
                <span className={`text-sm ${done ? 'text-emerald-700 line-through' : 'text-gray-700'}`}>{label}</span>
              </a>
            ))}
          </div>
        </div>

        {/* Safety reminder */}
        <div className="bg-gray-100 rounded-2xl px-5 py-4 text-xs text-gray-500 space-y-1">
          <p><strong>Safety reminders:</strong></p>
          <p>• <code>OMNI_ALLOW_WA_SESSION</code> is not enabled by default</p>
          <p>• <code>OMNI_ENABLE_REAL_META_SEND</code> is not enabled by default</p>
          <p>• No WhatsApp messages are sent from this setup page</p>
          <p>• No Meta/WhatsApp APIs are called from this setup page</p>
          <p>• Real channel activation requires explicit credential setup under Settings → Channels</p>
        </div>

        {/* Current status card */}
        {status && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs font-bold text-gray-500 uppercase mb-3">Current Setup Status</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: 'Channel Type',      value: status.channelType ?? 'Not set' },
                { label: 'Test Status',       value: status.testStatus },
                { label: 'Real WA Session',   value: status.realWaSessionEnabled ? 'ENABLED' : 'Disabled' },
                { label: 'Real Meta Send',    value: status.realMetaSendEnabled  ? 'ENABLED' : 'Disabled' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-gray-400">{label}</p>
                  <p className={`font-medium mt-0.5 ${value === 'ENABLED' ? 'text-red-600' : 'text-gray-700'}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
