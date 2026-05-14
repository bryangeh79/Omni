'use client'

import { useEffect, useState } from 'react'
import {
  getToken, login, getMe,
  fetchTeamMembers, inviteDraft, updateMemberRole, updateMemberStatus,
  type TeamMember, type TeamMembersResponse,
} from '@/lib/api'
import { actorRoleLabel } from '@/lib/enumLabels'

const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER']

const ROLE_COLORS: Record<string, string> = {
  OWNER:   'bg-purple-100 text-purple-700',
  ADMIN:   'bg-blue-100 text-blue-700',
  MANAGER: 'bg-indigo-100 text-indigo-700',
  AGENT:   'bg-emerald-100 text-emerald-700',
  VIEWER:  'bg-gray-100 text-gray-600',
}

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 mb-3"><span className="text-white text-xl">👥</span></div>
          <h1 className="text-2xl font-bold text-gray-900">团队管理</h1>
          <p className="text-sm text-gray-400 mt-1">登录以管理团队成员</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400" placeholder="租户标识" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-500'}`} title={role}>{actorRoleLabel(role)}</span>
  )
}

export default function TeamPage() {
  const [authed,    setAuthed]    = useState(false)
  const [myRole,    setMyRole]    = useState<string | null>(null)
  const [team,      setTeam]      = useState<TeamMembersResponse | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [notice,    setNotice]    = useState('')
  const [error,     setError]     = useState('')
  // Invite form
  const [invEmail,  setInvEmail]  = useState('')
  const [invName,   setInvName]   = useState('')
  const [invRole,   setInvRole]   = useState('AGENT')
  const [inviting,  setInviting]  = useState(false)
  const [invResult, setInvResult] = useState<string | null>(null)
  // Role edit
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editingRole,  setEditingRole]  = useState('')
  const [savingRole,   setSavingRole]   = useState(false)

  useEffect(() => {
    if (getToken()) { setAuthed(true); void load() }
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [t, me] = await Promise.all([fetchTeamMembers(), getMe()])
      setTeam(t)
      setMyRole(me.role)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN'

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault(); setInviting(true); setError('')
    try {
      const r = await inviteDraft({ email: invEmail, name: invName || undefined, role: invRole })
      setInvResult(`已记录 ${r.invited.email} 的 ${actorRoleLabel(r.invited.role)} 邀请草稿。${r.note}`)
      setInvEmail(''); setInvName('')
      setTimeout(() => setInvResult(null), 8000)
    } catch (ex) { setError(ex instanceof Error ? ex.message : '邀请失败') }
    finally { setInviting(false) }
  }

  async function handleRoleSave(member: TeamMember) {
    setSavingRole(true); setError('')
    try {
      await updateMemberRole(member.id, editingRole)
      setNotice(`角色已更新为 ${actorRoleLabel(editingRole)}`)
      setEditingId(null)
      setTimeout(() => setNotice(''), 3000)
      await load()
    } catch (ex) { setError(ex instanceof Error ? ex.message : '更新失败') }
    finally { setSavingRole(false) }
  }

  async function handleToggleStatus(member: TeamMember) {
    setError('')
    try {
      await updateMemberStatus(member.id, !member.isActive)
      setNotice(`${member.email} ${!member.isActive ? '已激活' : '已停用'}`)
      setTimeout(() => setNotice(''), 3000)
      await load()
    } catch (ex) { setError(ex instanceof Error ? ex.message : '状态更新失败') }
  }

  if (!authed) return <LoginForm onLogin={() => { setAuthed(true); void load() }} />

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center"><span className="text-white text-xs font-bold">TM</span></div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">团队管理</h1>
              <p className="text-xs text-gray-400">{team ? `活跃 ${team.active} · 总计 ${team.total}` : '加载中…'}{myRole ? ` · 您的角色：${actorRoleLabel(myRole)}` : ''}</p>
            </div>
          </div>
          <nav className="flex items-center gap-2 text-xs flex-wrap">
            <a href="/settings" className="text-gray-500 hover:text-gray-700">设置</a>
            <span className="text-gray-200">|</span>
            <a href="/billing" className="text-blue-600 hover:text-blue-700">套餐与计费</a>
            <span className="text-gray-200">|</span>
            <a href="/boss" className="text-gray-500 hover:text-gray-700">工作台</a>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        {error   && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}
        {notice  && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-5 py-3 text-sm">{notice}</div>}

        {/* RBAC info banner */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-xs text-indigo-800 space-y-1">
          <p><strong>权限层级：</strong>OWNER / ADMIN 可管理团队、计费与设置；MANAGER 可查看团队与报表；AGENT 可使用收件箱；VIEWER 为只读。</p>
          {!isAdmin && <p className="text-amber-700"><strong>提示：</strong>邀请或修改团队成员需要 OWNER 或 ADMIN 角色。</p>}
        </div>

        {loading && !team ? (
          <div className="text-center py-16 text-gray-400"><p className="text-sm">正在加载团队…</p></div>
        ) : (
          <>
            {/* 成员列表 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">团队成员</h2>
              <div className="space-y-2">
                {(team?.members ?? []).map(m => (
                  <div key={m.id} className={`flex items-center gap-3 rounded-xl px-4 py-3 ${m.isActive ? 'bg-gray-50' : 'bg-red-50 opacity-70'}`}>
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-700">
                      {(m.name?.[0] ?? m.email[0]).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{m.name ?? m.email}</p>
                      <p className="text-xs text-gray-400 truncate">{m.name ? m.email : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {editingId === m.id ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={editingRole}
                            onChange={e => setEditingRole(e.target.value)}
                            className="text-xs border border-indigo-200 rounded-lg px-2 py-1 outline-none"
                          >
                            {ROLES.map(r => <option key={r} value={r}>{actorRoleLabel(r)}</option>)}
                          </select>
                          <button onClick={() => { void handleRoleSave(m) }} disabled={savingRole} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-lg disabled:opacity-50">{savingRole ? '…' : '保存'}</button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 px-1">✕</button>
                        </div>
                      ) : (
                        <>
                          <RoleBadge role={m.role} />
                          {!m.isActive && <span className="text-xs text-red-500 font-bold">已停用</span>}
                          {isAdmin && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => { setEditingId(m.id); setEditingRole(m.role) }}
                                className="text-xs text-indigo-500 hover:text-indigo-700 px-1"
                                title="修改角色"
                              >编辑</button>
                              <button
                                onClick={() => { void handleToggleStatus(m) }}
                                className={`text-xs px-1 ${m.isActive ? 'text-red-400 hover:text-red-600' : 'text-emerald-500 hover:text-emerald-700'}`}
                                title={m.isActive ? '停用' : '激活'}
                              >{m.isActive ? '停用' : '激活'}</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {(team?.members?.length ?? 0) === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">暂无团队成员。</p>
                )}
              </div>
            </div>

            {/* Invite Form — ADMIN+ only */}
            {isAdmin && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">邀请团队成员（草稿）</h2>
                {invResult && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-xs mb-4">{invResult}</div>
                )}
                <form onSubmit={e => { void handleInvite(e) }} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">邮箱 *</label>
                      <input
                        type="email"
                        required
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="user@company.com"
                        value={invEmail}
                        onChange={e => setInvEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">姓名</label>
                      <input
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="全名（选填）"
                        value={invName}
                        onChange={e => setInvName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">角色</label>
                    <select
                      value={invRole}
                      onChange={e => setInvRole(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{actorRoleLabel(r)}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="submit" disabled={inviting} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-5 py-2 rounded-xl disabled:opacity-50">
                      {inviting ? '记录中…' : '记录邀请草稿'}
                    </button>
                    <p className="text-xs text-amber-600">不会发送真实邮件 — 当前阶段邮件投递未配置。</p>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
