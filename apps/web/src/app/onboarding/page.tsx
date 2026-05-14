'use client'

import { useEffect, useState } from 'react'
import {
  getToken, login, saveOnboardingDraft, generateOnboardingPreview,
  ingestOnboardingMaterials, enableOnboarding, fetchOnboardingStatus,
  type OnboardingPreview,
} from '@/lib/api'

const INDUSTRIES = [
  { value: 'real-estate',    label: '房地产' },
  { value: 'education',      label: '教育与培训' },
  { value: 'retail',         label: '零售 / 电商' },
  { value: 'food-beverage',  label: '餐饮' },
  { value: 'beauty-wellness',label: '美容与养生' },
  { value: 'automotive',     label: '汽车' },
  { value: 'healthcare',     label: '医疗 / 诊所' },
  { value: 'finance',        label: '金融与保险' },
  { value: 'default',        label: '其他 / 通用' },
]

const AI_GOALS = [
  { value: 'lead-conversion',  label: '将潜在客户转化为成交客户' },
  { value: 'appointment',      label: '预约 / 排程' },
  { value: 'demo-trial',       label: '安排演示 / 免费试用' },
  { value: 'collect-info',     label: '收集客户信息' },
  { value: 'product-qa',       label: '回答产品问题' },
  { value: 'pre-sales',        label: '售前资格筛选' },
  { value: 'after-sales',      label: '售后支持' },
  { value: 'quotation',        label: '处理价格与报价' },
  { value: 'transfer-human',   label: '高意向客户转人工' },
]

const STEPS = ['公司基础', 'AI 目标', '产品资料', '预览', '启用']

