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
      <h2 style={{ marginTop: 0 }}>登录到 Omni</h2>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      <input value={slug}     onChange={e => setSlug(e.target.value)}     placeholder="租户标识（可选 · 高级登录）" style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.75rem', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
      <input value={email}    onChange={e => setEmail(e.target.value)}    placeholder="邮箱"       type="email"    required style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.75rem', borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
      <input value={password} onChange={e => setPassword(e.target.value)} placeholder="密码"    type="password" required style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '1rem',   borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }} />
      <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.625rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
        {loading ? '登录中…' : '登录'}
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
  { key: 'api_health',   label: 'API /ops/health 返回 200',          url: 'http://localhost:43111/ops/health' },
  { key: 'api_ready',    label: 'API /ops/ready 返回 200',           url: 'http://localhost:43111/ops/ready'  },
  { key: 'api_db',       label: '数据库连通性（通过 API ready 判定）', url: null },
]

const BACKUP_CHECKLIST = [
  { key: 'pg_dump',          label: 'PostgreSQL pg_dump 已计划（至少每日）',           status: 'MANUAL' },
  { key: 'backup_offsite',   label: '备份副本存储于异地（S3 或类似服务）',              status: 'MANUAL' },
  { key: 'backup_restore',   label: '恢复流程已在预演环境验证',                          status: 'MANUAL' },
  { key: 'backup_retention', label: '保留策略已定义（至少 7 天）',                       status: 'MANUAL' },
  { key: 'backup_alert',     label: '备份失败告警已配置',                                status: 'MANUAL' },
]

const MONITORING_CHECKLIST = [
  { key: 'uptime_monitor',   label: '外部监控对 API 健康端点检测',                       status: 'MANUAL' },
  { key: 'error_rate_alert', label: '错误率告警（>1% 5xx 触发 page）',                  status: 'MANUAL' },
  { key: 'disk_alert',       label: '磁盘使用率告警（>80%）',                            status: 'MANUAL' },
  { key: 'db_size',          label: '数据库容量增长已跟踪',                              status: 'MANUAL' },
  { key: 'log_retention',    label: 'API / Worker 日志保留 ≥ 30 天',                    status: 'MANUAL' },
  { key: 'redis_memory',     label: 'Redis 内存监控与淘汰策略已设置',                    status: 'MANUAL' },
]

const INCIDENT_STEPS = [
  '确认影响范围：哪些租户 / 渠道 / 功能受影响？',
  '检查 API 健康：GET /ops/health 与 /ops/ready',
  '检查 Postgres：43113 端口可连接并查询？',
  '检查 Redis：43114 端口可连接？',
  '检查 Worker：进程是否在跑、是否在消费任务？',
  '审阅 API 日志：5xx 错误或未捕获异常',
  '若为 WhatsApp 会话问题：检查 OMNI_ALLOW_WA_SESSION 开关',
  '若为 Meta Webhook 问题：检查 verify token 与渠道配置',
  '通过外部渠道（邮件 / WhatsApp）通知受影响租户',
  '记录事件时间线、根因与修复，用于事后复盘',
]

const SUPPORT_READINESS = [
  { key: 'support_contact',   label: '支持联系方式已定义并记录' },
  { key: 'escalation_path',   label: '升级路径已记录（L1 → L2 → 工程师）' },
  { key: 'tenant_comms',      label: '故障时租户通知模板已就绪' },
  { key: 'runbook_location',  label: '本手册 URL 已同步给运维团队' },
]

export default function RunbookPage() {
  const [authed,  setAuthed]  = useState<boolean | null>(null)
  const [section, setSection] = useState<string>('health')

  useEffect(() => { setAuthed(!!getToken()) }, [])

  if (authed === null) return null

  if (!authed) return <LoginForm onSuccess={() => setAuthed(true)} />

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>生产运维手册</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
            健康检查、备份清单、监控、事件响应与支持准备。
          </p>
        </div>
        <a href="/production-qa" style={{ color: '#6366f1', fontSize: '0.875rem', textDecoration: 'none' }}>生产 QA →</a>
      </div>

      {/* Nav tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { id: 'health',   label: '健康检查' },
          { id: 'backup',   label: '备份清单' },
          { id: 'monitor',  label: '监控' },
          { id: 'incident', label: '事件响应' },
          { id: 'support',  label: '支持准备' },
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
        <Section title="健康检查端点">
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            所有 Omni 服务均应在专属端口响应；不与其他项目共用端口。
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>服务</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>端口</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>检查方式</th>
              </tr>
            </thead>
            <tbody>
              {OMNI_PORTS.map(p => (
                <tr key={p.port} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.5rem 0.75rem', color: '#111827' }}>{p.label}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', color: '#6366f1' }}>{p.port}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>TCP 连通</td>
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
                  : <span style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>派生</span>
                }
              </div>
            ))}
          </div>
        </Section>
      )}

      {section === 'backup' && (
        <Section title="备份清单">
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            以下均为运维人工任务，配置完成后请逐项勾选。
          </p>
          <ChecklistItems items={BACKUP_CHECKLIST} />
          <InfoBox>
            备份命令：<code>pg_dump -h localhost -p 43113 -U omni_user omni_dev &gt; backup_$(date +%Y%m%d).sql</code>
            <br />恢复命令：<code>psql -h localhost -p 43113 -U omni_user omni_dev &lt; backup_YYYYMMDD.sql</code>
            <br />投入生产前请先在隔离的开发数据库中验证恢复流程。
          </InfoBox>
        </Section>
      )}

      {section === 'monitor' && (
        <Section title="监控清单">
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            以下项目需要外部工具（UptimeRobot / Grafana / Sentry 等），上线前请完成配置。
          </p>
          <ChecklistItems items={MONITORING_CHECKLIST} />
          <InfoBox>
            建议：使用外部探针每 60 秒检测 <code>GET /ops/health</code>，连续失败 2 次即触发值班 page。
          </InfoBox>
        </Section>
      )}

      {section === 'incident' && (
        <Section title="事件响应流程">
          <ol style={{ margin: 0, padding: '0 0 0 1.25rem', lineHeight: 1.8 }}>
            {INCIDENT_STEPS.map((step, i) => (
              <li key={i} style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.5rem' }}>
                {step}
              </li>
            ))}
          </ol>
          <InfoBox>
            事后：撰写简短报告记录时间线、根因与待办；若发现手册缺口，请同步更新本手册。
          </InfoBox>
        </Section>
      )}

      {section === 'support' && (
        <Section title="支持准备">
          <ChecklistItems items={SUPPORT_READINESS} />
          <InfoBox>
            所有支持联系人与升级路径应记录到内部 Wiki，并在正式上线前同步给运维团队。
          </InfoBox>
        </Section>
      )}

      <footer style={{ marginTop: '2.5rem', color: '#9ca3af', fontSize: '0.75rem', textAlign: 'center' }}>
        Omni AI Chatbot — 生产运维手册 &nbsp;|&nbsp;
        <a href="/audit" style={{ color: '#6366f1' }}>审计日志</a> &nbsp;|&nbsp;
        <a href="/production-qa" style={{ color: '#6366f1' }}>生产 QA</a> &nbsp;|&nbsp;
        <a href="/activation-guide" style={{ color: '#6366f1' }}>上线激活指南</a> &nbsp;|&nbsp;
        <a href="/activation/monitoring" style={{ color: '#6366f1' }}>激活监控</a>
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
