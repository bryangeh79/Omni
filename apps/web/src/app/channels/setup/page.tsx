'use client'

import { useEffect, useState } from 'react'
import {
  getToken, login,
  fetchChannelSetupStatus, saveChannelSetupDraft, testChannelSetup,
  saveCredentialsDraft, fetchCredentialsStatus, clearCredentials,
  requestActivation, confirmActivation,
  fetchWaWebStatus, requestWaWebQr,
  fetchMetaLiveStatus, requestMetaLiveTest,
  type ChannelSetupStatus, type ChannelSetupTestResult,
  type CredentialsStatus, type ActivationResult,
  type WaWebStatus, type MetaLiveStatus,
} from '@/lib/api'
import { channelSetupStatusLabel, credentialStatusLabel, activationStatusLabel } from '@/lib/enumLabels'

// ── Status badge helpers ──────────────────────────────────────────────────────
// Labels 来自共用 enumLabels；本地仅保留颜色样式 → 单一事实来源 + 视觉一致
const SETUP_STATUS_CLS: Record<string, string> = {
  DRAFT:                  'bg-gray-100 text-gray-600',
  TESTED_STUB:            'bg-blue-50 text-blue-700',
  READY_FOR_CREDENTIALS:  'bg-amber-50 text-amber-700',
  CREDENTIALS_SAVED:      'bg-indigo-50 text-indigo-700',
  ACTIVATION_PENDING:     'bg-orange-50 text-orange-700',
  ACTIVE:                 'bg-emerald-50 text-emerald-700',
  FAILED:                 'bg-red-50 text-red-700',
}

const CRED_STATUS_CLS: Record<string, string> = {
  NONE:             'bg-gray-100 text-gray-500',
  DRAFT:            'bg-amber-50 text-amber-600',
  ENCRYPTED_STORED: 'bg-emerald-50 text-emerald-700',
}

