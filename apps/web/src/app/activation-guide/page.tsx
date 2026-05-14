'use client'
// Production Activation Operator Guide — Phase 16A
// Step-by-step guide for moving from demo/staging to controlled live activation.
// Does NOT enable real send — operator must manually change env flags after completing this guide.

import { useState, useEffect } from 'react'
import { getToken }            from '@/lib/api'

const ACCENT     = '#6366f1'
const SUCCESS    = '#15803d'
const WARN_COLOR = '#b45309'
const DANGER     = '#b91c1c'

interface Step {
  n:       number
  title:   string
  detail:  string
  items:   string[]
  warning?: string
}

const BEFORE_STEPS: Step[] = [
  {
    n: 1,
    title:  'Complete all pre-flight checks',
    detail: 'Run GET /activation/preflight or check /release-checklist to confirm readiness level.',
    items: [
      'Onboarding wizard must be ENABLED',
      'At least one active knowledge base item',
      'Channel type selected and draft saved',
      'OWNER or ADMIN user exists',
      'Credential vault configured (OMNI_API_KEY_ENCRYPTION_SECRET)',
    ],
  },
  {
    n: 2,
    title:  'Confirm backup and monitoring are configured',
    detail: 'Before going live, protect your data.',
    items: [
      'pg_dump scheduled (daily minimum) with off-server storage',
      'Restore procedure tested in staging',
      'Uptime monitor on GET /ops/health (external probe)',
      'Error rate alert configured (>1% 5xx triggers page)',
    ],
    warning: 'Do not activate live channels without backup configured. Data loss is permanent.',
  },
  {
    n: 3,
    title:  'Run activation dry-run',
    detail: 'Use POST /activation/dry-run to simulate the activation path without making any real connections.',
    items: [
      'POST /activation/dry-run with channelType and intendedMode',
      'Review blockedReasons — resolve any BLOCKED items',
      'Review stepsIfProceeding for your channel type',
      'Note: dry-run never enables real send',
    ],
  },
]

const WA_WEB_STEPS: Step[] = [
  {
    n: 1,
    title:  'Required: Ordinary WhatsApp account',
    detail: 'You need an active WhatsApp account on a real phone number for WA Web.',
    items: [
      'A phone number with active WhatsApp installed',
      'Phone must remain connected/online for session stability',
      'NOT the Meta WhatsApp Business Platform (WABA) — that is a separate path',
    ],
    warning: 'Ordinary WhatsApp (WA Web) stability is BEST-EFFORT. WhatsApp may disconnect or ban the session. Use Meta WhatsApp Business API for production stability.',
  },
  {
    n: 2,
    title:  'Set environment flag',
    detail: 'In production .env only (never dev/staging unless testing).',
    items: [
      'Set OMNI_ALLOW_WA_SESSION=true',
      'Restart the API server',
      'Confirm /channels/setup/wa-web/status shows waSessionAllowed: true',
    ],
    warning: 'This flag enables real WhatsApp Web session capabilities. Ensure your phone and account are ready.',
  },
  {
    n: 3,
    title:  'Scan QR code',
    detail: 'Navigate to /channels/setup/wa-web/qr and scan the QR with your phone.',
    items: [
      'Open /channels/setup/wa-web/qr in the operator dashboard',
      'Open WhatsApp on your phone → Linked Devices → Link a Device',
      'Scan the QR code',
      'Wait for session to confirm (sessionStatus: CONNECTED)',
    ],
  },
  {
    n: 4,
    title:  'Verify session health',
    detail: 'Confirm the session is active and messages flow correctly.',
    items: [
      'GET /channels/setup/wa-web/status → sessionStatus: CONNECTED',
      'GET /activation/health → overallHealthLevel not WARN',
      'Send a test message to a known internal number',
      'Confirm message received on the other device',
    ],
  },
  {
    n: 5,
    title:  'Post-activation monitoring',
    detail: 'WA Web sessions can drop. Monitor regularly.',
    items: [
      'Check /channels/setup/wa-web/status daily',
      'Set up alert if session drops (sessionStatus ≠ CONNECTED)',
      'Keep the linked phone powered on and online',
      'Plan for reconnect workflow if session expires',
    ],
  },
]

