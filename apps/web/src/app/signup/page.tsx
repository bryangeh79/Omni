'use client'
// Tenant Self-service Signup — Phase 17A
// Let operators/customers create a new Omni tenant account.
// No real WhatsApp/Meta/email/payment calls made.

import { useState, useEffect } from 'react'
import { setToken } from '@/lib/api'
import { toChineseError } from '@/lib/errorText'

const API_BASE   = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:43111'
const ACCENT     = '#6366f1'
const SUCCESS    = '#15803d'
const DANGER     = '#b91c1c'
const NEUTRAL    = '#6b7280'

// Round-9E: aligned with /onboarding broader industry list (UAT feedback).
const INDUSTRIES = [
  { value: 'saas',             label: 'SaaS / 软件服务' },
  { value: 'software-dev',     label: '软件开发' },
  { value: 'ai-chatbot',       label: 'AI Chatbot' },
  { value: 'automation',       label: '自动化系统' },
  { value: 'digital-marketing',label: '数码营销' },
  { value: 'retail',           label: '零售 / 电商' },
  { value: 'education',        label: '教育培训' },
  { value: 'real-estate',      label: '房地产 / 物业' },
  { value: 'automotive',       label: '汽车销售' },
  { value: 'beauty-wellness',  label: '美容 / 医美' },
  { value: 'food-beverage',    label: '餐饮' },
  { value: 'travel',           label: '旅游' },
  { value: 'insurance',        label: '保险' },
  { value: 'finance',          label: '金融服务' },
  { value: 'legal',            label: '法律服务' },
  { value: 'repair',           label: '维修服务' },
  { value: 'home-services',    label: '家政服务' },
  { value: 'wholesale',        label: '批发 / 零售' },
  { value: 'logistics',        label: '物流 / 运输' },
  { value: 'healthcare',       label: '医疗 / 健康' },
  { value: 'fitness',          label: '健身 / 运动' },
  { value: 'events',           label: '活动策划' },
  { value: 'other',            label: '其他 / 通用业务' },
]

