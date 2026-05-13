'use client'

import { useEffect, useState } from 'react'
import {
  getToken, login,
  fetchChannelSetupStatus, saveChannelSetupDraft, testChannelSetup,
  saveCredentialsDraft, fetchCredentialsStatus, clearCredentials,
  requestActivation, confirmActivation,
  type ChannelSetupStatus, type ChannelSetupTestResult,
  type CredentialsStatus, type ActivationResult,
} from '@/lib/api'

// ── Status badge helpers ──────────────────────────────────────────────────────
const SETUP_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  DRAFT:                  { label: 'Draft',               cls: 'bg-gray-100 text-gray-600' },
  TESTED_STUB:            { label: 'Stub Tested',         cls: 'bg-blue-50 text-blue-700' },
  READY_FOR_CREDENTIALS:  { label: 'Ready for Credentials', cls: 'bg-amber-50 text-amber-700' },
  CREDENTIALS_SAVED:      { label: 'Credentials Saved',   cls: 'bg-indigo-50 text-indigo-700' },
  ACTIVATION_PENDING:     { label: 'Activation Pending',  cls: 'bg-orange-50 text-orange-700' },
  ACTIVE:                 { label: 'Active',              cls: 'bg-emerald-50 text-emerald-700' },
  FAILED:                 { label: 'Failed',              cls: 'bg-red-50 text-red-700' },
}

const CRED_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  NONE:             { label: 'Not Set',        cls: 'bg-gray-100 text-gray-500' },
  DRAFT:            { label: 'Draft (No Vault)', cls: 'bg-amber-50 text-amber-600' },
  ENCRYPTED_STORED: { label: 'Encrypted',      cls: 'bg-emerald-50 text-emerald-700' },
}

