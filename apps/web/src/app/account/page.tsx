'use client'
// Account / Tenant Settings Hub — Phase 17B
// OWNER/ADMIN self-service management page.
// All data is local/DB-derived. No real provider calls.

import { useEffect, useState, useCallback } from 'react'
import { getToken } from '@/lib/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:43111'
const ACCENT   = '#6366f1'
const SUCCESS  = '#15803d'
const WARN_C   = '#b45309'
const DANGER   = '#b91c1c'
const NEUTRAL  = '#6b7280'

interface AnyData { [k: string]: unknown }

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [slug,     setSlug]     = useState('omni-demo')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const { login, setToken } = await import('@/lib/api')
      const r = await login(slug, email, password)
      setToken(r.accessToken); onSuccess()
    } catch (err) { setError((err as Error).message) }
    finally { setLoading(false) }
  }
  return (
    <form onSubmit={handleLogin} style={{ maxWidth: 360, margin: '4rem auto', padding: '2rem', border: '1px solid #e5e7eb', borderRadius: 12, fontFamily: 'system-ui' }}>
      <h2 style={{ marginTop: 0 }}>Sign in to Omni</h2>
      {error && <p style={{ color: DANGER }}>{error}</p>}
      <input value={slug}     onChange={e => setSlug(e.target.value)}     placeholder="Tenant slug" required style={inputCss} />
      <input value={email}    onChange={e => setEmail(e.target.value)}    placeholder="Email"    type="email"    required style={inputCss} />
      <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" required style={{ ...inputCss, marginBottom: '1rem' }} />
      <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.625rem', background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}

const inputCss: React.CSSProperties = { display: 'block', width: '100%', padding: '0.5rem 0.625rem', marginBottom: '0.75rem', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box', fontSize: '0.875rem' }

export default function AccountPage() {
  const [authed,   setAuthed]   = useState(false)
  const [data,     setData]     = useState<AnyData | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [editing,  setEditing]  = useState(false)
  const [editName, setEditName] = useState('')
  const [editLang, setEditLang] = useState('zh')
  const [saving,   setSaving]   = useState(false)
  const [saveOk,   setSaveOk]   = useState(false)

  useEffect(() => { setAuthed(!!getToken()) }, [])

  const loadOverview = useCallback(async () => {
    const tok = getToken()
    if (!tok) return
    setLoading(true); setError('')
    try {
      const r = await fetch(`${API_BASE}/account/overview`, { headers: { Authorization: `Bearer ${tok}` } })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const body = await r.json() as AnyData
      setData(body)
      const t = (body.tenant ?? {}) as AnyData
      setEditName(String(t.name ?? ''))
      setEditLang(String(t.defaultLanguage ?? 'zh'))
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (authed) void loadOverview() }, [authed, loadOverview])

  const handleSave = async () => {
    setSaving(true); setError(''); setSaveOk(false)
    try {
      const tok = getToken()
      const r = await fetch(`${API_BASE}/account/profile`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body:    JSON.stringify({ businessName: editName, defaultLanguage: editLang }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` })) as { error?: string }
        throw new Error(err.error ?? `HTTP ${r.status}`)
      }
      setSaveOk(true)
      setEditing(false)
      await loadOverview()
      setTimeout(() => setSaveOk(false), 2500)
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  if (!authed) return <LoginForm onSuccess={() => setAuthed(true)} />

  const tenant      = (data?.tenant      ?? {}) as AnyData
  const currentUser = (data?.currentUser ?? {}) as AnyData
  const onboarding  = (data?.onboarding  ?? {}) as AnyData
  const channel     = (data?.channel     ?? {}) as AnyData
  const safety      = (data?.safety      ?? {}) as AnyData
  const checklist   = (data?.setupChecklist ?? []) as AnyData[]
  const progress    = (data?.setupProgress  ?? {}) as AnyData
  const isOwnerOrAdmin = ['OWNER', 'ADMIN'].includes(String(currentUser.role ?? ''))

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 920, margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            👤  My Account
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: NEUTRAL, fontSize: '0.875rem' }}>
            Tenant settings, onboarding progress, and continue-setup checklist.
          </p>
        </div>
        <button onClick={loadOverview} disabled={loading} style={btnSecondary}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.625rem 0.875rem', color: DANGER, fontSize: '0.875rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      {saveOk && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '0.625rem 0.875rem', color: SUCCESS, fontSize: '0.875rem', marginBottom: '1rem' }}>
          ✓ Profile updated successfully.
        </div>
      )}

      {/* Two-column layout for tenant + user cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>

        {/* Tenant profile card */}
        <Card title="Tenant Profile" action={isOwnerOrAdmin && !editing ? { label: 'Edit', onClick: () => setEditing(true) } : undefined}>
          {!editing ? (
            <>
              <Row label="Business name" value={String(tenant.name ?? '—')} />
              <Row label="Slug"           value={String(tenant.slug ?? '—')} mono />
              <Row label="Default language" value={String(tenant.defaultLanguage ?? '—').toUpperCase()} />
              <Row label="Plan"           value={String(tenant.plan ?? '—')} />
              <Row label="Active"         value={tenant.isActive ? 'Yes' : 'No'} color={tenant.isActive ? SUCCESS : DANGER} />
              <Row label="Member since"   value={tenant.memberSince ? new Date(String(tenant.memberSince)).toLocaleDateString() : '—'} />
            </>
          ) : (
            <>
              <Field label="Business name">
                <input value={editName} onChange={e => setEditName(e.target.value)} style={inputCss} maxLength={120} minLength={2} />
              </Field>
              <Field label="Default language">
                <select value={editLang} onChange={e => setEditLang(e.target.value)} style={inputCss}>
                  <option value="zh">中文 (zh)</option>
                  <option value="en">English (en)</option>
                  <option value="ms">Bahasa Melayu (ms)</option>
                </select>
              </Field>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={handleSave} disabled={saving} style={btnPrimary}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => { setEditing(false); setEditName(String(tenant.name ?? '')); setEditLang(String(tenant.defaultLanguage ?? 'zh')) }} disabled={saving} style={btnSecondary}>
                  Cancel
                </button>
              </div>
              {!isOwnerOrAdmin && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: WARN_C }}>
                  Only OWNER or ADMIN can edit profile.
                </div>
              )}
            </>
          )}
        </Card>

        {/* Current user card */}
        <Card title="Your Account">
          <Row label="Name"   value={String(currentUser.name  ?? '—')} />
          <Row label="Email"  value={String(currentUser.email ?? '—')} mono />
          <Row label="Role"   value={String(currentUser.role  ?? '—')} color={ACCENT} />
          <Row label="Status" value={currentUser.isActive ? 'Active' : 'Inactive'} color={currentUser.isActive ? SUCCESS : DANGER} />
          <Row label="Member since" value={currentUser.memberSince ? new Date(String(currentUser.memberSince)).toLocaleDateString() : '—'} />
        </Card>
      </div>

      {/* Onboarding + Channel cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <Card title="Onboarding Status" action={{ label: 'Open →', onClick: () => window.location.href = '/onboarding' }}>
          <Row label="Status"        value={String(onboarding.status ?? 'NOT_STARTED')} color={onboarding.status === 'ENABLED' ? SUCCESS : WARN_C} />
          <Row label="Company name"  value={String(onboarding.companyName ?? '—')} />
          <Row label="Industry"      value={String(onboarding.industry ?? '—')} />
          <Row label="Goals"         value={Array.isArray(onboarding.goals) && onboarding.goals.length > 0 ? (onboarding.goals as unknown[]).join(', ') : '—'} />
        </Card>

        <Card title="Channel Setup" action={{ label: 'Open →', onClick: () => window.location.href = '/channels/setup' }}>
          <Row label="Channel type"  value={String(channel.channelType ?? 'Not configured')} />
          <Row label="Setup status"  value={String(channel.setupStatus ?? 'NOT_STARTED')} />
          <Row label="Credentials"   value={String(channel.credentialStatus ?? 'NONE')} color={channel.credentialStatus === 'ENCRYPTED_STORED' ? SUCCESS : NEUTRAL} />
          <Row label="Active channels" value={String(channel.activeChannelCount ?? 0)} />
        </Card>
      </div>

      {/* Setup checklist */}
      <Card title={`Continue Setup (${progress.completed ?? 0}/${progress.total ?? 0})`}>
        {/* Progress bar */}
        <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden', marginBottom: '0.875rem' }}>
          <div style={{ height: '100%', width: `${progress.percent ?? 0}%`, background: ACCENT, borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
        {checklist.map(item => (
          <div key={String(item.key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f3f4f6', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: item.passed ? SUCCESS : '#e5e7eb', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', flexShrink: 0 }}>
                {item.passed ? '✓' : ''}
              </span>
              <span style={{ fontSize: '0.875rem', color: item.passed ? NEUTRAL : '#374151', textDecoration: item.passed ? 'line-through' : 'none' }}>
                {String(item.label)}
              </span>
            </div>
            <a href={String(item.action)} style={{ color: ACCENT, fontSize: '0.8125rem', textDecoration: 'none', flexShrink: 0 }}>
              {item.passed ? 'Review →' : 'Open →'}
            </a>
          </div>
        ))}
      </Card>

      {/* Safety status */}
      <div style={{ marginTop: '1.25rem' }}>
        <Card title="Safety Status">
          <Row label="Real send"             value={safety.realSendCurrentlyOff ? 'OFF ✓ (safe)' : 'ON ⚠️'} color={safety.realSendCurrentlyOff ? SUCCESS : DANGER} />
          <Row label="WA Web session"         value={safety.realWaSessionEnabled ? 'Enabled ⚠️' : 'Disabled ✓'} color={safety.realWaSessionEnabled ? WARN_C : SUCCESS} />
          <Row label="Meta API send"          value={safety.realMetaSendEnabled  ? 'Enabled ⚠️' : 'Disabled ✓'} color={safety.realMetaSendEnabled  ? WARN_C : SUCCESS} />
          <Row label="Broadcast / bulk send"  value="Not supported on any plan ✓" color={SUCCESS} />
          <div style={{ marginTop: '0.625rem', fontSize: '0.75rem', color: NEUTRAL, lineHeight: 1.5, paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
            Activation must go through the <a href="/activation-guide" style={{ color: ACCENT }}>activation guide</a> and pass{' '}
            <a href="/activation/monitoring" style={{ color: ACCENT }}>monitoring checks</a>.
            Omni is for 1:1 WhatsApp AI customer service — not for broadcast, ads, or bulk messaging.
          </div>
        </Card>
      </div>

      {/* Quick links footer */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'center' }}>
        {[
          { href: '/team',                 label: 'Team' },
          { href: '/knowledge',            label: 'Knowledge Base' },
          { href: '/channels/setup',       label: 'Channel Setup' },
          { href: '/activation-guide',     label: 'Activation Guide' },
          { href: '/activation/monitoring', label: 'Activation Monitor' },
          { href: '/release-checklist',    label: 'Release Checklist' },
        ].map(l => (
          <a key={l.href} href={l.href} style={{ padding: '0.3125rem 0.75rem', background: '#f3f4f6', color: '#374151', borderRadius: 6, textDecoration: 'none', fontSize: '0.8125rem', border: '1px solid #e5e7eb' }}>
            {l.label}
          </a>
        ))}
      </div>
    </main>
  )
}

function Card({ title, action, children }: { title: string; action?: { label: string; onClick: () => void }; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '0.875rem 1.125rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: '#111827' }}>{title}</h3>
        {action && (
          <button onClick={action.onClick} style={{ background: 'none', border: 'none', color: ACCENT, cursor: 'pointer', fontSize: '0.8125rem', padding: 0 }}>
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3125rem 0', fontSize: '0.8125rem', gap: '0.5rem' }}>
      <span style={{ color: NEUTRAL }}>{label}</span>
      <span style={{ color: color ?? '#111827', fontFamily: mono ? 'monospace' : 'inherit', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>{label}</label>
      {children}
    </div>
  )
}

const btnPrimary: React.CSSProperties  = { padding: '0.375rem 0.875rem', background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }
const btnSecondary: React.CSSProperties = { padding: '0.375rem 0.875rem', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: '0.8125rem' }
