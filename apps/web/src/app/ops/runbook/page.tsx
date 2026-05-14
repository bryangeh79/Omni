'use client'
// Production Monitoring & Backup Runbook — Phase 15C

import { useState, useEffect } from 'react'
import { getToken } from '@/lib/api'

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

const OMNI_PORTS = [
  { label: 'Web (Next.js)',  port: 43110 },
  { label: 'API (Fastify)', port: 43111 },
  { label: 'Worker',        port: 43112 },
  { label: 'PostgreSQL',    port: 43113 },
  { label: 'Redis',         port: 43114 },
]

const HEALTH_CHECKS = [
  { key: 'api_health',   label: 'API /ops/health responds 200',      url: 'http://localhost:43111/ops/health' },
  { key: 'api_ready',    label: 'API /ops/ready responds 200',       url: 'http://localhost:43111/ops/ready'  },
  { key: 'api_db',       label: 'DB connectivity (via API ready)',   url: null },
]

const BACKUP_CHECKLIST = [
  { key: 'pg_dump',          label: 'PostgreSQL pg_dump scheduled (daily minimum)',         status: 'MANUAL' },
  { key: 'backup_offsite',   label: 'Backup copy stored off-server (S3 or similar)',        status: 'MANUAL' },
  { key: 'backup_restore',   label: 'Restore procedure tested in staging',                  status: 'MANUAL' },
  { key: 'backup_retention', label: 'Retention policy defined (7 days minimum)',            status: 'MANUAL' },
  { key: 'backup_alert',     label: 'Alert on backup failure configured',                   status: 'MANUAL' },
]

const MONITORING_CHECKLIST = [
  { key: 'uptime_monitor',   label: 'External uptime monitor on API health endpoint',       status: 'MANUAL' },
  { key: 'error_rate_alert', label: 'Error rate alert (>1% 5xx triggers page)',             status: 'MANUAL' },
  { key: 'disk_alert',       label: 'Disk usage alert (>80%)',                              status: 'MANUAL' },
  { key: 'db_size',          label: 'Database size growth tracked',                        status: 'MANUAL' },
  { key: 'log_retention',    label: 'API/worker logs retained ≥30 days',                   status: 'MANUAL' },
  { key: 'redis_memory',     label: 'Redis memory monitored, eviction policy set',         status: 'MANUAL' },
]

const INCIDENT_STEPS = [
  'Confirm scope: which tenants, channels, features affected?',
  'Check API health: GET /ops/health and /ops/ready',
  'Check Postgres: can you connect to port 43113 and query?',
  'Check Redis: can you connect to port 43114?',
  'Check Worker: is the worker process running and processing jobs?',
  'Review API logs for 5xx errors or uncaught exceptions',
  'If WhatsApp session issue: check OMNI_ALLOW_WA_SESSION flag',
  'If Meta webhook issue: check webhook verify token and channel config',
  'Notify affected tenants via out-of-band channel (email/WhatsApp)',
  'Capture incident timeline, root cause, and fix for post-mortem',
]

const SUPPORT_READINESS = [
  { key: 'support_contact',   label: 'Support contact method defined and documented' },
  { key: 'escalation_path',   label: 'Escalation path documented (L1 → L2 → engineer)' },
  { key: 'tenant_comms',      label: 'Tenant communication template ready for outages' },
  { key: 'runbook_location',  label: 'This runbook URL shared with ops team' },
]

