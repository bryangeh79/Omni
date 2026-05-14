'use client'
// Audit Activity Timeline — Phase 15C

import { useEffect, useState, useCallback } from 'react'
import { getToken, fetchAuditLogs, type AuditLog, type AuditLogsResponse } from '@/lib/api'
import { AUDIT_ACTION_LABELS, auditActionLabel, actorRoleLabel } from '@/lib/enumLabels'

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
      <h2 style={{ marginTop: 0 }}>登录到 Omni（审计日志）</h2>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      <input value={slug}     onChange={e => setSlug(e.target.value)}     placeholder="租户标识"  required style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.75rem', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
      <input value={email}    onChange={e => setEmail(e.target.value)}    placeholder="邮箱"       type="email"    required style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.75rem', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
      <input value={password} onChange={e => setPassword(e.target.value)} placeholder="密码"    type="password" required style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '1rem',   borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
      <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.625rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
        {loading ? '登录中…' : '登录'}
      </button>
    </form>
  )
}

// ACTION 标签来自共用 enumLabels（参见 apps/web/src/lib/enumLabels.ts）

const ROLE_COLORS: Record<string, string> = {
  OWNER:   '#7c3aed',
  ADMIN:   '#1d4ed8',
  MANAGER: '#0369a1',
  AGENT:   '#15803d',
  VIEWER:  '#71717a',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000)         return '刚刚'
  if (diff < 3_600_000)      return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000)     return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}

// Phase 18B: client-side raw metadataJson parser removed.
// /audit/logs now returns server-sanitized `safeMetadata` (whitelisted object)
// and `summary` (deterministic human-readable string). The audit UI consumes
// those fields directly — no raw JSON parsing is performed in the browser.

function formatSafeMetadata(meta: Record<string, unknown> | undefined): string {
  if (!meta || Object.keys(meta).length === 0) return ''
  const s = JSON.stringify(meta)
  return s.length > 120 ? s.slice(0, 117) + '...' : s
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
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>管理动作时间线</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
            关键管理动作的审计日志；密钥与凭据永远不会被记录。
          </p>
        </div>
        <a href="/settings" style={{ color: '#6366f1', fontSize: '0.875rem', textDecoration: 'none' }}>← 设置</a>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select
          value={filterAction}
          onChange={e => { setFilterAction(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.875rem' }}
        >
          <option value="">全部动作</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={filterEntityType}
          onChange={e => { setFilterEntityType(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.875rem' }}
        >
          <option value="">全部实体类型</option>
          <option value="User">用户</option>
          <option value="Tenant">租户</option>
          <option value="TeamInvite">团队邀请</option>
          <option value="SmokeTest">冒烟测试</option>
        </select>
        <button
          onClick={() => load(1)}
          disabled={loading}
          style={{ padding: '0.4rem 1rem', borderRadius: 6, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}
        >
          {loading ? '加载中…' : '刷新'}
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
            暂无审计事件。
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
            上一页
          </button>
          <span style={{ color: '#374151', fontSize: '0.875rem' }}>
            第 {pag.page} / {pag.pages} 页 · 共 {pag.total} 条
          </span>
          <button
            onClick={() => load(page + 1)}
            disabled={page >= pag.pages || loading}
            style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid #d1d5db', background: page >= pag.pages ? '#f3f4f6' : '#fff', cursor: page >= pag.pages ? 'not-allowed' : 'pointer' }}
          >
            下一页
          </button>
        </div>
      )}

      <footer style={{ marginTop: '2rem', color: '#9ca3af', fontSize: '0.75rem', textAlign: 'center' }}>
        审计日志按租户隔离；密钥与凭据永不记录。
      </footer>
    </main>
  )
}

function AuditCard({ log }: { log: AuditLog }) {
  // Phase 18B: prefer server `summary`; fall back to label map for older codepaths
  const label     = log.summary ?? auditActionLabel(log.action)
  const roleColor = log.actorRole ? (ROLE_COLORS[log.actorRole] ?? '#374151') : '#9ca3af'
  const meta      = formatSafeMetadata(log.safeMetadata)

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
                {actorRoleLabel(log.actorRole)}
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
          {!!meta && (
            <span style={{ marginLeft: '0.75rem', fontFamily: 'monospace', color: '#9ca3af', fontSize: '0.75rem' }}>
              {meta}
            </span>
          )}
        </div>

        {log.actorUserId && (
          <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#9ca3af' }}>
            操作者：{log.actorUserId.slice(0, 12)}…
          </div>
        )}
      </div>
    </div>
  )
}
