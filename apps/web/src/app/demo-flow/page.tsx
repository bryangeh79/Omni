'use client'
// Demo Flow — Phase 15D
// Guided internal/sales demo flow for Omni SaaS v1.
// Shows the full sellable product journey from setup to go-live.
// Demo/staging safe: no real sends, clearly labeled.

import { useState } from 'react'

interface DemoStep {
  step:     number
  title:    string
  subtitle: string
  href:     string
  icon:     string
  tasks:    string[]
  badge?:   string
}

const DEMO_STEPS: DemoStep[] = [
  {
    step: 1,
    title:    'Onboarding Wizard',
    subtitle: 'Set up your company profile, AI goals, and generate a starter persona',
    href:     '/onboarding',
    icon:     '🧙',
    badge:    'Start here',
    tasks: [
      'Enter company name, industry, business hours',
      'Choose AI goals (lead capture, follow-up, customer service)',
      'Paste product/service materials',
      'Preview AI persona and welcome message',
      'Enable onboarding to activate AI config',
    ],
  },
  {
    step: 2,
    title:    'Knowledge Base',
    subtitle: 'Review and manage FAQ items and product knowledge the AI will use',
    href:     '/knowledge',
    icon:     '📚',
    tasks: [
      'Review pre-generated FAQ entries',
      'Add product-specific questions and answers',
      'Check multi-language support (ZH / EN / MS)',
      'Mark items active/inactive',
    ],
  },
  {
    step: 3,
    title:    'Channel Setup',
    subtitle: 'Configure WhatsApp channel (stub mode — no real connection in demo)',
    href:     '/channels/setup',
    icon:     '📡',
    badge:    'Stub only',
    tasks: [
      'Select channel type: WA Web or Meta WhatsApp Business API',
      'Enter display name and draft channel info',
      'Run stub test (no real WhatsApp connection)',
      'Confirm realWaSessionEnabled=false, realMetaSendEnabled=false',
      'Review safety gates — all disabled by default',
    ],
  },
  {
    step: 4,
    title:    'Inbox',
    subtitle: 'AI conversation workflow and CRM actions',
    href:     '/inbox',
    icon:     '💬',
    tasks: [
      'View open conversations from customers',
      'See AI-handled vs human-handled threads',
      'Take over a conversation from AI (human handoff)',
      'Stage a lead: INTERESTED → HIGH_INTENT → QUOTED → BOOKED',
      'Send a manual reply (WA send disabled in demo)',
    ],
  },
  {
    step: 5,
    title:    'Boss Dashboard',
    subtitle: 'Today\'s priorities, lead pipeline, and business health at a glance',
    href:     '/boss',
    icon:     '📊',
    tasks: [
      'Review today\'s open conversations and high-intent leads',
      'See follow-up tasks due today',
      'Check AI reply volume vs human handoffs',
      'Review lead stage pipeline',
      'Confirm no real WhatsApp messages sent',
    ],
  },
  {
    step: 6,
    title:    'Mobile PWA',
    subtitle: 'Salesperson mobile workflow — add to home screen for best experience',
    href:     '/pwa',
    icon:     '📱',
    tasks: [
      'Open on mobile browser → Add to Home Screen',
      'Review mobile inbox view',
      'Test push notification setup (stub)',
      'Confirm mobile-optimized lead card display',
    ],
  },
  {
    step: 7,
    title:    'Billing & Plan',
    subtitle: 'Plan selection and usage summary (no real charge in demo)',
    href:     '/billing',
    icon:     '💳',
    badge:    'No charge',
    tasks: [
      'Review Starter / Pro / Business plan features',
      'Note: Meta API message fees are NOT bundled — billed as pass-through credits',
      'Note: No broadcast/ads/bulk sending on any plan',
      'Select a plan draft (preference only — no payment configured)',
      'Review usage summary',
    ],
  },
  {
    step: 8,
    title:    'Production QA + Launch Checklist',
    subtitle: 'Confirm readiness before live activation',
    href:     '/production-qa',
    icon:     '✅',
    tasks: [
      'Review all PASS / WARN / FAIL / MANUAL items',
      'Confirm safety gates: real send disabled',
      'Confirm vault configured (or note as WARN)',
      'Check team, knowledge, channel, billing items',
      'Review audit log readiness',
      'See /ops/runbook for backup + monitoring steps',
    ],
  },
  {
    step: 9,
    title:    'Audit Logs + Ops Runbook',
    subtitle: 'Admin activity trail and production operations reference',
    href:     '/audit',
    icon:     '🔍',
    tasks: [
      'Review admin activity timeline at /audit',
      'Check TEAM_INVITE_DRAFT, BILLING_PLAN_SELECTED, SETTINGS_PROFILE_UPDATE events',
      'Confirm no secrets in audit log metadata',
      'Review /ops/runbook: health checks, backup, monitoring, incident response',
      'Confirm tenant-scoped data — no cross-tenant leakage',
    ],
  },
]

