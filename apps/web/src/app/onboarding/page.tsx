'use client'

import { useEffect, useState } from 'react'
import {
  getToken, login, saveOnboardingDraft, generateOnboardingPreview,
  ingestOnboardingMaterials, enableOnboarding, fetchOnboardingStatus,
  generateProductSalesConfig, saveProductSalesConfig, saveFaqToKnowledge,
  type OnboardingPreview,
  type ProductSalesConfig, type FaqDraft, type ProductSetupRecord, type ProductSetupStatus,
} from '@/lib/api'

// ── Round-8 Product Intelligence types (local UI shape) ──────────────────────
interface ProductDraft {
  productId:           string
  productName:         string
  productCategory:     string
  suitableCustomers:   string
  sellingPoints:       string
  pricing:             string
  purchaseFlow:        string
  requiredCustomerInfo:string
  handoffConditions:   string
  extraNotes:          string
  pastedMaterialText:  string
  referenceUrl:        string
  uploadedFile?:       { filename: string; sizeBytes: number; mimeType: string }
  salesConfig?:        ProductSalesConfig
  status:              ProductSetupStatus
  lastUpdatedAt?:      string
}

const PRODUCT_STATUS_LABEL: Record<ProductSetupStatus, string> = {
  PENDING_INPUT:      '待填写资料',
  PENDING_GENERATION: '待生成配置',
  GENERATED:          '已生成配置',
  FAQ_SAVED:          '已保存 FAQ',
  ENABLED:            '已启用',
}
const PRODUCT_STATUS_STYLE: Record<ProductSetupStatus, string> = {
  PENDING_INPUT:      'bg-gray-100 text-gray-600',
  PENDING_GENERATION: 'bg-amber-100 text-amber-700',
  GENERATED:          'bg-blue-100 text-blue-700',
  FAQ_SAVED:          'bg-emerald-100 text-emerald-700',
  ENABLED:            'bg-emerald-600 text-white',
}

