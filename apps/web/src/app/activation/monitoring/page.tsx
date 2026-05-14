'use client'
// Activation Monitoring Dashboard — Phase 16B
// Shows operator-safe activation readiness and health in one view.
// All data is local/DB-derived. No external provider calls.

import { useEffect, useState, useCallback } from 'react'
import { getToken } from '@/lib/api'

const ACCENT   = '#6366f1'
const SUCCESS  = '#15803d'
const WARN_C   = '#b45309'
const DANGER   = '#b91c1c'
const NEUTRAL  = '#6b7280'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:43111'

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
      <input value={slug}     onChange={e => setSlug(e.target.value)}     placeholder="Tenant slug" required style={inputStyle} />
      <input value={email}    onChange={e => setEmail(e.target.value)}    placeholder="Email"    type="email"    required style={inputStyle} />
      <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" required style={{ ...inputStyle, marginBottom: '1rem' }} />
      <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.625rem', background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}

const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.75rem', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }

interface AnyData { [k: string]: unknown }

function readinessColor(level: string): string {
  if (level === 'BLOCKED')                 return DANGER
  if (level.startsWith('READY_FOR_LIVE'))  return SUCCESS
  if (level.startsWith('READY_FOR_STAG')) return '#0369a1'
  if (level === 'READY_FOR_OPERATOR_REVIEW') return WARN_C
  return NEUTRAL
}

function healthColor(level: string): string {
  if (level === 'SAFE_STUB_MODE')          return SUCCESS
  if (level === 'WARN_NO_CHANNELS')        return WARN_C
  if (level === 'ACTIVE_MONITORING_NEEDED') return '#7c3aed'
  return NEUTRAL
}

function statusBadge(passed: boolean, manual?: boolean) {
  if (manual) return { label: 'MANUAL', bg: '#eff6ff', color: '#1d4ed8' }
  return passed
    ? { label: 'PASS', bg: '#f0fdf4', color: SUCCESS }
    : { label: 'FAIL', bg: '#fef2f2', color: DANGER }
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000)       return 'just now'
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function metaSafePreview(json: string): string {
  try {
    const o = JSON.parse(json) as AnyData
    const s = JSON.stringify(o)
    return s.length > 80 ? s.slice(0, 77) + '…' : s
  } catch { return '{}' }
}

