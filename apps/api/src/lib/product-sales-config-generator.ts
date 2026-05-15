// Product Sales Config Generator — Phase 19 / Round-8
//
// Deterministic, stub-mode generator. Produces a draft sales-config bundle from
// product setup fields supplied by the tenant. NO external provider call.
//
// Output bundle:
//   - productProfile           — Chinese product summary (售前/售后/AI 边界)
//   - faqDrafts                — 30–50 FAQ drafts in Chinese, categorised
//   - salesScripts             — Common sales-scenario reply scripts
//   - qualificationQuestions   — Questions AI should ask the customer
//   - suggestedTags            — CRM tags to apply
//   - leadScoringRules         — Default scoring deltas
//   - followUpRules            — Default follow-up scenarios
//   - handoffRules             — Default transfer-to-human triggers
//   - summary                  — counts + coverage hints
//
// Safety:
//   - Never hallucinates exact prices, warranties, delivery promises, medical
//     or legal claims. Missing-fact answers say "资料中未明确说明，建议转人工确认。"
//   - All outputs are drafts; not auto-applied to KnowledgeItem, FollowUpRule
//     or HandoffRule tables. Saving is a separate, explicit tenant action.

export interface ProductSetupInput {
  productId?:              string
  productName:             string
  productCategory?:        string
  suitableCustomers?:      string
  sellingPoints?:          string
  pricing?:                string
  purchaseFlow?:           string
  requiredCustomerInfo?:   string
  handoffConditions?:      string
  extraNotes?:             string
  pastedMaterialText?:     string
  referenceUrl?:           string
  /** Uploaded-file metadata only — never contains raw file bytes. */
  uploadedFile?: {
    filename?:     string
    sizeBytes?:    number
    mimeType?:     string
    extractedText?: string  // only when caller could safely extract (.txt/.md)
  }
  /** 30–50; default 40. Clamped to [30, 50]. */
  desiredFaqCount?: number
}

export interface FaqDraft {
  id:           string
  question:     string
  answer:       string
  category:     string
  productName:  string
  isSelected:   boolean
  source:       'generated_draft'
  /** Round-9I: true if this FAQ answer is the missing-info fallback. */
  hasMissingInfo?: boolean
}

/** Round-9I: company-level (non-product) FAQ for general/company questions. */
export interface CompanyFaqDraft {
  id:          string
  question:    string
  answer:      string
  category:    string
  isSelected:  boolean
  source:      'generated_draft'
  hasMissingInfo?: boolean
}

/** Round-9I: tenant-friendly Chinese label mapping for product-input fields. */
export const PRODUCT_FIELD_LABELS_ZH: Record<string, string> = {
  productCategory:       '产品分类',
  suitableCustomers:     '适合客户',
  sellingPoints:         '核心卖点',
  pricing:               '价格 / 套餐',
  purchaseFlow:          '购买流程',
  requiredCustomerInfo:  '客户需要提供的资料',
  handoffConditions:     '转人工条件',
  extraNotes:            '补充说明',
}

/** Round-9I: completeness tier for elastic FAQ count. */
export type CompletenessTier = 'minimal' | 'moderate' | 'complete'

export interface SalesScript {
  title:    string
  scenario: string
  script:   string
  tone:     'friendly' | 'professional' | 'concise'
}

export interface QualificationQuestion {
  question: string
  purpose:  string
}

export interface LeadScoringRule {
  trigger:     string
  adjustment:  number
  description: string
}

export interface FollowUpRule {
  scenario:    string
  delay:       string
  message:     string
  description: string
}

export interface HandoffRule {
  trigger:     string
  description: string
}

export interface ProductProfile {
  summary:          string
  suitableCustomers:string
  sellingPoints:    string
  pricing:          string
  purchaseFlow:     string
  restrictions:     string
  afterSales:       string
  aiReplyBoundary:  string
}