const GOALS = [
  { value: 'sales',          label: '引导成交（潜客转化）' },
  { value: 'appointment',    label: '引导预约（约见 / 会议）' },
  { value: 'support',        label: '客户支持与售后' },
  { value: 'qualification',  label: '售前资格筛选' },
  { value: 'demo',           label: '安排演示 / 免费试用' },
  { value: 'other',          label: '其他' },
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
        const rawMsg = String(body.error ?? `HTTP ${res.status}`)
        const msg = toChineseError(rawMsg, '注册失败，请稍后再试')
        if (body.suggestion) setError(`${msg} — 建议：${body.suggestion}`)
        else setError(msg)
        return
      }
      // Store access token (same as login)
      if (body.accessToken) setToken(body.accessToken)
      setSuccess(body)
      // Auto-redirect to onboarding after brief pause
      setTimeout(() => { window.location.href = body.nextRoute ?? '/onboarding' }, 1800)
    } catch (err) {
      setError(toChineseError(err, '注册失败，请稍后再试'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{ fontFamily: 'system-ui', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', maxWidth: 440, padding: '2rem' }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 1rem', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: SUCCESS, fontSize: '1.75rem', fontWeight: 700 }}>✓</span>
          </div>
          <h2 style={{ color: SUCCESS, fontSize: '1.375rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            账号创建成功！
          </h2>
          <p style={{ color: NEUTRAL, marginBottom: '0.875rem', lineHeight: 1.6 }}>
            欢迎使用 Omni！您的租户 <strong>{success.slug}</strong> 已就绪。<br />
            即将跳转到上线向导…
          </p>
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '0.75rem 1rem', color: SUCCESS, fontSize: '0.875rem', marginBottom: '1rem' }}>
            真实 WhatsApp 发送默认<strong>关闭</strong>。<br />
            正式上线前请先按「上线激活指南」完成所有检查。
          </div>
          <a href="/onboarding" style={{ display: 'inline-block', padding: '0.625rem 1.5rem', background: ACCENT, color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>
            继续设置 →
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
          Omni
        </div>
        <div style={{ fontSize: '1rem', color: NEUTRAL, lineHeight: 1.5 }}>
          WhatsApp AI 客服 · CRM · 自动跟进 · 成交转化
        </div>
        <div style={{ fontSize: '0.8125rem', color: '#9ca3af', marginTop: '0.25rem' }}>
          不是广播 / 广告 / 群发平台 — 仅提供 1:1 AI 客服
        </div>
      </div>

      {/* Form card */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '2rem', width: '100%', maxWidth: 480 }}>
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '0.625rem 0.875rem', marginBottom: '1rem', fontSize: '0.8125rem', color: '#92400e' }}>
          <strong>SaaS Admin 内部 / 测试入口：</strong>此页面用于 SaaS Admin 创建租户测试账号 / 内部开通，**不是普通租户日常功能**。正常租户由 SaaS Admin 在 <a href="/admin/tenants/new" style={{ color: '#92400e', textDecoration: 'underline' }}>租户管理 → 创建租户</a> 中创建后获得登录资料。
        </div>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
          创建您的 Omni 账号
        </h2>
        <p style={{ margin: '0 0 1.5rem', color: NEUTRAL, fontSize: '0.875rem' }}>
          只需几分钟即可搭建您的 WhatsApp AI 客服系统。
        </p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.625rem 0.875rem', color: DANGER, fontSize: '0.875rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Business name */}
          <FormField label="商家名称" required>
            <input
              type="text" required minLength={2} maxLength={120}
              value={form.businessName}
              onChange={e => handleField('businessName', e.target.value)}
              placeholder="例如：阳光地产"
              style={inputCss}
            />
          </FormField>

          {/* Tenant slug */}
          <FormField label="账号标识（slug）" required hint="用于登录。仅允许小写字母、数字与短横线。">
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text" required minLength={3} maxLength={40}
                value={form.slug}
                onChange={e => handleField('slug', slugify(e.target.value))}
                placeholder="例如：sunrise-property"
                style={{ ...inputCss, fontFamily: 'monospace', flex: 1 }}
              />
            </div>
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {/* Owner name */}
            <FormField label="您的姓名" required>
              <input
                type="text" required minLength={2}
                value={form.ownerName}
                onChange={e => handleField('ownerName', e.target.value)}
                placeholder="全名"
                style={inputCss}
              />
            </FormField>
            {/* Owner email */}
            <FormField label="邮箱地址" required>
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
          <FormField label="密码" required hint="至少 8 位字符">
            <div style={{ position: 'relative' }}>
              <input
                type={pwVisible ? 'text' : 'password'} required minLength={8}
                value={form.password}
                onChange={e => handleField('password', e.target.value)}
                placeholder="至少 8 位字符"
                style={{ ...inputCss, paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setPwVisible(v => !v)}
                style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: NEUTRAL, fontSize: '0.75rem' }}
              >
                {pwVisible ? '隐藏' : '显示'}
              </button>
            </div>
          </FormField>

          {/* Industry */}
          <FormField label="所属行业">
            <select value={form.industry} onChange={e => handleField('industry', e.target.value)} style={inputCss}>
              {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </FormField>

          {/* Channel preference */}
          <FormField label="WhatsApp 接入方式">
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {[
                { value: 'WA_WEB', label: '普通 WhatsApp / WhatsApp Web', note: '扫码接入，稳定性尽力而为' },
                { value: 'META_WA_BUSINESS', label: 'Meta WhatsApp Business 官方 API', note: '官方 API，生产级稳定性' },
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
          <FormField label="主要使用目标">
            <select value={form.primaryGoal} onChange={e => handleField('primaryGoal', e.target.value)} style={inputCss}>
              {GOALS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </FormField>

          {/* Safety notice */}
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.8125rem', color: NEUTRAL, marginBottom: '1.25rem', lineHeight: 1.5 }}>
            <strong>提示：</strong>真实 WhatsApp 发送默认关闭，需完成「上线激活指南」后方可发送消息。本平台仅提供 1:1 AI 客服，<strong>不支持广播、广告或群发</strong>。注册阶段不会发送真实邮件（邮件验证为占位实现）。
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '0.75rem', background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? '正在创建账号…' : '创建账号'}
          </button>
        </form>

        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.875rem', color: NEUTRAL }}>
          已有账号？{' '}
          <a href="/inbox" style={{ color: ACCENT, textDecoration: 'none', fontWeight: 600 }}>登录</a>
        </div>
      </div>

      {/* Bottom note */}
      <div style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', maxWidth: 480 }}>
        创建账号即表示您理解 Omni 仅提供 WhatsApp AI 客服工具；所有套餐均不支持广播、广告或群发。
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