function StatusBadge({ status, kind }: { status: string; kind: 'setup' | 'cred' }) {
  const cls = (kind === 'setup' ? SETUP_STATUS_CLS : CRED_STATUS_CLS)[status] ?? 'bg-gray-100 text-gray-600'
  const label = kind === 'setup' ? channelSetupStatusLabel(status) : credentialStatusLabel(status)
  return <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full ${cls}`}>{label}</span>
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-teal-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-600 mb-3">
            <span className="text-white text-2xl">💬</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">渠道设置</h1>
          <p className="text-sm text-gray-400 mt-1">登录以配置您的 WhatsApp 渠道</p>
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

// ── Channel Option Card ───────────────────────────────────────────────────────
function ChannelCard({ type, icon, title, tagline, pros, cons, boundary, selected, onSelect }: {
  type: string; icon: string; title: string; tagline: string
  pros: string[]; cons: string[]; boundary: string
  selected: boolean; onSelect: (t: string) => void
}) {
  return (
    <button type="button" onClick={() => onSelect(type)}
      className={`text-left rounded-2xl border-2 p-5 transition-all w-full ${selected ? 'border-green-500 bg-green-50 shadow-md' : 'border-gray-200 bg-white hover:border-green-300 hover:shadow-sm'}`}>
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-lg font-semibold ${selected ? 'bg-green-200 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{icon}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            {selected && <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">已选择</span>}
          </div>
          <p className="text-xs text-gray-500 mb-3">{tagline}</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">优势</p>
              <ul className="space-y-0.5">{pros.map((p, i) => <li key={i} className="text-xs text-gray-700 flex gap-1"><span className="text-green-500">✓</span>{p}</li>)}</ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">限制</p>
              <ul className="space-y-0.5">{cons.map((c, i) => <li key={i} className="text-xs text-gray-700 flex gap-1"><span className="text-amber-400">·</span>{c}</li>)}</ul>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            <p className="text-xs text-amber-700"><strong>使用边界：</strong>{boundary}</p>
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ChannelSetupPage() {
  const [authed,       setAuthed]       = useState<boolean | null>(null)
  const [status,       setStatus]       = useState<ChannelSetupStatus | null>(null)
  const [credStatus,   setCredStatus]   = useState<CredentialsStatus | null>(null)
  const [selected,     setSelected]     = useState('')
  const [displayName,  setDisplayName]  = useState('')
  const [phoneNumber,  setPhoneNumber]  = useState('')
  const [saving,       setSaving]       = useState(false)
  const [testing,      setTesting]      = useState(false)
  const [testResult,   setTestResult]   = useState<ChannelSetupTestResult | null>(null)
  const [error,        setError]        = useState('')
  const [notice,       setNotice]       = useState('')
  // Credential form (Meta API)
  const [showCredForm, setShowCredForm] = useState(false)
  const [wabaId,       setWabaId]       = useState('')
  const [phoneId,      setPhoneId]      = useState('')
  const [accessToken,  setAccessToken]  = useState('')
  const [savingCreds,  setSavingCreds]  = useState(false)
  const [clearingCreds,setClearingCreds]= useState(false)
  // Activation
  const [activationResult, setActivationResult] = useState<ActivationResult | null>(null)
  const [requestingAct, setRequestingAct] = useState(false)
  const [confirmingAct, setConfirmingAct] = useState(false)
  // Phase 14A — live activation readiness
  const [waWebStatus,     setWaWebStatus]     = useState<WaWebStatus | null>(null)
  const [metaLiveStatus,  setMetaLiveStatus]  = useState<MetaLiveStatus | null>(null)
  const [requestingQr,    setRequestingQr]    = useState(false)
  const [qrResult,        setQrResult]        = useState<{ blocked: boolean; note: string } | null>(null)
  const [requestingLive,  setRequestingLive]  = useState(false)
  const [liveTestResult,  setLiveTestResult]  = useState<{ blocked: boolean; note: string } | null>(null)

  useEffect(() => {
    if (getToken()) {
      setAuthed(true)
      void loadStatus()
    }
  }, [])

  async function loadStatus() {
    try {
      const [s, c] = await Promise.all([fetchChannelSetupStatus(), fetchCredentialsStatus().catch(() => null)])
      setStatus(s)
      if (c) setCredStatus(c)
      if (s.channelType) {
        setSelected(s.channelType)
        // Load live status based on channel type
        void fetchWaWebStatus().then(setWaWebStatus).catch(() => null)
        void fetchMetaLiveStatus().then(setMetaLiveStatus).catch(() => null)
      }
      if (s.displayName) setDisplayName(s.displayName)
    } catch { /* ignore */ }
  }

  async function handleRequestQr() {
    setRequestingQr(true); setError('')
    try {
      const r = await requestWaWebQr()
      setQrResult({ blocked: r.blocked, note: r.note })
    } catch (e) { setError(e instanceof Error ? e.message : 'QR 请求失败') }
    finally { setRequestingQr(false) }
  }

  async function handleRequestLiveTest() {
    setRequestingLive(true); setError('')
    try {
      const r = await requestMetaLiveTest()
      setLiveTestResult({ blocked: r.blocked, note: r.note })
    } catch (e) { setError(e instanceof Error ? e.message : '真实测试请求失败') }
    finally { setRequestingLive(false) }
  }

  function notify(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 4000) }

  async function handleSaveDraft() {
    if (!selected) { setError('请先选择渠道类型'); return }
    setSaving(true); setError('')
    try {
      const r = await saveChannelSetupDraft({ channelType: selected, displayName: displayName || undefined, phoneNumber: phoneNumber || undefined })
      setStatus(r); notify('草稿已保存')
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败') }
    finally { setSaving(false) }
  }

  async function handleTest() {
    setTesting(true); setError(''); setTestResult(null)
    try {
      const r = await testChannelSetup(selected || undefined)
      setTestResult(r); await loadStatus()
    } catch (e) { setError(e instanceof Error ? e.message : '测试失败') }
    finally { setTesting(false) }
  }

  async function handleSaveCreds() {
    setSavingCreds(true); setError('')
    try {
      await saveCredentialsDraft({ wabaId: wabaId || undefined, phoneNumberId: phoneId || undefined, accessToken: accessToken || undefined, channelType: selected || undefined })
      await Promise.all([loadStatus(), fetchCredentialsStatus().then(setCredStatus)])
      setShowCredForm(false); setAccessToken(''); notify('凭据已保存（已加密）')
    } catch (e) { setError(e instanceof Error ? e.message : '凭据保存失败') }
    finally { setSavingCreds(false) }
  }

  async function handleClearCreds() {
    setClearingCreds(true); setError('')
    try {
      await clearCredentials()
      await Promise.all([loadStatus(), fetchCredentialsStatus().then(setCredStatus)])
      notify('凭据已清除')
    } catch (e) { setError(e instanceof Error ? e.message : '清除失败') }
    finally { setClearingCreds(false) }
  }

  async function handleRequestActivation() {
    setRequestingAct(true); setError('')
    try {
      const r = await requestActivation(); setActivationResult(r); await loadStatus()
    } catch (e) { setError(e instanceof Error ? e.message : '激活请求失败') }
    finally { setRequestingAct(false) }
  }

  async function handleConfirmActivation() {
    setConfirmingAct(true); setError('')
    try {
      const r = await confirmActivation(); setActivationResult(r); await loadStatus()
    } catch (e) { setError(e instanceof Error ? e.message : '激活确认失败') }
    finally { setConfirmingAct(false) }
  }

  if (authed === null) return null

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  const setupStatus = status?.setupStatus ?? 'DRAFT'
  const credStat    = status?.credentialStatus ?? 'NONE'
  const isMetaType  = selected === 'META_WA_BUSINESS'

  // Activation readiness checklist
  const checklist = [
    { label: '已选择渠道类型', done: !!selected },
    { label: '草稿已保存到数据库', done: !!(status && status.updatedAt) },
    { label: '已完成安全演练测试', done: setupStatus !== 'DRAFT' },
    { label: '凭据已保存', done: credStat === 'ENCRYPTED_STORED' || credStat === 'DRAFT', applicable: isMetaType },
    { label: 'WhatsApp Web 真实连接（待平台审核开启）', done: false, note: '为保护账号安全，真实连接需由服务商完成平台审核后开启', applicable: selected === 'WA_WEB' },
    { label: 'Meta 官方 API 启用（待企业认证完成）', done: false, note: 'Meta API 需要完成企业认证和平台配置后才能启用', applicable: isMetaType },
    { label: '已发起激活请求', done: setupStatus === 'ACTIVATION_PENDING' || setupStatus === 'ACTIVE' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-sm font-bold">CH</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">渠道设置</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge status={setupStatus} kind="setup" />
                <StatusBadge status={credStat}    kind="cred" />
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-3 text-xs flex-wrap">
            <a href="/onboarding" className="text-green-600 hover:text-green-800">← 上线向导</a>
            <span className="text-gray-200">|</span>
            <a href="/channels/setup/meta-webhook" className="text-blue-600 hover:text-blue-700">Meta Webhook</a>
            <span className="text-gray-200">|</span>
            <a href="/launch-checklist" className="text-emerald-600 hover:text-emerald-800 font-medium">上线清单</a>
            <span className="text-gray-200">|</span>
            <a href="/knowledge" className="text-gray-500 hover:text-gray-700">知识库</a>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {error  && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm">{error}</div>}
        {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl px-5 py-3 text-sm">{notice}</div>}

        {/* Intro */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-2">选择您的 WhatsApp 渠道</h2>
          <p className="text-sm text-gray-500 mb-3">草稿会持久化到数据库。选择渠道、配置参数、运行安全演练 — 真实激活必须显式设置环境变量（默认关闭）。</p>
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-xs text-blue-700">
            <strong>默认安全：</strong>本页不会触发任何 WhatsApp 会话或 Meta API 调用。所有激活均受环境变量门控保护。
          </div>
        </div>

        {/* Channel option cards */}
        <div className="space-y-3">
          <ChannelCard
            type="WA_WEB" icon="WA" title="WhatsApp Web / 商家版"
            tagline="通过 WhatsApp Web 接入 — 启动快速，无需 Meta 审批。"
            pros={['启动快 — 无需 Meta 审批', '兼容标准 WA / WA 商家版', '试用成本低', '适合小团队']}
            cons={['非 Meta 官方平台', '手机需保持在线', '不支持模板消息', '会话稳定性尽力而为']}
            boundary="不可用于大规模营销或广播；遵守 WhatsApp 服务条款；会话稳定性尽力而为。"
            selected={selected === 'WA_WEB'} onSelect={setSelected}
          />
          <ChannelCard
            type="META_WA_BUSINESS" icon="API" title="Meta WhatsApp 商业平台（官方 API）"
            tagline="Meta Cloud API — 企业级、支持模板消息、无需手机会话。"
            pros={['Meta 官方授权', '支持模板消息', '不依赖手机', '企业级承载']}
            cons={['需 Meta 企业认证', '需模板审核', '按会话计费', '配置步骤较多']}
            boundary="面向企业用户；Meta 费用为透传，不打包；当前产品不含广播 / 广告。"
            selected={selected === 'META_WA_BUSINESS'} onSelect={setSelected}
          />
        </div>

        {/* Draft form */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">渠道详情</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">显示名称</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400" placeholder="例如：阳光地产 WA" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">手机号（仅保存末四位）</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400" placeholder="+60 12-345 6789" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} />
              <p className="text-xs text-gray-400 mt-0.5">仅保存末四位用于显示</p>
            </div>
          </div>
          {status?.phoneLast4 && (
            <p className="text-xs text-gray-500">已保存手机末尾：****{status.phoneLast4}</p>
          )}
          <div className="flex gap-2">
            <button onClick={() => { void handleSaveDraft() }} disabled={saving || !selected} title="保存渠道草稿到数据库（不会触发真实连接）" className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">
              {saving ? '保存中…' : '保存草稿'}
            </button>
            <button onClick={() => { void handleTest() }} disabled={testing} title="仅检查配置，不会发送真实 WhatsApp 消息或调用 Meta API" className="px-5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 text-sm font-medium disabled:opacity-50">
              {testing ? '测试中…' : '安全演练'}
            </button>
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-amber-800">安全演练结果</span>
              <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{testResult.testResult}</span>
            </div>
            <p className="text-xs text-amber-700">{testResult.note}</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                { label: 'WhatsApp 会话已启动', value: testResult.whatsappSessionStarted },
                { label: 'Meta API 已调用',      value: testResult.metaApiCalled },
                { label: '真实发送已启用',       value: testResult.realMetaSendEnabled },
                { label: '已连接',               value: testResult.connected },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between bg-white rounded-xl px-3 py-1.5 border border-amber-100">
                  <span className="text-xs text-gray-600">{label}</span>
                  <span className={`text-xs font-semibold ${value ? 'text-red-600' : 'text-emerald-600'}`}>{value ? '是' : '否'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Credential vault section (Meta API) */}
        {isMetaType && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">凭据保险库</h3>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={credStat} kind="cred" />
                  {credStatus?.credentialLast4 && <span className="text-xs text-gray-500">凭据末尾：****{credStatus.credentialLast4}</span>}
                  {credStatus && <span className="text-xs text-gray-400">保险库：{credStatus.vaultConfigured ? '✓ 已配置' : '⚠ 未配置'}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                {credStat !== 'NONE' && (
                  <button onClick={() => { void handleClearCreds() }} disabled={clearingCreds} className="text-xs px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 disabled:opacity-50">
                    {clearingCreds ? '…' : '清除'}
                  </button>
                )}
                <button onClick={() => setShowCredForm(v => !v)} className="text-xs px-3 py-1.5 rounded-xl bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200">
                  {showCredForm ? '取消' : credStat !== 'NONE' ? '更新' : '添加凭据'}
                </button>
              </div>
            </div>

            {showCredForm && (
              <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
                  凭据保存前会经 AES-256-GCM 加密，原始值不会写入日志或在响应中返回。开发环境请使用测试或占位值。
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">WABA ID</label>
                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-green-400" placeholder="WhatsApp 商业账号 ID" value={wabaId} onChange={e => setWabaId(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Phone Number ID</label>
                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-green-400" placeholder="Meta 手机号 ID" value={phoneId} onChange={e => setPhoneId(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Access Token（保存时加密）</label>
                  <input
                    type="password"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-green-400"
                    placeholder="EAAxxxxxxx（绝不以明文保存）"
                    value={accessToken}
                    onChange={e => setAccessToken(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">仅末四位用于显示，原始 token 永远不会返回。</p>
                </div>
                <button onClick={() => { void handleSaveCreds() }} disabled={savingCreds || (!wabaId && !phoneId && !accessToken)} title="保存前会加密处理，不会在页面回显原始凭据" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">
                  {savingCreds ? '加密保存中…' : '保存凭据（加密）'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Meta webhook setup link */}
        {isMetaType && (
          <a href="/channels/setup/meta-webhook" className="block bg-blue-50 border border-blue-200 rounded-2xl p-4 hover:bg-blue-100 transition-all">
            <p className="text-sm font-semibold text-blue-800">Meta Webhook 配置向导</p>
            <p className="text-xs text-blue-600 mt-0.5">配置 webhook URL、校验 token，完成 Meta 应用配置步骤 →</p>
          </a>
        )}

        {/* Activation readiness checklist */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">激活准备度</h3>
            <a href="/launch-checklist" className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">完整上线清单 →</a>
          </div>
          <div className="space-y-1.5">
            {checklist.filter(c => c.applicable !== false).map((c, i) => (
              <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${c.done ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c.done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {c.done ? '✓' : i + 1}
                </span>
                <span className={`text-xs ${c.done ? 'text-emerald-700' : 'text-gray-600'}`}>{c.label}</span>
                {c.note && !c.done && <span className="text-xs text-gray-400 ml-auto">{c.note}</span>}
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => { void handleRequestActivation() }} disabled={requestingAct || !selected} title="发起激活流程，仍受环境门控保护；不会自动开启真实发送" className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">
              {requestingAct ? '请求中…' : '发起激活请求'}
            </button>
            <button onClick={() => { void handleConfirmActivation() }} disabled={confirmingAct || setupStatus !== 'ACTIVATION_PENDING'} title="将渠道标记为已激活；真实发送仍需运维显式开启 env 标志" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">
              {confirmingAct ? '确认中…' : '确认激活'}
            </button>
          </div>
        </div>

        {/* Activation result */}
        {activationResult && (
          <div className={`rounded-2xl border p-4 space-y-2 ${activationResult.blocked ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${activationResult.blocked ? 'text-amber-800' : 'text-emerald-800'}`}>
                {activationResult.blocked ? '激活已拦截（默认安全）' : '激活已推进'}
              </span>
            </div>
            <p className="text-xs text-gray-700">{activationResult.note}</p>
            {((activationResult.missingConditions?.length ?? 0) > 0 || (activationResult.blockers?.length ?? 0) > 0) && (
              <ul className="space-y-1 mt-2">
                {[...(activationResult.missingConditions ?? []), ...(activationResult.blockers ?? [])].map((c, i) => (
                  <li key={i} className="text-xs text-amber-700 flex gap-1.5"><span>•</span>{c}</li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                { label: '真实 WhatsApp 会话', value: activationResult.realWaSessionEnabled },
                { label: '真实 Meta 发送',     value: activationResult.realMetaSendEnabled },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between bg-white rounded-xl px-3 py-1.5 border border-gray-100">
                  <span className="text-xs text-gray-600">{label}</span>
                  <span className={`text-xs font-semibold ${value ? 'text-red-600' : 'text-emerald-600'}`}>{value ? '是' : '否'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phase 14A: WA Web Guarded Live Activation */}
        {selected === 'WA_WEB' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">WhatsApp Web 真实激活</h3>
              {waWebStatus && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${waWebStatus.waSessionAllowed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {activationStatusLabel(waWebStatus.sessionStatus)}
                </span>
              )}
            </div>
            {waWebStatus?.missingConditions && waWebStatus.missingConditions.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                <p className="font-semibold mb-1">缺失条件</p>
                {waWebStatus.missingConditions.map((c, i) => <p key={i}>• {c}</p>)}
              </div>
            )}
            <p className="text-xs text-gray-500">{waWebStatus?.note ?? '加载中…'}</p>
            <button
              onClick={() => { void handleRequestQr() }}
              disabled={requestingQr}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {requestingQr ? '请求中…' : '请求 QR 码（受门控保护）'}
            </button>
            {qrResult && (
              <div className={`rounded-xl border px-4 py-3 text-xs ${qrResult.blocked ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                <p className="font-semibold mb-1">{qrResult.blocked ? '已拦截' : '返回结果'}</p>
                <p>{qrResult.note}</p>
              </div>
            )}
          </div>
        )}

        {/* Phase 14A: Meta Live Webhook Verification */}
        {selected === 'META_WA_BUSINESS' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Meta Webhook 真实验证</h3>
              {metaLiveStatus && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${metaLiveStatus.liveStatus === 'READY_FOR_LIVE_TEST' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {activationStatusLabel(metaLiveStatus.liveStatus)}
                </span>
              )}
            </div>
            {metaLiveStatus?.missingConditions && metaLiveStatus.missingConditions.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                <p className="font-semibold mb-1">缺失条件</p>
                {metaLiveStatus.missingConditions.map((c, i) => <p key={i}>• {c}</p>)}
              </div>
            )}
            <p className="text-xs text-gray-500">{metaLiveStatus?.note ?? '加载中…'}</p>
            <div className="flex gap-2">
              <button
                onClick={() => { void handleRequestLiveTest() }}
                disabled={requestingLive}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {requestingLive ? '请求中…' : '请求真实测试（受门控保护）'}
              </button>
              <a href="/channels/setup/meta-webhook" className="px-4 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-medium">
                Webhook 向导
              </a>
            </div>
            {liveTestResult && (
              <div className={`rounded-xl border px-4 py-3 text-xs ${liveTestResult.blocked ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                <p className="font-semibold mb-1">{liveTestResult.blocked ? '已拦截' : '返回结果'}</p>
                <p>{liveTestResult.note}</p>
              </div>
            )}
          </div>
        )}

        {/* Safety reminder (tenant-facing, business copy) */}
        <div className="bg-gray-100 rounded-2xl px-5 py-4 text-xs text-gray-500 space-y-1">
          <p className="font-semibold text-gray-600">安全默认：</p>
          <p>• 默认<strong>不会</strong>启动真实 WhatsApp 会话或调用真实 Meta API。</p>
          <p>• 当前页面只能进行<strong>安全演练</strong>（保存凭据 / 模拟测试），不会发送真实消息。</p>
          <p>• 凭据保存前经强加密处理，响应中绝不返回原始值。</p>
          <p>• 真实激活需<a href="/activation-guide" className="text-blue-600 hover:text-blue-800 font-medium">联系服务商执行平台激活流程</a>。</p>
          <p>• <a href="/launch-checklist" className="text-emerald-600 hover:text-emerald-800 font-medium">查看完整上线清单 →</a></p>
        </div>
      </main>
    </div>
  )
}
