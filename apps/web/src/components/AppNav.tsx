'use client'
// AppNav — collapsible grouped sidebar (Phase 19 UAT polish, Round-7 IA cleanup)
// Chinese-first labels. Top-level groups collapse/expand on click.
// Active page highlights both child item and parent group.
// Expanded state persists in localStorage.
// Tenant daily groups appear on top; SaaS Admin / 平台运维 is separated at the bottom.

import { useState, useEffect } from 'react'
import { usePathname }         from 'next/navigation'
import { getToken, clearToken } from '@/lib/api'

interface NavItem {
  href:  string
  label: string
}

interface NavGroup {
  key:     string
  label:   string
  icon:    string
  items:   NavItem[]
  /** When true, group is rendered in the SaaS Admin / 平台运维 section (muted + divider). */
  admin?:  boolean
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'workspace',
    label: '日常工作',
    icon: '🏠',
    items: [
      { href: '/boss',  label: '老板工作台' },
      { href: '/inbox', label: '对话收件箱' },
      { href: '/pwa',   label: '手机工作台' },
    ],
  },
  {
    key: 'crm',
    label: '客户与成交',
    icon: '👥',
    items: [
      { href: '/knowledge', label: '知识库' },
    ],
  },
  // Round-9B: rename "新客户上线" → "开始使用". Remove customer-facing "新建账号" —
  // tenants are provisioned by SaaS Admin (see Admin group). /signup route still
  // exists for SaaS Admin internal use and existing smoke compatibility.
  {
    key: 'getStarted',
    label: '开始使用',
    icon: '🧙',
    items: [
      { href: '/onboarding',       label: '配置 AI 客服' },
      { href: '/channels/setup',   label: '连接 WhatsApp' },
      { href: '/launch-checklist', label: '上线检查' },
    ],
  },
  {
    key: 'account',
    label: '账户管理',
    icon: '👤',
    items: [
      { href: '/account',  label: '我的账户' },
      { href: '/team',     label: '团队成员' },
      { href: '/billing',  label: '套餐与额度' },
      { href: '/settings', label: '设置' },
    ],
  },
  // ── SaaS Admin / 平台运维 ───────────────────────────────────────────────
  // Future: hide SaaS Admin group for non-platform roles when platform RBAC is available.
  // For now this is visual separation only — all tenants can still reach these routes.
  // Round-9B: add tenant provisioning entries at the top of the admin group.
  {
    key: 'admin',
    label: '平台运维',
    icon: '🛡️',
    admin: true,
    items: [
      { href: '/admin/tenants',         label: '租户管理' },
      { href: '/admin/tenants/new',     label: '创建租户' },
      { href: '/admin/tenants?tab=license', label: '套餐 / 授权' },
      { href: '/admin/tenants?filter=expired', label: '到期 / 暂停管理' },
      { href: '/admin/ai-settings',     label: '平台 AI 设置' },
      { href: '/activation-guide',      label: '上线激活指南' },
      { href: '/activation/monitoring', label: '激活监控' },
      { href: '/audit',                 label: '审计日志' },
      { href: '/production-qa',         label: '生产 QA' },
      { href: '/ops/runbook',           label: '运维手册' },
      { href: '/release-checklist',     label: '发布检查清单' },
      { href: '/demo-flow',             label: '演示流程' },
    ],
  },
]

const SIDEBAR_W  = 232
const ACCENT     = '#6366f1'
const BG_DARK    = '#1e1b4b'
const BG_DARKER  = '#16134a'
const TEXT_DIM   = '#a5b4fc'
const TEXT_LIGHT = '#e0e7ff'
const HOVER_BG   = 'rgba(99,102,241,0.18)'
const ACTIVE_BG  = 'rgba(99,102,241,0.32)'

// v3 — Round-9B renamed group "setup" → "getStarted"; older v2 keys are ignored harmlessly.
const STORAGE_KEY = 'omni.nav.expanded.v3'

