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
    title:  '完成所有上线前检查',
    detail: '运行 GET /activation/preflight 或检查 /release-checklist 以确认就绪等级。',
    items: [
      '上线向导必须处于「已启用」状态',
      '知识库至少存在一条启用条目',
      '已选择渠道类型并保存草稿',
      '存在 OWNER 或 ADMIN 用户',
      '凭据保险库已配置（OMNI_API_KEY_ENCRYPTION_SECRET）',
    ],
  },
  {
    n: 2,
    title:  '确认备份与监控已配置',
    detail: '正式上线前请先保护好数据。',
    items: [
      'pg_dump 已计划（至少每日）且备份存储于异地',
      '恢复流程已在预演环境中验证',
      '外部探针监控 GET /ops/health',
      '已配置错误率告警（>1% 5xx 触发 page）',
    ],
    warning: '未配置备份不要激活真实渠道 — 数据丢失不可恢复。',
  },
  {
    n: 3,
    title:  '运行激活安全演练',
    detail: '使用 POST /activation/dry-run 模拟激活路径，不会触发任何真实连接。',
    items: [
      'POST /activation/dry-run 传入 channelType 与 intendedMode',
      '检查 blockedReasons — 解决所有 BLOCKED 项',
      '检查 stepsIfProceeding 中对应渠道的步骤',
      '提示：安全演练绝不会启用真实发送',
    ],
  },
]

const WA_WEB_STEPS: Step[] = [
  {
    n: 1,
    title:  '前提：拥有普通 WhatsApp 账号',
    detail: 'WhatsApp Web 需要在真实手机号上有可用的 WhatsApp 账号。',
    items: [
      '一个已安装并激活 WhatsApp 的手机号',
      '手机需保持在线以维持会话稳定',
      '不是 Meta 商业平台（WABA） — 那是独立路径',
    ],
    warning: '普通 WhatsApp（WA Web）会话稳定性「尽力而为」，WhatsApp 可能断线或封禁。生产环境稳定性请使用 Meta 商业 API。',
  },
  {
    n: 2,
    title:  '设置环境变量',
    detail: '仅在生产环境 .env 中设置（开发 / 预演环境除非测试，否则不要开启）。',
    items: [
      '设置 OMNI_ALLOW_WA_SESSION=true',
      '重启 API 服务',
      '确认 /channels/setup/wa-web/status 返回 waSessionAllowed: true',
    ],
    warning: '此开关启用真实 WhatsApp Web 会话能力，请确认手机与账号已就绪。',
  },
  {
    n: 3,
    title:  '扫描二维码',
    detail: '前往 /channels/setup/wa-web/qr 并用手机扫码。',
    items: [
      '在运维控制台打开 /channels/setup/wa-web/qr',
      '手机端打开 WhatsApp → 已链接设备 → 链接设备',
      '扫描二维码',
      '等待会话确认（sessionStatus: CONNECTED）',
    ],
  },
  {
    n: 4,
    title:  '验证会话健康',
    detail: '确认会话活跃且消息正常流转。',
    items: [
      'GET /channels/setup/wa-web/status → sessionStatus: CONNECTED',
      'GET /activation/health → overallHealthLevel 非 WARN',
      '向内部已知号码发送测试消息',
      '在对端设备确认收到消息',
    ],
  },
  {
    n: 5,
    title:  '激活后监控',
    detail: 'WA Web 会话可能断线，请定期监控。',
    items: [
      '每日检查 /channels/setup/wa-web/status',
      '会话断开（sessionStatus ≠ CONNECTED）触发告警',
      '保持已链接的手机在线',
      '为会话过期场景预先规划重连流程',
    ],
  },
]

