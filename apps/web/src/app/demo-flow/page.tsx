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
    title:    '上线向导',
    subtitle: '配置公司资料、AI 目标，并生成起始 AI 人设',
    href:     '/onboarding',
    icon:     '1',
    badge:    '从这里开始',
    tasks: [
      '填写公司名称、行业与营业时间',
      '选择 AI 目标（获客 / 跟进 / 客户服务）',
      '粘贴产品 / 服务资料',
      '预览 AI 人设与欢迎语',
      '点击启用以激活 AI 配置',
    ],
  },
  {
    step: 2,
    title:    '知识库',
    subtitle: '检查并管理 AI 会使用的 FAQ 与产品知识',
    href:     '/knowledge',
    icon:     '2',
    tasks: [
      '检查自动生成的 FAQ 条目',
      '补充产品专属问答',
      '验证中文 / 英文 / 马来文多语言支持',
      '按需启用 / 停用条目',
    ],
  },
  {
    step: 3,
    title:    '渠道设置',
    subtitle: '配置 WhatsApp 渠道（演示模式 — 不会触发真实连接）',
    href:     '/channels/setup',
    icon:     '3',
    badge:    '仅安全演练',
    tasks: [
      '选择渠道类型：WhatsApp Web 或 Meta 商业 API',
      '填写显示名称与渠道草稿',
      '运行安全演练（不会真实连接 WhatsApp）',
      '确认 realWaSessionEnabled=false、realMetaSendEnabled=false',
      '检查安全门控 — 默认全部关闭',
    ],
  },
  {
    step: 4,
    title:    '对话收件箱',
    subtitle: 'AI 对话流程与 CRM 操作',
    href:     '/inbox',
    icon:     '4',
    tasks: [
      '查看客户开放中的对话',
      '区分 AI 处理与人工处理的会话',
      '将 AI 处理的对话切换到人工接管',
      '推动客户阶段：INTERESTED → HIGH_INTENT → QUOTED → BOOKED',
      '发送手动回复（演示模式 WhatsApp 不会真实发送）',
    ],
  },
  {
    step: 5,
    title:    '老板工作台',
    subtitle: '今日重点、成交管道与业务健康度一览',
    href:     '/boss',
    icon:     '5',
    tasks: [
      '检查今日开放对话与高意向客户',
      '查看今日到期的跟进任务',
      '对比 AI 回复量与人工接管次数',
      '查看客户阶段管道',
      '确认未发送任何真实 WhatsApp 消息',
    ],
  },
  {
    step: 6,
    title:    '手机工作台（PWA）',
    subtitle: '销售移动端工作流 — 建议添加到主屏幕以获得最佳体验',
    href:     '/pwa',
    icon:     '6',
    tasks: [
      '在手机浏览器打开并「添加到主屏幕」',
      '检查手机端收件箱视图',
      '测试推送通知设置（演示模式）',
      '确认移动端客户卡片显示',
    ],
  },
  {
    step: 7,
    title:    '套餐与计费',
    subtitle: '套餐选择与用量摘要（演示模式无真实扣费）',
    href:     '/billing',
    icon:     '7',
    badge:    '无真实扣费',
    tasks: [
      '检查 Starter / Pro / Business 套餐功能',
      '注意：Meta API 按会话费用不打包 — 按透传 credits 计费',
      '注意：所有套餐均不支持广播 / 广告 / 群发',
      '选择套餐草稿（仅为偏好，未配置支付）',
      '检查用量摘要',
    ],
  },
  {
    step: 8,
    title:    '生产 QA 与上线清单',
    subtitle: '正式激活前确认就绪',
    href:     '/production-qa',
    icon:     '8',
    tasks: [
      '检查所有 通过 / 警告 / 失败 / 人工 项',
      '确认安全门控：真实发送关闭',
      '确认凭据保险库已配置（或标记为警告）',
      '检查团队、知识库、渠道、计费各项',
      '检查审计日志就绪度',
      '参考 /ops/runbook 完成备份与监控步骤',
    ],
  },
  {
    step: 9,
    title:    '审计日志与运维手册',
    subtitle: '管理动作轨迹与生产运维参考',
    href:     '/audit',
    icon:     '9',
    tasks: [
      '在 /audit 查看管理动作时间线',
      '关注 TEAM_INVITE_DRAFT、BILLING_PLAN_SELECTED、SETTINGS_PROFILE_UPDATE 事件',
      '确认审计日志元数据中不含密钥',
      '参考 /ops/runbook：健康检查、备份、监控、事件响应',
      '确认数据按租户隔离，无跨租户泄漏',
    ],
  },
]

const SAFETY_BADGES = [
  { label: '不会真实发送 WhatsApp',  color: '#15803d', bg: '#f0fdf4' },
  { label: '不调用 Meta API',         color: '#1e40af', bg: '#eff6ff' },
  { label: '不调用真实 AI 服务商',     color: '#7c3aed', bg: '#f5f3ff' },
  { label: '无真实支付',              color: '#b45309', bg: '#fffbeb' },
  { label: '演示 / 预演环境安全',     color: '#0f766e', bg: '#f0fdfa' },
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
              🎯 Omni SaaS v1 — 演示流程
            </h1>
            <p style={{ margin: '0.375rem 0 0', color: '#6b7280', fontSize: '0.9375rem', lineHeight: 1.5 }}>
              引导式产品演示与内部 QA 演练。完整走完 <strong>WhatsApp AI 客服 + CRM + 自动跟进 + 成交转化</strong> 的产品旅程。
            </p>
          </div>
          <a href="/release-checklist" style={{ padding: '0.4375rem 0.875rem', background: '#6366f1', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
            发布检查清单 →
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
            <span>演示进度</span>
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
