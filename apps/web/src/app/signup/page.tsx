'use client'
// Tenant Self-service Signup — Phase 17A
// Let operators/customers create a new Omni tenant account.
// No real WhatsApp/Meta/email/payment calls made.

import { useState, useEffect } from 'react'
import { setToken } from '@/lib/api'

const API_BASE   = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:43111'
const ACCENT     = '#6366f1'
const SUCCESS    = '#15803d'
const DANGER     = '#b91c1c'
const NEUTRAL    = '#6b7280'

const INDUSTRIES = [
  { value: 'real-estate',     label: 'Real Estate / Property' },
  { value: 'education',       label: 'Education & Training' },
  { value: 'retail',          label: 'Retail / E-commerce' },
  { value: 'food-beverage',   label: 'Food & Beverage' },
  { value: 'beauty-wellness', label: 'Beauty & Wellness' },
  { value: 'automotive',      label: 'Automotive' },
  { value: 'healthcare',      label: 'Healthcare & Clinic' },
  { value: 'finance',         label: 'Finance & Insurance' },
  { value: 'other',           label: 'Other / General Business' },
]

const GOALS = [
  { value: 'sales',          label: 'Convert leads to customers' },
  { value: 'appointment',    label: 'Book appointments / meetings' },
  { value: 'support',        label: 'Customer support & after-sales' },
  { value: 'qualification',  label: 'Pre-sales lead qualification' },
  { value: 'demo',           label: 'Schedule demos / free trials' },
  { value: 'other',          label: 'Other' },
]

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').slice(0, 40)
}

interface SignupResult {
  tenantId:   string
  slug:       string
  ownerEmail: string
  accessToken: string
  nextRoute:  string
  error?:     string
  suggestion?: string
}