const META_STEPS: Step[] = [
  {
    n: 1,
    title:  'Required: Meta WhatsApp Business account',
    detail: 'You need a verified Meta Business Account and WhatsApp Business Account (WABA).',
    items: [
      'Meta Business Manager account (business.facebook.com)',
      'WhatsApp Business Account (WABA) — approved by Meta',
      'A phone number ID registered on Meta (not an ordinary number)',
      'Meta System User token or App access token with whatsapp_business_messaging permission',
      'Meta App with webhook subscription capability',
    ],
  },
  {
    n: 2,
    title:  'Store credentials via channel setup',
    detail: 'Use the encrypted credential vault — never paste tokens in plaintext.',
    items: [
      'Navigate to /channels/setup',
      'Save credentials via POST /channels/setup/credentials-draft',
      'Verify credentialStatus: ENCRYPTED_STORED in response',
      'Confirm no raw token appears in any API response',
    ],
    warning: 'Never store raw Meta access tokens in plaintext. Always use the credential vault (OMNI_API_KEY_ENCRYPTION_SECRET).',
  },
  {
    n: 3,
    title:  'Configure and test webhook',
    detail: 'Meta needs to verify your webhook endpoint before messages flow.',
    items: [
      'Webhook URL: https://your-domain.com/webhooks/meta/whatsapp/{channelId}',
      'Webhook verify token: set via /channels/setup/meta-webhook/save-draft',
      'Subscribe your Meta App to the WABA webhooks in Meta Business Settings',
      'Test with GET /channels/setup/meta-webhook/status → webhookSubscribed: true',
      'Run /channels/setup/meta-webhook/test-stub to verify locally',
    ],
  },
  {
    n: 4,
    title:  'Set environment flag',
    detail: 'In production .env only.',
    items: [
      'Set OMNI_ENABLE_REAL_META_SEND=true',
      'Restart the API server',
      'Confirm /activation/health → safetyFlags.realMetaSendEnabled: true',
    ],
    warning: 'This flag enables real Meta WhatsApp API calls. Ensure your credentials are valid and your webhook is subscribed first.',
  },
  {
    n: 5,
    title:  'Send test message and verify',
    detail: 'Send a test message to a known number to confirm end-to-end flow.',
    items: [
      'Use /messages/send with a valid conversationId on the Meta channel',
      'Confirm sendStatus: SENT (not META_SEND_DISABLED)',
      'Confirm the message arrives on the destination phone',
      'Monitor /webhooks/meta/whatsapp/{channelId} for incoming delivery receipts',
      'Review /audit logs for the send attempt',
    ],
  },
  {
    n: 6,
    title:  'Post-activation monitoring',
    detail: 'Meta API has rate limits and may return errors. Monitor carefully.',
    items: [
      'Monitor API error rate on /ops/health',
      'Set up alert on /audit logs for FAILED send events',
      'Review Meta message delivery reports in Meta Business Manager',
      'Note: Meta charges per-conversation fees — track usage in /billing/usage-summary',
      'Meta fees are NOT bundled in Omni plan pricing — billed as pass-through credits',
    ],
  },
]

const ROLLBACK_STEPS = [
  'Set OMNI_ALLOW_WA_SESSION=false OR OMNI_ENABLE_REAL_META_SEND=false in .env',
  'Restart the API server',
  'Confirm /activation/health shows realSendCurrentlyOff: true',
  'Verify no further real messages are sent (check /audit logs)',
  'If WA Web: disconnect session via /channels/setup/wa-web/disconnect',
  'Investigate root cause before re-activating',
  'Post incident report with timeline and action items',
]

