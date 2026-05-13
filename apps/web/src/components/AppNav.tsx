'use client'
// AppNav — shared app shell navigation (Phase 15D)
// Sidebar for desktop, collapsible for mobile.
// Uses inline styles for consistency with the project's existing page style.

import { useState, useEffect } from 'react'
import { usePathname }         from 'next/navigation'
import { getToken, clearToken } from '@/lib/api'

interface NavItem {
  href:    string
  label:   string
  icon:    string
  group?:  string
}

const NAV_ITEMS: NavItem[] = [
  // Core workflow
  { href: '/inbox',            label: 'Inbox',           icon: '💬', group: 'Conversations' },
  { href: '/pwa',              label: 'Mobile / PWA',    icon: '📱', group: 'Conversations' },
  // CRM & Automation
  { href: '/boss',             label: 'Boss Dashboard',  icon: '📊', group: 'CRM & Leads' },
  { href: '/launch-checklist', label: 'Launch Checklist',icon: '🚀', group: 'CRM & Leads' },
  // Setup
  { href: '/onboarding',       label: 'Onboarding',      icon: '🧙', group: 'Setup' },
  { href: '/knowledge',        label: 'Knowledge Base',  icon: '📚', group: 'Setup' },
  { href: '/channels/setup',   label: 'Channel Setup',   icon: '📡', group: 'Setup' },
  // Admin
  { href: '/settings',         label: 'Settings',        icon: '⚙️',  group: 'Admin' },
  { href: '/billing',          label: 'Billing',         icon: '💳', group: 'Admin' },
  { href: '/team',             label: 'Team',            icon: '👥', group: 'Admin' },
  // Ops
  { href: '/audit',            label: 'Audit Logs',      icon: '🔍', group: 'Ops' },
  { href: '/production-qa',    label: 'Production QA',   icon: '✅', group: 'Ops' },
  { href: '/ops/runbook',      label: 'Ops Runbook',     icon: '📋', group: 'Ops' },
  // Demo / Release
  { href: '/demo-flow',          label: 'Demo Flow',         icon: '🎯', group: 'Release' },
  { href: '/release-checklist',  label: 'Release Checklist', icon: '📦', group: 'Release' },
  { href: '/activation-guide',   label: 'Activation Guide',  icon: '🚦', group: 'Release' },
]

const SIDEBAR_W  = 220
const ACCENT     = '#6366f1'
const BG_DARK    = '#1e1b4b'
const BG_DARKER  = '#16134a'
const TEXT_DIM   = '#a5b4fc'
const TEXT_LIGHT = '#e0e7ff'
const HOVER_BG   = 'rgba(99,102,241,0.18)'
const ACTIVE_BG  = 'rgba(99,102,241,0.32)'

export default function AppNav() {
  const pathname        = usePathname()
  const [authed,    setAuthed]   = useState(false)
  const [open,      setOpen]     = useState(false)  // mobile drawer
  const [mounted,   setMounted]  = useState(false)

  useEffect(() => {
    setMounted(true)
    setAuthed(!!getToken())
  }, [])

  // Don't render on server (avoids hydration mismatch for token state)
  if (!mounted) return null

  const groups = Array.from(new Set(NAV_ITEMS.map(i => i.group)))

  const handleSignOut = () => {
    clearToken()
    window.location.href = '/inbox'
  }

  const sidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo / brand */}
      <div style={{ padding: '1.25rem 1rem 1rem', borderBottom: `1px solid rgba(99,102,241,0.2)` }}>
        <a href="/boss" style={{ textDecoration: 'none' }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff', letterSpacing: '-0.5px' }}>
            Omni
          </div>
          <div style={{ fontSize: '0.6875rem', color: TEXT_DIM, marginTop: 2, lineHeight: 1.3 }}>
            WhatsApp AI 客服 · CRM · Follow-up
          </div>
        </a>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
        {groups.map(group => (
          <div key={group} style={{ marginBottom: '0.25rem' }}>
            <div style={{ padding: '0.5rem 1rem 0.25rem', fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em', color: TEXT_DIM, textTransform: 'uppercase' }}>
              {group}
            </div>
            {NAV_ITEMS.filter(i => i.group === group).map(item => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.4375rem 1rem',
                    margin: '0.0625rem 0.5rem',
                    borderRadius: 6,
                    textDecoration: 'none',
                    fontSize: '0.8125rem',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#fff' : TEXT_LIGHT,
                    background: isActive ? ACTIVE_BG : 'transparent',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = HOVER_BG }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
                >
                  <span style={{ fontSize: '0.875rem', width: 18, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  {isActive && (
                    <span style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: '50%', background: ACCENT, flexShrink: 0 }} />
                  )}
                </a>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '0.75rem 1rem', borderTop: `1px solid rgba(99,102,241,0.2)`, fontSize: '0.75rem', color: TEXT_DIM }}>
        {authed ? (
          <button
            onClick={handleSignOut}
            style={{ background: 'none', border: 'none', color: TEXT_DIM, cursor: 'pointer', fontSize: '0.75rem', padding: 0, width: '100%', textAlign: 'left' }}
          >
            Sign Out
          </button>
        ) : (
          <a href="/inbox" style={{ color: TEXT_DIM, textDecoration: 'none' }}>Sign In</a>
        )}
        <div style={{ marginTop: 4, opacity: 0.6 }}>v1.0 Phase 15D</div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside style={{
        width: SIDEBAR_W,
        minWidth: SIDEBAR_W,
        height: '100vh',
        background: `linear-gradient(180deg, ${BG_DARK} 0%, ${BG_DARKER} 100%)`,
        position: 'sticky',
        top: 0,
        overflowY: 'auto',
        flexShrink: 0,
        display: 'none',
        // Show on md+
      }}
      className="omni-sidebar"
      >
        {sidebarContent}
      </aside>

      {/* Mobile toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="omni-mobile-toggle"
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 200,
          background: BG_DARK,
          border: 'none',
          borderRadius: 8,
          padding: '0.4375rem 0.625rem',
          cursor: 'pointer',
          color: '#fff',
          fontSize: '1.125rem',
          display: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
        aria-label="Toggle navigation"
      >
        {open ? '✕' : '☰'}
      </button>

      {/* Mobile drawer overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 150,
            background: 'rgba(0,0,0,0.5)',
            display: 'block',
          }}
          className="omni-overlay"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className="omni-drawer"
        style={{
          position: 'fixed',
          top: 0,
          left: open ? 0 : -SIDEBAR_W - 20,
          width: SIDEBAR_W,
          height: '100vh',
          zIndex: 160,
          background: `linear-gradient(180deg, ${BG_DARK} 0%, ${BG_DARKER} 100%)`,
          transition: 'left 0.22s ease',
          overflowY: 'auto',
        }}
      >
        {sidebarContent}
      </aside>

      {/* Responsive CSS injected inline */}
      <style>{`
        @media (min-width: 768px) {
          .omni-sidebar        { display: flex !important; flex-direction: column; }
          .omni-mobile-toggle  { display: none !important; }
          .omni-drawer         { display: none !important; }
          .omni-overlay        { display: none !important; }
        }
        @media (max-width: 767px) {
          .omni-sidebar        { display: none !important; }
          .omni-mobile-toggle  { display: flex !important; }
        }
      `}</style>
    </>
  )
}
