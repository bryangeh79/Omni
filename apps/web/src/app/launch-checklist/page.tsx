'use client'

import { useEffect, useState } from 'react'
import { getToken, login, fetchLaunchChecklist, fetchStagingReadiness, type LaunchChecklist, type ChecklistItem, type StagingReadiness } from '@/lib/api'
import { launchStatusLabel } from '@/lib/enumLabels'
import { toChineseError } from '@/lib/errorText'

// ── Status styles ─────────────────────────────────────────────────────────────
// Label 走共用 launchStatusLabel；本地仅保留视觉样式 → 单一事实来源
const STATUS_STYLE: Record<string, { icon: string; ring: string; bg: string; text: string }> = {
  DONE:    { icon: '✓', ring: 'ring-emerald-300', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  PENDING: { icon: '○', ring: 'ring-amber-300',   bg: 'bg-amber-50',   text: 'text-amber-700'   },
  WARN:    { icon: '!', ring: 'ring-yellow-300',  bg: 'bg-yellow-50',  text: 'text-yellow-700'  },
  BLOCKED: { icon: '✕', ring: 'ring-red-200',     bg: 'bg-red-50',     text: 'text-red-700'     },
  SKIP:    { icon: '–', ring: 'ring-gray-200',    bg: 'bg-gray-50',    text: 'text-gray-500'    },
}

const LAUNCH_STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  NOT_READY:                    { bg: 'bg-red-100',     text: 'text-red-800',     border: 'border-red-200' },
  READY_FOR_STAGING:            { bg: 'bg-amber-100',   text: 'text-amber-800',   border: 'border-amber-200' },
  READY_FOR_PRODUCTION_REVIEW:  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' },
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await login(slug, email, pass); onLogin() }
    catch (ex) { setErr(ex instanceof Error ? ex.message : '登录失败') }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-600 mb-3">
            <span className="text-white text-2xl">🚀</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">上线清单</h1>
          <p className="text-sm text-gray-400 mt-1">登录以查看上线准备度</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400" placeholder="租户标识（可选 · 高级登录）" value={slug} onChange={e => setSlug(e.target.value)} />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  )
}