const POST_MONITORING = [
  { label: 'API health',       href: '/ops/runbook', detail: 'GET /ops/health every 60s externally' },
  { label: 'Activation health', href: '/activation-guide', detail: 'GET /activation/health — local safety flags + channel health' },
  { label: 'Audit logs',       href: '/audit', detail: 'Review TEAM/BILLING/SETTINGS actions and any ACTIVATION_DRY_RUN events' },
  { label: 'Channel status',   href: '/channels/setup', detail: 'WA Web: session status; Meta: webhook status' },
  { label: 'Billing usage',    href: '/billing', detail: 'Track Meta per-conversation fees in usage summary' },
]

export default function ActivationGuidePage() {
  const [path,    setPath]    = useState<'wa-web' | 'meta' | null>(null)
  const [authed,  setAuthed]  = useState(false)
  const [preflight, setPreflight] = useState<Record<string, unknown> | null>(null)
  const [pfLoading, setPfLoading] = useState(false)

  useEffect(() => { setAuthed(!!getToken()) }, [])

  const loadPreflight = async () => {
    const tok = getToken()
    if (!tok) return
    setPfLoading(true)
    try {
      const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:43111'
      const r   = await fetch(`${API}/activation/preflight`, { headers: { Authorization: `Bearer ${tok}` } })
      if (r.ok) setPreflight(await r.json() as Record<string, unknown>)
    } catch { /* non-fatal */ }
    finally { setPfLoading(false) }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            🚦 上线激活操作指南
          </h1>
          <p style={{ margin: '0.375rem 0 0', color: '#6b7280', fontSize: '0.9375rem', lineHeight: 1.5, maxWidth: 640 }}>
            从演示 / 预演环境过渡到受控真实激活的分步指南。
            <strong> 真实发送默认关闭：必须手动修改 env 标志并完成所有检查后才会启用。</strong>
          </p>
        </div>
        <a href="/release-checklist" style={{ padding: '0.4375rem 0.875rem', background: ACCENT, color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
          发布检查清单 →
        </a>
      </div>

      {/* Safety banner */}
      <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '0.875rem 1.25rem', marginBottom: '1.5rem', color: DANGER, lineHeight: 1.5, fontSize: '0.875rem' }}>
        <strong>⚠️  Safety first:</strong> Omni is a WhatsApp AI 客服 + CRM + follow-up system — not a broadcast or ads platform.
        Bulk sending, marketing blast, and ads are categorically not supported on any plan.
        Real sends only activate 1:1 customer service conversations.
      </div>

      {/* Preflight status panel */}
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: preflight ? '0.875rem' : 0 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827' }}>Pre-flight Status</div>
            <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: 2 }}>
              {authed ? 'Live check from /activation/preflight' : 'Sign in to load live status'}
            </div>
          </div>
          {authed && (
            <button onClick={loadPreflight} disabled={pfLoading} style={{ padding: '0.375rem 0.875rem', background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8125rem' }}>
              {pfLoading ? 'Checking…' : 'Run Pre-flight'}
            </button>
          )}
        </div>
        {preflight && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <Pill label="Readiness" value={String(preflight.readiness ?? '—')} color={String(preflight.readiness) === 'BLOCKED' ? DANGER : String(preflight.readiness).startsWith('READY') ? SUCCESS : WARN_COLOR} />
            <Pill label="Critical blocks" value={String((preflight.summary as Record<string, unknown>)?.critical ?? 0)} color={(preflight.summary as Record<string, unknown>)?.critical === 0 ? SUCCESS : DANGER} />
            <Pill label="Checks passed" value={`${(preflight.summary as Record<string, unknown>)?.passed ?? 0}/${(preflight.summary as Record<string, unknown>)?.total ?? 0}`} color={ACCENT} />
            <Pill label="Real send" value={String((preflight.currentFlags as Record<string, unknown>)?.realSendCurrentlyOff) === 'true' ? 'OFF ✓' : 'ON ⚠'} color={String((preflight.currentFlags as Record<string, unknown>)?.realSendCurrentlyOff) === 'true' ? SUCCESS : WARN_COLOR} />
          </div>
        )}
        {preflight && !!preflight.nextAction && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: '#374151', background: '#fff', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid #e5e7eb' }}>
            Next: {String(preflight.nextAction)}
          </div>
        )}
      </div>

      {/* Before activation */}
      <Section title="Before Activation (Required for Both Paths)" accent={ACCENT}>
        {BEFORE_STEPS.map(step => <StepCard key={step.n} step={step} />)}
      </Section>

      {/* Path selection */}
      <Section title="Choose Your Activation Path" accent={ACCENT}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <PathCard
            id="wa-web"
            selected={path === 'wa-web'}
            onSelect={() => setPath(p => p === 'wa-web' ? null : 'wa-web')}
            title="Ordinary WhatsApp / WA Web"
            icon="📱"
            badge="Best-effort stability"
            badgeColor={WARN_COLOR}
            badgeBg="#fffbeb"
            desc="Link a real WhatsApp account via QR code. Simple setup but session can disconnect. Suitable for testing or low-volume operations."
          />
          <PathCard
            id="meta"
            selected={path === 'meta'}
            onSelect={() => setPath(p => p === 'meta' ? null : 'meta')}
            title="Meta WhatsApp Business Platform"
            icon="🏢"
            badge="Production recommended"
            badgeColor={SUCCESS}
            badgeBg="#f0fdf4"
            desc="Official Meta Business API. Requires WABA approval, system user token, and webhook setup. More stable and has official SLA."
          />
        </div>
      </Section>

      {/* WA Web path */}
      {path === 'wa-web' && (
        <Section title="WA Web Activation Steps" accent={WARN_COLOR}>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', color: WARN_COLOR, fontSize: '0.875rem' }}>
            <strong>WA Web Stability Warning:</strong> Ordinary WhatsApp (WA Web) session stability is best-effort per WhatsApp ToS. WhatsApp may disconnect sessions without notice. Plan for reconnect downtime. For production with SLA requirements, use Meta WhatsApp Business Platform instead.
          </div>
          {WA_WEB_STEPS.map(step => <StepCard key={step.n} step={step} />)}
        </Section>
      )}

      {/* Meta path */}
      {path === 'meta' && (
        <Section title="Meta WhatsApp Business Platform Activation Steps" accent={SUCCESS}>
          {META_STEPS.map(step => <StepCard key={step.n} step={step} />)}
        </Section>
      )}

      {/* Rollback */}
      <Section title="Rollback Plan" accent={DANGER}>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.875rem' }}>
          If anything goes wrong after activation, follow these steps to safely return to stub/demo mode:
        </p>
        <ol style={{ margin: 0, padding: '0 0 0 1.25rem', lineHeight: 1.8 }}>
          {ROLLBACK_STEPS.map((step, i) => (
            <li key={i} style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.375rem' }}>{step}</li>
          ))}
        </ol>
      </Section>

      {/* Post-activation monitoring */}
      <Section title="Post-activation Monitoring" accent={SUCCESS}>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.875rem' }}>
          After activation, these monitoring points should be checked regularly:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {POST_MONITORING.map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.875rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{item.label}</span>
                <span style={{ fontSize: '0.8125rem', color: '#6b7280', marginLeft: '0.5rem' }}>{item.detail}</span>
              </div>
              <a href={item.href} style={{ color: ACCENT, fontSize: '0.8125rem', textDecoration: 'none' }}>Open →</a>
            </div>
          ))}
        </div>
      </Section>

      {/* API quick reference */}
      <Section title="Activation API Quick Reference" accent="#374151">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
          {[
            { method: 'GET',  path: '/activation/preflight', desc: 'Run pre-flight readiness checks' },
            { method: 'POST', path: '/activation/dry-run',   desc: 'Simulate activation — never enables real send' },
            { method: 'GET',  path: '/activation/health',    desc: 'Post-activation safety flags + channel health' },
            { method: 'GET',  path: '/release-checklist/status', desc: 'SaaS v1 release readiness' },
            { method: 'GET',  path: '/production-qa/checklist',  desc: 'Full production QA checklist' },
            { method: 'GET',  path: '/audit/logs',           desc: 'Admin activity audit trail' },
            { method: 'GET',  path: '/ops/health',           desc: 'API + DB + Redis health check' },
          ].map(api => (
            <div key={api.path} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4375rem 0.75rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, background: api.method === 'GET' ? '#eff6ff' : '#f5f3ff', color: api.method === 'GET' ? '#1e40af' : '#7c3aed', padding: '0.125rem 0.375rem', borderRadius: 3, flexShrink: 0 }}>
                {api.method}
              </span>
              <code style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: '#111827', flexShrink: 0 }}>{api.path}</code>
              <span style={{ color: '#6b7280', fontSize: '0.8125rem' }}>{api.desc}</span>
            </div>
          ))}
        </div>
      </Section>

      <footer style={{ marginTop: '2rem', color: '#9ca3af', fontSize: '0.75rem', textAlign: 'center' }}>
        <a href="/activation/monitoring" style={{ color: ACCENT }}>Activation Monitor</a> ·{' '}
        <a href="/release-checklist" style={{ color: ACCENT }}>Release Checklist</a> ·{' '}
        <a href="/ops/runbook" style={{ color: ACCENT }}>Ops Runbook</a> ·{' '}
        <a href="/audit" style={{ color: ACCENT }}>Audit Logs</a>
      </footer>
    </main>
  )
}

