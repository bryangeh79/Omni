'use client'

import { useEffect, useState } from 'react'
import { getToken, login, fetchSettingsOverview, updateCompanyProfile, type SettingsOverview } from '@/lib/api'

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-slate-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-700 mb-3"><span className="text-white text-xl">⚙️</span></div>
          <h1 className="text-2xl font-bold text-gray-900">设置</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to manage your account</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400" placeholder="租户标识" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-slate-700 hover:bg-slate-800 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const [authed,  setAuthed]  = useState(false)
  const [overview, setOverview] = useState<SettingsOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [notice,  setNotice]  = useState('')
  const [error,   setError]   = useState('')
  // Edit state
  const [companyName,   setCompanyName]   = useState('')
  const [businessHours, setBusinessHours] = useState('')
  const [editing,       setEditing]       = useState(false)

  useEffect(() => {
    if (getToken()) { setAuthed(true); void load() }
  }, [])

  async function load() {
    setLoading(true)
    try {
      const o = await fetchSettingsOverview()
      setOverview(o)
      setCompanyName(o.onboarding.companyName ?? '')
      setBusinessHours(o.onboarding.businessHours ?? '')
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  async function handleSaveProfile() {
    setSaving(true); setError('')
    try {
      await updateCompanyProfile({ companyName, businessHours })
      setNotice('Profile saved'); setTimeout(() => setNotice(''), 3000)
      setEditing(false); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  const o = overview

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-700 rounded-xl flex items-center justify-center"><span className="text-white text-sm">⚙️</span></div>
            <div>
              <h1 className="text-base font-bold text-gray-900">设置</h1>
              <p className="text-xs text-gray-400">{o?.company.name ?? 'Loading…'} · {o?.company.plan ?? 'trial'} plan</p>
            </div>
          </div>
          <nav className="flex items-center gap-2 text-xs flex-wrap">
            <a href="/boss" className="text-gray-400 hover:text-gray-700">Dashboard</a>
            <span className="text-gray-200">|</span>
            <a href="/team" className="text-indigo-600 hover:text-indigo-800">Team</a>
            <span className="text-gray-200">|</span>
            <a href="/billing" className="text-blue-500 hover:text-blue-700">Billing</a>
            <span className="text-gray-200">|</span>
            <a href="/production-qa" className="text-emerald-600 hover:text-emerald-800">QA Checklist</a>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        {error  && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}
        {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-5 py-3 text-sm">{notice}</div>}

        {loading && !o ? (
          <div className="text-center py-16 text-gray-400"><p className="text-4xl mb-3">⏳</p><p>Loading settings…</p></div>
        ) : o ? (
          <>
            {/* Company Profile */}
            <Section title="Company Profile">
              {!editing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Company Name', value: o.onboarding.companyName ?? '—' },
                      { label: 'Industry', value: o.onboarding.industry ?? '—' },
                      { label: 'Business Hours', value: o.onboarding.businessHours ?? '—' },
                      { label: 'Plan', value: o.company.plan },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-gray-50 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-400">{label}</p>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setEditing(true)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl">Edit Profile</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">Company Name</label>
                      <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400" value={companyName} onChange={e => setCompanyName(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">Business Hours</label>
                      <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400" value={businessHours} onChange={e => setBusinessHours(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { void handleSaveProfile() }} disabled={saving} className="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
                    <button onClick={() => setEditing(false)} className="bg-gray-100 text-gray-600 text-xs px-4 py-2 rounded-xl">取消</button>
                  </div>
                </div>
              )}
            </Section>

            {/* AI & Onboarding */}
            <Section title="AI Configuration">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Onboarding', value: o.onboarding.status ?? 'Not started' },
                  { label: 'AI Goals', value: `${o.onboarding.goalsCount} selected` },
                  { label: 'Preview', value: o.onboarding.hasPreview ? 'Generated' : 'Not generated' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl px-3 py-2">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              <a href="/onboarding" className="inline-block mt-3 text-xs text-blue-600 hover:text-blue-800">Update AI Configuration →</a>
            </Section>

            {/* Knowledge Base */}
            <Section title="Knowledge Base">
              <div className="flex items-center gap-4">
                <div className="bg-purple-50 rounded-xl px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-purple-700">{o.knowledgeBase.activeItems}</p>
                  <p className="text-xs text-purple-500">Active Items</p>
                </div>
                <div>
                  <p className={`text-sm font-semibold ${o.knowledgeBase.ready ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {o.knowledgeBase.ready ? '● Ready' : '● No items — add product/service materials'}
                  </p>
                  <a href="/knowledge" className="text-xs text-blue-600 hover:text-blue-800 mt-1 block">Manage Knowledge Base →</a>
                </div>
              </div>
            </Section>

            {/* Channel */}
            <Section title="Channel Setup">
              <div className="grid grid-cols-3 gap-3 mb-3">
                {[
                  { label: 'Type', value: o.channel.type ?? '—' },
                  { label: 'Status', value: o.channel.setupStatus },
                  { label: 'Credentials', value: o.channel.credentialStatus },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl px-3 py-2">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              <a href="/channels/setup" className="text-xs text-blue-600 hover:text-blue-800">Channel Setup →</a>
              {' · '}
              <a href="/launch-checklist" className="text-xs text-emerald-600 hover:text-emerald-800">Launch Checklist →</a>
            </Section>

            {/* Safety */}
            <Section title="Safety Status">
              <div className="grid grid-cols-3 gap-3 mb-3">
                {[
                  { label: 'WA Session', value: o.safety.waSessionAllowed ? 'ENABLED' : 'Disabled', warn: o.safety.waSessionAllowed },
                  { label: 'Meta Send',  value: o.safety.metaSendAllowed  ? 'ENABLED' : 'Disabled', warn: o.safety.metaSendAllowed },
                  { label: 'Real Send',  value: o.safety.realSendEnabled  ? 'ENABLED' : 'Disabled', warn: o.safety.realSendEnabled },
                ].map(({ label, value, warn }) => (
                  <div key={label} className={`rounded-xl px-3 py-2 ${warn ? 'bg-red-50' : 'bg-emerald-50'}`}>
                    <p className={`text-xs ${warn ? 'text-red-400' : 'text-emerald-400'}`}>{label}</p>
                    <p className={`text-sm font-bold mt-0.5 ${warn ? 'text-red-700' : 'text-emerald-700'}`}>{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">Real send flags are disabled by default. Operator must explicitly enable them to go live.</p>
            </Section>

            {/* Team */}
            <Section title="Team">
              <p className="text-sm text-gray-600 mb-2">{o.team.userCount} active user{o.team.userCount !== 1 ? 's' : ''}</p>
              <div className="space-y-1.5">
                {o.team.users.slice(0, 5).map(u => (
                  <div key={u.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                    <div className="w-7 h-7 bg-slate-200 rounded-full flex items-center justify-center text-xs font-bold text-slate-600">{(u.name?.[0] ?? u.email[0]).toUpperCase()}</div>
                    <div><p className="text-xs font-medium text-gray-800">{u.name ?? u.email}</p><p className="text-xs text-gray-400">{u.role}</p></div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">{o.team.rbacNote}</p>
            </Section>

            {/* Quick Links */}
            <Section title="Quick Links">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(o.links).map(([key, href]) => (
                  <a key={key} href={href} className="text-xs bg-gray-50 border border-gray-200 text-gray-700 px-3 py-2 rounded-xl hover:border-slate-400 hover:bg-slate-50 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </a>
                ))}
              </div>
            </Section>
          </>
        ) : null}
      </main>
    </div>
  )
}
