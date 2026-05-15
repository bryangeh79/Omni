'use client'

import { useEffect, useState } from 'react'
import {
  getToken, login,
  adminListTenants, adminUpdateTenantServiceStatus, adminUpdateTenantContract, adminResetTenantPasswordStub,
  type AdminTenantRow, type ServiceStatus,
} from '@/lib/api'

const STATUS_STYLE: Record<ServiceStatus, string> = {
  TRIAL:     'bg-blue-100 text-blue-700',
  ACTIVE:    'bg-emerald-100 text-emerald-700',
  PAST_DUE:  'bg-amber-100 text-amber-700',
  SUSPENDED: 'bg-orange-100 text-orange-700',
  EXPIRED:   'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-200 text-gray-600',
}
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
        <h1 className="text-xl font-bold text-gray-900 text-center">租户管理（SaaS Admin）</h1>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="租户标识（可选 · 高级登录）" value={slug} onChange={e => setSlug(e.target.value)} />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  )
}

export default function AdminTenantsPage() {
  const [authed,   setAuthed]   = useState<boolean | null>(null)
  const [tenants,  setTenants]  = useState<AdminTenantRow[]>([])
  const [loading,  setLoading]  = useState(false)
  const [q,        setQ]        = useState('')
  const [filter,   setFilter]   = useState<'' | ServiceStatus>('')
  const [error,    setError]    = useState('')
  const [notice,   setNotice]   = useState('')

  useEffect(() => {
    if (getToken()) { setAuthed(true); void load() }
    else { setAuthed(false) }
  }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await adminListTenants({ q: q || undefined, serviceStatus: filter || undefined })
      setTenants(res.tenants)
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
    finally { setLoading(false) }
  }

  async function handleSuspend(t: AdminTenantRow) {
    const reason = prompt(`暂停租户「${t.name}」？请填写暂停原因（可空）`, '逾期未付款')
    if (reason === null) return
    try {
      await adminUpdateTenantServiceStatus(t.id, { serviceStatus: 'SUSPENDED', suspensionReason: reason })
      setNotice(`已暂停 ${t.name}`); setTimeout(() => setNotice(''), 3000); await load()
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败') }
  }
  async function handleReactivate(t: AdminTenantRow) {
    if (!confirm(`恢复租户「${t.name}」服务（→ 正常服务）？`)) return
    try {
      await adminUpdateTenantServiceStatus(t.id, { serviceStatus: 'ACTIVE' })
      setNotice(`已恢复 ${t.name}`); setTimeout(() => setNotice(''), 3000); await load()
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败') }
  }
  async function handleExtend(t: AdminTenantRow) {
    const next = prompt(`延长「${t.name}」合约 — 请输入新到期日期（YYYY-MM-DD）`, t.contractEndAt?.slice(0, 10) ?? '')
    if (!next) return
    try {
      await adminUpdateTenantContract(t.id, { contractEndAt: next })
      setNotice(`合约已更新至 ${next}`); setTimeout(() => setNotice(''), 3000); await load()
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败') }
  }
  async function handleReset(t: AdminTenantRow) {
    if (!confirm(`为租户「${t.name}」重置临时密码？\n\nstub mode：不会自动发邮件，新密码会显示一次供您手动发送给客户。`)) return
    try {
      const r = await adminResetTenantPasswordStub(t.id)
      alert(`新临时密码（仅显示一次）：\n\n登录邮箱：${r.ownerEmail}\n临时密码：${r.temporaryPassword}\n\n请手动发送给客户，并提示首次登录后立即重置。`)
      setNotice(`已为 ${t.name} 重置临时密码`); setTimeout(() => setNotice(''), 3000)
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败') }
  }

  if (authed === null) return null
  if (!authed) return <LoginForm onLogin={() => { setAuthed(true); void load() }} />

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center"><span className="text-white text-xs font-bold">SA</span></div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">租户管理 · SaaS Admin</h1>
              <p className="text-xs text-gray-400">创建租户 · 套餐 / 授权 · 到期 / 暂停管理</p>
            </div>
          </div>
          <nav className="flex items-center gap-2 text-xs flex-wrap">
            <a href="/admin/tenants/new" className="bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">+ 创建租户</a>
            <a href="/boss" className="text-gray-500 hover:text-gray-700">工作台</a>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        {error  && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}
        {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-5 py-3 text-sm">{notice}</div>}

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
          <input className="flex-1 min-w-[200px] border border-gray-200 rounded-xl px-3 py-2 text-sm" placeholder="搜索 名称 / slug / 授权码…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void load() }} />
          <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={filter} onChange={e => setFilter(e.target.value as '' | ServiceStatus)}>
            <option value="">全部状态</option>
            {(['TRIAL','ACTIVE','PAST_DUE','SUSPENDED','EXPIRED','CANCELLED'] as ServiceStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <button onClick={() => { void load() }} className="px-4 py-2 text-sm bg-slate-800 text-white rounded-xl hover:bg-slate-900">查询</button>
        </div>

        {/* Tenant list */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="text-xs text-gray-500 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
            <span>共 {tenants.length} 个租户{loading ? '（加载中…）' : ''}</span>
            <span className="text-gray-400">不会自动发邮件 · 不会真实扣费</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">租户</th>
                  <th className="text-left px-4 py-2">套餐</th>
                  <th className="text-left px-4 py-2">服务状态</th>
                  <th className="text-left px-4 py-2">合约到期</th>
                  <th className="text-left px-4 py-2">授权码</th>
                  <th className="text-left px-4 py-2">Owner 邮箱</th>
                  <th className="text-right px-4 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800">{t.name}</div>
                      <div className="text-xs text-gray-400" title={t.id}>{t.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{t.plan}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[t.serviceStatus]}`}>{t.serviceStatusLabel}</span>
                      {t.suspensionReason && <div className="text-[10px] text-orange-600 mt-0.5" title={t.suspensionReason}>原因：{t.suspensionReason}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {t.contractEndAt ? new Date(t.contractEndAt).toLocaleDateString('zh-CN') : '—'}
                      {t.daysRemaining !== null && <div className="text-[10px] text-gray-400">剩余 {t.daysRemaining} 天</div>}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-600">{t.licenseCode ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{t.ownerEmail ?? '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {t.serviceStatus === 'SUSPENDED' || t.serviceStatus === 'EXPIRED' || t.serviceStatus === 'CANCELLED' ? (
                        <button onClick={() => handleReactivate(t)} title="恢复服务" className="text-xs text-emerald-600 hover:text-emerald-800 mr-2">恢复服务</button>
                      ) : (
                        <button onClick={() => handleSuspend(t)} title="暂停服务" className="text-xs text-orange-600 hover:text-orange-800 mr-2">暂停服务</button>
                      )}
                      <button onClick={() => handleExtend(t)} title="延长合约" className="text-xs text-blue-600 hover:text-blue-800 mr-2">延长合约</button>
                      <button onClick={() => handleReset(t)} title="重置临时密码" className="text-xs text-purple-600 hover:text-purple-800">重置密码</button>
                    </td>
                  </tr>
                ))}
                {!loading && tenants.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-gray-400 px-4 py-12 text-sm">暂无租户</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          说明：此页面为 SaaS Admin 运维工具。租户由 SaaS Admin 创建后将登录资料手动发送给客户 — 系统不发送真实邮件，不调用真实支付网关。
        </p>
      </main>
    </div>
  )
}