function Pill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${color}40`, borderRadius: 6, padding: '0.3125rem 0.625rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '0.625rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: '0.875rem', fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <h2 style={{ margin: '0 0 0.875rem', fontSize: '1.0625rem', fontWeight: 700, color: '#111827', borderBottom: `2px solid ${accent}30`, paddingBottom: '0.375rem' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function StepCard({ step }: { step: Step }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '0.875rem 1.25rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem', flexShrink: 0, marginTop: 2 }}>
          {step.n}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827' }}>{step.title}</div>
          <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: 2, lineHeight: 1.5 }}>{step.detail}</div>
          <ul style={{ margin: '0.5rem 0 0', padding: '0 0 0 1.125rem', lineHeight: 1.7 }}>
            {step.items.map((item, i) => (
              <li key={i} style={{ fontSize: '0.8125rem', color: '#374151' }}>{item}</li>
            ))}
          </ul>
          {step.warning && (
            <div style={{ marginTop: '0.625rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '0.5rem 0.75rem', color: WARN_COLOR, fontSize: '0.8125rem', lineHeight: 1.5 }}>
              ⚠️  {step.warning}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PathCard({ id, selected, onSelect, title, icon, badge, badgeColor, badgeBg, desc }: {
  id: string; selected: boolean; onSelect: () => void; title: string; icon: string
  badge: string; badgeColor: string; badgeBg: string; desc: string
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        flex: '1 1 260px',
        background: selected ? '#eef2ff' : '#fff',
        border: `2px solid ${selected ? ACCENT : '#e5e7eb'}`,
        borderRadius: 12,
        padding: '1rem 1.25rem',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ fontSize: '1.5rem', marginBottom: '0.375rem' }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827', marginBottom: '0.375rem' }}>{title}</div>
      <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: badgeColor, background: badgeBg, padding: '0.125rem 0.5rem', borderRadius: 12 }}>{badge}</span>
      <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.5rem', lineHeight: 1.5 }}>{desc}</p>
      <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', fontWeight: 600, color: selected ? ACCENT : '#9ca3af' }}>
        {selected ? '✓ Selected — see steps below' : 'Click to see activation steps'}
      </div>
    </div>
  )
}
