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

  // Phase 17C — tabs + activity + export
  type Tab = 'overview' | 'activity' | 'export'
  const [tab,         setTab]         = useState<Tab>('overview')
  const [activity,    setActivity]    = useState<AnyData | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [exportData,  setExportData]  = useState<AnyData | null>(null)
  const [exportLoading, setExportLoading] = useState(false)

  useEffect(() => { setAuthed(!!getToken()) }, [])

  const loadActivity = useCallback(async () => {
    const tok = getToken()
    if (!tok) return
    setActivityLoading(true); setError('')
    try {
      const r = await fetch(`${API_BASE}/account/activity?limit=20`, { headers: { Authorization: `Bearer ${tok}` } })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setActivity(await r.json() as AnyData)
    } catch (e) { setError((e as Error).message) }
    finally { setActivityLoading(false) }
  }, [])

  const loadExport = useCallback(async () => {
    const tok = getToken()
    if (!tok) return
    setExportLoading(true); setError('')
    try {
      const r = await fetch(`${API_BASE}/account/export`, { headers: { Authorization: `Bearer ${tok}` } })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` })) as { error?: string }
        throw new Error(err.error ?? `HTTP ${r.status}`)
      }
      setExportData(await r.json() as AnyData)
    } catch (e) { setError((e as Error).message) }
    finally { setExportLoading(false) }
  }, [])

  const downloadExport = () => {
    if (!exportData) return
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `omni-tenant-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

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

      {/* Tabs (Phase 17C) */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem', borderBottom: '1px solid #e5e7eb' }}>
        {([
          { id: 'overview', label: 'Overview',  icon: '🏠' },
          { id: 'activity', label: 'Activity',  icon: '📜' },
          { id: 'export',   label: 'Export',    icon: '📦' },
        ] as { id: Tab; label: string; icon: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id)
              if (t.id === 'activity' && !activity) void loadActivity()
            }}
            style={{
              padding: '0.5rem 1rem',
              background: 'none',
              border: 'none',
              borderBottom: tab === t.id ? `2px solid ${ACCENT}` : '2px solid transparent',
              color: tab === t.id ? ACCENT : NEUTRAL,
              fontWeight: tab === t.id ? 700 : 500,
              cursor: 'pointer',
              fontSize: '0.875rem',
              marginBottom: -1,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
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

      {tab === 'overview' && <>
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
      </>}

      {/* ── Activity tab (Phase 17C) ────────────────────────────────────── */}
      {tab === 'activity' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>📜 Recent Account Activity</h2>
            <button onClick={loadActivity} disabled={activityLoading} style={btnSecondary}>
              {activityLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          <p style={{ color: NEUTRAL, fontSize: '0.8125rem', marginBottom: '1rem', lineHeight: 1.5 }}>
            Audit-derived activity for your tenant. Raw metadata values are filtered to a safe whitelist; no secrets, tokens, or credentials are shown.
          </p>
          <Card title={`Events (${((activity?.events ?? []) as AnyData[]).length})`}>
            {((activity?.events ?? []) as AnyData[]).length === 0 ? (
              <div style={{ color: NEUTRAL, fontSize: '0.875rem', padding: '0.5rem 0' }}>
                {activityLoading ? 'Loading recent activity…' : 'No account activity recorded yet.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {((activity?.events ?? []) as AnyData[]).map(e => (
                  <div key={String(e.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.8125rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT, marginTop: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 600, color: '#111827' }}>{String(e.summary ?? e.action)}</span>
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                          {e.actorRole ? `${String(e.actorRole)} · ` : ''}{e.createdAt ? new Date(String(e.createdAt)).toLocaleString() : '—'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: NEUTRAL, marginTop: 2 }}>
                        <code style={{ background: '#f9fafb', padding: '0 4px', borderRadius: 3 }}>{String(e.action)}</code>
                        {!!e.safeMetadata && Object.keys(e.safeMetadata as object).length > 0 && (
                          <span style={{ marginLeft: '0.5rem', fontFamily: 'monospace', color: '#9ca3af' }}>
                            {JSON.stringify(e.safeMetadata)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Export tab (Phase 17C) ─────────────────────────────────────── */}
      {tab === 'export' && (
        <div>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: '#111827' }}>📦 Safe Tenant Export</h2>
          <Card title="What this export includes">
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#374151', lineHeight: 1.7 }}>
              <li>Tenant profile (id, slug, name, language, plan, active status)</li>
              <li>Users list (id, email, name, role, isActive — NO passwordHash)</li>
              <li>Onboarding draft fields (company name, industry, goals)</li>
              <li>Channel setup status only (no credentialRef, no tokens)</li>
              <li>Knowledge base questions list (NOT answers)</li>
              <li>AI config provider label only (no API key refs)</li>
              <li>Follow-up rule keys + delay (NOT message templates)</li>
              <li>Handoff rule conditions</li>
              <li>Counts: users, customers, conversations, audit events</li>
              <li>Safety flags and redaction summary</li>
            </ul>
          </Card>
          <Card title="What this export excludes">
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#374151', lineHeight: 1.7 }}>
              <li>Password hashes</li>
              <li>Encrypted credential blobs (credentialRef, metaAccessTokenRef, webhookVerifyTokenRef, apiKeyRef)</li>
              <li>Raw tokens of any kind</li>
              <li>WhatsApp / Meta provider session or QR data</li>
              <li>Full customer conversations or message content</li>
              <li>Knowledge base answers (questions only, to avoid leaking pasted content)</li>
              <li>Follow-up message templates</li>
            </ul>
          </Card>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button onClick={loadExport} disabled={exportLoading} style={btnPrimary}>
              {exportLoading ? 'Generating…' : (exportData ? 'Regenerate' : 'Generate Safe Export')}
            </button>
            {exportData && (
              <button onClick={downloadExport} style={btnSecondary}>
                ⬇  Download JSON
              </button>
            )}
          </div>
          {!isOwnerOrAdmin && (
            <div style={{ marginTop: '0.625rem', fontSize: '0.75rem', color: WARN_C }}>
              Note: Export is restricted to OWNER and ADMIN.
            </div>
          )}
          {exportData && (
            <div style={{ marginTop: '1rem' }}>
              <Card title={`Export Preview (generated ${String(exportData.generatedAt ?? '')})`}>
                <pre style={{ fontSize: '0.6875rem', fontFamily: 'monospace', background: '#f9fafb', padding: '0.75rem', borderRadius: 6, border: '1px solid #e5e7eb', overflow: 'auto', maxHeight: 360, margin: 0 }}>
                  {JSON.stringify(exportData, null, 2)}
                </pre>
              </Card>
            </div>
          )}
        </div>
      )}
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