// ── Checklist Item Card ───────────────────────────────────────────────────────
function ItemCard({ item }: { item: ChecklistItem }) {
  const cfg = STATUS_STYLE[item.status] ?? STATUS_STYLE.WARN
  return (
    <div className={`rounded-2xl border p-4 ring-1 ${cfg.ring} ${cfg.bg} transition-all`}>
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ring-1 ${cfg.ring} ${cfg.bg} ${cfg.text}`}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className={`text-sm font-semibold ${cfg.text}`}>{item.label}</p>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text} border border-current border-opacity-20`}>{launchStatusLabel(item.status)}</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{item.detail}</p>
        </div>
        {item.action && item.status !== 'DONE' && item.status !== 'SKIP' && (
          <a href={item.action} className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-xl font-medium ${item.status === 'BLOCKED' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white border border-gray-200 text-gray-700 hover:border-emerald-300 hover:text-emerald-700'}`}>
            {item.status === 'BLOCKED' ? '运维操作' : '处理 →'}
          </a>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LaunchChecklistPage() {
  const [authed,    setAuthed]    = useState<boolean | null>(null)
  const [checklist, setChecklist] = useState<LaunchChecklist | null>(null)
  const [staging,   setStaging]   = useState<StagingReadiness | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    if (getToken()) { setAuthed(true); void loadChecklist() }
  }, [])

  async function loadChecklist() {
    setLoading(true); setError('')
    try {
      const [cl, st] = await Promise.all([
        fetchLaunchChecklist(),
        fetchStagingReadiness().catch(() => null),
      ])
      setChecklist(cl)
      if (st) setStaging(st)
    }
    catch (e) { setError(toChineseError(e, '加载清单失败')) }
    finally { setLoading(false) }
  }

  if (authed === null) return null

  if (!authed) return <LoginForm onLogin={() => { setAuthed(true); void loadChecklist() }} />

  const launchStatusKey = checklist?.launchStatus ?? 'NOT_READY'
  const launchCfg = LAUNCH_STATUS_STYLE[launchStatusKey] ?? LAUNCH_STATUS_STYLE.NOT_READY
  const summary = checklist?.summary

  const readyItems   = checklist?.items.filter(i => i.status === 'DONE') ?? []
  const actionItems  = checklist?.items.filter(i => i.status === 'PENDING' || i.status === 'BLOCKED') ?? []
  const warnItems    = checklist?.items.filter(i => i.status === 'WARN') ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-lg">🚀</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">上线清单</h1>
              {checklist && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${launchCfg.bg} ${launchCfg.text} ${launchCfg.border}`}>
                  {launchStatusLabel(launchStatusKey)}
                </span>
              )}
            </div>
          </div>
          <nav className="flex items-center gap-3 text-xs">
            <a href="/channels/setup" className="text-emerald-600 hover:text-emerald-800">渠道设置</a>
            <span className="text-gray-200">|</span>
            <a href="/boss" className="text-gray-500 hover:text-gray-700">工作台</a>
            <button onClick={() => { void loadChecklist() }} disabled={loading} title="刷新上线清单状态，不会调用真实外部服务" className="text-xs px-3 py-1.5 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50">
              {loading ? '…' : '↻ 刷新'}
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}

        {loading && !checklist ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">正在加载清单…</p>
          </div>
        ) : checklist ? (
          <>
            {/* Launch status banner */}
            <div className={`rounded-2xl border p-5 ${launchCfg.bg} ${launchCfg.border}`}>
              <div className="flex items-center gap-3 mb-2">
                <div>
                  <h2 className={`text-base font-semibold ${launchCfg.text}`}>{launchStatusLabel(launchStatusKey)}</h2>
                  <p className={`text-xs ${launchCfg.text} opacity-80`}>{checklist.launchNote}</p>
                </div>
              </div>
              {summary && (
                <div className="flex gap-3 mt-3 flex-wrap">
                  {[
                    { label: '已完成', count: summary.done,    color: 'bg-emerald-200 text-emerald-800' },
                    { label: '待处理', count: summary.pending, color: 'bg-amber-200 text-amber-800' },
                    { label: '可选项', count: summary.warn,    color: 'bg-yellow-200 text-yellow-800' },
                    { label: '阻塞项', count: summary.blocked, color: 'bg-red-200 text-red-800' },
                  ].map(({ label, count, color }) => count > 0 && (
                    <span key={label} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${color}`}>
                      {count} 项{label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Safety notice */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-xs text-blue-700">
              <strong>真实发送默认关闭。</strong><code>OMNI_ENABLE_REAL_META_SEND</code> 与 <code>OMNI_ALLOW_WA_SESSION</code> 默认均为 <strong>OFF</strong>，必须由运维显式启用才能正式上线。
            </div>

            {/* Needs action */}
            {actionItems.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-700">上线前必须处理</h2>
                {actionItems.map(item => <ItemCard key={item.key} item={item} />)}
              </section>
            )}

            {/* Ready */}
            {readyItems.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-700">已就绪</h2>
                {readyItems.map(item => <ItemCard key={item.key} item={item} />)}
              </section>
            )}

            {/* Optional/warn */}
            {warnItems.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-700">可选 / 建议</h2>
                {warnItems.map(item => <ItemCard key={item.key} item={item} />)}
              </section>
            )}

            {/* Quick actions */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">快速操作</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  { href: '/onboarding',                  label: '上线向导' },
                  { href: '/knowledge',                   label: '知识库' },
                  { href: '/channels/setup',              label: '渠道设置' },
                  { href: '/channels/setup/meta-webhook', label: 'Meta Webhook' },
                  { href: '/inbox',                       label: '对话收件箱' },
                  { href: '/boss',                        label: '老板工作台' },
                ].map(({ href, label }) => (
                  <a key={href} href={href}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-xs font-medium text-gray-700 hover:text-emerald-700">
                    {label}
                  </a>
                ))}
              </div>
            </div>

            {/* Channel paths */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">WhatsApp Web 路径</h3>
                <ul className="space-y-1.5 text-xs text-gray-600">
                  <li className="flex items-center gap-1.5"><span className="text-gray-400">→</span>选择 WA_WEB 渠道类型</li>
                  <li className="flex items-center gap-1.5"><span className="text-gray-400">→</span>运维设置 OMNI_ALLOW_WA_SESSION=true</li>
                  <li className="flex items-center gap-1.5"><span className="text-gray-400">→</span>扫码登录会话（Phase 14）</li>
                  <li className="flex items-center gap-1.5"><span className="text-amber-500">!</span>会话稳定性尽力而为</li>
                </ul>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Meta API 路径</h3>
                <ul className="space-y-1.5 text-xs text-gray-600">
                  <li className="flex items-center gap-1.5"><span className="text-gray-400">→</span>选择 META_WA_BUSINESS 类型</li>
                  <li className="flex items-center gap-1.5"><span className="text-gray-400">→</span>在 Meta 应用中配置 Webhook</li>
                  <li className="flex items-center gap-1.5"><span className="text-gray-400">→</span>保存加密凭据</li>
                  <li className="flex items-center gap-1.5"><span className="text-gray-400">→</span>运维设置 OMNI_ENABLE_REAL_META_SEND=true</li>
                </ul>
              </div>
            </div>

            {/* Staging mode section (Phase 14B) */}
            {staging && (
              <div className={`rounded-2xl border p-5 ${staging.stagingStatus === 'READY_FOR_MANUAL_ACTIVATION_REVIEW' ? 'bg-emerald-50 border-emerald-200' : staging.stagingStatus === 'PARTIALLY_READY' ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">预演模式（Staging）</p>
                    <p className="text-xs text-gray-600">{staging.stagingNote}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(staging.stagingMode).map(([key, val]) => (
                    <div key={key} className={`flex items-center justify-between px-3 py-2 rounded-xl ${val ? 'bg-emerald-100' : 'bg-white'}`}>
                      <span className="text-xs text-gray-600">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className={`text-xs font-bold ${val ? 'text-emerald-700' : 'text-gray-400'}`}>{val ? '✓' : '–'}</span>
                    </div>
                  ))}
                </div>
                {staging.flags.realSendDisabled && (
                  <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-700 font-medium">
                    真实发送已关闭 — OMNI_ENABLE_REAL_META_SEND 与 OMNI_ALLOW_WA_SESSION 均为 OFF
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <a href="/channels/setup/wa-web/qr" className="text-xs bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-xl hover:bg-gray-50">WhatsApp Web 二维码 →</a>
                  <a href="/channels/setup/meta-webhook" className="text-xs bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-xl hover:bg-gray-50">Meta Webhook →</a>
                </div>
              </div>
            )}

            {/* Safety defaults */}
            <div className="bg-gray-100 rounded-2xl px-5 py-4 text-xs text-gray-500">
              <p className="font-semibold text-gray-600 mb-1">当前安全状态</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'WhatsApp 会话', value: checklist.safety.realWaSessionEnabled },
                  { label: 'Meta 发送',     value: checklist.safety.realMetaSendEnabled },
                  { label: 'AI 服务商',     value: checklist.safety.aiProviderEnabled },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between bg-white rounded-xl px-3 py-2">
                    <span>{label}</span>
                    <span className={`font-bold ${value ? 'text-red-600' : 'text-emerald-600'}`}>{value ? '开启' : '关闭'}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