function findActiveGroup(pathname: string): string | null {
  for (const g of NAV_GROUPS) {
    if (g.items.some(i => pathname === i.href || (i.href !== '/' && pathname.startsWith(i.href)))) {
      return g.key
    }
  }
  return null
}

export default function AppNav() {
  const pathname  = usePathname()
  const [authed, setAuthed]     = useState(false)
  const [open, setOpen]         = useState(false)  // mobile drawer
  const [mounted, setMounted]   = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    setMounted(true)
    setAuthed(!!getToken())
    // Restore expanded state, default to active group only
    const activeKey = findActiveGroup(pathname)
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const arr = JSON.parse(raw) as string[]
        const s = new Set(arr)
        if (activeKey) s.add(activeKey)
        setExpanded(s)
        return
      }
    } catch { /* ignore */ }
    // No localStorage state: expand the active group only, or fall back to 日常工作.
    setExpanded(new Set([activeKey ?? 'workspace']))
  }, [pathname])

  function toggle(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next))) } catch { /* ignore */ }
      return next
    })
  }

  if (!mounted) return null

  const handleSignOut = () => {
    clearToken()
    window.location.href = '/boss'
  }

  const sidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Brand */}
      <div style={{ padding: '1.25rem 1.125rem 1rem', borderBottom: `1px solid rgba(99,102,241,0.2)` }}>
        <a href="/boss" style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{ fontWeight: 800, fontSize: '1.125rem', color: '#fff', letterSpacing: '-0.5px' }}>
            Omni
          </div>
          <div style={{ fontSize: '0.6875rem', color: TEXT_DIM, marginTop: 2, lineHeight: 1.3 }}>
            WhatsApp AI 客服 · CRM · 自动跟进
          </div>
        </a>
      </div>

      {/* Groups */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.5rem' }}>
        {NAV_GROUPS.map((group, idx) => {
          const isExpanded = expanded.has(group.key)
          const hasActive  = group.items.some(i => pathname === i.href || (i.href !== '/' && pathname.startsWith(i.href)))
          const prev       = idx > 0 ? NAV_GROUPS[idx - 1] : null
          const showAdminDivider = group.admin && !prev?.admin
          return (
            <div key={group.key} style={{ marginBottom: '0.125rem' }}>
              {showAdminDivider && (
                <div
                  aria-hidden
                  style={{
                    marginTop: '0.75rem',
                    paddingTop: '0.75rem',
                    paddingLeft: '0.625rem',
                    paddingRight: '0.625rem',
                    paddingBottom: '0.25rem',
                    borderTop: '1px solid rgba(99,102,241,0.18)',
                    fontSize: '0.625rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: TEXT_DIM,
                    opacity: 0.7,
                  }}
                >
                  SaaS Admin · 平台运维
                </div>
              )}
              <button
                onClick={() => toggle(group.key)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: group.admin ? '0.4375rem 0.625rem' : '0.5rem 0.625rem',
                  borderRadius: 6,
                  background: hasActive && !isExpanded ? HOVER_BG : 'transparent',
                  border: 'none',
                  color: hasActive ? '#fff' : (group.admin ? TEXT_DIM : TEXT_LIGHT),
                  fontSize: group.admin ? '0.75rem' : '0.8125rem',
                  fontWeight: hasActive ? 600 : (group.admin ? 400 : 500),
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.12s',
                  opacity: group.admin && !hasActive ? 0.85 : 1,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = HOVER_BG }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = hasActive && !isExpanded ? HOVER_BG : 'transparent' }}
              >
                <span style={{ fontSize: '0.95rem', width: 18, textAlign: 'center', flexShrink: 0 }}>{group.icon}</span>
                <span style={{ flex: 1 }}>{group.label}</span>
                <span style={{
                  fontSize: '0.625rem',
                  color: TEXT_DIM,
                  transition: 'transform 0.15s',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  flexShrink: 0,
                }}>▶</span>
              </button>
              {isExpanded && (
                <div style={{ paddingLeft: '0.5rem', marginTop: 2 }}>
                  {group.items.map(item => {
                    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0.375rem 0.75rem 0.375rem 1.75rem',
                          margin: '0.0625rem 0',
                          borderRadius: 6,
                          textDecoration: 'none',
                          fontSize: group.admin ? '0.75rem' : '0.8125rem',
                          fontWeight: isActive ? 600 : 400,
                          color: isActive ? '#fff' : (group.admin ? TEXT_DIM : TEXT_LIGHT),
                          background: isActive ? ACTIVE_BG : 'transparent',
                          transition: 'background 0.12s',
                          position: 'relative',
                          opacity: group.admin && !isActive ? 0.85 : 1,
                        }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = HOVER_BG }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
                      >
                        {isActive && (
                          <span style={{ position: 'absolute', left: '0.875rem', width: 3, height: 14, background: ACCENT, borderRadius: 2 }} />
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                      </a>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer — Round-9C: only show version; logout moved to top-right account menu. */}
      <div style={{ padding: '0.75rem 1.125rem', borderTop: `1px solid rgba(99,102,241,0.2)`, fontSize: '0.6875rem', color: TEXT_DIM, opacity: 0.7 }}>
        Omni v1 · UAT
      </div>
    </div>
  )

  // Round-9C: top-right account widget (fixed-positioned). Shown only when
  // signed in. Provides quick links to 我的账户 / 设置 + logout. Sidebar bottom
  // is now version-only.
  const accountWidget = authed ? (
    <div
      className="omni-account-widget"
      style={{
        position: 'fixed', top: 10, right: 12, zIndex: 90,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(15,23,42,0.08)', borderRadius: 9999,
        padding: '4px 6px 4px 4px',
        boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
        fontSize: 12,
      }}
    >
      <span
        title="账户"
        aria-hidden
        style={{ width: 22, height: 22, borderRadius: '50%', background: ACCENT, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}
      >O</span>
      <a href="/account"  title="我的账户" aria-label="我的账户" style={{ color: '#334155', textDecoration: 'none', padding: '2px 8px' }}>我的账户</a>
      <span style={{ color: '#e2e8f0' }}>|</span>
      <a href="/settings" title="设置"     aria-label="设置"     style={{ color: '#334155', textDecoration: 'none', padding: '2px 8px' }}>设置</a>
      <span style={{ color: '#e2e8f0' }}>|</span>
      <button
        onClick={handleSignOut}
        title="退出登录" aria-label="退出登录"
        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, padding: '2px 8px', fontWeight: 600 }}
      >退出</button>
    </div>
  ) : null

  return (
    <>
      {accountWidget}
      {/* Desktop sidebar */}
      <aside
        style={{
          width: SIDEBAR_W,
          minWidth: SIDEBAR_W,
          height: '100vh',
          background: `linear-gradient(180deg, ${BG_DARK} 0%, ${BG_DARKER} 100%)`,
          position: 'sticky',
          top: 0,
          overflowY: 'auto',
          flexShrink: 0,
          display: 'none',
        }}
        className="omni-sidebar"
      >
        {sidebarContent}
      </aside>

      {/* Mobile toggle */}
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
        aria-label="切换导航"
      >
        {open ? '✕' : '☰'}
      </button>

      {/* Mobile drawer overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.5)' }}
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

      <style>{`
        @media (min-width: 768px) {
          .omni-sidebar       { display: flex !important; flex-direction: column; }
          .omni-mobile-toggle { display: none !important; }
          .omni-drawer        { display: none !important; }
          .omni-overlay       { display: none !important; }
        }
        @media (max-width: 767px) {
          .omni-sidebar       { display: none !important; }
          .omni-mobile-toggle { display: flex !important; }
        }
      `}</style>
    </>
  )
}