export default function RunbookPage() {
  const [authed,  setAuthed]  = useState(false)
  const [section, setSection] = useState<string>('health')

  useEffect(() => { setAuthed(!!getToken()) }, [])

  if (!authed) return <LoginForm onSuccess={() => setAuthed(true)} />

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Production Ops Runbook</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
            Health checks, backup checklist, monitoring, incident response, and support readiness.
          </p>
        </div>
        <a href="/production-qa" style={{ color: '#6366f1', fontSize: '0.875rem', textDecoration: 'none' }}>Production QA &rarr;</a>
      </div>

      {/* Nav tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { id: 'health',   label: 'Health Checks' },
          { id: 'backup',   label: 'Backup Checklist' },
          { id: 'monitor',  label: 'Monitoring' },
          { id: 'incident', label: 'Incident Response' },
          { id: 'support',  label: 'Support Readiness' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id)}
            style={{
              padding: '0.4rem 0.875rem',
              borderRadius: 6,
              border: '1px solid',
              borderColor: section === tab.id ? '#6366f1' : '#d1d5db',
              background:  section === tab.id ? '#6366f1' : '#fff',
              color:       section === tab.id ? '#fff'    : '#374151',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: section === tab.id ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {section === 'health' && (
        <Section title="Health Check Endpoints">
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            All Omni services should respond on their dedicated ports. No port conflicts with other projects.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Service</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Port</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Check</th>
              </tr>
            </thead>
            <tbody>
              {OMNI_PORTS.map(p => (
                <tr key={p.port} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.5rem 0.75rem', color: '#111827' }}>{p.label}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', color: '#6366f1' }}>{p.port}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>TCP connect</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: '1.25rem' }}>
            {HEALTH_CHECKS.map(hc => (
              <div key={hc.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: '0.875rem', color: '#374151' }}>{hc.label}</span>
                {hc.url
                  ? <a href={hc.url} target="_blank" rel="noopener" style={{ color: '#6366f1', fontSize: '0.8125rem', fontFamily: 'monospace' }}>{hc.url}</a>
                  : <span style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>derived</span>
                }
              </div>
            ))}
          </div>
        </Section>
      )}

      {section === 'backup' && (
        <Section title="Backup Checklist">
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            All items are manual operator tasks. Mark each as complete once configured.
          </p>
          <ChecklistItems items={BACKUP_CHECKLIST} />
          <InfoBox>
            Backup command: <code>pg_dump -h localhost -p 43113 -U omni_user omni_dev &gt; backup_$(date +%Y%m%d).sql</code>
            <br />Restore: <code>psql -h localhost -p 43113 -U omni_user omni_dev &lt; backup_YYYYMMDD.sql</code>
            <br />Test restore in an isolated dev database before using in production.
          </InfoBox>
        </Section>
      )}

      {section === 'monitor' && (
        <Section title="Monitoring Checklist">
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            All items require external tooling (UptimeRobot, Grafana, Sentry, etc.) — configure before launch.
          </p>
          <ChecklistItems items={MONITORING_CHECKLIST} />
          <InfoBox>
            Recommended: monitor <code>GET /ops/health</code> every 60s from an external probe.
            Set alert threshold: 2 consecutive failures = page on-call.
          </InfoBox>
        </Section>
      )}

      {section === 'incident' && (
        <Section title="Incident Response Procedure">
          <ol style={{ margin: 0, padding: '0 0 0 1.25rem', lineHeight: 1.8 }}>
            {INCIDENT_STEPS.map((step, i) => (
              <li key={i} style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.5rem' }}>
                {step}
              </li>
            ))}
          </ol>
          <InfoBox>
            Post-incident: file a brief report with timeline, root cause, and action items.
            Update this runbook if the incident revealed a gap.
          </InfoBox>
        </Section>
      )}

      {section === 'support' && (
        <Section title="Support Readiness">
          <ChecklistItems items={SUPPORT_READINESS} />
          <InfoBox>
            All support contacts and escalation paths should be documented in an internal wiki
            and shared with the ops team before production launch.
          </InfoBox>
        </Section>
      )}

      <footer style={{ marginTop: '2.5rem', color: '#9ca3af', fontSize: '0.75rem', textAlign: 'center' }}>
        Omni AI Chatbot — Phase 15C Production Ops Runbook &nbsp;|&nbsp;
        <a href="/audit" style={{ color: '#6366f1' }}>Audit Logs</a> &nbsp;|&nbsp;
        <a href="/production-qa" style={{ color: '#6366f1' }}>Production QA</a> &nbsp;|&nbsp;
        <a href="/activation-guide" style={{ color: '#6366f1' }}>Activation Guide</a> &nbsp;|&nbsp;
        <a href="/activation/monitoring" style={{ color: '#6366f1' }}>Activation Monitor</a>
      </footer>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: '#111827' }}>{title}</h2>
      {children}
    </div>
  )
}

function ChecklistItems({ items }: { items: { key: string; label: string; status?: string }[] }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {items.map(item => (
        <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.5rem', borderRadius: 6, background: checked[item.key] ? '#f0fdf4' : '#f9fafb' }}>
          <input
            type="checkbox"
            checked={!!checked[item.key]}
            onChange={e => setChecked(prev => ({ ...prev, [item.key]: e.target.checked }))}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontSize: '0.875rem', color: checked[item.key] ? '#15803d' : '#374151', textDecoration: checked[item.key] ? 'line-through' : 'none' }}>
            {item.label}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#9ca3af' }}>MANUAL</span>
        </label>
      ))}
    </div>
  )
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#1e40af', lineHeight: 1.6 }}>
      {children}
    </div>
  )
}
