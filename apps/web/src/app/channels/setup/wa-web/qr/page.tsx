'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  getToken, login,
  fetchWaWebStatus, fetchWaWebSessionStatus, requestWaWebQr,
  type WaWebStatus,
} from '@/lib/api'

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-teal-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-600 mb-3">
            <span className="text-white text-2xl">📱</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Web 二维码登录</h1>
          <p className="text-sm text-gray-400 mt-1">登录以管理您的 WhatsApp 连接</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-400" placeholder="租户标识" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-400" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-400" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  )
}

// ── Main QR Staging Page ──────────────────────────────────────────────────────
export default function WaWebQrPage() {
  const [authed,     setAuthed]     = useState<boolean | null>(null)
  const [status,     setStatus]     = useState<WaWebStatus | null>(null)
  const [sessStatus, setSessStatus] = useState<{ sessionStatus: string; hasSessionRef: boolean; channelIsActive: boolean; lastUpdatedAt: string | null } | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [qrResult,   setQrResult]   = useState<{ blocked: boolean; note: string; nextStep?: string } | null>(null)
  const [requesting, setRequesting] = useState(false)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const [s, sess] = await Promise.all([
        fetchWaWebStatus(),
        fetchWaWebSessionStatus().catch(() => null),
      ])
      setStatus(s)
      if (sess) setSessStatus({ sessionStatus: sess.sessionStatus, hasSessionRef: sess.hasSessionRef, channelIsActive: sess.channelIsActive, lastUpdatedAt: sess.lastUpdatedAt })
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (getToken()) { setAuthed(true); void loadStatus() }
  }, [loadStatus])

  async function handleRequestQr() {
    setRequesting(true); setError('')
    try {
      const r = await requestWaWebQr()
      setQrResult({ blocked: r.blocked, note: r.note, nextStep: r.nextStep })
    } catch (e) { setError(e instanceof Error ? e.message : '请求失败') }
    finally { setRequesting(false) }
  }

  if (authed === null) return null

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  const isBlocked = !status?.waSessionAllowed
  const isConnected = sessStatus?.sessionStatus === 'CONNECTED' || sessStatus?.channelIsActive

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-xs font-bold">QR</span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">WhatsApp Web 二维码登录</h1>
              <p className="text-xs text-gray-400">
                {loading ? '加载中…' : isConnected ? '● 已连接' : isBlocked ? '● 已拦截（默认安全）' : '● 未连接'}
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-3 text-xs">
            <a href="/channels/setup" className="text-green-600 hover:text-green-800">← 渠道设置</a>
            <span className="text-gray-200">|</span>
            <a href="/launch-checklist" className="text-emerald-600 hover:text-emerald-800">上线清单</a>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-6 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}

        {/* Safety state banner */}
        <div className={`rounded-2xl border p-4 ${isBlocked ? 'bg-amber-50 border-amber-200' : isConnected ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'}`}>
          <div className="flex items-center gap-3">
            <div>
              <p className={`text-sm font-semibold ${isBlocked ? 'text-amber-800' : isConnected ? 'text-emerald-800' : 'text-blue-800'}`}>
                {isBlocked ? '会话已拦截（默认安全）' : isConnected ? 'WhatsApp 会话已连接' : '尚未启动会话'}
              </p>
              <p className={`text-xs mt-0.5 ${isBlocked ? 'text-amber-700' : isConnected ? 'text-emerald-700' : 'text-blue-700'}`}>
                {isBlocked
                  ? 'OMNI_ALLOW_WA_SESSION 未启用 — WhatsApp 会话不会启动。这是默认安全状态。'
                  : isConnected
                    ? 'WhatsApp Web 会话已就绪。请在「对话收件箱」中监控。'
                    : 'OMNI_ALLOW_WA_SESSION 已启用。请按下方步骤启动会话。'}
              </p>
            </div>
          </div>
        </div>

        {/* Session status */}
        {sessStatus && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">会话状态</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '会话状态',  value: sessStatus.sessionStatus },
                { label: '会话引用',  value: sessStatus.hasSessionRef ? '已建立' : '无' },
                { label: '渠道状态',  value: sessStatus.channelIsActive ? '激活' : '未激活' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-sm font-semibold text-gray-700 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
            {sessStatus.lastUpdatedAt && <p className="text-xs text-gray-400 mt-2">更新于：{new Date(sessStatus.lastUpdatedAt).toLocaleString('zh-CN')}</p>}
          </div>
        )}

        {/* Operator steps */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">
            {isBlocked ? '如何启用 WhatsApp Web 会话' : '二维码登录流程'}
          </h2>
          <div className="space-y-3">
            {[
              {
                num: 1, title: '启用 WhatsApp Web 会话开关',
                desc: '运维需在 .env 中设置 OMNI_ALLOW_WA_SESSION=true 并重启 API 进程。',
                done: !isBlocked,
                blocked: isBlocked,
                isOperator: true,
              },
              {
                num: 2, title: '创建 WhatsApp Web 渠道',
                desc: 'POST /channels/whatsapp-web/connect — 创建渠道并启动 QR 会话。',
                done: !!sessStatus?.hasSessionRef,
                blocked: isBlocked,
              },
              {
                num: 3, title: '获取二维码',
                desc: 'GET /channels/whatsapp-web/:channelId/qr — 轮询直到 QR 可用后显示。',
                done: sessStatus?.sessionStatus === 'CONNECTED',
                blocked: isBlocked || !sessStatus?.hasSessionRef,
              },
              {
                num: 4, title: '使用 WhatsApp 手机端扫码',
                desc: '打开 WhatsApp 手机端 → 设置 → 已链接的设备 → 链接设备 → 扫描二维码。',
                done: isConnected ?? false,
                blocked: isBlocked,
              },
              {
                num: 5, title: '确认连接成功',
                desc: '会话状态变为 CONNECTED 后，可在「对话收件箱」中发送测试消息。',
                done: isConnected ?? false,
                blocked: isBlocked,
              },
            ].map(step => (
              <div key={step.num} className={`rounded-xl border p-4 flex items-start gap-3 ${step.done ? 'bg-emerald-50 border-emerald-200' : step.blocked ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-gray-50 border-gray-200'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${step.done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {step.done ? '✓' : step.num}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${step.done ? 'text-emerald-800' : 'text-gray-800'}`}>{step.title}</p>
                    {step.isOperator && <span className="text-xs bg-orange-50 border border-orange-200 text-orange-600 px-1.5 py-0.5 rounded-full">运维操作</span>}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Request QR button */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">请求 QR 会话（受门控保护）</h3>
          <p className="text-xs text-gray-500">此按钮仅检查准备度并返回运维步骤说明，不会从本页启动真实会话。</p>
          <button
            onClick={() => { void handleRequestQr() }}
            disabled={requesting}
            className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {requesting ? '检查中…' : '检查 QR 准备度'}
          </button>
          {qrResult && (
            <div className={`rounded-xl border px-4 py-3 space-y-2 ${qrResult.blocked ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
              <p className={`text-xs font-semibold ${qrResult.blocked ? 'text-amber-800' : 'text-blue-800'}`}>
                {qrResult.blocked ? '已拦截（默认安全）' : '运维路径'}
              </p>
              <p className="text-xs text-gray-700">{qrResult.note}</p>
              {qrResult.nextStep && (
                <p className="text-xs text-blue-700 font-mono">下一步：{qrResult.nextStep}</p>
              )}
            </div>
          )}
        </div>

        {/* Real send disabled badge */}
        <div className="bg-gray-100 rounded-2xl px-5 py-4 text-xs text-gray-500 space-y-1">
          <p className="font-semibold text-gray-600">安全默认</p>
          <p>• <code>OMNI_ALLOW_WA_SESSION=false</code> — WhatsApp 会话默认不会启动</p>
          <p>• 本页不会返回原始 QR 数据、会话 token 或会话内容</p>
          <p>• 本页不会启动 Chromium 或 WhatsApp Web 会话</p>
          <p>• <strong>不支持广播 / 广告 / 群发</strong> — Omni 仅提供 1:1 AI 客服</p>
        </div>
      </main>
    </div>
  )
}