const SAFETY_BADGES = [
  { label: 'No real WhatsApp send', color: '#15803d', bg: '#f0fdf4' },
  { label: 'No Meta API calls',     color: '#1e40af', bg: '#eff6ff' },
  { label: 'No AI provider calls',  color: '#7c3aed', bg: '#f5f3ff' },
  { label: 'No real payment',       color: '#b45309', bg: '#fffbeb' },
  { label: 'Demo/staging safe',     color: '#0f766e', bg: '#f0fdfa' },
]

export default function DemoFlowPage() {
  const [completed, setCompleted] = useState<Record<number, boolean>>({})

  const toggleStep = (n: number) => setCompleted(prev => ({ ...prev, [n]: !prev[n] }))
  const doneCount  = Object.values(completed).filter(Boolean).length

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 820, margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
              🎯 Omni SaaS v1 — Demo Flow
            </h1>
            <p style={{ margin: '0.375rem 0 0', color: '#6b7280', fontSize: '0.9375rem', lineHeight: 1.5 }}>
              Guided product demo and internal QA walkthrough. Step through the complete <strong>WhatsApp AI 客服 + CRM + Follow-up + Conversion</strong> product journey.
            </p>
          </div>
          <a href="/release-checklist" style={{ padding: '0.4375rem 0.875rem', background: '#6366f1', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Release Checklist →
          </a>
        </div>

        {/* Safety badges */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.875rem' }}>
          {SAFETY_BADGES.map(b => (
            <span key={b.label} style={{ padding: '0.25rem 0.625rem', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, color: b.color, background: b.bg, border: `1px solid ${b.color}30` }}>
              {b.label}
            </span>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.375rem' }}>
            <span>Demo progress</span>
            <span>{doneCount} / {DEMO_STEPS.length} steps</span>
          </div>
          <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(doneCount / DEMO_STEPS.length) * 100}%`, background: '#6366f1', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {DEMO_STEPS.map(step => {
          const done = !!completed[step.step]
          return (
            <div key={step.step} style={{
              background: '#fff',
              border: `1px solid ${done ? '#d1fae5' : '#e5e7eb'}`,
              borderRadius: 12,
              overflow: 'hidden',
              transition: 'border-color 0.2s',
            }}>
              {/* Step header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.875rem',
                padding: '0.875rem 1.25rem',
                background: done ? '#f0fdf4' : '#fafafa',
                cursor: 'pointer',
              }}
              onClick={() => toggleStep(step.step)}
              >
                {/* Step number / check */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: done ? '#16a34a' : '#6366f1',
                  color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '0.875rem', flexShrink: 0,
                }}>
                  {done ? '✓' : step.step}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>
                      {step.icon} {step.title}
                    </span>
                    {step.badge && (
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '0.125rem 0.5rem', borderRadius: 12, background: '#ede9fe', color: '#7c3aed' }}>
                        {step.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: 2 }}>{step.subtitle}</div>
                </div>

                <a
                  href={step.href}
                  onClick={e => e.stopPropagation()}
                  style={{
                    padding: '0.3125rem 0.75rem',
                    background: '#6366f1',
                    color: '#fff',
                    borderRadius: 6,
                    textDecoration: 'none',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  Open
                </a>
              </div>

              {/* Task checklist */}
              <div style={{ padding: '0.75rem 1.25rem 1rem', borderTop: '1px solid #f3f4f6' }}>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {step.tasks.map((task, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8125rem', color: '#374151', lineHeight: 1.5 }}>
                      <span style={{ color: '#9ca3af', marginTop: 1, flexShrink: 0 }}>→</span>
                      {task}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => toggleStep(step.step)}
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.3125rem 0.75rem',
                    borderRadius: 6,
                    border: `1px solid ${done ? '#16a34a' : '#d1d5db'}`,
                    background: done ? '#f0fdf4' : '#f9fafb',
                    color: done ? '#16a34a' : '#374151',
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    fontWeight: done ? 600 : 400,
                  }}
                >
                  {done ? '✓ Mark incomplete' : 'Mark as done'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <footer style={{ marginTop: '2rem', padding: '1rem', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: '0.8125rem', color: '#6b7280', lineHeight: 1.6 }}>
        <strong>Demo Notes:</strong> This is a sales/internal demo walkthrough. All real sends (WhatsApp, Meta API, AI provider, email, payment) are disabled by default.
        Omni is a <strong>WhatsApp AI 客服 + CRM + follow-up + lead conversion</strong> system — not a broadcast or ads platform.
        Bulk messaging and marketing blast are not supported on any plan.
      </footer>
    </main>
  )
}
