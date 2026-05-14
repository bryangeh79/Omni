'use client'

import { useEffect, useState } from 'react'
import { getToken, login, fetchSettingsOverview, updateCompanyProfile, fetchQuotaSummary, setAiSmartReply, type SettingsOverview, type QuotaSummary } from '@/lib/api'
import { actorRoleLabel, channelTypeLabel, channelSetupStatusLabel, credentialStatusLabel, planLabel } from '@/lib/enumLabels'

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [slug, setSlug] = useState(''); const [email, setEmail] = useState(''); const [pass, setPass] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await login(slug, email, pass); onLogin() }
    catch (ex) { setErr(ex instanceof Error ? ex.message : '登录失败') }
    finally { setBusy(false) }
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-slate-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-700 mb-3"><span className="text-white text-xl">⚙️</span></div>
          <h1 className="text-2xl font-bold text-gray-900">设置</h1>
          <p className="text-sm text-gray-400 mt-1">Sign in to manage your account</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400" placeholder="租户标识" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-400" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-slate-700 hover:bg-slate-800 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const [authed,  setAuthed]  = useState<boolean | null>(null)
  const [overview, setOverview] = useState<SettingsOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [notice,  setNotice]  = useState('')
  const [error,   setError]   = useState('')
  // Edit state
  const [companyName,   setCompanyName]   = useState('')
  const [businessHours, setBusinessHours] = useState('')
  const [editing,       setEditing]       = useState(false)
  // Round-9A: AI Smart Reply
  const [quota,            setQuota]            = useState<QuotaSummary | null>(null)
  const [togglingSmartReply, setTogglingSmartReply] = useState(false)

  useEffect(() => {
    if (getToken()) { setAuthed(true); void load() }
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [o, q] = await Promise.all([fetchSettingsOverview(), fetchQuotaSummary().catch(() => null)])
      setOverview(o)
      setCompanyName(o.onboarding.companyName ?? '')
      setBusinessHours(o.onboarding.businessHours ?? '')
      if (q) setQuota(q)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  async function handleToggleSmartReply(next: boolean) {
    setTogglingSmartReply(true); setError(''); setNotice('')
    try {
      const res = await setAiSmartReply(next)
      setQuota(q => q ? { ...q, aiSmartReplyEnabled: res.aiSmartReplyEnabled } : q)
      setNotice(`AI 智能回复已${res.aiSmartReplyEnabled ? '开启' : '关闭'}`); setTimeout(() => setNotice(''), 3000)
    } catch (e) { setError(e instanceof Error ? e.message : '切换失败') }
    finally { setTogglingSmartReply(false) }
  }

  async function handleSaveProfile() {
    setSaving(true); setError('')
    try {
      await updateCompanyProfile({ companyName, businessHours })
      setNotice('资料已保存'); setTimeout(() => setNotice(''), 3000)
      setEditing(false); await load()
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败') }
    finally { setSaving(false) }
  }

  if (authed === null) return null

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  const o = overview

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-700 rounded-xl flex items-center justify-center"><span className="text-white text-xs font-bold">⚙</span></div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">设置</h1>
              <p className="text-xs text-gray-400" title={o?.company.plan ?? ''}>{o?.company.name ?? '加载中…'} · {planLabel(o?.company.plan ?? 'trial')}</p>
            </div>
          </div>
          <nav className="flex items-center gap-2 text-xs flex-wrap">
            <a href="/boss" className="text-gray-500 hover:text-gray-700">工作台</a>
            <span className="text-gray-200">|</span>
            <a href="/team" className="text-indigo-600 hover:text-indigo-800">团队</a>
            <span className="text-gray-200">|</span>
            <a href="/billing" className="text-blue-600 hover:text-blue-700">套餐与计费</a>
            <span className="text-gray-200">|</span>
            <a href="/production-qa" className="text-emerald-600 hover:text-emerald-800">QA 清单</a>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        {error  && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}
        {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-5 py-3 text-sm">{notice}</div>}

        {loading && !o ? (
          <div className="text-center py-16 text-gray-400"><p className="text-sm">正在加载设置…</p></div>
        ) : o ? (
          <>
            {/* Company Profile */}
            <Section title="公司资料">
              {!editing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: '公司名称',   value: o.onboarding.companyName ?? '—' },
                      { label: '行业',       value: o.onboarding.industry ?? '—' },
                      { label: '营业时间',   value: o.onboarding.businessHours ?? '—' },
                      { label: '套餐',       value: planLabel(o.company.plan) },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-gray-50 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-400">{label}</p>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setEditing(true)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl">编辑资料</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">公司名称</label>
                      <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400" value={companyName} onChange={e => setCompanyName(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">营业时间</label>
                      <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400" value={businessHours} onChange={e => setBusinessHours(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { void handleSaveProfile() }} disabled={saving} className="bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-xl disabled:opacity-50">{saving ? '保存中…' : '保存'}</button>
                    <button onClick={() => setEditing(false)} className="bg-gray-100 text-gray-600 text-xs px-4 py-2 rounded-xl">取消</button>
                  </div>
                </div>
              )}
            </Section>

            {/* AI & Onboarding */}
            <Section title="AI 配置">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '上线向导',  value: o.onboarding.status ?? '未开始' },
                  { label: 'AI 目标',   value: `已选 ${o.onboarding.goalsCount} 项` },
                  { label: '预览',      value: o.onboarding.hasPreview ? '已生成' : '未生成' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl px-3 py-2">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              <a href="/onboarding" className="inline-block mt-3 text-xs text-blue-600 hover:text-blue-800">更新 AI 配置 →</a>
            </Section>

            {/* Round-9A: AI Smart Reply toggle */}
            {quota && (
              <Section title="AI 智能回复">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">
                      当前状态：<span className={`font-semibold ${quota.aiSmartReplyEnabled ? 'text-emerald-700' : 'text-gray-500'}`}>{quota.aiSmartReplyEnabled ? '已开启' : '已关闭'}</span>
                    </p>
                    <ul className="mt-1.5 space-y-0.5 text-[11px] text-gray-600 leading-relaxed">
                      <li>• <strong>开启时</strong>：仅在 AI 生成被实际调用时扣 1 条 AI 回复配额。</li>
                      <li>• <strong>关闭时</strong>：匹配到 FAQ 直接发送 — 不调用 AI，不扣配额。</li>
                      <li>• 人工回复、固定模板、安全回退均不扣 AI 回复配额。</li>
                      <li>• Meta 官方 WhatsApp API 费用为 pass-through，不包含在套餐内。</li>
                    </ul>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleToggleSmartReply(true)}  disabled={togglingSmartReply || quota.aiSmartReplyEnabled}   title="开启 AI 智能回复"  aria-label="开启 AI 智能回复"  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${quota.aiSmartReplyEnabled ? 'bg-emerald-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'} disabled:opacity-60`}>开启</button>
                    <button onClick={() => handleToggleSmartReply(false)} disabled={togglingSmartReply || !quota.aiSmartReplyEnabled} title="关闭 AI 智能回复" aria-label="关闭 AI 智能回复" className={`px-3 py-1.5 rounded-lg text-xs font-medium ${!quota.aiSmartReplyEnabled ? 'bg-gray-700 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'} disabled:opacity-60`}>关闭</button>
                  </div>
                </div>
              </Section>
            )}

            {/* Knowledge Base */}
            <Section title="知识库">
              <div className="flex items-center gap-4">
                <div className="bg-purple-50 rounded-xl px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-purple-700">{o.knowledgeBase.activeItems}</p>
                  <p className="text-xs text-purple-500">启用条目</p>
                </div>
                <div>
                  <p className={`text-sm font-semibold ${o.knowledgeBase.ready ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {o.knowledgeBase.ready ? '● 已就绪' : '● 暂无条目 — 请添加产品 / 服务资料'}
                  </p>
                  <a href="/knowledge" className="text-xs text-blue-600 hover:text-blue-800 mt-1 block">管理知识库 →</a>
                </div>
              </div>
            </Section>

            {/* Channel */}
            <Section title="渠道设置">
              <div className="grid grid-cols-3 gap-3 mb-3">
                {[
                  { label: '类型',   value: o.channel.type ? channelTypeLabel(o.channel.type) : '—' },
                  { label: '状态',   value: channelSetupStatusLabel(o.channel.setupStatus) },
                  { label: '凭据',   value: credentialStatusLabel(o.channel.credentialStatus) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl px-3 py-2">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              <a href="/channels/setup" className="text-xs text-blue-600 hover:text-blue-800">渠道设置 →</a>
              {' · '}
              <a href="/launch-checklist" className="text-xs text-emerald-600 hover:text-emerald-800">上线清单 →</a>
            </Section>

            {/* Safety */}
            <Section title="安全状态">
              <div className="grid grid-cols-3 gap-3 mb-3">
                {[
                  { label: 'WhatsApp 会话', value: o.safety.waSessionAllowed ? '已启用' : '已关闭', warn: o.safety.waSessionAllowed },
                  { label: 'Meta 发送',     value: o.safety.metaSendAllowed  ? '已启用' : '已关闭', warn: o.safety.metaSendAllowed },
                  { label: '真实发送',      value: o.safety.realSendEnabled  ? '已启用' : '已关闭', warn: o.safety.realSendEnabled },
                ].map(({ label, value, warn }) => (
                  <div key={label} className={`rounded-xl px-3 py-2 ${warn ? 'bg-red-50' : 'bg-emerald-50'}`}>
                    <p className={`text-xs ${warn ? 'text-red-400' : 'text-emerald-400'}`}>{label}</p>
                    <p className={`text-sm font-bold mt-0.5 ${warn ? 'text-red-700' : 'text-emerald-700'}`}>{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">真实发送相关开关默认关闭，需运维显式启用才能正式上线。</p>
            </Section>

            {/* Team */}
            <Section title="团队">
              <p className="text-sm text-gray-600 mb-2">{o.team.userCount} 名活跃成员</p>
              <div className="space-y-1.5">
                {o.team.users.slice(0, 5).map(u => (
                  <div key={u.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                    <div className="w-7 h-7 bg-slate-200 rounded-full flex items-center justify-center text-xs font-bold text-slate-600">{(u.name?.[0] ?? u.email[0]).toUpperCase()}</div>
                    <div><p className="text-xs font-medium text-gray-800">{u.name ?? u.email}</p><p className="text-xs text-gray-400">{actorRoleLabel(u.role)}</p></div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">{o.team.rbacNote}</p>
            </Section>

            {/* Quick Links */}
            <Section title="快速链接">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(o.links).map(([key, href]) => (
                  <a key={key} href={href} className="text-xs bg-gray-50 border border-gray-200 text-gray-700 px-3 py-2 rounded-xl hover:border-slate-400 hover:bg-slate-50 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </a>
                ))}
              </div>
            </Section>
          </>
        ) : null}
      </main>
    </div>
  )
}
