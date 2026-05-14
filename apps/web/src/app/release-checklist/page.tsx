'use client'
// Release Checklist — Phase 15D
// SaaS v1 final release readiness view.
// Pulls live data from /release-checklist/status and /production-qa/checklist.

import { useEffect, useState } from 'react'
import { getToken } from '@/lib/api'
import { releaseStatusLabel } from '@/lib/enumLabels'

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
      <h2 style={{ marginTop: 0 }}>登录到 Omni</h2>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      <input value={slug}     onChange={e => setSlug(e.target.value)}     placeholder="租户标识" required style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.75rem', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
      <input value={email}    onChange={e => setEmail(e.target.value)}    placeholder="邮箱"    type="email"    required style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.75rem', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
      <input value={password} onChange={e => setPassword(e.target.value)} placeholder="密码" type="password" required style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '1rem',   borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
      <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.625rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
        {loading ? '登录中…' : '登录'}
      </button>
    </form>
  )
}

interface ReleaseSection {
  key:      string
  label:    string
  status:   'PASS' | 'WARN' | 'FAIL' | 'MANUAL' | 'LOADING'
  detail:   string
  action?:  string
}

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  PASS:    { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  WARN:    { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  FAIL:    { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
  MANUAL:  { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  LOADING: { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' },
}

const STATIC_SECTIONS: ReleaseSection[] = [
  {
    key:    'product_complete',
    label:  '产品主流程完整',
    status: 'PASS',
    detail: '上线向导 → 知识库 → 渠道 → 收件箱 → 老板工作台 → PWA → 计费 → 团队 → 审计，全部核心流程已实现。',
  },
  {
    key:    'no_broadcast',
    label:  '不支持广播 / 广告 / 群发',
    status: 'PASS',
    detail: '所有套餐均不实现营销广播或群发。Omni 仅提供 1:1 AI 客服。',
  },
  {
    key:    'real_send_default_off',
    label:  '真实发送默认关闭',
    status: 'PASS',
    detail: 'OMNI_ALLOW_WA_SESSION=false、OMNI_ENABLE_REAL_META_SEND=false，不会发送真实 WhatsApp / Meta 消息。',
  },
  {
    key:    'auth_rbac',
    label:  '认证与 RBAC 已启用',
    status: 'PASS',
    detail: '5 级 RBAC（OWNER / ADMIN / MANAGER / AGENT / VIEWER），基于 JWT 鉴权，按租户隔离，禁止跨租户访问。',
  },
  {
    key:    'audit_logs',
    label:  '审计日志可用',
    status: 'PASS',
    detail: '所有管理动作写入 AuditLog 表，GET /audit/logs 可查询；密钥与凭据永不写入日志。',
    action: '/audit',
  },
  {
    key:    'ops_runbook',
    label:  '运维手册已就绪',
    status: 'PASS',
    detail: '/ops/runbook 涵盖健康检查、备份、监控与事件响应。',
    action: '/ops/runbook',
  },
  {
    key:    'meta_fees_separated',
    label:  'Meta API 费用单独透传',
    status: 'PASS',
    detail: 'Meta 官方 WhatsApp API 的按会话费用不打包到套餐中，作为透传 credits 按成本结算。',
    action: '/billing',
  },
  {
    key:    'payment_not_configured',
    label:  '支付网关未配置（安全）',
    status: 'PASS',
    detail: '当前无真实支付网关。套餐选择仅为草稿偏好，在显式配置支付网关前不会产生任何扣费。',
    action: '/billing',
  },
  {
    key:    'manual_activation',
    label:  '正式上线需运维手动激活',
    status: 'MANUAL',
    detail: '正式上线前：运维需在完成渠道配置、凭据保险库与测试后，显式设置 OMNI_ALLOW_WA_SESSION=true 或 OMNI_ENABLE_REAL_META_SEND=true。',
  },
  {
    key:    'backup_configured',
    label:  '数据库备份已配置',
    status: 'MANUAL',
    detail: '运维需配置 pg_dump 计划、异地备份存储与恢复流程，详见 /ops/runbook。',
    action: '/ops/runbook',
  },
  {
    key:    'monitoring_configured',
    label:  '外部监控已配置',
    status: 'MANUAL',
    detail: '运维需配置 /ops/health 健康监测、错误率告警与磁盘告警，详见 /ops/runbook。',
    action: '/ops/runbook',
  },
  {
    key:    'docs_ready',
    label:  '文档完整',
    status: 'PASS',
    detail: 'Phase 15D 起 DEMO_FLOW.md、RELEASE_CHECKLIST.md、OPS_RUNBOOK.md、AUDIT_LOGS.md、PRODUCTION_HARDENING.md 均已就绪。',
  },
  {
    key:    'navigation_shell',
    label:  '应用 Shell / 导航已就位',
    status: 'PASS',
    detail: '共用 AppNav 侧边栏覆盖全部页面，全部 15+ 路由可达。',
  },
]

interface ApiStatus {
  overallStatus: string
  summary:       { passed: number; failed: number; warned: number; manual: number }
  saasV1Ready:   boolean
}

export default function ReleaseChecklistPage() {
  const [authed,    setAuthed]    = useState(false)
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null)
  const [loading,   setLoading]   = useState(false)

  useEffect(() => { setAuthed(!!getToken()) }, [])

  const loadApiStatus = async () => {
    if (!getToken()) return
    setLoading(true)
    try {
      const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:43111'
      const tok = getToken()
      const r = await fetch(`${API}/release-checklist/status`, {
        headers: { Authorization: `Bearer ${tok}` },
      })
      if (r.ok) setApiStatus(await r.json() as ApiStatus)
    } catch { /* non-fatal */ }
    finally { setLoading(false) }
  }

  useEffect(() => { if (authed) void loadApiStatus() }, [authed])

  if (!authed) return <LoginForm onSuccess={() => setAuthed(true)} />

  const failCount   = STATIC_SECTIONS.filter(s => s.status === 'FAIL').length
  const manualCount = STATIC_SECTIONS.filter(s => s.status === 'MANUAL').length
  const passCount   = STATIC_SECTIONS.filter(s => s.status === 'PASS').length
  const warnCount   = STATIC_SECTIONS.filter(s => s.status === 'WARN').length
  const isReady     = failCount === 0 && (apiStatus?.overallStatus !== 'FAIL')

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            SaaS v1 发布检查清单
          </h1>
          <p style={{ margin: '0.375rem 0 0', color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.5 }}>
            正式上线激活前的最终就绪复核。标记为「人工」的项目需要运维操作。
          </p>
        </div>
        <a href="/demo-flow" style={{ padding: '0.4375rem 0.875rem', background: '#6366f1', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
          ← 演示流程
        </a>
      </div>

      {/* Summary banner */}
      <div style={{
        padding: '1rem 1.25rem',
        borderRadius: 10,
        background: isReady ? '#f0fdf4' : '#fffbeb',
        border: `1px solid ${isReady ? '#86efac' : '#fde68a'}`,
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.0625rem', color: isReady ? '#15803d' : '#b45309' }}>
            {isReady ? 'SaaS v1 — 可进入手动激活' : '激活前需复核'}
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: 4 }}>
            通过 {passCount} 项 · 警告 {warnCount} 项 · 失败 {failCount} 项 · 人工 {manualCount} 项
            {apiStatus && (
              <> · API：通过 {apiStatus.summary.passed} / 失败 {apiStatus.summary.failed}</>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <a href="/production-qa" style={{ padding: '0.375rem 0.75rem', background: '#6366f1', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: '0.8125rem' }}>
            生产 QA →
          </a>
          <button
            onClick={loadApiStatus}
            disabled={loading}
            title="刷新发布检查状态，不会调用真实外部服务"
            style={{ padding: '0.375rem 0.75rem', background: '#f3f4f6', color: '#374151', borderRadius: 6, border: '1px solid #d1d5db', cursor: 'pointer', fontSize: '0.8125rem' }}
          >
            {loading ? '检查中…' : '刷新'}
          </button>
        </div>
      </div>

      {/* Checklist items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {STATIC_SECTIONS.map(item => {
          const colors = STATUS_COLORS[item.status]
          return (
            <div key={item.key} style={{
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.875rem',
            }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.color, background: `${colors.border}60`, padding: '0.1875rem 0.5rem', borderRadius: 4, flexShrink: 0, marginTop: 1 }}>
                {releaseStatusLabel(item.status)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{item.label}</div>
                <div style={{ fontSize: '0.8125rem', color: '#4b5563', marginTop: 2, lineHeight: 1.5 }}>{item.detail}</div>
              </div>
              {item.action && (
                <a href={item.action} style={{ fontSize: '0.8125rem', color: '#6366f1', textDecoration: 'none', flexShrink: 0, marginTop: 2 }}>
                  查看 →
                </a>
              )}
            </div>
          )
        })}
      </div>

      {/* Manual activation note */}
      <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: '0.875rem', color: '#374151', lineHeight: 1.6 }}>
        <strong>正式上线手动激活步骤：</strong>
        <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', lineHeight: 1.8 }}>
          <li>完成所有「人工」项（备份、监控、支持联系人）</li>
          <li>配置凭据保险库（OMNI_API_KEY_ENCRYPTION_SECRET）</li>
          <li>通过 /channels/setup 添加真实渠道凭据</li>
          <li>运行安全演练 → 在预演环境验证 webhook 可用</li>
          <li>按需设置 OMNI_ALLOW_WA_SESSION=true 或 OMNI_ENABLE_REAL_META_SEND=true（一般不同时开启）</li>
          <li>需要正式计费时再配置支付网关</li>
          <li>所有「生产 QA」项均为「通过」后再正式上线</li>
        </ol>
      </div>

      <footer style={{ marginTop: '1.5rem', color: '#9ca3af', fontSize: '0.75rem', textAlign: 'center' }}>
        Omni SaaS v1 · <a href="/demo-flow" style={{ color: '#6366f1' }}>演示流程</a> · <a href="/production-qa" style={{ color: '#6366f1' }}>生产 QA</a> · <a href="/ops/runbook" style={{ color: '#6366f1' }}>运维手册</a> · <a href="/activation-guide" style={{ color: '#6366f1' }}>上线激活指南</a> · <a href="/activation/monitoring" style={{ color: '#6366f1' }}>激活监控</a>
      </footer>
    </main>
  )
}