function newEmptyProduct(idx: number): ProductDraft {
  return {
    productId:           `prod_${Date.now().toString(36)}_${idx}`,
    productName:         `产品 ${idx + 1}`,
    productCategory:     '',
    suitableCustomers:   '',
    sellingPoints:       '',
    pricing:             '',
    purchaseFlow:        '',
    requiredCustomerInfo:'',
    handoffConditions:   '',
    extraNotes:          '',
    pastedMaterialText:  '',
    referenceUrl:        '',
    status:              'PENDING_INPUT',
  }
}

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
  const [authed,   setAuthed]   = useState<boolean | null>(null)
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

  // ── Round-8: Product Intelligence Setup state ──────────────────────────────
  const [products,    setProducts]    = useState<ProductDraft[]>([newEmptyProduct(0)])
  const [activeIdx,   setActiveIdx]   = useState(0)
  const [generating,  setGenerating]  = useState(false)
  const [savingFaq,   setSavingFaq]   = useState(false)
  const [productMsg,  setProductMsg]  = useState('')
  const updateActive = (patch: Partial<ProductDraft>) =>
    setProducts(prev => prev.map((p, i) => (i === activeIdx ? { ...p, ...patch, lastUpdatedAt: new Date().toISOString() } : p)))
  const current = products[activeIdx]

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

  // ── Round-8 product handlers ────────────────────────────────────────────────
  function addProduct() {
    if (products.length >= 20) { setError('每个租户最多 20 个产品'); return }
    setProducts(prev => {
      const next = [...prev, newEmptyProduct(prev.length)]
      setActiveIdx(next.length - 1)
      return next
    })
    setProductMsg('')
  }
  function removeProduct() {
    if (products.length <= 1) return
    if (!confirm(`删除产品「${current.productName}」？已生成的草稿会一起删除。`)) return
    setProducts(prev => prev.filter((_, i) => i !== activeIdx))
    setActiveIdx(0)
    setProductMsg('')
  }
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 10 * 1024 * 1024) { setError('文件超过 10 MB 限制'); return }
    const allowed = /\.(pdf|docx?|txt|md|png|jpe?g)$/i
    if (!allowed.test(f.name)) { setError('支持的文件类型：PDF / DOC / DOCX / TXT / MD / PNG / JPG'); return }
    setError('')
    updateActive({ uploadedFile: { filename: f.name, sizeBytes: f.size, mimeType: f.type || 'application/octet-stream' } })
    // For .txt/.md only, surface text content into pasted area as a hint
    if (/\.(txt|md)$/i.test(f.name) && f.size < 200 * 1024) {
      f.text().then(text => {
        updateActive({ pastedMaterialText: (current.pastedMaterialText ? current.pastedMaterialText + '\n\n' : '') + text })
      }).catch(() => null)
    } else {
      setProductMsg('当前版本会先记录文件，建议同时粘贴关键文字内容以生成 FAQ。')
    }
  }
  async function handleGenerateProductConfig() {
    if (!current.productName.trim()) { setError('请填写产品名称'); return }
    setGenerating(true); setError(''); setProductMsg('')
    try {
      const res = await generateProductSalesConfig({
        productId:           current.productId,
        productName:         current.productName,
        productCategory:     current.productCategory || undefined,
        suitableCustomers:   current.suitableCustomers || undefined,
        sellingPoints:       current.sellingPoints || undefined,
        pricing:             current.pricing || undefined,
        purchaseFlow:        current.purchaseFlow || undefined,
        requiredCustomerInfo:current.requiredCustomerInfo || undefined,
        handoffConditions:   current.handoffConditions || undefined,
        extraNotes:          current.extraNotes || undefined,
        pastedMaterialText:  current.pastedMaterialText || undefined,
        referenceUrl:        current.referenceUrl || undefined,
        uploadedFile:        current.uploadedFile,
        desiredFaqCount:     40,
      })
      updateActive({ salesConfig: res.config, status: 'GENERATED' })
      setProductMsg(`已生成 ${res.config.faqDrafts.length} 条 FAQ 草稿，请检查后再保存。`)
      // Persist updated products array
      void persistProducts()
    } catch (e) { setError(e instanceof Error ? e.message : '生成失败') }
    finally { setGenerating(false) }
  }
  async function persistProducts() {
    try {
      const recs: ProductSetupRecord[] = products.map(p => ({
        productId:           p.productId,
        productName:         p.productName,
        productCategory:     p.productCategory || undefined,
        suitableCustomers:   p.suitableCustomers || undefined,
        sellingPoints:       p.sellingPoints || undefined,
        pricing:             p.pricing || undefined,
        purchaseFlow:        p.purchaseFlow || undefined,
        requiredCustomerInfo:p.requiredCustomerInfo || undefined,
        handoffConditions:   p.handoffConditions || undefined,
        extraNotes:          p.extraNotes || undefined,
        pastedMaterialText:  p.pastedMaterialText || undefined,
        referenceUrl:        p.referenceUrl || undefined,
        uploadedFile:        p.uploadedFile,
        salesConfig:         p.salesConfig,
        status:              p.status,
        lastUpdatedAt:       p.lastUpdatedAt,
      }))
      await saveProductSalesConfig(recs)
    } catch { /* non-blocking */ }
  }
  function toggleFaq(idx: number) {
    if (!current.salesConfig) return
    const next: FaqDraft[] = current.salesConfig.faqDrafts.map((f, i) => i === idx ? { ...f, isSelected: !f.isSelected } : f)
    updateActive({ salesConfig: { ...current.salesConfig, faqDrafts: next } })
  }
  function editFaq(idx: number, patch: Partial<FaqDraft>) {
    if (!current.salesConfig) return
    const next: FaqDraft[] = current.salesConfig.faqDrafts.map((f, i) => i === idx ? { ...f, ...patch } : f)
    updateActive({ salesConfig: { ...current.salesConfig, faqDrafts: next } })
  }
  function deleteFaq(idx: number) {
    if (!current.salesConfig) return
    const next = current.salesConfig.faqDrafts.filter((_, i) => i !== idx)
    updateActive({ salesConfig: { ...current.salesConfig, faqDrafts: next } })
  }
  async function handleSaveFaqToKb() {
    if (!current.salesConfig) return
    const selected = current.salesConfig.faqDrafts.filter(f => f.isSelected)
    if (selected.length === 0) { setError('请至少选择一条 FAQ'); return }
    setSavingFaq(true); setError(''); setProductMsg('')
    try {
      const res = await saveFaqToKnowledge(
        current.productName,
        selected.map(f => ({ question: f.question, answer: f.answer, category: f.category, language: 'zh' })),
      )
      updateActive({ status: 'FAQ_SAVED' })
      setProductMsg(`已保存 ${res.saved} 条 FAQ 到知识库${res.skippedDuplicates > 0 ? `，跳过 ${res.skippedDuplicates} 条重复` : ''}。`)
      void persistProducts()
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败') }
    finally { setSavingFaq(false) }
  }
  async function handleSaveProductConfig() {
    setBusy(true); setError(''); setProductMsg('')
    try { await persistProducts(); setProductMsg('产品配置已保存到草稿。') }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败') }
    finally { setBusy(false) }
  }

  if (authed === null) return null

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

        {/* Step 2: Product Intelligence Setup (Round-8) */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Header card */}
            <div className="bg-white rounded-3xl shadow-sm p-8 space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">产品智能配置</h2>
                <p className="text-sm text-gray-500 mt-1">您不需要自己写 FAQ，Omni 会根据产品资料自动生成草稿。</p>
                <p className="text-xs text-gray-400 mt-1">生成结果不会直接上线，您可以先检查、修改，再保存。当前不会发送真实 WhatsApp 消息。</p>
              </div>

              {/* Product selector chips */}
              <div className="flex flex-wrap items-center gap-2">
                {products.map((p, i) => (
                  <button
                    key={p.productId}
                    onClick={() => setActiveIdx(i)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${i === activeIdx ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}
                    title={`当前产品：${p.productName} — ${PRODUCT_STATUS_LABEL[p.status]}`}
                  >
                    {p.productName}
                    <span className={`ml-2 inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full ${PRODUCT_STATUS_STYLE[p.status]}`}>{PRODUCT_STATUS_LABEL[p.status]}</span>
                  </button>
                ))}
                <button onClick={addProduct} className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600" title="新增产品">+ 新增产品</button>
                {products.length > 1 && (
                  <button onClick={removeProduct} className="ml-auto px-3 py-1.5 rounded-full text-xs font-medium text-red-600 hover:bg-red-50" title={`删除当前产品 ${current.productName}`}>删除当前产品</button>
                )}
              </div>
            </div>

            {/* Product basic fields */}
            <div className="bg-white rounded-3xl shadow-sm p-8 space-y-4">
              <h3 className="text-base font-semibold text-gray-900">当前产品基础资料</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">产品名称 *</label>
                  <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="例如：阳光地产高级套餐" value={current.productName} onChange={e => updateActive({ productName: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">产品分类 / 类型</label>
                  <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="例如：住宅 / 课程 / SaaS" value={current.productCategory} onChange={e => updateActive({ productCategory: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">适合客户</label>
                  <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="例如：首次置业的年轻家庭，预算 30-80 万" value={current.suitableCustomers} onChange={e => updateActive({ suitableCustomers: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">主要卖点</label>
                  <textarea rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none" placeholder="一两句话概括核心卖点" value={current.sellingPoints} onChange={e => updateActive({ sellingPoints: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">价格 / 套餐</label>
                  <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="例如：基础 199 / 专业 499 / 企业 999" value={current.pricing} onChange={e => updateActive({ pricing: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">购买 / 预约 / 使用流程</label>
                  <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="例如：填表 → 沟通 → 看房 → 签约" value={current.purchaseFlow} onChange={e => updateActive({ purchaseFlow: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">客户需要提供什么资料</label>
                  <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="例如：联系方式、预算、看房时间" value={current.requiredCustomerInfo} onChange={e => updateActive({ requiredCustomerInfo: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">什么时候需要转人工</label>
                  <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="例如：要看合同、要谈优惠、要付订金" value={current.handoffConditions} onChange={e => updateActive({ handoffConditions: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">其他补充资料（选填）</label>
                  <textarea rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none" placeholder="任何 AI 应该知道的注意事项" value={current.extraNotes} onChange={e => updateActive({ extraNotes: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Material input modes */}
            <div className="bg-white rounded-3xl shadow-sm p-8 space-y-4">
              <h3 className="text-base font-semibold text-gray-900">产品资料输入</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">粘贴产品资料</label>
                  <textarea rows={5} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none" placeholder="粘贴产品手册 / 服务说明 / 详细文字资料" value={current.pastedMaterialText} onChange={e => updateActive({ pastedMaterialText: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">输入产品网页链接（选填）</label>
                  <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="https://your-website.com/products" value={current.referenceUrl} onChange={e => updateActive({ referenceUrl: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">上传产品介绍文件（PDF / DOC / DOCX / TXT / MD / 图片）</label>
                  <label className="flex items-center justify-between gap-3 border border-dashed border-gray-300 rounded-xl px-4 py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all">
                    <span className="text-sm text-gray-600">{current.uploadedFile ? `${current.uploadedFile.filename}（${Math.round(current.uploadedFile.sizeBytes / 1024)} KB）` : '选择文件…'}</span>
                    <span className="px-3 py-1 bg-gray-100 text-xs text-gray-600 rounded-md">浏览</span>
                    <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.md,image/*" onChange={handleFileSelect} />
                  </label>
                  <p className="text-xs text-gray-400 mt-1.5">PDF / DOCX / 图片当前版本会先记录文件名与大小，建议同时粘贴关键文字内容到上方以生成 FAQ。</p>
                </div>
              </div>
            </div>

            {/* Primary action */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-3xl p-6 space-y-3">
              <div>
                <p className="text-sm font-semibold text-blue-900">一键生成产品成交配置</p>
                <p className="text-xs text-blue-700 mt-1">系统将根据产品资料生成 FAQ、销售话术、客户资格问题、标签、评分规则、跟进规则和转人工规则。</p>
                <p className="text-xs text-blue-700">仅生成草稿，您可以先检查再保存。不会发送真实 WhatsApp 消息。</p>
              </div>
              <button onClick={handleGenerateProductConfig} disabled={generating || !current.productName.trim()} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
                {generating ? '生成中…' : '一键生成产品成交配置 →'}
              </button>
              {productMsg && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{productMsg}</p>}
            </div>

            {/* Review of generated config */}
            {current.salesConfig && (
              <div className="bg-white rounded-3xl shadow-sm p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900">已生成的产品成交配置（草稿）</h3>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">模式：{current.salesConfig.mode}</span>
                </div>

                {/* Product profile */}
                <details open className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
                  <summary className="text-sm font-semibold text-gray-800 cursor-pointer">产品档案</summary>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-700">
                    <div><strong>产品简介：</strong>{current.salesConfig.productProfile.summary}</div>
                    <div><strong>适合客户：</strong>{current.salesConfig.productProfile.suitableCustomers}</div>
                    <div><strong>核心卖点：</strong>{current.salesConfig.productProfile.sellingPoints}</div>
                    <div><strong>价格说明：</strong>{current.salesConfig.productProfile.pricing}</div>
                    <div><strong>购买流程：</strong>{current.salesConfig.productProfile.purchaseFlow}</div>
                    <div><strong>AI 回复边界：</strong>{current.salesConfig.productProfile.aiReplyBoundary}</div>
                  </div>
                </details>

                {/* FAQ list */}
                <details open className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
                  <summary className="text-sm font-semibold text-gray-800 cursor-pointer">FAQ / 常见问题（已生成 {current.salesConfig.faqDrafts.length} 条草稿）</summary>
                  <div className="mt-3 space-y-2 max-h-96 overflow-y-auto pr-1">
                    {current.salesConfig.faqDrafts.map((f, i) => (
                      <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-3 text-xs">
                        <div className="flex items-start gap-2">
                          <input type="checkbox" checked={f.isSelected} onChange={() => toggleFaq(i)} className="mt-0.5" title="勾选以保存到知识库" />
                          <div className="flex-1 space-y-1.5">
                            <input className="w-full font-semibold text-gray-800 bg-transparent border-b border-gray-100 focus:border-blue-400 outline-none" value={f.question} onChange={e => editFaq(i, { question: e.target.value })} />
                            <textarea rows={2} className="w-full text-gray-600 bg-transparent border-b border-gray-100 focus:border-blue-400 outline-none resize-none" value={f.answer} onChange={e => editFaq(i, { answer: e.target.value })} />
                            <div className="flex items-center justify-between text-[10px] text-gray-400">
                              <input className="bg-transparent" value={f.category} onChange={e => editFaq(i, { category: e.target.value })} />
                              <button onClick={() => deleteFaq(i)} className="text-red-500 hover:text-red-700" title="删除此 FAQ">删除</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={handleSaveFaqToKb} disabled={savingFaq} className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">
                    {savingFaq ? '保存中…' : `保存选中的 FAQ 到知识库（${current.salesConfig.faqDrafts.filter(f => f.isSelected).length} 条）`}
                  </button>
                </details>

                {/* Sales scripts */}
                <details className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
                  <summary className="text-sm font-semibold text-gray-800 cursor-pointer">AI 销售话术（{current.salesConfig.salesScripts.length} 个场景）</summary>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {current.salesConfig.salesScripts.map((s, i) => (
                      <div key={i} className="bg-white rounded-xl border border-gray-200 p-3 text-xs">
                        <p className="font-semibold text-gray-800">{s.title}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{s.scenario} · {s.tone}</p>
                        <p className="text-gray-600 mt-2 leading-relaxed">{s.script}</p>
                      </div>
                    ))}
                  </div>
                </details>

                {/* Qualification questions */}
                <details className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
                  <summary className="text-sm font-semibold text-gray-800 cursor-pointer">客户资格问题（{current.salesConfig.qualificationQuestions.length} 个）</summary>
                  <ul className="mt-3 space-y-1 text-xs text-gray-700">
                    {current.salesConfig.qualificationQuestions.map((q, i) => (
                      <li key={i}>• <strong>{q.question}</strong> <span className="text-gray-400">— {q.purpose}</span></li>
                    ))}
                  </ul>
                </details>

                {/* Tags */}
                <details className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
                  <summary className="text-sm font-semibold text-gray-800 cursor-pointer">客户标签（{current.salesConfig.suggestedTags.length}）</summary>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {current.salesConfig.suggestedTags.map((t, i) => <span key={i} className="bg-blue-50 text-blue-600 text-xs px-2.5 py-1 rounded-full">#{t}</span>)}
                  </div>
                </details>

                {/* Scoring */}
                <details className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
                  <summary className="text-sm font-semibold text-gray-800 cursor-pointer">意向评分规则（{current.salesConfig.leadScoringRules.length} 条 · 草稿，可稍后在规则中心调整）</summary>
                  <ul className="mt-3 space-y-1 text-xs text-gray-700">
                    {current.salesConfig.leadScoringRules.map((r, i) => (
                      <li key={i}>• {r.description} <span className={`ml-1 font-mono ${r.adjustment >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{r.adjustment > 0 ? '+' : ''}{r.adjustment}</span></li>
                    ))}
                  </ul>
                </details>

                {/* Follow-up */}
                <details className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
                  <summary className="text-sm font-semibold text-gray-800 cursor-pointer">自动跟进规则（{current.salesConfig.followUpRules.length} 条 · 草稿，启用前不会真实发送）</summary>
                  <ul className="mt-3 space-y-2 text-xs text-gray-700">
                    {current.salesConfig.followUpRules.map((r, i) => (
                      <li key={i} className="bg-white border border-gray-200 rounded-lg p-2">
                        <p><strong>{r.scenario}</strong> · 延迟 {r.delay}</p>
                        <p className="text-gray-500 mt-0.5">{r.description}</p>
                        <p className="text-gray-400 mt-0.5 italic">"{r.message}"</p>
                      </li>
                    ))}
                  </ul>
                </details>

                {/* Handoff */}
                <details className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
                  <summary className="text-sm font-semibold text-gray-800 cursor-pointer">转人工规则（{current.salesConfig.handoffRules.length} 条 · 草稿）</summary>
                  <ul className="mt-3 space-y-1 text-xs text-gray-700">
                    {current.salesConfig.handoffRules.map((r, i) => (
                      <li key={i}>• <strong>{r.trigger}</strong> — {r.description}</li>
                    ))}
                  </ul>
                </details>

                {/* Coverage hints */}
                {current.salesConfig.summary.missingFields.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-700">
                    <strong>覆盖提示：</strong>{current.salesConfig.summary.coverageNote}
                  </div>
                )}

                <button onClick={handleSaveProductConfig} disabled={busy} className="w-full bg-gray-800 hover:bg-gray-900 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">
                  {busy ? '保存中…' : '保存产品配置（写入草稿，不会真实发送）'}
                </button>
              </div>
            )}

            {/* Optional: legacy single textarea fallback (kept for back-compat with /onboarding/ingest-materials) */}
            <details className="bg-white rounded-3xl shadow-sm p-6">
              <summary className="text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700">高级：使用旧版单一文本框（兼容旧 onboarding/ingest-materials）</summary>
              <div className="mt-4 space-y-3">
                <textarea rows={4} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-400 resize-none" placeholder="（可选）使用旧版整段贴入" value={materialsText} onChange={e => setMaterialsText(e.target.value)} />
                <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-400" placeholder="（可选）参考链接" value={materialsUrl} onChange={e => setMaterialsUrl(e.target.value)} />
                <button onClick={() => { void handleIngestMaterials() }} disabled={busy || !materialsText.trim()} className={`px-3 py-1.5 text-xs rounded-lg disabled:opacity-50 ${ingested ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'}`}>{busy ? '解析中…' : ingested ? '✓ 已解析' : '解析旧版资料'}</button>
                {ingestMsg && <p className="text-xs text-indigo-600">{ingestMsg}</p>}
              </div>
            </details>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 bg-gray-100 text-gray-600 rounded-xl py-3 text-sm font-medium hover:bg-gray-200">← 上一步</button>
              <button onClick={handleGeneratePreview} disabled={busy} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
                {busy ? '生成中…' : '继续下一步：预览 AI 配置 →'}
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