export default function SignupPage() {
  const [form, setForm] = useState({
    businessName:      '',
    slug:              '',
    ownerName:         '',
    ownerEmail:        '',
    password:          '',
    industry:          'other',
    channelPreference: 'WA_WEB',
    primaryGoal:       'sales',
  })
  const [slugManual, setSlugManual] = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState<SignupResult | null>(null)
  const [pwVisible,  setPwVisible]  = useState(false)

  // Auto-derive slug from business name unless manually edited
  useEffect(() => {
    if (!slugManual && form.businessName) {
      setForm(f => ({ ...f, slug: slugify(f.businessName) }))
    }
  }, [form.businessName, slugManual])

  const handleField = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    if (k === 'slug') setSlugManual(true)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API_BASE}/tenants/signup`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const body = await res.json() as SignupResult
      if (!res.ok) {
        const msg = String(body.error ?? `Error ${res.status}`)
        if (body.suggestion) setError(`${msg} — try: ${body.suggestion}`)
        else setError(msg)
        return
      }
      // Store access token (same as login)
      if (body.accessToken) setToken(body.accessToken)
      setSuccess(body)
      // Auto-redirect to onboarding after brief pause
      setTimeout(() => { window.location.href = body.nextRoute ?? '/onboarding' }, 1800)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{ fontFamily: 'system-ui', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', maxWidth: 440, padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
          <h2 style={{ color: SUCCESS, fontSize: '1.375rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            Account created!
          </h2>
          <p style={{ color: NEUTRAL, marginBottom: '0.875rem', lineHeight: 1.6 }}>
            Welcome to Omni! Your tenant <strong>{success.slug}</strong> is ready.<br />
            Redirecting to the onboarding wizard…
          </p>
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '0.75rem 1rem', color: SUCCESS, fontSize: '0.875rem', marginBottom: '1rem' }}>
            Real WhatsApp sending is <strong>disabled by default</strong>.<br />
            Follow the activation guide when you are ready to go live.
          </div>
          <a href="/onboarding" style={{ display: 'inline-block', padding: '0.625rem 1.5rem', background: ACCENT, color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>
            Continue Setup →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'system-ui', minHeight: '100vh', background: 'linear-gradient(135deg, #eef2ff 0%, #f8fafc 50%, #eff6ff 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '2rem 1rem' }}>
      {/* Brand header */}
      <div style={{ textAlign: 'center', marginBottom: '1.75rem', maxWidth: 480 }}>
        <div style={{ fontWeight: 800, fontSize: '1.5rem', color: '#111827', letterSpacing: '-0.5px', marginBottom: '0.375rem' }}>
          🤖 Omni
        </div>
        <div style={{ fontSize: '1rem', color: NEUTRAL, lineHeight: 1.5 }}>
          WhatsApp AI 客服 · CRM · 自动跟进 · 成交转化
        </div>
        <div style={{ fontSize: '0.8125rem', color: '#9ca3af', marginTop: '0.25rem' }}>
          Not a broadcast or ads platform — 1:1 AI customer service only
        </div>
      </div>

      {/* Form card */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '2rem', width: '100%', maxWidth: 480 }}>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
          Create your Omni account
        </h2>
        <p style={{ margin: '0 0 1.5rem', color: NEUTRAL, fontSize: '0.875rem' }}>
          Set up your WhatsApp AI customer service system in minutes.
        </p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.625rem 0.875rem', color: DANGER, fontSize: '0.875rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Business name */}
          <FormField label="Business Name" required>
            <input
              type="text" required minLength={2} maxLength={120}
              value={form.businessName}
              onChange={e => handleField('businessName', e.target.value)}
              placeholder="e.g. Sunrise Property"
              style={inputCss}
            />
          </FormField>

          {/* Tenant slug */}
          <FormField label="Account ID (slug)" required hint="Used for login. Lowercase, letters, numbers, dashes only.">
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text" required minLength={3} maxLength={40}
                value={form.slug}
                onChange={e => handleField('slug', slugify(e.target.value))}
                placeholder="e.g. sunrise-property"
                style={{ ...inputCss, fontFamily: 'monospace', flex: 1 }}
              />
            </div>
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {/* Owner name */}
            <FormField label="Your Name" required>
              <input
                type="text" required minLength={2}
                value={form.ownerName}
                onChange={e => handleField('ownerName', e.target.value)}
                placeholder="Full name"
                style={inputCss}
              />
            </FormField>
            {/* Owner email */}
            <FormField label="Email Address" required>
              <input
                type="email" required
                value={form.ownerEmail}
                onChange={e => handleField('ownerEmail', e.target.value)}
                placeholder="you@company.com"
                style={inputCss}
              />
            </FormField>
          </div>

          {/* Password */}
          <FormField label="Password" required hint="Min 8 characters">
            <div style={{ position: 'relative' }}>
              <input
                type={pwVisible ? 'text' : 'password'} required minLength={8}
                value={form.password}
                onChange={e => handleField('password', e.target.value)}
                placeholder="Min 8 characters"
                style={{ ...inputCss, paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setPwVisible(v => !v)}
                style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: NEUTRAL, fontSize: '0.875rem' }}
              >
                {pwVisible ? '🙈' : '👁️'}
              </button>
            </div>
          </FormField>

          {/* Industry */}
          <FormField label="Industry">
            <select value={form.industry} onChange={e => handleField('industry', e.target.value)} style={inputCss}>
              {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </FormField>

          {/* Channel preference */}
          <FormField label="WhatsApp Connection Type">
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {[
                { value: 'WA_WEB', label: 'Ordinary WhatsApp', note: 'QR scan, best-effort stability' },
                { value: 'META_WA_BUSINESS', label: 'Meta WhatsApp Business', note: 'Official API, production-grade' },
              ].map(ch => (
                <label key={ch.value} style={{
                  flex: '1 1 180px',
                  display: 'flex', flexDirection: 'column', gap: '0.125rem',
                  padding: '0.625rem 0.875rem',
                  border: `2px solid ${form.channelPreference === ch.value ? ACCENT : '#e5e7eb'}`,
                  borderRadius: 8, cursor: 'pointer',
                  background: form.channelPreference === ch.value ? '#eef2ff' : '#fafafa',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="radio" name="channelPref" value={ch.value}
                      checked={form.channelPreference === ch.value}
                      onChange={e => handleField('channelPreference', e.target.value)}
                      style={{ flexShrink: 0 }}
                    />
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{ch.label}</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: NEUTRAL, marginLeft: '1.25rem' }}>{ch.note}</span>
                </label>
              ))}
            </div>
          </FormField>

          {/* Primary goal */}
          <FormField label="Primary Goal">
            <select value={form.primaryGoal} onChange={e => handleField('primaryGoal', e.target.value)} style={inputCss}>
              {GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </FormField>

          {/* Safety notice */}
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.8125rem', color: NEUTRAL, marginBottom: '1.25rem', lineHeight: 1.5 }}>
            <strong>Note:</strong> Real WhatsApp sending is disabled by default. No messages are sent until you complete the activation guide. This platform is for 1:1 AI customer service — not broadcast, ads, or bulk messaging.
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '0.75rem', background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Creating your account…' : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.875rem', color: NEUTRAL }}>
          Already have an account?{' '}
          <a href="/inbox" style={{ color: ACCENT, textDecoration: 'none', fontWeight: 600 }}>登录</a>
        </div>
      </div>

      {/* Bottom note */}
      <div style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', maxWidth: 480 }}>
        By creating an account, you understand that Omni provides WhatsApp AI customer service tools only — no broadcast, ads, or bulk messaging on any plan.
      </div>
    </div>
  )
}

const inputCss: React.CSSProperties = {
  display: 'block', width: '100%', padding: '0.5625rem 0.75rem',
  borderRadius: 7, border: '1.5px solid #d1d5db',
  fontSize: '0.9375rem', color: '#111827',
  background: '#fff', boxSizing: 'border-box',
  outline: 'none',
}

function FormField({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: '0.875rem' }}>
      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '0.3125rem' }}>
        {label}{required && <span style={{ color: DANGER, marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1875rem' }}>{hint}</div>}
    </div>
  )
}