const META_STEPS: Step[] = [
  {
    n: 1,
    title:  '前提：拥有 Meta WhatsApp 商业账号',
    detail: '需要已认证的 Meta 商业账号与 WhatsApp 商业账号（WABA）。',
    items: [
      'Meta Business Manager 账号（business.facebook.com）',
      '已获 Meta 批准的 WhatsApp 商业账号（WABA）',
      '在 Meta 上注册的 Phone Number ID（非普通手机号）',
      'Meta 系统用户 token 或 App access token，需具备 whatsapp_business_messaging 权限',
      '具备 webhook 订阅能力的 Meta 应用',
    ],
  },
  {
    n: 2,
    title:  '通过渠道设置保存凭据',
    detail: '使用加密凭据保险库 — 切勿明文粘贴 token。',
    items: [
      '前往 /channels/setup',
      '通过 POST /channels/setup/credentials-draft 保存凭据',
      '确认响应中 credentialStatus: ENCRYPTED_STORED',
      '确认任何 API 响应中均不会出现原始 token',
    ],
    warning: '绝不可明文保存 Meta access token；始终使用凭据保险库（OMNI_API_KEY_ENCRYPTION_SECRET）。',
  },
  {
    n: 3,
    title:  '配置并测试 Webhook',
    detail: 'Meta 需先验证您的 Webhook 端点才能下发消息。',
    items: [
      'Webhook URL：https://your-domain.com/webhooks/meta/whatsapp/{channelId}',
      'Verify token：通过 /channels/setup/meta-webhook/save-draft 设置',
      '在 Meta 商业设置中将应用订阅 WABA webhook',
      '通过 GET /channels/setup/meta-webhook/status 确认 webhookSubscribed: true',
      '运行 /channels/setup/meta-webhook/test-stub 完成本地安全演练',
    ],
  },
  {
    n: 4,
    title:  '设置环境变量',
    detail: '仅在生产环境 .env 中设置。',
    items: [
      '设置 OMNI_ENABLE_REAL_META_SEND=true',
      '重启 API 服务',
      '确认 /activation/health → safetyFlags.realMetaSendEnabled: true',
    ],
    warning: '此开关启用真实 Meta WhatsApp API 调用；启用前请先确认凭据有效且 webhook 已订阅。',
  },
  {
    n: 5,
    title:  '发送测试消息并验证',
    detail: '向已知号码发送测试消息以确认端到端链路。',
    items: [
      '使用 /messages/send 在 Meta 渠道上发送（提供有效 conversationId）',
      '确认 sendStatus: SENT（而非 META_SEND_DISABLED）',
      '在目标手机上确认消息送达',
      '通过 /webhooks/meta/whatsapp/{channelId} 监控入站投递回执',
      '在 /audit 日志中检查本次发送记录',
    ],
  },
  {
    n: 6,
    title:  '激活后监控',
    detail: 'Meta API 有速率限制并可能返回错误，请持续监控。',
    items: [
      '监控 /ops/health 上的 API 错误率',
      '为 /audit 日志中的 FAILED 发送事件配置告警',
      '在 Meta Business Manager 中检查消息投递报告',
      '提示：Meta 按会话计费 — 通过 /billing/usage-summary 跟踪用量',
      'Meta 费用不打包到 Omni 套餐 — 按透传 credits 计费',
    ],
  },
]

