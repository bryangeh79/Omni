'use client'
// Audit Activity Timeline — Phase 15C

import { useEffect, useState, useCallback } from 'react'
import { getToken, fetchAuditLogs, type AuditLog, type AuditLogsResponse } from '@/lib/api'

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [slug,     setSlug]     = useState('omni-demo')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const { login, setToken } = await import('@/lib/api')
      const r = await login(slug, email, password)
      setToken(r.accessToken)
      onSuccess()
    } catch (err) { setError((err as Error).message) }
    finally { setLoading(false) }
  }
  return (
    <form onSubmit={handleLogin} style={{ maxWidth: 360, margin: '4rem auto', padding: '2rem', border: '1px solid #e5e7eb', borderRadius: 12, fontFamily: 'system-ui' }}>
      <h2 style={{ marginTop: 0 }}>Sign in to Omni</h2>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      <input value={slug}     onChange={e => setSlug(e.target.value)}     placeholder="Tenant slug"  required style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.75rem', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
      <input value={email}    onChange={e => setEmail(e.target.value)}    placeholder="Email"       type="email"    required style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.75rem', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
      <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"    type="password" required style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '1rem',   borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
      <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.625rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}

const ACTION_LABELS: Record<string, string> = {
  TEAM_INVITE_DRAFT:      'Team invite drafted',
  TEAM_ROLE_UPDATE:       'Member role updated',
  TEAM_STATUS_UPDATE:     'Member status changed',
  BILLING_PLAN_SELECTED:  'Billing plan selected',
  SETTINGS_PROFILE_UPDATE: 'Company profile updated',
  SMOKE_TEST_EVENT:       'Smoke test event',
}

const ROLE_COLORS: Record<string, string> = {
  OWNER:   '#7c3aed',
  ADMIN:   '#1d4ed8',
  MANAGER: '#0369a1',
  AGENT:   '#15803d',
  VIEWER:  '#71717a',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000)         return 'just now'
  if (diff < 3_600_000)      return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000)     return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function safeMetaPreview(json: string): string {
  try {
    const obj = JSON.parse(json) as Record<string, unknown>
    const safe: Record<string, unknown> = {}
    const skip = new Set(['password', 'token', 'secret', 'apiKey', 'credential'])
    for (const [k, v] of Object.entries(obj)) {
      if (!skip.has(k)) safe[k] = v
    }
    const s = JSON.stringify(safe)
    return s.length > 120 ? s.slice(0, 117) + '...' : s
  } catch {
    return '{}'
  }
}

export default function AuditPage() {
  const [authed, setAuthed]   = useState(false)
  const [data,   setData]     = useState<AuditLogsResponse | null>(null)
  const [error,  setError]    = useState('')
  const [loading, setLoading] = useState(false)
  const [page,   setPage]     = useState(1)
  const [filterAction,     setFilterAction]     = useState('')
  const [filterEntityType, setFilterEntityType] = useState('')

  useEffect(() => { setAuthed(!!getToken()) }, [])

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    setError('')
    try {
      const r = await fetchAuditLogs({
        page:       p,
        pageSize:   20,
        action:     filterAction     || undefined,
        entityType: filterEntityType || undefined,
      })
      setData(r)
      setPage(p)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [filterAction, filterEntityType])

  useEffect(() => { if (authed) load(1) }, [authed, load])

  if (!authed) return <LoginForm onSuccess={() => setAuthed(true)} />

  const logs = data?.logs ?? []
  const pag  = data?.pagination

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Admin Activity Timeline</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
            Audit log of critical admin actions. Secrets and credentials are never recorded.
          </p>
        </div>
        <a href="/settings" style={{ color: '#6366f1', fontSize: '0.875rem', textDecoration: 'none' }}>&larr; Settings</a>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select
          value={filterAction}
          onChange={e => { setFilterAction(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.875rem' }}
        >
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={filterEntityType}
          onChange={e => { setFilterEntityType(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.875rem' }}
        >
          <option value="">All entity types</option>
          <option value="User">User</option>
          <option value="Tenant">Tenant</option>
          <option value="TeamInvite">TeamInvite</option>
          <option value="SmokeTest">SmokeTest</option>
        </select>
        <button
          onClick={() => load(1)}
          disabled={loading}
          style={{ padding: '0.4rem 1rem', borderRadius: 6, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.75rem 1rem', color: '#b91c1c', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {logs.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem 0' }}>
            No audit events found.
          </div>
        )}
        {logs.map((log: AuditLog) => (
          <AuditCard key={log.id} log={log} />
        ))}
      </div>

      {/* Pagination */}
      {pag && pag.pages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'center', alignItems: 'center' }}>
          <button
            onClick={() => load(page - 1)}
            disabled={page <= 1 || loading}
            style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid #d1d5db', background: page <= 1 ? '#f3f4f6' : '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
          >
            Prev
          </button>
          <span style={{ color: '#374151', fontSize: '0.875rem' }}>
            Page {pag.page} of {pag.pages} ({pag.total} events)
          </span>
          <button
            onClick={() => load(page + 1)}
            disabled={page >= pag.pages || loading}
            style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid #d1d5db', background: page >= pag.pages ? '#f3f4f6' : '#fff', cursor: page >= pag.pages ? 'not-allowed' : 'pointer' }}
          >
            Next
          </button>
        </div>
      )}

      <footer style={{ marginTop: '2rem', color: '#9ca3af', fontSize: '0.75rem', textAlign: 'center' }}>
        Audit logs are tenant-scoped. Secrets and credentials are never recorded.
      </footer>
    </main>
  )
}

function AuditCard({ log }: { log: AuditLog }) {
  const label    = ACTION_LABELS[log.action] ?? log.action
  const roleColor = log.actorRole ? (ROLE_COLORS[log.actorRole] ?? '#374151') : '#9ca3af'
  const meta     = safeMetaPreview(log.metadataJson)

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      padding: '0.875rem 1.25rem',
      display: 'flex',
      gap: '1rem',
      alignItems: 'flex-start',
    }}>
      {/* Timeline dot */}
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: '#6366f1', marginTop: 6, flexShrink: 0,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827' }}>{label}</span>
            {log.actorRole && (
              <span style={{
                marginLeft: '0.5rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: roleColor,
                background: `${roleColor}18`,
                padding: '0.125rem 0.5rem',
                borderRadius: 12,
              }}>
                {log.actorRole}
              </span>
            )}
          </div>
          <span style={{ color: '#9ca3af', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
            {relativeTime(log.createdAt)}
          </span>
        </div>

        <div style={{ marginTop: '0.25rem', fontSize: '0.8125rem', color: '#6b7280' }}>
          <span style={{ fontFamily: 'monospace', background: '#f9fafb', padding: '0.125rem 0.375rem', borderRadius: 4 }}>
            {log.entityType}{log.entityId ? `:${log.entityId.slice(0, 8)}` : ''}
          </span>
          {meta !== '{}' && (
            <span style={{ marginLeft: '0.75rem', fontFamily: 'monospace', color: '#9ca3af', fontSize: '0.75rem' }}>
              {meta}
            </span>
          )}
        </div>

        {log.actorUserId && (
          <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#9ca3af' }}>
            actor: {log.actorUserId.slice(0, 12)}…
          </div>
        )}
      </div>
    </div>
  )
}