function StatusBadge({ status, cfg }: { status: string; cfg: Record<string, { label: string; cls: string }> }) {
  const c = cfg[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full ${c.cls}`}>{c.label}</span>
}

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
function ChannelCard({ type, icon, title, tagline, pros, cons, boundary, selected, onSelect }: {
  type: string; icon: string; title: string; tagline: string
  pros: string[]; cons: string[]; boundary: string
  selected: boolean; onSelect: (t: string) => void
}) {
  return (
    <button type="button" onClick={() => onSelect(type)}
      className={`text-left rounded-2xl border-2 p-5 transition-all w-full ${selected ? 'border-green-500 bg-green-50 shadow-md' : 'border-gray-200 bg-white hover:border-green-300 hover:shadow-sm'}`}>
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl ${selected ? 'bg-green-200' : 'bg-gray-100'}`}>{icon}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-gray-900">{title}</h3>
            {selected && <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Selected</span>}
          </div>
          <p className="text-xs text-gray-500 mb-3">{tagline}</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Pros</p>
              <ul className="space-y-0.5">{pros.map((p, i) => <li key={i} className="text-xs text-gray-700 flex gap-1"><span className="text-green-500">✓</span>{p}</li>)}</ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Cons</p>
              <ul className="space-y-0.5">{cons.map((c, i) => <li key={i} className="text-xs text-gray-700 flex gap-1"><span className="text-amber-400">·</span>{c}</li>)}</ul>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            <p className="text-xs text-amber-700"><strong>Boundary:</strong> {boundary}</p>
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ChannelSetupPage() {
  const [authed,       setAuthed]       = useState(false)
  const [status,       setStatus]       = useState<ChannelSetupStatus | null>(null)
  const [credStatus,   setCredStatus]   = useState<CredentialsStatus | null>(null)
  const [selected,     setSelected]     = useState('')
  const [displayName,  setDisplayName]  = useState('')
  const [phoneNumber,  setPhoneNumber]  = useState('')
  const [saving,       setSaving]       = useState(false)
  const [testing,      setTesting]      = useState(false)
  const [testResult,   setTestResult]   = useState<ChannelSetupTestResult | null>(null)
  const [error,        setError]        = useState('')
  const [notice,       setNotice]       = useState('')
  // Credential form (Meta API)
  const [showCredForm, setShowCredForm] = useState(false)
  const [wabaId,       setWabaId]       = useState('')
  const [phoneId,      setPhoneId]      = useState('')
  const [accessToken,  setAccessToken]  = useState('')
  const [savingCreds,  setSavingCreds]  = useState(false)
  const [clearingCreds,setClearingCreds]= useState(false)
  // Activation
  const [activationResult, setActivationResult] = useState<ActivationResult | null>(null)
  const [requestingAct, setRequestingAct] = useState(false)
  const [confirmingAct, setConfirmingAct] = useState(false)

  useEffect(() => {
    if (getToken()) {
      setAuthed(true)
      void loadStatus()
    }
  }, [])

  async function loadStatus() {
    try {
      const [s, c] = await Promise.all([fetchChannelSetupStatus(), fetchCredentialsStatus().catch(() => null)])
      setStatus(s)
      if (c) setCredStatus(c)
      if (s.channelType) setSelected(s.channelType)
      if (s.displayName) setDisplayName(s.displayName)
    } catch { /* ignore */ }
  }

  function notify(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 4000) }

  async function handleSaveDraft() {
    if (!selected) { setError('Select a channel type first'); return }
    setSaving(true); setError('')
    try {
      const r = await saveChannelSetupDraft({ channelType: selected, displayName: displayName || undefined, phoneNumber: phoneNumber || undefined })
      setStatus(r); notify('Draft saved')
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  async function handleTest() {
    setTesting(true); setError(''); setTestResult(null)
    try {
      const r = await testChannelSetup(selected || undefined)
      setTestResult(r); await loadStatus()
    } catch (e) { setError(e instanceof Error ? e.message : 'Test failed') }
    finally { setTesting(false) }
  }

  async function handleSaveCreds() {
    setSavingCreds(true); setError('')
    try {
      await saveCredentialsDraft({ wabaId: wabaId || undefined, phoneNumberId: phoneId || undefined, accessToken: accessToken || undefined, channelType: selected || undefined })
      await Promise.all([loadStatus(), fetchCredentialsStatus().then(setCredStatus)])
      setShowCredForm(false); setAccessToken(''); notify('Credentials saved (encrypted)')
    } catch (e) { setError(e instanceof Error ? e.message : 'Credential save failed') }
    finally { setSavingCreds(false) }
  }

  async function handleClearCreds() {
    setClearingCreds(true); setError('')
    try {
      await clearCredentials()
      await Promise.all([loadStatus(), fetchCredentialsStatus().then(setCredStatus)])
      notify('Credentials cleared')
    } catch (e) { setError(e instanceof Error ? e.message : 'Clear failed') }
    finally { setClearingCreds(false) }
  }

  async function handleRequestActivation() {
    setRequestingAct(true); setError('')
    try {
      const r = await requestActivation(); setActivationResult(r); await loadStatus()
    } catch (e) { setError(e instanceof Error ? e.message : 'Activation request failed') }
    finally { setRequestingAct(false) }
  }

  async function handleConfirmActivation() {
    setConfirmingAct(true); setError('')
    try {
      const r = await confirmActivation(); setActivationResult(r); await loadStatus()
    } catch (e) { setError(e instanceof Error ? e.message : 'Confirm activation failed') }
    finally { setConfirmingAct(false) }
  }

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  const setupStatus = status?.setupStatus ?? 'DRAFT'
  const credStat    = status?.credentialStatus ?? 'NONE'
  const isMetaType  = selected === 'META_WA_BUSINESS'

  // Activation readiness checklist
  const checklist = [
    { label: 'Channel type selected', done: !!selected },
    { label: 'Draft saved to DB', done: !!(status && status.updatedAt) },
    { label: 'Stub test completed', done: setupStatus !== 'DRAFT' },
    { label: 'Credentials saved', done: credStat === 'ENCRYPTED_STORED' || credStat === 'DRAFT', applicable: isMetaType },
    { label: 'OMNI_ALLOW_WA_SESSION=true (WA Web)', done: false, note: 'Required for WA_WEB activation — set by operator', applicable: selected === 'WA_WEB' },
    { label: 'OMNI_ENABLE_REAL_META_SEND=true (Meta API)', done: false, note: 'Required for Meta API activation — set by operator', applicable: isMetaType },
    { label: 'Activation requested', done: setupStatus === 'ACTIVATION_PENDING' || setupStatus === 'ACTIVE' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-sm font-bold">CH</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Channel Setup</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge status={setupStatus} cfg={SETUP_STATUS_CFG} />
                <StatusBadge status={credStat}   cfg={CRED_STATUS_CFG} />
              </div>
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

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {error  && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}
        {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-5 py-3 text-sm">{notice}</div>}

        {/* Intro */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-base font-bold text-gray-900 mb-2">Choose Your WhatsApp Channel</h2>
          <p className="text-sm text-gray-500 mb-3">Draft persists to DB. Choose, configure, and test — real activation requires explicit env flags not set by default.</p>
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-xs text-blue-700">
            <strong>Safe by default:</strong> No WhatsApp session or Meta API call is made from this page. All activation is guarded by environment flags.
          </div>
        </div>

        {/* Channel option cards */}
        <div className="space-y-3">
          <ChannelCard
            type="WA_WEB" icon="📱" title="WhatsApp Web / Business App"
            tagline="Connect via WhatsApp Web — quick start, no Meta approval needed."
            pros={['Fast start — no Meta approval', 'Works with standard WA/WA Business', 'Low cost to trial', 'Small team friendly']}
            cons={['Not official Meta platform', 'Phone must stay connected', 'No template messages', 'Session stability best-effort']}
            boundary="Not for mass marketing or broadcast. WA ToS applies. Session stability is best-effort."
            selected={selected === 'WA_WEB'} onSelect={setSelected}
          />
          <ChannelCard
            type="META_WA_BUSINESS" icon="🏢" title="Meta WhatsApp Business Platform (Official API)"
            tagline="Official Meta Cloud API — enterprise-grade, template messages, no phone session."
            pros={['Official Meta-approved', 'Template messages', 'No phone dependency', 'Enterprise scale']}
            cons={['Needs Meta business verification', 'Template approval needed', 'Per-conversation fee', 'More setup steps']}
            boundary="Enterprise use. Meta fees are pass-through credits — not bundled. No broadcast/ads in current product."
            selected={selected === 'META_WA_BUSINESS'} onSelect={setSelected}
          />
        </div>

        {/* Draft form */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-800">Channel Details</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Display Name</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400" placeholder="e.g. Sunshine Property WA" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Phone Number (last 4 stored)</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400" placeholder="+60 12-345 6789" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} />
              <p className="text-xs text-gray-400 mt-0.5">Only last 4 digits are stored</p>
            </div>
          </div>
          {status?.phoneLast4 && (
            <p className="text-xs text-gray-500">Stored phone hint: ****{status.phoneLast4}</p>
          )}
          <div className="flex gap-2">
            <button onClick={() => { void handleSaveDraft() }} disabled={saving || !selected} className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button onClick={() => { void handleTest() }} disabled={testing} className="px-5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 text-sm font-medium disabled:opacity-50">
              {testing ? 'Testing…' : 'Stub Test'}
            </button>
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🔒</span>
              <span className="text-sm font-bold text-amber-800">Stub Test Result</span>
              <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{testResult.testResult}</span>
            </div>
            <p className="text-xs text-amber-700">{testResult.note}</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                { label: 'WA Session Started', value: testResult.whatsappSessionStarted },
                { label: 'Meta API Called',     value: testResult.metaApiCalled },
                { label: 'Real Send Enabled',   value: testResult.realMetaSendEnabled },
                { label: 'Connected',           value: testResult.connected },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between bg-white rounded-xl px-3 py-1.5 border border-amber-100">
                  <span className="text-xs text-gray-600">{label}</span>
                  <span className={`text-xs font-bold ${value ? 'text-red-600' : 'text-emerald-600'}`}>{value ? 'YES' : 'NO'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Credential vault section (Meta API) */}
        {isMetaType && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Credential Vault</h3>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={credStat} cfg={CRED_STATUS_CFG} />
                  {credStatus?.credentialLast4 && <span className="text-xs text-gray-500">Token hint: ****{credStatus.credentialLast4}</span>}
                  {credStatus && <span className="text-xs text-gray-400">Vault: {credStatus.vaultConfigured ? '✓ configured' : '⚠ not configured'}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                {credStat !== 'NONE' && (
                  <button onClick={() => { void handleClearCreds() }} disabled={clearingCreds} className="text-xs px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 disabled:opacity-50">
                    {clearingCreds ? '…' : 'Clear'}
                  </button>
                )}
                <button onClick={() => setShowCredForm(v => !v)} className="text-xs px-3 py-1.5 rounded-xl bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200">
                  {showCredForm ? 'Cancel' : credStat !== 'NONE' ? 'Update' : 'Add Credentials'}
                </button>
              </div>
            </div>

            {showCredForm && (
              <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
                  Credentials are encrypted (AES-256-GCM) before storage. Raw values are never logged or returned. Use test/placeholder values in development.
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">WABA ID</label>
                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-green-400" placeholder="WhatsApp Business Account ID" value={wabaId} onChange={e => setWabaId(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Phone Number ID</label>
                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-green-400" placeholder="Meta Phone Number ID" value={phoneId} onChange={e => setPhoneId(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Access Token (encrypted on save)</label>
                  <input
                    type="password"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-green-400"
                    placeholder="EAAxxxxxxx (never stored in plaintext)"
                    value={accessToken}
                    onChange={e => setAccessToken(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Only last 4 characters are stored for display. Raw token is never returned.</p>
                </div>
                <button onClick={() => { void handleSaveCreds() }} disabled={savingCreds || (!wabaId && !phoneId && !accessToken)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-50">
                  {savingCreds ? 'Encrypting & Saving…' : 'Save Credentials (Encrypted)'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Activation readiness checklist */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h3 className="text-sm font-bold text-gray-800">Activation Readiness</h3>
          <div className="space-y-1.5">
            {checklist.filter(c => c.applicable !== false).map((c, i) => (
              <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${c.done ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c.done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {c.done ? '✓' : i + 1}
                </span>
                <span className={`text-xs ${c.done ? 'text-emerald-700' : 'text-gray-600'}`}>{c.label}</span>
                {c.note && !c.done && <span className="text-xs text-gray-400 ml-auto">{c.note}</span>}
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => { void handleRequestActivation() }} disabled={requestingAct || !selected} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-50">
              {requestingAct ? 'Requesting…' : 'Request Activation'}
            </button>
            <button onClick={() => { void handleConfirmActivation() }} disabled={confirmingAct || setupStatus !== 'ACTIVATION_PENDING'} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-50">
              {confirmingAct ? 'Confirming…' : 'Confirm Activation'}
            </button>
          </div>
        </div>

        {/* Activation result */}
        {activationResult && (
          <div className={`rounded-2xl border p-4 space-y-2 ${activationResult.blocked ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="flex items-center gap-2">
              <span className="text-base">{activationResult.blocked ? '🔒' : '✓'}</span>
              <span className={`text-sm font-bold ${activationResult.blocked ? 'text-amber-800' : 'text-emerald-800'}`}>
                {activationResult.blocked ? 'Activation Blocked (Safe Default)' : 'Activation Progressed'}
              </span>
            </div>
            <p className="text-xs text-gray-700">{activationResult.note}</p>
            {((activationResult.missingConditions?.length ?? 0) > 0 || (activationResult.blockers?.length ?? 0) > 0) && (
              <ul className="space-y-1 mt-2">
                {[...(activationResult.missingConditions ?? []), ...(activationResult.blockers ?? [])].map((c, i) => (
                  <li key={i} className="text-xs text-amber-700 flex gap-1.5"><span>•</span>{c}</li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                { label: 'Real WA Session', value: activationResult.realWaSessionEnabled },
                { label: 'Real Meta Send',  value: activationResult.realMetaSendEnabled },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between bg-white rounded-xl px-3 py-1.5 border border-gray-100">
                  <span className="text-xs text-gray-600">{label}</span>
                  <span className={`text-xs font-bold ${value ? 'text-red-600' : 'text-emerald-600'}`}>{value ? 'YES' : 'NO'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Safety reminder */}
        <div className="bg-gray-100 rounded-2xl px-5 py-4 text-xs text-gray-500 space-y-1">
          <p className="font-bold text-gray-600">Safety defaults:</p>
          <p>• <code>OMNI_ALLOW_WA_SESSION=false</code> — WA Web session never started by default</p>
          <p>• <code>OMNI_ENABLE_REAL_META_SEND=false</code> — Meta API never called by default</p>
          <p>• Credentials are AES-256-GCM encrypted before storage; never returned in responses</p>
          <p>• Real channel activation requires explicit operator-set env flags</p>
        </div>
      </main>
    </div>
  )
}
