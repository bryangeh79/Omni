'use client'

import { useEffect, useState } from 'react'
import { getToken, login, adminCreateTenant, type ServiceStatus } from '@/lib/api'

const PLAN_OPTIONS = [
  { value: 'trial',    label: '试用版' },
  { value: 'starter',  label: 'Starter 基础版' },
  { value: 'pro',      label: 'Pro 成长版' },
  { value: 'business', label: 'Business 企业版' },
]
const STATUS_OPTIONS: ServiceStatus[] = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'EXPIRED', 'CANCELLED']
const STATUS_LABEL: Record<ServiceStatus, string> = {
  TRIAL: '试用中', ACTIVE: '正常服务', PAST_DUE: '已逾期',
  SUSPENDED: '已暂停', EXPIRED: '已到期', CANCELLED: '已取消',
}

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [slug, setSlug] = useState(''); const [email, setEmail] = useState(''); const [pass, setPass] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await login(slug, email, pass); onLogin() } catch (ex) { setErr(ex instanceof Error ? ex.message : '登录失败') } finally { setBusy(false) }
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-gray-900 text-center">创建租户 · SaaS Admin</h1>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="租户标识（可选 · 高级登录）" value={slug} onChange={e => setSlug(e.target.value)} />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  )
}

export default function AdminCreateTenantPage() {
  const [authed,   setAuthed]   = useState<boolean | null>(null)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')
  const [result,   setResult]   = useState<null | { tenantId: string; tenantSlug: string; plan: string; serviceStatus: ServiceStatus; contractEndAt: string | null; licenseCode: string; loginEmail: string; temporaryPassword: string; note: string }>(null)

  // Form state
  const [name,        setName]        = useState('')
  const [slug,        setSlug]        = useState('')
  const [ownerName,   setOwnerName]   = useState('')
  const [ownerEmail,  setOwnerEmail]  = useState('')
  const [plan,        setPlan]        = useState('starter')
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('TRIAL')
  const [contractStartAt, setContractStartAt] = useState(new Date().toISOString().slice(0, 10))
  const [contractEndAt,   setContractEndAt]   = useState('')
  const [licenseCode, setLicenseCode] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [genPwd,      setGenPwd]      = useState(true)
  const [tempPwd,     setTempPwd]     = useState('')

  useEffect(() => {
    setAuthed(!!getToken())
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setResult(null)
    try {
      const r = await adminCreateTenant({
        name, slug, ownerName, ownerEmail,
        plan, serviceStatus,
        contractStartAt: contractStartAt || undefined,
        contractEndAt:   contractEndAt   || undefined,
        licenseCode:     licenseCode     || undefined,
        internalNotes:   internalNotes   || undefined,
        generateTemporaryPassword: genPwd,
        temporaryPassword:         genPwd ? undefined : tempPwd,
      })
      setResult(r)
    } catch (e) { setError(e instanceof Error ? e.message : '创建失败') }
    finally { setBusy(false) }
  }

  if (authed === null) return null
  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  if (result) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100 px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <h1 className="text-base font-semibold text-gray-900">租户已创建</h1>
            <a href="/admin/tenants" className="text-xs text-blue-600 hover:text-blue-700">← 返回租户列表</a>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-bold text-emerald-800">发送给客户的登录资料（仅显示一次）</h2>
            <div className="bg-white rounded-xl p-4 space-y-2 text-sm font-mono">
              <div><span className="text-gray-500">租户标识：</span>{result.tenantSlug}</div>
              <div><span className="text-gray-500">登录邮箱：</span>{result.loginEmail}</div>
              <div><span className="text-gray-500">临时密码：</span><strong className="text-red-700">{result.temporaryPassword}</strong></div>
              <div><span className="text-gray-500">套餐：</span>{result.plan}</div>
              <div><span className="text-gray-500">服务状态：</span>{result.serviceStatus}</div>
              <div><span className="text-gray-500">合约到期：</span>{result.contractEndAt ? new Date(result.contractEndAt).toLocaleDateString('zh-CN') : '—'}</div>
              <div><span className="text-gray-500">授权码：</span>{result.licenseCode}</div>
            </div>
            <p className="text-xs text-emerald-700">{result.note}</p>
            <button onClick={() => { setResult(null); setName(''); setSlug(''); setOwnerName(''); setOwnerEmail(''); setTempPwd(''); setLicenseCode(''); setInternalNotes('') }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-semibold">继续创建下一个</button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-base font-semibold text-gray-900">创建租户 · SaaS Admin</h1>
          <a href="/admin/tenants" className="text-xs text-gray-500 hover:text-gray-700">← 返回租户列表</a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-800">
          <p><strong>SaaS Admin 内部工具：</strong>由 SaaS Admin 在签约 / 收款 / 审核后为客户创建租户账号；不会自动发邮件，不会触发真实付款。临时密码在创建成功页面仅显示一次 — 请手动发给客户。</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}

        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">公司名称 *</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" required value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">租户标识（slug）*</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" required value={slug} onChange={e => setSlug(e.target.value)} placeholder="3-40 字符 a-z0-9-" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Owner 姓名 *</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" required value={ownerName} onChange={e => setOwnerName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Owner 邮箱 *</label>
              <input type="email" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" required value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">套餐</label>
              <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={plan} onChange={e => setPlan(e.target.value)}>
                {PLAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">服务状态</label>
              <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={serviceStatus} onChange={e => setServiceStatus(e.target.value as ServiceStatus)}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">合约开始日期</label>
              <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={contractStartAt} onChange={e => setContractStartAt(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">合约到期日期</label>
              <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={contractEndAt} onChange={e => setContractEndAt(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-600 block mb-1">授权码 / 合约编号（选填，自动生成）</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={licenseCode} onChange={e => setLicenseCode(e.target.value)} placeholder="留空自动生成 OMNI-{PLAN}-{YYYY}-{NNNNN}" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-600 block mb-1">内部备注（仅 SaaS Admin 可见）</label>
              <textarea rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" value={internalNotes} onChange={e => setInternalNotes(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-600 block mb-1">临时密码</label>
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-700"><input type="checkbox" className="mr-1.5" checked={genPwd} onChange={e => setGenPwd(e.target.checked)} />自动生成 12 字符临时密码</label>
                <input className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50" disabled={genPwd} value={tempPwd} onChange={e => setTempPwd(e.target.value)} placeholder={genPwd ? '系统生成 (≥8 字符)' : '输入临时密码 (≥8 字符)'} />
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
            提示：创建成功后临时密码仅显示一次。请手动复制并发送给客户，并提示客户首次登录后立即修改密码。系统不会发送真实邮件、不会触发真实付款。
          </div>

          <button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '创建中…' : '创建租户'}</button>
        </form>
      </main>
    </div>
  )
}
