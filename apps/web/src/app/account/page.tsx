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
      <input value={slug}     onChange={e => setSlug(e.target.value)}     placeholder="租户标识" required style={inputCss} />
      <input value={email}    onChange={e => setEmail(e.target.value)}    placeholder="邮箱"    type="email"    required style={inputCss} />
      <input value={password} onChange={e => setPassword(e.target.value)} placeholder="密码" type="password" required style={{ ...inputCss, marginBottom: '1rem' }} />
      <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.625rem', background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
        {loading ? '登录中…' : '登录'}
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
  type Tab = 'overview' | 'activity' | 'export' | 'security'
  const [tab,         setTab]         = useState<Tab>('overview')
  const [activity,    setActivity]    = useState<AnyData | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [exportData,  setExportData]  = useState<AnyData | null>(null)
  const [exportLoading, setExportLoading] = useState(false)

  // Phase 17D: activity filters + security tab state
  const [filterGroup, setFilterGroup] = useState<string>('')
  const [filterFrom,  setFilterFrom]  = useState<string>('')
  const [filterTo,    setFilterTo]    = useState<string>('')
  const [security,    setSecurity]    = useState<AnyData | null>(null)
  const [securityLoading, setSecurityLoading] = useState(false)

  useEffect(() => { setAuthed(!!getToken()) }, [])

  const loadActivity = useCallback(async (group?: string, from?: string, to?: string) => {
    const tok = getToken()
    if (!tok) return
    setActivityLoading(true); setError('')
    try {
      const params = new URLSearchParams({ limit: '50' })
      const g = group ?? filterGroup
      const f = from  ?? filterFrom
      const t = to    ?? filterTo
      if (g) params.set('actionGroup', g)
      if (f) params.set('from', new Date(f).toISOString())
      if (t) params.set('to',   new Date(t).toISOString())
      const r = await fetch(`${API_BASE}/account/activity?${params}`, { headers: { Authorization: `Bearer ${tok}` } })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` })) as { error?: string }
        throw new Error(err.error ?? `HTTP ${r.status}`)
      }
      setActivity(await r.json() as AnyData)
    } catch (e) { setError((e as Error).message) }
    finally { setActivityLoading(false) }
  }, [filterGroup, filterFrom, filterTo])

  const loadSecurity = useCallback(async () => {
    const tok = getToken()
    if (!tok) return
    setSecurityLoading(true); setError('')
    try {
      const r = await fetch(`${API_BASE}/account/security-events`, { headers: { Authorization: `Bearer ${tok}` } })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` })) as { error?: string }
        throw new Error(err.error ?? `HTTP ${r.status}`)
      }
      setSecurity(await r.json() as AnyData)
    } catch (e) { setError((e as Error).message) }
    finally { setSecurityLoading(false) }
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
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {/* Tabs (Phase 17C) */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem', borderBottom: '1px solid #e5e7eb' }}>
        {([
          { id: 'overview', label: '账户概览', icon: '' },
          { id: 'activity', label: '活动记录', icon: '' },
          { id: 'security', label: '安全事件', icon: '' },
          { id: 'export',   label: '安全导出', icon: '' },
        ] as { id: Tab; label: string; icon: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id)
              if (t.id === 'activity' && !activity) void loadActivity()
              if (t.id === 'security' && !security) void loadSecurity()
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
          ✓ 资料更新成功。
        </div>
      )}

      {tab === 'overview' && <>
      {/* Two-column layout for tenant + user cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>

        {/* Tenant profile card */}
        <Card title="租户资料" action={isOwnerOrAdmin && !editing ? { label: '编辑', onClick: () => setEditing(true) } : undefined}>
          {!editing ? (
            <>
              <Row label="商家名称"    value={String(tenant.name ?? '—')} />
              <Row label="租户标识"    value={String(tenant.slug ?? '—')} mono />
              <Row label="默认语言"    value={String(tenant.defaultLanguage ?? '—').toUpperCase()} />
              <Row label="套餐"        value={String(tenant.plan ?? '—')} />
              <Row label="是否激活"    value={tenant.isActive ? '是' : '否'} color={tenant.isActive ? SUCCESS : DANGER} />
              <Row label="开通日期"    value={tenant.memberSince ? new Date(String(tenant.memberSince)).toLocaleDateString('zh-CN') : '—'} />
            </>
          ) : (
            <>
              <Field label="商家名称">
                <input value={editName} onChange={e => setEditName(e.target.value)} style={inputCss} maxLength={120} minLength={2} />
              </Field>
              <Field label="默认语言">
                <select value={editLang} onChange={e => setEditLang(e.target.value)} style={inputCss}>
                  <option value="zh">中文 (zh)</option>
                  <option value="en">English (en)</option>
                  <option value="ms">Bahasa Melayu (ms)</option>
                </select>
              </Field>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={handleSave} disabled={saving} style={btnPrimary}>
                  {saving ? '保存中…' : '保存'}
                </button>
                <button onClick={() => { setEditing(false); setEditName(String(tenant.name ?? '')); setEditLang(String(tenant.defaultLanguage ?? 'zh')) }} disabled={saving} style={btnSecondary}>
                  取消
                </button>
              </div>
              {!isOwnerOrAdmin && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: WARN_C }}>
                  仅 OWNER 或 ADMIN 可编辑资料。
                </div>
              )}
            </>
          )}
        </Card>

        {/* Current user card */}
        <Card title="您的账户">
          <Row label="姓名"      value={String(currentUser.name  ?? '—')} />
          <Row label="邮箱"      value={String(currentUser.email ?? '—')} mono />
          <Row label="角色"      value={String(currentUser.role  ?? '—')} color={ACCENT} />
          <Row label="状态"      value={currentUser.isActive ? '激活' : '停用'} color={currentUser.isActive ? SUCCESS : DANGER} />
          <Row label="注册日期"  value={currentUser.memberSince ? new Date(String(currentUser.memberSince)).toLocaleDateString('zh-CN') : '—'} />
        </Card>
      </div>

      {/* Onboarding + Channel cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <Card title="上线向导状态" action={{ label: '前往 →', onClick: () => window.location.href = '/onboarding' }}>
          <Row label="状态"          value={String(onboarding.status ?? 'NOT_STARTED')} color={onboarding.status === 'ENABLED' ? SUCCESS : WARN_C} />
          <Row label="公司名称"      value={String(onboarding.companyName ?? '—')} />
          <Row label="行业"          value={String(onboarding.industry ?? '—')} />
          <Row label="AI 目标"       value={Array.isArray(onboarding.goals) && onboarding.goals.length > 0 ? (onboarding.goals as unknown[]).join(', ') : '—'} />
        </Card>

        <Card title="渠道设置" action={{ label: '前往 →', onClick: () => window.location.href = '/channels/setup' }}>
          <Row label="渠道类型"      value={String(channel.channelType ?? '未配置')} />
          <Row label="配置状态"      value={String(channel.setupStatus ?? 'NOT_STARTED')} />
          <Row label="凭据状态"      value={String(channel.credentialStatus ?? 'NONE')} color={channel.credentialStatus === 'ENCRYPTED_STORED' ? SUCCESS : NEUTRAL} />
          <Row label="活跃渠道数"    value={String(channel.activeChannelCount ?? 0)} />
        </Card>
      </div>

      {/* Setup checklist */}
      <Card title={`继续设置（${progress.completed ?? 0}/${progress.total ?? 0}）`}>
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
              {item.passed ? '回顾 →' : '前往 →'}
            </a>
          </div>
        ))}
      </Card>

      {/* Safety status */}
      <div style={{ marginTop: '1.25rem' }}>
        <Card title="安全状态">
          <Row label="真实发送"           value={safety.realSendCurrentlyOff ? '关闭 ✓（安全）' : '开启 ⚠️'} color={safety.realSendCurrentlyOff ? SUCCESS : DANGER} />
          <Row label="WhatsApp Web 会话"   value={safety.realWaSessionEnabled ? '已启用 ⚠️' : '已关闭 ✓'} color={safety.realWaSessionEnabled ? WARN_C : SUCCESS} />
          <Row label="Meta API 发送"       value={safety.realMetaSendEnabled  ? '已启用 ⚠️' : '已关闭 ✓'} color={safety.realMetaSendEnabled  ? WARN_C : SUCCESS} />
          <Row label="广播 / 群发"         value="所有套餐均不支持 ✓" color={SUCCESS} />
          <div style={{ marginTop: '0.625rem', fontSize: '0.75rem', color: NEUTRAL, lineHeight: 1.5, paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
            正式激活必须通过 <a href="/activation-guide" style={{ color: ACCENT }}>上线激活指南</a> 并通过 <a href="/activation/monitoring" style={{ color: ACCENT }}>监控检查</a>。Omni 仅用于 1:1 WhatsApp AI 客服，不用于广播、广告或群发。
          </div>
        </Card>
      </div>

      {/* Quick links footer */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'center' }}>
        {[
          { href: '/team',                  label: '团队成员' },
          { href: '/knowledge',             label: '知识库' },
          { href: '/channels/setup',        label: '渠道设置' },
          { href: '/activation-guide',      label: '上线激活指南' },
          { href: '/activation/monitoring', label: '激活监控' },
          { href: '/release-checklist',     label: '发布检查清单' },
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
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>近期账户活动</h2>
            <button onClick={() => loadActivity()} disabled={activityLoading} style={btnSecondary}>
              {activityLoading ? '加载中…' : '刷新'}
            </button>
          </div>

          {/* Phase 17D: Activity filters */}
          <Card title="筛选">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.625rem', alignItems: 'end' }}>
              <Field label="动作分组">
                <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)} style={inputCss}>
                  <option value="">全部分组</option>
                  <option value="account">账户</option>
                  <option value="team">团队</option>
                  <option value="billing">计费</option>
                  <option value="settings">设置</option>
                  <option value="activation">激活</option>
                  <option value="security">安全事件</option>
                </select>
              </Field>
              <Field label="开始时间">
                <input type="datetime-local" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={inputCss} />
              </Field>
              <Field label="结束时间">
                <input type="datetime-local" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={inputCss} />
              </Field>
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                <button onClick={() => loadActivity()} disabled={activityLoading} style={{ ...btnPrimary, flex: 1 }}>
                  应用
                </button>
                <button onClick={() => { setFilterGroup(''); setFilterFrom(''); setFilterTo(''); loadActivity('', '', '') }} style={btnSecondary}>
                  清除
                </button>
              </div>
            </div>
          </Card>

          <p style={{ color: NEUTRAL, fontSize: '0.8125rem', margin: '0.875rem 0', lineHeight: 1.5 }}>
            来自审计日志、按本租户隔离的活动记录。原始元数据经白名单过滤，不展示密钥、token 或凭据。
          </p>
          <Card title={`事件（${((activity?.events ?? []) as AnyData[]).length} 条）`}>
            {((activity?.events ?? []) as AnyData[]).length === 0 ? (
              <div style={{ color: NEUTRAL, fontSize: '0.875rem', padding: '0.5rem 0' }}>
                {activityLoading ? '正在加载近期活动…' : '暂无账户活动记录。'}
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

      {/* ── Security tab (Phase 17D) ─────────────────────────────────────── */}
      {tab === 'security' && (() => {
        const sev      = (security?.severityCounts ?? {}) as Record<string, number>
        const last24h  = (security?.last24h        ?? {}) as Record<string, number>
        const events   = (security?.events         ?? []) as AnyData[]
        const recommended = (security?.recommendedActions ?? []) as string[]
        const safety   = (security?.safetyFlags    ?? {}) as Record<string, unknown>
        const sevColor = (s: string): string =>
          s === 'critical' ? DANGER :
          s === 'warning'  ? WARN_C :
          SUCCESS
        const sevBg = (s: string): string =>
          s === 'critical' ? '#fef2f2' :
          s === 'warning'  ? '#fffbeb' :
          '#f0fdf4'
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>安全事件</h2>
              <button onClick={loadSecurity} disabled={securityLoading} style={btnSecondary}>
                {securityLoading ? '加载中…' : '刷新'}
              </button>
            </div>
            <p style={{ color: NEUTRAL, fontSize: '0.8125rem', marginBottom: '1rem', lineHeight: 1.5 }}>
              基于本地审计日志的安全视图（近 7 日），不调用任何外部服务商，仅 OWNER 与 ADMIN 可见。
            </p>

            {!isOwnerOrAdmin && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.625rem 0.875rem', color: DANGER, fontSize: '0.875rem', marginBottom: '1rem' }}>
                安全视图仅对 OWNER 与 ADMIN 开放。
              </div>
            )}

            {/* Severity summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              {[
                { key: 'critical', label: '严重（7 日）', count: sev.critical ?? 0 },
                { key: 'warning',  label: '警告（7 日）', count: sev.warning  ?? 0 },
                { key: 'info',     label: '信息（7 日）', count: sev.info     ?? 0 },
              ].map(s => (
                <div key={s.key} style={{ background: sevBg(s.key), border: `1px solid ${sevColor(s.key)}33`, borderRadius: 10, padding: '0.875rem 1rem' }}>
                  <div style={{ fontSize: '0.6875rem', color: NEUTRAL, letterSpacing: '0.04em', marginBottom: '0.25rem' }}>{s.label}</div>
                  <div style={{ fontWeight: 700, fontSize: '1.375rem', color: sevColor(s.key) }}>{s.count}</div>
                </div>
              ))}
            </div>

            {/* Last 24h summary */}
            <Card title="最近 24 小时">
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
                <div><strong>{last24h.total ?? 0}</strong> 起事件</div>
                <div style={{ color: DANGER }}><strong>{last24h.critical ?? 0}</strong> 严重</div>
                <div style={{ color: WARN_C }}><strong>{last24h.warning ?? 0}</strong> 警告</div>
                <div style={{ color: SUCCESS }}><strong>{last24h.info ?? 0}</strong> 信息</div>
              </div>
            </Card>

            {/* Recommended actions */}
            {recommended.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <Card title="建议动作">
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#374151', lineHeight: 1.7 }}>
                    {recommended.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </Card>
              </div>
            )}

            {/* Event list */}
            <div style={{ marginTop: '1rem' }}>
              <Card title={`近期事件（${events.length} 条）`}>
                {events.length === 0 ? (
                  <div style={{ color: NEUTRAL, fontSize: '0.875rem', padding: '0.5rem 0' }}>
                    {securityLoading ? '正在加载安全事件…' : '近 7 日无安全相关事件。'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    {events.map(e => (
                      <div key={String(e.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', padding: '0.4375rem 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.8125rem' }}>
                        <span style={{ padding: '0.0625rem 0.4375rem', borderRadius: 4, background: sevBg(String(e.severity)), color: sevColor(String(e.severity)), fontWeight: 700, fontSize: '0.6875rem', flexShrink: 0, marginTop: 1 }}>
                          {String(e.severity).toUpperCase()}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 600, color: '#111827' }}>{String(e.reason ?? e.summary ?? e.action)}</span>
                            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                              {e.actorRole ? `${String(e.actorRole)} · ` : ''}{e.createdAt ? new Date(String(e.createdAt)).toLocaleString() : '—'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: NEUTRAL, marginTop: 2 }}>
                            <code style={{ background: '#f9fafb', padding: '0 4px', borderRadius: 3 }}>{String(e.action)}</code>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Safety footer */}
            <div style={{ marginTop: '1rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.75rem', color: NEUTRAL, lineHeight: 1.5 }}>
              安全状态：realSendEnabled = <strong>{String(safety.realSendEnabled ?? false)}</strong> · realWaSessionEnabled = <strong>{String(safety.realWaSessionEnabled ?? false)}</strong> · realMetaSendEnabled = <strong>{String(safety.realMetaSendEnabled ?? false)}</strong>
            </div>
          </div>
        )
      })()}

      {/* ── Export tab (Phase 17C) ─────────────────────────────────────── */}
      {tab === 'export' && (
        <div>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: '#111827' }}>安全导出</h2>
          <Card title="导出包含的内容">
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#374151', lineHeight: 1.7 }}>
              <li>租户资料（id、slug、名称、语言、套餐、是否激活）</li>
              <li>用户列表（id、邮箱、姓名、角色、是否激活 — 不含 passwordHash）</li>
              <li>上线向导草稿字段（公司名称、行业、AI 目标）</li>
              <li>仅渠道配置状态（不含 credentialRef、不含 token）</li>
              <li>知识库问题列表（不含答案）</li>
              <li>AI 配置服务商标签（不含 API key 引用）</li>
              <li>自动跟进规则键与延迟（不含话术模板）</li>
              <li>人工转接规则条件</li>
              <li>计数：用户、客户、对话、审计事件</li>
              <li>安全开关与脱敏摘要</li>
            </ul>
          </Card>
          <Card title="导出不包含的内容">
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#374151', lineHeight: 1.7 }}>
              <li>密码哈希</li>
              <li>加密凭据块（credentialRef、metaAccessTokenRef、webhookVerifyTokenRef、apiKeyRef）</li>
              <li>任何原始 token</li>
              <li>WhatsApp / Meta 服务商会话或 QR 数据</li>
              <li>完整客户对话或消息内容</li>
              <li>知识库答案（仅导出问题，避免泄漏粘贴内容）</li>
              <li>自动跟进话术模板</li>
            </ul>
          </Card>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button onClick={loadExport} disabled={exportLoading} style={btnPrimary}>
              {exportLoading ? '生成中…' : (exportData ? '重新生成' : '生成安全导出')}
            </button>
            {exportData && (
              <button onClick={downloadExport} style={btnSecondary}>
                下载 JSON
              </button>
            )}
          </div>
          {!isOwnerOrAdmin && (
            <div style={{ marginTop: '0.625rem', fontSize: '0.75rem', color: WARN_C }}>
              提示：导出仅对 OWNER 与 ADMIN 开放。
            </div>
          )}
          {exportData && (
            <div style={{ marginTop: '1rem' }}>
              <Card title={`导出预览（生成于 ${String(exportData.generatedAt ?? '')}）`}>
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