// ── Generation mode badge ──────────────────────────────────────────────────────
function ModeBadge({ mode }: { mode: string }) {
  const cfg = {
    DETERMINISTIC_TEMPLATE: { label: '模板生成', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
    AI_GENERATED:           { label: 'AI 生成', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    AI_FALLBACK:            { label: 'AI 回退到模板', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  }[mode] ?? { label: mode, bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-3 shadow-md">
            <span className="text-white text-2xl font-bold">O</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">设置 Omni</h1>
          <p className="text-sm text-gray-400 mt-1">登录以开始上线向导</p>
        </div>
        {err && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2">{err}</p>}
        <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="租户标识" value={slug} onChange={e => setSlug(e.target.value)} required />
        <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="密码" value={pass} onChange={e => setPass(e.target.value)} required />
        <button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  )
}

// ── Main Onboarding Wizard ────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [authed,   setAuthed]   = useState(false)
  const [step,     setStep]     = useState(0)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')
  const [preview,  setPreview]  = useState<OnboardingPreview | null>(null)
  const [enabled,  setEnabled]  = useState(false)
  const [ingested, setIngested] = useState(false)
  const [ingestMsg, setIngestMsg] = useState('')

  // Form state
  const [companyName,    setCompanyName]    = useState('')
  const [industry,       setIndustry]       = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [website,        setWebsite]        = useState('')
  const [serviceArea,    setServiceArea]    = useState('')
  const [businessHours,  setBusinessHours]  = useState('Mon-Fri 9:00-18:00')
  const [aiGoals,        setAiGoals]        = useState<string[]>([])
  const [materialsText,  setMaterialsText]  = useState('')
  const [materialsUrl,   setMaterialsUrl]   = useState('')

  useEffect(() => {
    const token = getToken()
    if (!token) return
    setAuthed(true)
    fetchOnboardingStatus().then((s) => {
      if (s.hasStarted) {
        setCompanyName(s.companyName ?? '')
        setIndustry(s.industry ?? '')
        if (s.ingestedKbCount > 0) setIngested(true)
        if (s.hasPreview) setStep(3)
        else if (s.status) setStep(1)
      }
    }).catch(() => null)
  }, [])

  const toggleGoal = (g: string) =>
    setAiGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])

  async function saveDraft(stepNum?: number) {
    setBusy(true); setError('')
    try {
      await saveOnboardingDraft({
        companyName, industry, whatsappNumber, website, serviceArea, businessHours,
        aiGoals, materialsText, materialsUrl,
        completedSteps: stepNum ?? step,
      })
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setBusy(false) }
  }

  async function handleNext() {
    if (step === 0 && (!companyName.trim() || !industry)) {
      setError('Company name and industry are required'); return
    }
    if (step === 1 && aiGoals.length === 0) {
      setError('Select at least one AI goal'); return
    }
    setError('')
    await saveDraft(step + 1)
    if (step < 3) setStep(s => s + 1)
  }

  async function handleIngestMaterials() {
    setBusy(true); setError(''); setIngestMsg('')
    try {
      await saveDraft(2)
      const result = await ingestOnboardingMaterials()
      if (result.alreadyDone) {
        setIngestMsg(`Already ingested (${result.count} items in knowledge base)`)
      } else if (result.ingested) {
        setIngested(true)
        setIngestMsg(`Ingested ${result.count} knowledge item${result.count !== 1 ? 's' : ''} from materials`)
      } else {
        setIngestMsg('No materials text to ingest — add content above first')
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Ingest failed') }
    finally { setBusy(false) }
  }

  async function handleGeneratePreview() {
    setBusy(true); setError('')
    try {
      await saveDraft(3)
      const result = await generateOnboardingPreview()
      setPreview(result.preview)
      setStep(3)
    } catch (e) { setError(e instanceof Error ? e.message : '预览生成失败') }
    finally { setBusy(false) }
  }

  async function handleEnable() {
    setBusy(true); setError('')
    try {
      await enableOnboarding()
      setEnabled(true)
      setStep(4)
    } catch (e) { setError(e instanceof Error ? e.message : '启用失败') }
    finally { setBusy(false) }
  }

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />

  // ── Step indicator ────────────────────────────────────────────────────────
  const StepBar = () => (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i < step ? 'bg-blue-600 text-white' : i === step ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-gray-100 text-gray-400'}`}>
            {i < step ? '✓' : i + 1}
          </div>
          <div className={`flex-1 h-1 ${i < STEPS.length - 1 ? (i < step ? 'bg-blue-600' : 'bg-gray-100') : 'hidden'}`} />
        </div>
      ))}
    </div>
  )

  if (enabled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
            <span className="text-emerald-600 text-2xl font-bold">✓</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Omni 已配置完成</h2>
          <p className="text-sm text-gray-500 mb-4">您的 AI 配置已就绪。下一步：连接 WhatsApp 渠道，然后检查知识库。</p>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-700 mb-4">
            <strong>提示：</strong>WhatsApp 渠道连接与真实发送是独立步骤 — 请使用下方的「渠道设置」。真实发送默认关闭以保障安全。
          </div>
          <div className="space-y-2">
            <a href="/channels/setup" className="block w-full bg-green-600 text-white rounded-xl py-3 text-sm font-semibold text-center hover:bg-green-700">
              设置 WhatsApp 渠道 →
            </a>
            <div className="flex gap-2">
              <a href="/knowledge" className="flex-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl py-2.5 text-sm font-semibold text-center hover:bg-purple-100">知识库 →</a>
              <a href="/boss" className="flex-1 bg-gray-100 text-gray-700 rounded-xl py-2.5 text-sm font-semibold text-center hover:bg-gray-200">工作台 →</a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">O</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">上线向导</h1>
            <p className="text-xs text-gray-400">配置您的 WhatsApp AI 客服</p>
          </div>
        </div>
        <a href="/boss" className="text-xs text-blue-600 hover:text-blue-700">← 返回工作台</a>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <StepBar />

        {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm mb-5">{error}</div>}

        {/* Step 0: Company Basics */}
        {step === 0 && (
          <div className="bg-white rounded-3xl shadow-sm p-8 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">公司基础</h2>
              <p className="text-sm text-gray-400 mt-1">告诉我们您的业务情况，以便为您配置合适的 AI 助手。</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">公司名称 *</label>
                <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="例如：阳光地产" value={companyName} onChange={e => setCompanyName(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">行业 *</label>
                <select className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white" value={industry} onChange={e => setIndustry(e.target.value)} required>
                  <option value="">请选择您的行业…</option>
                  {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">WhatsApp 号码（选填）</label>
                <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="例如：+60 12-345 6789" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">网站（选填）</label>
                  <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="https://…" value={website} onChange={e => setWebsite(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">服务区域（选填）</label>
                  <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="例如：吉隆坡" value={serviceArea} onChange={e => setServiceArea(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">营业时间（选填）</label>
                <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="例如：周一至周五 09:00-18:00" value={businessHours} onChange={e => setBusinessHours(e.target.value)} />
              </div>
            </div>
            <button onClick={handleNext} disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">下一步：AI 目标 →</button>
          </div>
        )}

        {/* Step 1: AI Goals */}
        {step === 1 && (
          <div className="bg-white rounded-3xl shadow-sm p-8 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">您希望 AI 完成什么任务？</h2>
              <p className="text-sm text-gray-400 mt-1">选择 WhatsApp AI 助手的工作目标。这将影响 AI 人设、回复风格与跟进规则。</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {AI_GOALS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => toggleGoal(value)}
                  className={`flex items-center gap-3 text-left rounded-2xl border p-4 transition-all ${aiGoals.includes(value) ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-200 hover:bg-blue-50/30'}`}
                >
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center text-xs font-bold flex-shrink-0 ${aiGoals.includes(value) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-transparent'}`}>✓</span>
                  <span className="text-sm font-medium text-gray-800">{label}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="flex-1 bg-gray-100 text-gray-600 rounded-xl py-3 text-sm font-medium hover:bg-gray-200">← 上一步</button>
              <button onClick={handleNext} disabled={busy || aiGoals.length === 0} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">下一步：产品资料 →</button>
            </div>
          </div>
        )}

        {/* Step 2: Materials */}
        {step === 2 && (
          <div className="bg-white rounded-3xl shadow-sm p-8 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">您的产品与服务</h2>
              <p className="text-sm text-gray-400 mt-1">粘贴您的产品 / 服务信息，系统将用于配置 AI 知识库与自动跟进话术。</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">产品 / 服务描述</label>
                <textarea
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  rows={8}
                  placeholder={`在此粘贴您的产品 / 服务详情。\n\n参考内容：\n- 产品名称与价格\n- 主要功能与卖点\n- 套餐 / 服务方案\n- 常见问题与答案\n- 差异化优势`}
                  value={materialsText}
                  onChange={e => setMaterialsText(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">参考链接（选填）</label>
                <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="https://your-website.com/products" value={materialsUrl} onChange={e => setMaterialsUrl(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">PDF / 文件上传即将推出，目前请直接粘贴内容到上方。</p>
              </div>

              {/* Ingestion button */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-indigo-800">构建知识库</p>
                    <p className="text-xs text-indigo-600 mt-0.5">将您的资料解析为可检索的 FAQ 与知识条目</p>
                  </div>
                  <button
                    onClick={() => { void handleIngestMaterials() }}
                    disabled={busy || !materialsText.trim()}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 ${ingested ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                  >
                    {busy ? '解析中…' : ingested ? '✓ 已解析' : '解析资料'}
                  </button>
                </div>
                {ingestMsg && (
                  <p className={`text-xs font-medium ${ingested ? 'text-emerald-700' : 'text-indigo-600'}`}>
                    {ingested ? '✓ ' : ''}{ingestMsg}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 bg-gray-100 text-gray-600 rounded-xl py-3 text-sm font-medium hover:bg-gray-200">← 上一步</button>
              <button onClick={handleGeneratePreview} disabled={busy} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
                {busy ? '生成中…' : '生成预览 →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl shadow-sm p-8">
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-xl font-bold text-gray-900">AI 配置预览</h2>
                {preview && <ModeBadge mode={preview.generationMode} />}
              </div>
              <p className="text-sm text-gray-400 mb-5">
                {preview?.generationMode === 'AI_GENERATED'
                  ? '基于您的 AI 服务商生成，已为您的业务个性化。'
                  : '基于您填写的内容使用确定性模板生成。未调用任何真实 AI 服务商。'}
              </p>

              {preview ? (
                <div className="space-y-5">
                  {/* Missing info warnings */}
                  {preview.missingInfoWarnings.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-amber-700 mb-2">信息不足提醒</p>
                      <ul className="space-y-1">
                        {preview.missingInfoWarnings.map((w, i) => (
                          <li key={i} className="text-xs text-amber-700">• {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* AI Persona */}
                  <div className="bg-blue-50 rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-blue-800 mb-2">AI 人设</h3>
                    <p className="text-sm text-blue-900"><strong>{preview.aiPersona.name}</strong> — {preview.aiPersona.tone}</p>
                    <p className="text-xs text-blue-700 mt-1">侧重：{preview.aiPersona.focus}</p>
                  </div>

                  {/* Welcome Message */}
                  <div className="bg-gray-50 rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">欢迎语</h3>
                    <p className="text-sm text-gray-800 leading-relaxed">{preview.welcomeMessage}</p>
                  </div>

                  {/* FAQ Samples */}
                  {preview.faqSamples.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">FAQ 回复样例</h3>
                      <div className="space-y-2">
                        {preview.faqSamples.slice(0, 3).map((faq, i) => (
                          <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <p className="text-xs font-semibold text-gray-600 mb-1">{faq.question}</p>
                            <p className="text-xs text-gray-700 leading-relaxed">{faq.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    {/* FAQ Categories */}
                    <div className="bg-gray-50 rounded-2xl p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">FAQ 分类</h3>
                      <ul className="space-y-1">
                        {preview.faqCategories.map((c, i) => <li key={i} className="text-xs text-gray-700">• {c}</li>)}
                      </ul>
                    </div>
                    {/* Follow-up Scenarios */}
                    <div className="bg-gray-50 rounded-2xl p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">自动跟进场景</h3>
                      <ul className="space-y-1">
                        {preview.followUpScenarios.map((s, i) => <li key={i} className="text-xs text-gray-700">• {s.replace(/_/g, ' ')}</li>)}
                      </ul>
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">推荐标签</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {preview.recommendedTags.map((t, i) => <span key={i} className="bg-blue-50 text-blue-600 text-xs px-2.5 py-1 rounded-full">#{t}</span>)}
                    </div>
                  </div>

                  {/* System Prompt Preview */}
                  {preview.globalSystemPrompt && (
                    <details className="bg-gray-50 rounded-2xl border border-gray-200">
                      <summary className="px-4 py-3 text-xs font-semibold text-gray-600 cursor-pointer">系统提示词预览</summary>
                      <pre className="px-4 pb-4 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed overflow-auto max-h-40">{preview.globalSystemPrompt}</pre>
                    </details>
                  )}

                  {/* Ingestion status */}
                  {preview.ingestedKbCount !== undefined && preview.ingestedKbCount > 0 && (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                      <span>✓</span>
                      <span>已从资料中解析 {preview.ingestedKbCount} 条知识条目</span>
                      <a href="/knowledge" className="ml-auto text-emerald-600 hover:text-emerald-800 font-medium">查看 →</a>
                    </div>
                  )}

                  <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-700">
                    <strong>提示：</strong>{preview.note}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">正在生成预览…</p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 bg-gray-100 text-gray-600 rounded-xl py-3 text-sm font-medium hover:bg-gray-200">← 编辑资料</button>
              <button onClick={handleEnable} disabled={busy || !preview} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
                {busy ? '启用中…' : '启用配置 →'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