export default function ActivationMonitoringPage() {
  const [authed,    setAuthed]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [preflight, setPreflight] = useState<AnyData | null>(null)
  const [health,    setHealth]    = useState<AnyData | null>(null)
  const [timeline,  setTimeline]  = useState<AnyData | null>(null)
  const [checklist, setChecklist] = useState<AnyData | null>(null)
  const [error,     setError]     = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  useEffect(() => { setAuthed(!!getToken()) }, [])

  const loadAll = useCallback(async () => {
    const tok = getToken()
    if (!tok) return
    setLoading(true); setError('')
    try {
      const headers = { Authorization: `Bearer ${tok}` }
      const [pfR, hR, tlR, clR] = await Promise.allSettled([
        fetch(`${API_BASE}/activation/preflight`,       { headers }),
        fetch(`${API_BASE}/activation/health`,          { headers }),
        fetch(`${API_BASE}/activation/timeline`,        { headers }),
        fetch(`${API_BASE}/activation/go-live-checklist`, { headers }),
      ])
      if (pfR.status === 'fulfilled' && pfR.value.ok) setPreflight(await pfR.value.json() as AnyData)
      if (hR.status  === 'fulfilled' && hR.value.ok)  setHealth(   await hR.value.json()  as AnyData)
      if (tlR.status === 'fulfilled' && tlR.value.ok) setTimeline( await tlR.value.json() as AnyData)
      if (clR.status === 'fulfilled' && clR.value.ok) setChecklist(await clR.value.json() as AnyData)
      setLastRefresh(new Date())
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (authed) void loadAll() }, [authed, loadAll])

  if (!authed) return <LoginForm onSuccess={() => setAuthed(true)} />

  const pfReadiness    = String(preflight?.readiness ?? '—')
  const healthLevel    = String(health?.overallHealthLevel ?? '—')
  const safetyFlags    = (health?.safetyFlags ?? {}) as AnyData
  const pfSummary      = (preflight?.summary  ?? {}) as AnyData
  const clSummary      = (checklist?.summary  ?? {}) as AnyData
  const events         = (timeline?.events    ?? []) as AnyData[]
  const checkItems     = (checklist?.items    ?? []) as AnyData[]
  const channelHealth  = (health?.channelHealth ?? []) as AnyData[]
  const recommendedAction = String(health?.recommendedAction ?? preflight?.nextAction ?? '—')

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            🖥️  Activation Monitoring Dashboard
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: NEUTRAL, fontSize: '0.875rem' }}>
            Local readiness and health overview. All data is DB-derived — no external provider calls.
            {lastRefresh && <span style={{ marginLeft: '0.75rem', color: '#9ca3af' }}>Last refresh: {lastRefresh.toLocaleTimeString()}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={loadAll} disabled={loading} style={{ padding: '0.4375rem 0.875rem', background: ACCENT, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '0.875rem' }}>
            {loading ? 'Refreshing…' : 'Refresh All'}
          </button>
          <a href="/activation-guide" style={{ padding: '0.4375rem 0.875rem', background: '#f3f4f6', color: '#374151', borderRadius: 7, textDecoration: 'none', fontSize: '0.875rem', border: '1px solid #e5e7eb' }}>
            Activation Guide →
          </a>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.75rem 1rem', color: DANGER, marginBottom: '1rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* Status row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.875rem', marginBottom: '1.5rem' }}>
        <StatusCard title="Readiness Level" value={pfReadiness} color={readinessColor(pfReadiness)} sub={`${pfSummary.passed ?? 0}/${pfSummary.total ?? 0} checks passed`} />
        <StatusCard title="Health Level" value={healthLevel} color={healthColor(healthLevel)} sub={`${channelHealth.length} active channel(s)`} />
        <StatusCard title="Real Send" value={safetyFlags.realSendCurrentlyOff === true ? 'OFF ✓' : 'ON ⚠'} color={safetyFlags.realSendCurrentlyOff === true ? SUCCESS : DANGER} sub={safetyFlags.realSendCurrentlyOff ? 'Safe — stub mode' : 'Active — monitor carefully'} />
        <StatusCard title="Go-Live Checklist" value={`${clSummary.automatedPassed ?? 0}/${(Number(clSummary.automatedPassed ?? 0) + Number(clSummary.automatedFailed ?? 0))} auto`} color={clSummary.automatedFailed === 0 ? SUCCESS : WARN_C} sub={`${clSummary.manualRequired ?? 0} manual items pending`} />
      </div>

      {/* Recommended action */}
      {recommendedAction !== '—' && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '0.75rem 1.125rem', marginBottom: '1.25rem', fontSize: '0.875rem', color: '#0c4a6e' }}>
          <strong>Next recommended action:</strong> {recommendedAction}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>

        {/* Pre-flight checks */}
        <Section title="Pre-flight Checks" link={{ href: '/activation-guide', label: 'Guide →' }}>
          {preflight
            ? ((preflight.checks ?? []) as AnyData[]).map(c => {
                const b = statusBadge(!!c.passed, false)
                return (
                  <CheckRow key={String(c.key)} label={String(c.label)} detail={String(c.detail ?? '')} badge={b} required={!!c.required} />
                )
              })
            : <Skeleton />}
        </Section>

        {/* Go-live checklist */}
        <Section title="Go-Live Checklist" link={{ href: '/release-checklist', label: 'Release →' }}>
          {checklist
            ? checkItems.map(c => {
                const b = statusBadge(!!c.passed, !!c.requiresManualConfirmation)
                return (
                  <CheckRow key={String(c.key)} label={String(c.label)} detail={String(c.detail ?? '')} badge={b} />
                )
              })
            : <Skeleton />}
        </Section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>

        {/* Channel health */}
        <Section title="Channel Health" link={{ href: '/channels/setup', label: 'Setup →' }}>
          {health ? (
            channelHealth.length > 0
              ? channelHealth.map(c => (
                  <div key={String(c.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4375rem 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.8125rem', gap: '0.5rem' }}>
                    <div>
                      <span style={{ fontWeight: 600, color: '#111827' }}>{String(c.displayName)}</span>
                      <span style={{ marginLeft: '0.375rem', color: NEUTRAL, fontSize: '0.75rem' }}>{String(c.type)}</span>
                    </div>
                    <span style={{ color: NEUTRAL, fontSize: '0.75rem', flexShrink: 0 }}>{c.lastWebhookAt ? relTime(String(c.lastWebhookAt)) : 'no webhook'}</span>
                  </div>
                ))
              : <div style={{ color: NEUTRAL, fontSize: '0.875rem', padding: '0.5rem 0' }}>No active channels found. Configure at /channels/setup.</div>
          ) : <Skeleton />}
          {health && (
            <div style={{ marginTop: '0.625rem', fontSize: '0.75rem', color: NEUTRAL }}>
              Safety: realSendActive = {String(safetyFlags.realSendActive ?? false)}
            </div>
          )}
        </Section>

        {/* Manual blockers summary */}
        <Section title="Manual Blockers" link={{ href: '/ops/runbook', label: 'Runbook →' }}>
          {checklist ? (
            checkItems
              .filter(c => !!c.requiresManualConfirmation)
              .map(c => (
                <div key={String(c.key)} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.375rem 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.8125rem' }}>
                  <span style={{ color: WARN_C, flexShrink: 0, marginTop: 1 }}>⬜</span>
                  <div>
                    <div style={{ color: '#374151', lineHeight: 1.4 }}>{String(c.label)}</div>
                    {!!c.action && <a href={String(c.action)} style={{ color: ACCENT, fontSize: '0.75rem' }}>View →</a>}
                  </div>
                </div>
              ))
          ) : <Skeleton />}
          <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: NEUTRAL }}>
            Manual items require operator action outside this system.
          </div>
        </Section>
      </div>

      {/* Audit / Timeline */}
      <Section title="Recent Activation Timeline" link={{ href: '/audit', label: 'Full Log →' }}>
        {timeline ? (
          events.length > 0
            ? <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {events.map(e => (
                  <div key={String(e.id)} style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start', padding: '0.4375rem 0', borderBottom: '1px solid #f9fafb' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT, marginTop: 5, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#111827' }}>{String(e.action)}</span>
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af', flexShrink: 0 }}>{relTime(String(e.createdAt))}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: NEUTRAL }}>
                        {!!e.actorRole && <span style={{ marginRight: '0.5rem' }}>{String(e.actorRole)}</span>}
                        {/* Phase 18A: server returns sanitized safeMetadata; fall back to legacy metadataJson if present */}
                        {!!e.safeMetadata && Object.keys(e.safeMetadata as object).length > 0 && (
                          <span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>{JSON.stringify(e.safeMetadata)}</span>
                        )}
                        {!e.safeMetadata && !!e.metadataJson && <span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>{metaSafePreview(String(e.metadataJson))}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            : <div style={{ color: NEUTRAL, fontSize: '0.875rem', padding: '0.5rem 0' }}>No activation events yet. Run a dry-run from /activation-guide.</div>
        ) : <Skeleton />}
        {timeline && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: NEUTRAL }}>
            Total activation dry-runs: {String(timeline.totalActivationDryRuns ?? 0)}
          </div>
        )}
      </Section>

      {/* Safety notice */}
      <div style={{ marginTop: '1.25rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8125rem', color: NEUTRAL, lineHeight: 1.6 }}>
        <strong>Safety:</strong> This dashboard is local-only. No external WhatsApp/Meta/AI/email/payment calls are made.
        Real sends remain <strong>disabled by default</strong> unless an operator manually sets{' '}
        <code style={{ fontFamily: 'monospace', background: '#f3f4f6', padding: '0 3px', borderRadius: 3 }}>OMNI_ALLOW_WA_SESSION</code> or{' '}
        <code style={{ fontFamily: 'monospace', background: '#f3f4f6', padding: '0 3px', borderRadius: 3 }}>OMNI_ENABLE_REAL_META_SEND</code>.
        Omni is a WhatsApp AI 客服 + CRM system — not a broadcast/ads/bulk-sending platform.
      </div>

      {/* Quick links */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.25rem', justifyContent: 'center' }}>
        {[
          { href: '/activation-guide',  label: 'Activation Guide' },
          { href: '/release-checklist', label: 'Release Checklist' },
          { href: '/ops/runbook',       label: 'Ops Runbook' },
          { href: '/channels/setup',    label: 'Channel Setup' },
          { href: '/audit',             label: 'Audit Logs' },
          { href: '/production-qa',     label: 'Production QA' },
        ].map(l => (
          <a key={l.href} href={l.href} style={{ padding: '0.3125rem 0.75rem', background: '#f3f4f6', color: '#374151', borderRadius: 6, textDecoration: 'none', fontSize: '0.8125rem', border: '1px solid #e5e7eb' }}>
            {l.label}
          </a>
        ))}
      </div>
    </main>
  )
}