export interface ProductSalesConfig {
  productId:              string
  productName:            string
  generatedAt:            string
  mode:                   'deterministic_stub'
  productProfile:         ProductProfile
  faqDrafts:              FaqDraft[]
  salesScripts:           SalesScript[]
  qualificationQuestions: QualificationQuestion[]
  suggestedTags:          string[]
  leadScoringRules:       LeadScoringRule[]
  followUpRules:          FollowUpRule[]
  handoffRules:           HandoffRule[]
  summary: {
    faqCount:           number
    pricingFaqCount:    number
    handoffFaqCount:    number
    objectionFaqCount:  number
    processFaqCount:    number
    missingFields:      string[]
    /** Round-9I: tenant-readable Chinese labels for missingFields. */
    missingFieldLabels: string[]
    /** Round-9I: completeness tier driving elastic count. */
    completenessTier:   CompletenessTier
    /** Round-9I: number of fields populated out of weighted total. */
    completenessScore:  number
    completenessMax:    number
    /** Round-9I: number of FAQ that fell back to "建议人工确认". */
    missingInfoFaqCount: number
    hasPricing:         boolean
    hasPurchaseFlow:    boolean
    hasUploadedFile:    boolean
    hasReferenceUrl:    boolean
    materialCharCount:  number
    coverageNote:       string
  }
  /** Round-9I: tenant-facing guidance for missing data. Never empty when missingFields > 0. */
  missingDataGuidance?: {
    headline:  string  // "以下资料还没填写..."
    items:     string[] // ["适合客户", "核心卖点", ...]
    ctaLabel:  string  // "去补充资料"
  }
  /** Round-9I: tenant-friendly Chinese rendering of qualification/tags/scoring/follow-up/handoff. */
  tenantFriendlyRules: {
    qualification: { headline: string; items: string[] }
    tags:          { headline: string; items: string[] }
    scoring:       { headline: string; items: string[] }
    followUp:      { headline: string; items: string[] }
    handoff:       { headline: string; items: string[] }
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

const MISSING_ANSWER = '资料中未明确说明，建议转人工确认。'

function nonEmpty(s?: string): string | undefined {
  if (!s) return undefined
  const t = s.trim()
  return t.length === 0 ? undefined : t
}

function safeId(productId: string, idx: number): string {
  return `faq_${productId}_${String(idx).padStart(3, '0')}`
}

function clampFaqCount(n?: number): number {
  if (typeof n !== 'number' || isNaN(n)) return 40
  return Math.max(8, Math.min(50, Math.floor(n)))
}

/**
 * Round-9I: classify completeness based on populated fields + supplemental
 * material (uploaded file extracted text + pasted material + reference URL).
 *
 * Score range 0..8. Tiers:
 *   - minimal  (0..2)  → target ~8-12 FAQ
 *   - moderate (3..5)  → target ~15-25 FAQ
 *   - complete (6..8)  → target ~30-40 FAQ
 */
function computeCompleteness(input: ProductSetupInput): {
  tier:  CompletenessTier
  score: number
  max:   number
  targetFaqCount: number
} {
  let score = 0
  if (nonEmpty(input.suitableCustomers))    score++
  if (nonEmpty(input.sellingPoints))        score++
  if (nonEmpty(input.pricing))              score++
  if (nonEmpty(input.purchaseFlow))         score++
  if (nonEmpty(input.requiredCustomerInfo)) score++
  if (nonEmpty(input.productCategory))      score++
  if (nonEmpty(input.extraNotes))           score++
  const materialChars =
    (input.pastedMaterialText?.length ?? 0) +
    (input.uploadedFile?.extractedText?.length ?? 0)
  if (materialChars >= 200 || nonEmpty(input.referenceUrl)) score++
  const max = 8

  let tier: CompletenessTier
  let target: number
  if (score <= 2)      { tier = 'minimal';  target = 10 }   // 8..12 band
  else if (score <= 5) { tier = 'moderate'; target = 20 }   // 15..25 band
  else                 { tier = 'complete'; target = 35 }   // 30..40 band

  // Respect caller override but always inside [8, 50]
  if (typeof input.desiredFaqCount === 'number' && !isNaN(input.desiredFaqCount)) {
    target = clampFaqCount(input.desiredFaqCount)
  }

  return { tier, score, max, targetFaqCount: target }
}

// ── product profile ────────────────────────────────────────────────────────

function buildProductProfile(input: ProductSetupInput): ProductProfile {
  const name = input.productName
  const cat  = nonEmpty(input.productCategory)
  const sp   = nonEmpty(input.sellingPoints)
  const sc   = nonEmpty(input.suitableCustomers)
  const pr   = nonEmpty(input.pricing)
  const pf   = nonEmpty(input.purchaseFlow)
  const ex   = nonEmpty(input.extraNotes)

  return {
    summary: cat
      ? `${name}（${cat}）。${sp ? '核心卖点：' + sp + '。' : ''}${ex ? '补充说明：' + ex + '。' : ''}`.trim()
      : `${name}。${sp ? '核心卖点：' + sp + '。' : ''}${ex ? '补充说明：' + ex + '。' : ''}`.trim() || `${name}。${MISSING_ANSWER}`,
    suitableCustomers: sc ?? MISSING_ANSWER,
    sellingPoints:     sp ?? MISSING_ANSWER,
    pricing:           pr ?? MISSING_ANSWER,
    purchaseFlow:      pf ?? MISSING_ANSWER,
    restrictions:      MISSING_ANSWER,
    afterSales:        MISSING_ANSWER,
    aiReplyBoundary:
      'AI 仅根据您提供的产品资料作答。涉及合同、价格优惠、医疗/法律建议、退款/投诉、个人付款等敏感场景，AI 会自动转人工，不会自作主张。',
  }
}

// ── FAQ generation ────────────────────────────────────────────────────────

interface FaqSeed {
  question: string
  answer:   string
  category: string
}

function buildFaqSeeds(input: ProductSetupInput): FaqSeed[] {
  const name = input.productName
  const cat  = nonEmpty(input.productCategory) ?? ''
  const sp   = nonEmpty(input.sellingPoints)
  const sc   = nonEmpty(input.suitableCustomers)
  const pr   = nonEmpty(input.pricing)
  const pf   = nonEmpty(input.purchaseFlow)
  const need = nonEmpty(input.requiredCustomerInfo)
  const ho   = nonEmpty(input.handoffConditions)
  const ex   = nonEmpty(input.extraNotes)

  const seeds: FaqSeed[] = []

  // 产品介绍 (≥4)
  seeds.push({ question: `${name} 是什么？`,                                  answer: sp ? `${name} 是${cat ? cat + '类' : ''}产品。核心卖点：${sp}。${ex ? '补充：' + ex : ''}` : `${name} 是${cat ? cat + '类' : ''}产品。${MISSING_ANSWER}`, category: '产品介绍' })
  seeds.push({ question: `${name} 主要功能有哪些？`,                          answer: sp ? `${name} 主要包括：${sp}。如需详细功能清单，建议转人工提供完整资料。` : MISSING_ANSWER, category: '产品介绍' })
  seeds.push({ question: `${name} 跟其他同类产品的区别？`,                    answer: sp ? `${name} 的差异化在于：${sp}。具体对比建议参考我们的官方资料或转人工说明。` : MISSING_ANSWER, category: '比较 / 犹豫处理' })
  seeds.push({ question: `${name} 有哪些用途？`,                              answer: sc ? `${name} 适合：${sc}。如果您的场景较特殊，建议转人工确认是否适配。` : MISSING_ANSWER, category: '产品介绍' })

  // 适合对象 (≥4)
  seeds.push({ question: `${name} 适合什么人群使用？`,                        answer: sc ?? MISSING_ANSWER, category: '适合对象' })
  seeds.push({ question: `我适不适合 ${name}？`,                              answer: sc ? `如果您属于：${sc}，那 ${name} 通常适合您。可以告诉我您的具体情况，我帮您判断或转人工评估。` : MISSING_ANSWER, category: '适合对象' })
  seeds.push({ question: `${name} 对企业还是个人？`,                          answer: sc ?? `${MISSING_ANSWER}（针对企业/个人差异，建议转人工确认）`, category: '适合对象' })
  seeds.push({ question: `${name} 有最低门槛吗？`,                            answer: MISSING_ANSWER, category: '限制条件' })

  // 价格 / 套餐 (≥3)
  seeds.push({ question: `${name} 多少钱？`,                                  answer: pr ? `${name} 的价格：${pr}。具体方案建议先告诉我您的需求，我帮您匹配最合适的套餐。` : `${MISSING_ANSWER} 您可以告诉我预算范围，我转人工为您准确报价。`, category: '价格 / 套餐' })
  seeds.push({ question: `${name} 有几种套餐？`,                              answer: pr ? `主要套餐：${pr}。具体差异请告诉我您的使用场景，我帮您推荐。` : MISSING_ANSWER, category: '价格 / 套餐' })
  seeds.push({ question: `${name} 有优惠 / 折扣吗？`,                         answer: `优惠政策会随时间调整，资料中未明确具体折扣。建议转人工为您确认当前的优惠方案。`, category: '价格 / 套餐' })
  seeds.push({ question: `${name} 可以分期付款吗？`,                          answer: MISSING_ANSWER, category: '付款' })
  seeds.push({ question: `${name} 支持哪些付款方式？`,                        answer: MISSING_ANSWER, category: '付款' })

  // 购买 / 预约 / 使用流程 (≥4)
  seeds.push({ question: `怎么购买 ${name}？`,                                answer: pf ? `购买流程：${pf}。如果您要现在开始，告诉我，我可以引导您下一步。` : `${MISSING_ANSWER} 建议告诉我，您准备好开始购买后，我会转人工协助。`, category: '购买流程' })
  seeds.push({ question: `购买 ${name} 需要提供什么资料？`,                    answer: need ?? MISSING_ANSWER, category: '购买流程' })
  seeds.push({ question: `下单 ${name} 后多久能开通 / 收到？`,                answer: MISSING_ANSWER, category: '购买流程' })
  seeds.push({ question: `${name} 可以预约 / Demo 吗？`,                      answer: pf ? `可以！${pf}。请告诉我您方便的时间，我帮您安排或转人工对接。` : `当然可以。${MISSING_ANSWER}请告诉我您的时间，我转人工帮您预约。`, category: '预约 / Demo' })
  seeds.push({ question: `Demo 是免费的吗？`,                                 answer: MISSING_ANSWER, category: '预约 / Demo' })

  // 售后 (≥3)
  seeds.push({ question: `${name} 有售后吗？`,                                answer: MISSING_ANSWER, category: '售后' })
  seeds.push({ question: `${name} 出现问题怎么处理？`,                         answer: `请描述具体问题，我先帮您判断。如果是产品故障/付款/退款相关，会立即转人工。`, category: '售后' })
  seeds.push({ question: `${name} 可以退款吗？`,                              answer: `退款政策因方案与时间而异。${MISSING_ANSWER} 退款请求会自动转人工处理。`, category: '售后' })

  // 限制条件 (≥3)
  seeds.push({ question: `${name} 有什么使用限制？`,                          answer: MISSING_ANSWER, category: '限制条件' })
  seeds.push({ question: `${name} 在哪里可以用？`,                            answer: MISSING_ANSWER, category: '限制条件' })
  seeds.push({ question: `${name} 是否包含某项功能？`,                        answer: `请告诉我具体是哪项功能，我先在资料中查找；找不到我会转人工为您确认。`, category: '限制条件' })

  // 比较 / 犹豫处理 (≥3)
  seeds.push({ question: `${name} 跟 [其他品牌] 比怎么选？`,                  answer: sp ? `${name} 的优势在于：${sp}。具体对比方面建议告诉我您最在乎什么（价格 / 功能 / 服务），我帮您评估或转人工对比。` : `${MISSING_ANSWER} 请告诉我您最在乎什么（价格 / 功能 / 服务），我帮您评估。`, category: '比较 / 犹豫处理' })
  seeds.push({ question: `我还在考虑，可以晚点决定吗？`,                       answer: `当然可以。可以告诉我您主要顾虑什么吗？我先帮您处理，准备好后随时联系我。`, category: '比较 / 犹豫处理' })
  seeds.push({ question: `${name} 真的有效吗？`,                              answer: sp ? `${name} 主打：${sp}。如果您想看实际案例或客户反馈，我帮您转人工提供。` : `${MISSING_ANSWER} 我帮您转人工提供实际案例。`, category: '比较 / 犹豫处理' })

  // 常见疑虑 (≥3)
  seeds.push({ question: `${name} 复杂吗？我不懂技术能用吗？`,                answer: `${name} 设计成尽量简单上手。如果您担心，我可以告诉团队您的具体情况，由人工协助 onboarding。`, category: '常见疑虑' })
  seeds.push({ question: `${name} 安不安全？`,                                answer: `资料中未列具体安全说明，建议转人工提供合规与安全细节。`, category: '常见疑虑' })
  seeds.push({ question: `购买后如果不满意怎么办？`,                          answer: `这种情况会立即转人工处理，确保您得到合适的方案或退款评估。`, category: '常见疑虑' })

  // 转人工问题 (≥4)
  seeds.push({ question: `我想跟人工客服聊`,                                  answer: `好的，我现在帮您转到人工客服。请稍等。`, category: '转人工问题' })
  seeds.push({ question: `请帮我联系负责人`,                                  answer: `好的，我已记下您的请求并转人工。我们的同事会尽快联系您。`, category: '转人工问题' })
  seeds.push({ question: `我要投诉`,                                          answer: `非常抱歉造成困扰。我立即转人工处理，并请您简单告诉我具体情况，方便我们快速回应。`, category: '转人工问题' })
  seeds.push({ question: `我要看合同 / 发票 / 法律条款`,                      answer: `合同 / 发票 / 法律相关问题会立即转人工处理，由专人为您提供。`, category: '转人工问题' })
  seeds.push({ question: `请提供你们公司资质 / 牌照`,                          answer: `资料中未直接列出，建议转人工为您提供官方资质文件。`, category: '转人工问题' })

  // Additional product-name personalised entries (≥5 to comfortably reach 40+)
  seeds.push({ question: `${name} 有没有保修？`,                              answer: MISSING_ANSWER, category: '售后' })
  seeds.push({ question: `${name} 怎么开始第一步？`,                           answer: pf ? `第一步：${pf.split(/[。;；]/)[0]}。准备好后随时告诉我。` : `请告诉我您的需求，我帮您安排第一步或转人工开始。`, category: '购买流程' })
  seeds.push({ question: `${name} 适合什么场景？`,                            answer: sc ?? MISSING_ANSWER, category: '适合对象' })
  seeds.push({ question: `${name} 跟我现在用的方案能一起用吗？`,              answer: MISSING_ANSWER, category: '比较 / 犹豫处理' })
  seeds.push({ question: `${name} 试用过的人评价怎样？`,                       answer: `资料中未列具体客户评价。建议转人工为您提供真实客户案例。`, category: '常见疑虑' })
  seeds.push({ question: `${name} 有培训 / 教程吗？`,                          answer: MISSING_ANSWER, category: '售后' })
  seeds.push({ question: `${name} 升级 / 续费怎么算？`,                        answer: MISSING_ANSWER, category: '价格 / 套餐' })
  seeds.push({ question: `${name} 在 [地区] 能用吗？`,                         answer: MISSING_ANSWER, category: '限制条件' })
  seeds.push({ question: `${ho ? ho.split(/[。;；]/)[0] : '紧急情况'} 时怎么联系？`, answer: `这类情况会立即转人工跟进，请稍等。`, category: '转人工问题' })

  return seeds
}

/**
 * Round-9I: a seed answer is "missing-info" if it equals MISSING_ANSWER or
 * begins with it. We do NOT trip on incidental mentions inside a longer answer.
 */
function isMissingInfoAnswer(answer: string): boolean {
  const t = answer.trim()
  return t === MISSING_ANSWER || t.startsWith(MISSING_ANSWER)
}

function buildFaqDrafts(
  input: ProductSetupInput,
  productId: string,
  targetFaqCount: number,
): FaqDraft[] {
  const seeds = buildFaqSeeds(input)
  const seen  = new Set<string>()

  // Round-9I: prefer useful answers first; only top up with missing-info FAQ
  // when target is large enough AND useful pool exhausted. This stops the
  // "40 weak FAQ where everything says 资料中未明确说明" UX.
  const useful:  FaqSeed[] = []
  const missing: FaqSeed[] = []
  for (const s of seeds) {
    const key = s.question.trim()
    if (seen.has(key)) continue
    seen.add(key)
    if (isMissingInfoAnswer(s.answer)) missing.push(s)
    else                                useful.push(s)
  }

  const out: FaqDraft[] = []
  const push = (s: FaqSeed): void => {
    out.push({
      id:            safeId(productId, out.length + 1),
      question:      s.question,
      answer:        s.answer,
      category:      s.category,
      productName:   input.productName,
      isSelected:    !isMissingInfoAnswer(s.answer), // missing-info FAQ start unchecked
      source:        'generated_draft',
      hasMissingInfo: isMissingInfoAnswer(s.answer) || undefined,
    })
  }

  // 1) Fill with useful FAQ up to target.
  for (const s of useful) {
    if (out.length >= targetFaqCount) break
    push(s)
  }
  // 2) Only if there's still headroom AND target is "moderate+" do we backfill
  //    with up to 25% missing-info FAQ. Minimal-tier never gets backfilled.
  const allowBackfillCap = Math.max(0, Math.floor(targetFaqCount * 0.25))
  let backfilled = 0
  for (const s of missing) {
    if (out.length >= targetFaqCount)      break
    if (backfilled >= allowBackfillCap)    break
    push(s)
    backfilled++
  }
  return out
}

/**
 * Round-9I: build a fixed catalogue of company-level (general) FAQ that is
 * shared across all products. Answers reference tenant-supplied company info
 * where provided; otherwise the FAQ is marked hasMissingInfo and starts
 * unchecked so the tenant can review.
 */
export interface CompanyProfileInput {
  companyName?:      string
  industry?:         string
  businessHours?:    string
  locationAddress?:  string
  supportedLanguages?: string[]      // ['zh','en','ms'] etc.
  humanHandoffNote?: string          // e.g. "营业时间内可转人工"
}

export function generateCompanyFaqs(profile: CompanyProfileInput = {}): CompanyFaqDraft[] {
  const name = nonEmpty(profile.companyName)
  const ind  = nonEmpty(profile.industry)
  const biz  = nonEmpty(profile.businessHours)
  const loc  = nonEmpty(profile.locationAddress)
  const langs = (profile.supportedLanguages ?? []).filter(Boolean)
  const langZh = langs.length === 0
    ? undefined
    : langs.map(l => l === 'zh' ? '中文' : l === 'en' ? 'English' : l === 'ms' ? 'Bahasa Melayu' : l).join(' / ')

  const seeds: { q: string; a: string; cat: string; missing?: boolean }[] = [
    { q: '你们是什么公司？',
      a: name ? `我们是 ${name}${ind ? '，所属行业：' + ind : ''}。如需更详细的介绍，可以告诉我您想了解的方面。` : MISSING_ANSWER,
      cat: '公司介绍',
      missing: !name },
    { q: '你们几点营业？',
      a: biz ?? MISSING_ANSWER,
      cat: '营业信息',
      missing: !biz },
    { q: '你们在哪里？',
      a: loc ?? MISSING_ANSWER,
      cat: '营业信息',
      missing: !loc },
    { q: '可以找真人吗？',
      a: nonEmpty(profile.humanHandoffNote)
        ?? '当然可以。请告诉我您想咨询的方面，我会立即帮您转人工客服。',
      cat: '转人工 / 真人客服' },
    { q: '你是机器人吗？',
      a: '我是 AI 客服助手，可以帮您快速解答常见问题。如果需要更详细或更复杂的处理，我会随时帮您转给真人同事。',
      cat: '关于 AI 助手' },
    { q: '你可以帮我什么？',
      a: '我可以帮您查询产品信息、回答常见问题、安排预约 / Demo、协助下单流程，必要时转给真人客服。请告诉我您主要想了解什么？',
      cat: '关于 AI 助手' },
    { q: '支持什么语言？',
      a: langZh
        ? `我们目前支持：${langZh}。您可以直接用您熟悉的语言跟我交流。`
        : '我们支持中文 / English / Bahasa Melayu。您可以直接用您熟悉的语言跟我交流。',
      cat: '语言支持' },
    { q: '我要投诉 / 退款 / 售后怎么办？',
      a: '非常抱歉造成困扰。我现在帮您转人工客服跟进；可以先简单告诉我具体情况，方便同事更快回应吗？',
      cat: '投诉 / 售后' },
    { q: '我只是想聊聊 / 看看',
      a: '没问题 😊 您随时可以问我关于我们的产品 / 服务的问题，或者告诉我您比较感兴趣的方面，我帮您找到合适的信息。',
      cat: '闲聊 / 离题处理' },
    { q: '我不知道要问什么',
      a: '没关系，我帮您 👉 您可以先告诉我您主要想解决什么问题，或者直接选一个产品 / 服务，我帮您介绍。',
      cat: '客户引导' },
  ]

  return seeds.map((s, i) => ({
    id:          `cfaq_${String(i + 1).padStart(3, '0')}`,
    question:    s.q,
    answer:      s.a,
    category:    s.cat,
    isSelected:  !s.missing,
    source:      'generated_draft',
    hasMissingInfo: s.missing || undefined,
  }))
}

// ── sales scripts / qualification / tags / scoring / follow-up / handoff ──

function buildSalesScripts(input: ProductSetupInput): SalesScript[] {
  const name = input.productName
  const pr   = nonEmpty(input.pricing)
  const pf   = nonEmpty(input.purchaseFlow)
  return [
    { title: '欢迎介绍',           scenario: '客户首次联系',         tone: 'friendly',     script: `您好，我是 ${name} 的助手。请问您主要想了解 ${name} 的哪一方面？我可以帮您快速找到答案。` },
    { title: '客户问价格',          scenario: '客户直接问价',         tone: 'professional', script: pr ? `${name} 的价格：${pr}。为了帮您匹配最合适的方案，可以告诉我您的具体使用场景吗？` : `${name} 有多个套餐，价格会随方案而定。可以告诉我您主要的用途 / 团队规模？我帮您转人工准确报价。` },
    { title: '客户犹豫',            scenario: '客户在比较 / 担心效果', tone: 'friendly',     script: `完全理解。可以告诉我您最在乎的是什么——价格、效果，还是服务？我先针对这个为您介绍，您再决定。` },
    { title: '客户要求优惠',         scenario: '客户问折扣',           tone: 'professional', script: `优惠政策会因时间和方案不同。让我帮您转人工确认目前的最新优惠，几分钟内回复您，可以吗？` },
    { title: '客户想预约 / Demo',   scenario: '客户主动要演示',       tone: 'concise',      script: pf ? `好的！${pf}。请告诉我您方便的时间，我帮您预约或转人工对接。` : `好的，告诉我您方便的时间，我立即转人工帮您安排。` },
    { title: '客户比较其他方案',     scenario: '客户提到竞品',         tone: 'professional', script: `理解您正在做比较。${name} 的差异主要在……（基于产品卖点）。要不要我帮您列出对比表，或者直接转人工跟您深聊？` },
    { title: '客户长时间没回复',     scenario: '24+ 小时无回应',       tone: 'friendly',     script: `Hi，看到您之前在了解 ${name}。请问您有什么疑问吗？我可以帮您解答，或者帮您预约更详细的咨询。` },
    { title: '客户要求人工',         scenario: '客户明确说"我要人工"', tone: 'concise',      script: `好的，我现在帮您转人工客服。请稍等一下，同事会很快联系您。` },
  ]
}

function buildQualificationQuestions(input: ProductSetupInput): QualificationQuestion[] {
  const sc = nonEmpty(input.suitableCustomers)
  const list: QualificationQuestion[] = [
    { question: '您主要的需求是什么？',                      purpose: '了解客户使用场景' },
    { question: '您预算大概多少？',                          purpose: '匹配产品套餐' },
    { question: '您预计什么时候开始 / 购买？',                purpose: '判断购买时间紧迫度' },
    { question: '您是个人使用还是团队使用？',                 purpose: '判断套餐规模' },
    { question: '您之前用过类似产品吗？',                     purpose: '了解经验与切换难度' },
    { question: '您想先看 Demo / 预约咨询吗？',               purpose: '推进下一步' },
    { question: '您主要担心 / 在意什么？',                    purpose: '识别异议' },
    { question: '需要我帮您直接转人工吗？',                   purpose: '客户偏好确认' },
  ]
  if (sc) list.unshift({ question: `您属于 ${sc.split(/[，,、]/)[0]} 这类客户吗？`, purpose: '判断产品适配度' })
  return list
}

function buildSuggestedTags(input: ProductSetupInput): string[] {
  const base = [
    '高意向', '价格咨询', '已报价', '已预约', '需要人工',
    '售后问题', '付款问题', '技术问题', '比较中', '长期跟进',
  ]
  return [...base, `产品: ${input.productName}`]
}

function buildLeadScoringRules(_input: ProductSetupInput): LeadScoringRule[] {
  return [
    { trigger: 'asked_price',                   adjustment:  20, description: '客户主动问价格 +20' },
    { trigger: 'asked_demo_appointment',        adjustment:  25, description: '客户问预约 / Demo +25' },
    { trigger: 'asked_payment_or_activation',   adjustment:  30, description: '客户问付款 / 开通 +30' },
    { trigger: 'shared_budget',                 adjustment:  20, description: '客户提供预算 +20' },
    { trigger: 'shared_timeline',               adjustment:  20, description: '客户提供购买时间 +20' },
    { trigger: 'near_term_purchase',            adjustment:  35, description: '客户明确近期购买 +35' },
    { trigger: 'requested_human',               adjustment:  30, description: '客户要求真人 +30' },
    { trigger: 'complaint_or_refund',           adjustment: -50, description: '投诉 / 退款 → 不作为销售 lead，转人工' },
    { trigger: 'blacklist_keywords',            adjustment:-100, description: '黑名单关键词 -100，立即停止销售路径' },
  ]
}

function buildFollowUpRules(_input: ProductSetupInput): FollowUpRule[] {
  return [
    { scenario: 'PRICE_ASKED_NO_REPLY',   delay: '2h / 24h', message: '了解您看到了报价，请问还有什么我可以帮您澄清的吗？', description: '问价格后未回复：2 小时轻跟进，24 小时再次询问需求' },
    { scenario: 'CONSIDERING',             delay: '24h',     message: '您之前提到再考虑一下，请问需要我帮您准备对比表吗？', description: '说"考虑一下"：24 小时后询问是否需要比较方案' },
    { scenario: 'BOOKING_NOT_CONFIRMED',   delay: '2h',      message: '想跟您确认一下预约时间，方便回复吗？',               description: '预约未确认：2 小时后提醒确认' },
    { scenario: 'HIGH_INTENT_UNHANDLED',   delay: '30m',     message: '（提醒人工：高意向客户尚未跟进）',                    description: '高意向未成交：30 分钟内提醒人工接手' },
    { scenario: 'LONG_NO_REPLY',           delay: '24h / 7d',message: '不知您最近还有兴趣了解吗？随时联系我。',               description: '长时间没回复：24 小时轻跟进，7 天后停止或长期维护' },
  ]
}

function buildHandoffRules(input: ProductSetupInput): HandoffRule[] {
  const rules: HandoffRule[] = [
    { trigger: 'customer_requests_human',      description: '客户明确要求人工服务' },
    { trigger: 'ai_low_confidence',            description: 'AI 不确定 / FAQ 没有答案' },
    { trigger: 'pricing_rule_incomplete',      description: '价格规则不完整，AI 无法直接报价' },
    { trigger: 'payment_or_activation',        description: '客户要付款 / 开通 / 下单' },
    { trigger: 'complaint_or_refund',          description: '投诉 / 退款 / 不满' },
    { trigger: 'legal_or_contract_request',    description: '合同 / 发票 / 法律 / 隐私相关' },
    { trigger: 'medical_or_high_risk_topic',   description: '医疗 / 健康高风险话题' },
    { trigger: 'high_intent_threshold_reached',description: '意向评分超过 high-intent 阈值' },
  ]
  const ho = nonEmpty(input.handoffConditions)
  if (ho) rules.push({ trigger: 'custom_business_rule', description: '租户自定义触发：' + ho })
  return rules
}

// ── public entry point ────────────────────────────────────────────────────

/** Round-9I: tenant-friendly rendering of qualification / tags / scoring / follow-up / handoff. */
function buildTenantFriendlyRules(
  qualification: QualificationQuestion[],
  tags: string[],
  scoring: LeadScoringRule[],
  followUps: FollowUpRule[],
  handoffs: HandoffRule[],
): ProductSalesConfig['tenantFriendlyRules'] {
  return {
    qualification: {
      headline: 'AI 会帮你收集这些客户资料：',
      items:    qualification.map(q => q.question),
    },
    tags: {
      headline: '系统会自动帮客户打标签：',
      items:    tags.filter(t => !t.startsWith('产品:')),
    },
    scoring: {
      headline: 'AI 会自动判断客户意向：',
      items:    scoring
        .filter(r => r.adjustment > 0 || r.trigger === 'requested_human')
        .map(r => r.description),
    },
    followUp: {
      headline: '自动跟进草稿，启用前不会真实发送：',
      items:    followUps.map(f => f.description),
    },
    handoff: {
      headline: '以下情况 AI 会建议转人工：',
      items:    handoffs.map(h => h.description),
    },
  }
}

export function generateProductSalesConfig(input: ProductSetupInput): ProductSalesConfig {
  if (!input.productName || !input.productName.trim()) {
    throw new Error('productName is required')
  }
  const productId = input.productId?.trim() || `prod_${Date.now().toString(36)}`

  const completeness = computeCompleteness(input)

  const productProfile = buildProductProfile(input)
  const faqDrafts      = buildFaqDrafts(input, productId, completeness.targetFaqCount)
  const salesScripts   = buildSalesScripts(input)
  const qualificationQuestions = buildQualificationQuestions(input)
  const suggestedTags  = buildSuggestedTags(input)
  const leadScoringRules = buildLeadScoringRules(input)
  const followUpRules  = buildFollowUpRules(input)
  const handoffRules   = buildHandoffRules(input)

  const pricingFaqCount     = faqDrafts.filter(f => f.category === '价格 / 套餐' || f.category === '付款').length
  const handoffFaqCount     = faqDrafts.filter(f => f.category === '转人工问题').length
  const objectionFaqCount   = faqDrafts.filter(f => f.category === '比较 / 犹豫处理' || f.category === '常见疑虑').length
  const processFaqCount     = faqDrafts.filter(f => f.category === '购买流程' || f.category === '预约 / Demo').length
  const missingInfoFaqCount = faqDrafts.filter(f => f.hasMissingInfo).length

  const missingFields: string[] = []
  if (!nonEmpty(input.suitableCustomers))     missingFields.push('suitableCustomers')
  if (!nonEmpty(input.sellingPoints))         missingFields.push('sellingPoints')
  if (!nonEmpty(input.pricing))               missingFields.push('pricing')
  if (!nonEmpty(input.purchaseFlow))          missingFields.push('purchaseFlow')
  if (!nonEmpty(input.requiredCustomerInfo))  missingFields.push('requiredCustomerInfo')

  const missingFieldLabels = missingFields.map(f => PRODUCT_FIELD_LABELS_ZH[f] ?? f)

  const materialChars =
    (input.pastedMaterialText?.length ?? 0) +
    (input.uploadedFile?.extractedText?.length ?? 0)

  const tenantFriendlyRules = buildTenantFriendlyRules(
    qualificationQuestions, suggestedTags, leadScoringRules, followUpRules, handoffRules,
  )

  const missingDataGuidance = missingFields.length === 0
    ? undefined
    : {
        headline: '以下资料还没填写，相关 FAQ 会先标记为"建议人工确认"：',
        items:    missingFieldLabels,
        ctaLabel: '去补充资料',
      }

  const coverageNote =
    completeness.tier === 'complete'
      ? `产品资料较完整（${completeness.score}/${completeness.max}）。已生成 ${faqDrafts.length} 条 FAQ。`
      : completeness.tier === 'moderate'
      ? `产品资料较充足（${completeness.score}/${completeness.max}）。已生成 ${faqDrafts.length} 条 FAQ；补充更多资料可生成更多 FAQ。`
      : `产品资料较少（${completeness.score}/${completeness.max}）。先生成 ${faqDrafts.length} 条有把握回答的 FAQ；缺失资料请见"建议补充资料"。`

  return {
    productId,
    productName:  input.productName.trim(),
    generatedAt:  new Date().toISOString(),
    mode:         'deterministic_stub',
    productProfile,
    faqDrafts,
    salesScripts,
    qualificationQuestions,
    suggestedTags,
    leadScoringRules,
    followUpRules,
    handoffRules,
    summary: {
      faqCount:           faqDrafts.length,
      pricingFaqCount,
      handoffFaqCount,
      objectionFaqCount,
      processFaqCount,
      missingFields,
      missingFieldLabels,
      completenessTier:   completeness.tier,
      completenessScore:  completeness.score,
      completenessMax:    completeness.max,
      missingInfoFaqCount,
      hasPricing:         !!nonEmpty(input.pricing),
      hasPurchaseFlow:    !!nonEmpty(input.purchaseFlow),
      hasUploadedFile:    !!input.uploadedFile?.filename,
      hasReferenceUrl:    !!nonEmpty(input.referenceUrl),
      materialCharCount:  materialChars,
      coverageNote,
    },
    missingDataGuidance,
    tenantFriendlyRules,
  }
}

// ── Round-9I: Customer Entry Menu (preview only — never sent to WhatsApp) ──

export interface CustomerEntryMenuLanguageOption {
  code:  'zh' | 'en' | 'ms'
  label: string
}

export interface CustomerEntryMenuProductOption {
  productId:   string
  productName: string
}

export interface CustomerEntryMenuConfig {
  /** Setup version; bump if the shape changes. */
  version:     'v1'
  /** Localised welcome line shown before language picker. */
  welcomeText: string
  languageStep: {
    promptText: string
    options:    CustomerEntryMenuLanguageOption[]
  }
  productStep: {
    promptText:        string
    options:           CustomerEntryMenuProductOption[]
    humanHandoffLabel: string
  }
  /** Plain-Chinese description of how the menu wires up to the FAQ bank. */
  behaviorDescription: string
  /** Hard safety flag — preview only, never sends real WhatsApp messages. */
  realWhatsAppSent:    false
  previewOnly:         true
}

export function buildCustomerEntryMenu(
  products: { productId: string; productName: string }[],
  opts: { supportedLanguages?: string[] } = {},
): CustomerEntryMenuConfig {
  const langs = (opts.supportedLanguages && opts.supportedLanguages.length > 0)
    ? opts.supportedLanguages
    : ['zh', 'en', 'ms']
  const languageLabels: Record<string, string> = {
    zh: '中文',
    en: 'English',
    ms: 'Bahasa Melayu',
  }
  const options = langs
    .filter(l => l === 'zh' || l === 'en' || l === 'ms')
    .map(l => ({ code: l as 'zh' | 'en' | 'ms', label: languageLabels[l] }))
  return {
    version:     'v1',
    welcomeText: '欢迎咨询 😊',
    languageStep: {
      promptText: '请先选择语言：',
      options,
    },
    productStep: {
      promptText:        '请问你想了解哪一个产品 / 服务？',
      options:           products.map(p => ({ productId: p.productId, productName: p.productName })),
      humanHandoffLabel: '找真人客服',
    },
    behaviorDescription:
      '客户先选语言，再选产品 / 服务；AI 会根据所选的语言与产品回答相应的 FAQ / 知识库内容。若客户选"找真人客服"，AI 会立即转人工。此处仅为预览，未连接真实 WhatsApp 发送。',
    realWhatsAppSent: false,
    previewOnly:      true,
  }
}