const ROLLBACK_STEPS = [
  '在 .env 中设置 OMNI_ALLOW_WA_SESSION=false 或 OMNI_ENABLE_REAL_META_SEND=false',
  '重启 API 服务',
  '确认 /activation/health 返回 realSendCurrentlyOff: true',
  '验证不再发送真实消息（检查 /audit 日志）',
  '若为 WA Web：通过 /channels/setup/wa-web/disconnect 断开会话',
  '在重新激活前定位根因',
  '撰写事件报告，记录时间线与待办',
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
        <strong>安全第一：</strong>Omni 是 WhatsApp AI 客服 + CRM + 自动跟进系统，不是广播或广告平台。所有套餐均不支持群发、营销 blast 与广告。真实发送仅用于 1:1 客户服务对话。
      </div>

      {/* Preflight status panel */}
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: preflight ? '0.875rem' : 0 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827' }}>上线前检查状态</div>
            <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: 2 }}>
              {authed ? '来自 /activation/preflight 的实时检查' : '登录后查看实时状态'}
            </div>
          </div>
          {authed && (
            <button onClick={loadPreflight} disabled={pfLoading} style={{ padding: '0.375rem 0.875rem', background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8125rem' }}>
              {pfLoading ? '检查中…' : '运行上线前检查'}
            </button>
          )}
        </div>
        {preflight && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <Pill label="就绪度" value={String(preflight.readiness ?? '—')} color={String(preflight.readiness) === 'BLOCKED' ? DANGER : String(preflight.readiness).startsWith('READY') ? SUCCESS : WARN_COLOR} />
            <Pill label="关键阻塞" value={String((preflight.summary as Record<string, unknown>)?.critical ?? 0)} color={(preflight.summary as Record<string, unknown>)?.critical === 0 ? SUCCESS : DANGER} />
            <Pill label="通过项" value={`${(preflight.summary as Record<string, unknown>)?.passed ?? 0}/${(preflight.summary as Record<string, unknown>)?.total ?? 0}`} color={ACCENT} />
            <Pill label="真实发送" value={String((preflight.currentFlags as Record<string, unknown>)?.realSendCurrentlyOff) === 'true' ? '关闭 ✓' : '开启 ⚠'} color={String((preflight.currentFlags as Record<string, unknown>)?.realSendCurrentlyOff) === 'true' ? SUCCESS : WARN_COLOR} />
          </div>
        )}
        {preflight && !!preflight.nextAction && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: '#374151', background: '#fff', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid #e5e7eb' }}>
            下一步：{String(preflight.nextAction)}
          </div>
        )}
      </div>

      {/* Before activation */}
      <Section title="激活前准备（两条路径通用）" accent={ACCENT}>
        {BEFORE_STEPS.map(step => <StepCard key={step.n} step={step} />)}
      </Section>

      {/* Path selection */}
      <Section title="选择您的激活路径" accent={ACCENT}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <PathCard
            id="wa-web"
            selected={path === 'wa-web'}
            onSelect={() => setPath(p => p === 'wa-web' ? null : 'wa-web')}
            title="普通 WhatsApp / WA Web"
            icon="WA"
            badge="稳定性尽力而为"
            badgeColor={WARN_COLOR}
            badgeBg="#fffbeb"
            desc="通过扫码连接真实 WhatsApp 账号，配置简单但会话可能断线。适合测试或小规模运营。"
          />
          <PathCard
            id="meta"
            selected={path === 'meta'}
            onSelect={() => setPath(p => p === 'meta' ? null : 'meta')}
            title="Meta WhatsApp 商业平台"
            icon="API"
            badge="生产推荐"
            badgeColor={SUCCESS}
            badgeBg="#f0fdf4"
            desc="Meta 官方商业 API，需 WABA 审批、系统用户 token 与 webhook 配置，稳定性更高，并有官方 SLA。"
          />
        </div>
      </Section>

      {/* WA Web path */}
      {path === 'wa-web' && (
        <Section title="WhatsApp Web 激活步骤" accent={WARN_COLOR}>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', color: WARN_COLOR, fontSize: '0.875rem' }}>
            <strong>WhatsApp Web 稳定性提示：</strong>普通 WhatsApp（WA Web）会话稳定性按 WhatsApp 服务条款属于「尽力而为」，WhatsApp 可能随时断开会话。请预先规划重连方案。如需 SLA 保障的生产环境，请改用 Meta WhatsApp 商业平台。
          </div>
          {WA_WEB_STEPS.map(step => <StepCard key={step.n} step={step} />)}
        </Section>
      )}

      {/* Meta path */}
      {path === 'meta' && (
        <Section title="Meta WhatsApp 商业平台激活步骤" accent={SUCCESS}>
          {META_STEPS.map(step => <StepCard key={step.n} step={step} />)}
        </Section>
      )}

      {/* Rollback */}
      <Section title="回滚预案" accent={DANGER}>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.875rem' }}>
          若激活后出现异常，请按以下步骤安全回退到演示 / 安全演练模式：
        </p>
        <ol style={{ margin: 0, padding: '0 0 0 1.25rem', lineHeight: 1.8 }}>
          {ROLLBACK_STEPS.map((step, i) => (
            <li key={i} style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.375rem' }}>{step}</li>
          ))}
        </ol>
      </Section>

      {/* Post-activation monitoring */}
      <Section title="激活后监控" accent={SUCCESS}>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.875rem' }}>
          激活后需定期检查以下监控点：
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {POST_MONITORING.map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.875rem', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{item.label}</span>
                <span style={{ fontSize: '0.8125rem', color: '#6b7280', marginLeft: '0.5rem' }}>{item.detail}</span>
              </div>
              <a href={item.href} style={{ color: ACCENT, fontSize: '0.8125rem', textDecoration: 'none' }}>打开 →</a>
            </div>
          ))}
        </div>
      </Section>

      {/* API quick reference */}
      <Section title="激活 API 速查" accent="#374151">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
          {[
            { method: 'GET',  path: '/activation/preflight',      desc: '运行上线前就绪检查' },
            { method: 'POST', path: '/activation/dry-run',        desc: '模拟激活 — 不会启用真实发送' },
            { method: 'GET',  path: '/activation/health',         desc: '激活后安全标志与渠道健康度' },
            { method: 'GET',  path: '/release-checklist/status',  desc: 'SaaS v1 发布就绪度' },
            { method: 'GET',  path: '/production-qa/checklist',   desc: '完整生产 QA 清单' },
            { method: 'GET',  path: '/audit/logs',                desc: '管理动作审计轨迹' },
            { method: 'GET',  path: '/ops/health',                desc: 'API + DB + Redis 健康检查' },
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
        <a href="/activation/monitoring" style={{ color: ACCENT }}>激活监控</a> ·{' '}
        <a href="/release-checklist" style={{ color: ACCENT }}>发布检查清单</a> ·{' '}
        <a href="/ops/runbook" style={{ color: ACCENT }}>运维手册</a> ·{' '}
        <a href="/audit" style={{ color: ACCENT }}>审计日志</a>
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