function StatusCard({ title, value, color, sub }: { title: string; value: string; color: string; sub: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '0.875rem 1rem' }}>
      <div style={{ fontSize: '0.6875rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>{title}</div>
      <div style={{ fontWeight: 700, fontSize: '1rem', color, marginBottom: '0.25rem', lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{sub}</div>
    </div>
  )
}

function Section({ title, link, children }: { title: string; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '0.875rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>{title}</h3>
        {link && <a href={link.href} style={{ fontSize: '0.8125rem', color: ACCENT, textDecoration: 'none' }}>{link.label}</a>}
      </div>
      {children}
    </div>
  )
}

function CheckRow({ label, detail, badge, required }: {
  label: string; detail: string; badge: { label: string; bg: string; color: string }; required?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.3125rem 0', borderBottom: '1px solid #f9fafb', fontSize: '0.8125rem' }}>
      <span style={{ padding: '0.0625rem 0.375rem', borderRadius: 4, background: badge.bg, color: badge.color, fontWeight: 700, fontSize: '0.6875rem', flexShrink: 0, marginTop: 2 }}>
        {badge.label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#374151', lineHeight: 1.3 }}>
          {label}{required && <span style={{ marginLeft: '0.25rem', color: DANGER, fontSize: '0.625rem' }}>*required</span>}
        </div>
        {detail && <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: 1 }}>{detail}</div>}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ height: 28, background: '#f3f4f6', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
    </div>
  )
}
