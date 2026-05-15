// Onboarding Wizard API — Phase 11B → 12A → Round-8 Product Intelligence
//
// GET  /onboarding/status                                — check current onboarding state
// POST /onboarding/draft                                 — save/update wizard draft
// POST /onboarding/ingest-materials                      — parse materialsText into KB items (Phase 12A)
// POST /onboarding/generate-preview                      — generate config preview
//         Default: deterministic templates (no AI provider call, always safe for tests)
//         ?mode=ai: AI-provider-enhanced if configured + OMNI_ENABLE_ONBOARDING_AI=true
// POST /onboarding/enable                                — mark ENABLED (does NOT connect WhatsApp or enable real send)
// POST /onboarding/products/generate-sales-config        — Round-8: deterministic product sales-config draft
// POST /onboarding/products/save-sales-config            — Round-8: persist edited product setup back to draft
// POST /onboarding/products/save-faq-to-knowledge        — Round-8: bulk-save selected FAQ drafts as PRODUCT_FAQ KnowledgeItems
//
// Safety:
//   - All endpoints are tenant-scoped via JWT.
//   - Default generate-preview never calls real AI provider.
//   - AI mode requires explicit opt-in AND env flag AND provider configuration.
//   - enable does NOT set OMNI_ENABLE_REAL_META_SEND or connect WhatsApp session.
//   - Round-8 product sales-config generator is fully deterministic; never calls AI provider.
//   - Round-8 save-faq-to-knowledge stores into KnowledgeItem with PRODUCT_FAQ type;
//     duplicate detection by (tenantId + question) avoids unbounded duplicates.
//   - No secrets in responses; uploaded-file metadata only (no raw bytes).

import type { FastifyInstance } from 'fastify'
import { prisma, OnboardingStatus, KnowledgeItemType } from '@omni/db'
import type { AiProvider, AiAgentInput } from '@omni/shared'
import { requireAuth, getAuthUser } from '../auth'
import { generateProductSalesConfig, type ProductSetupInput, type ProductSalesConfig } from '../lib/product-sales-config-generator'
import { tryDeductFaqGeneration } from '../lib/quota'
import { getTenantServiceAccess } from '../lib/service-access'

// ── Type: enriched preview shape ────────────────────────────────────────────
interface FaqSample { question: string; answer: string }
interface ScoringRule { trigger: string; adjustment: number; description: string }

interface EnrichedPreview {
  aiPersona:           { name: string; tone: string; focus: string; company: string }
  globalSystemPrompt:  string
  welcomeMessage:      string
  faqCategories:       string[]
  faqSamples:          FaqSample[]
  leadStages:          string[]
  recommendedTags:     string[]
  followUpScenarios:   string[]
  handoffTriggers:     string[]
  scoringRules:        ScoringRule[]
  missingInfoWarnings: string[]
  replyLanguagePolicy: string
  generatedAt:         string
  generationMode:      'DETERMINISTIC_TEMPLATE' | 'AI_GENERATED' | 'AI_FALLBACK'
  note:                string
  ingestedAt?:         string  // set when materials were ingested
  ingestedKbCount?:    number
}

// ── Industry → persona templates ─────────────────────────────────────────────
// Round-9G: expanded to cover the Round-9E industry list. Persona text is a
// platform-managed default; tenants never edit it directly.
const INDUSTRY_PERSONAS: Record<string, { name: string; tone: string; focus: string }> = {
  'real-estate':         { name: 'Alex',    tone: 'professional and warm',     focus: 'property inquiries, viewing appointments, pricing questions' },
  'education':           { name: 'Aisha',   tone: 'helpful and encouraging',   focus: 'course inquiries, enrollment, schedules, pricing' },
  'retail':              { name: 'Mei',     tone: 'friendly and efficient',    focus: 'product questions, orders, availability, promotions' },
  'food-beverage':       { name: 'Jamie',   tone: 'friendly and appetizing',   focus: 'menu questions, reservations, delivery, opening hours' },
  'beauty-wellness':     { name: 'Sophie',  tone: 'warm and reassuring',       focus: 'services, bookings, pricing, products' },
  'automotive':          { name: 'Daniel',  tone: 'knowledgeable and clear',   focus: 'vehicle inquiries, test drives, service bookings, pricing' },
  'healthcare':          { name: 'Dr. Kim', tone: 'professional and caring',   focus: 'appointments, services, clinic hours, referrals' },
  'finance':             { name: 'Raj',     tone: 'precise and trustworthy',   focus: 'product inquiries, eligibility, documentation, appointments' },
  // Round-9G: new tech / digital industries
  'saas':                { name: 'Casey',   tone: 'professional and concise',  focus: 'SaaS feature questions, pricing tiers, trial activation, onboarding' },
  'software-dev':        { name: 'Ravi',    tone: 'professional and technical', focus: 'software project scope, timeline, pricing, follow-up handoff to engineer' },
  'ai-chatbot':          { name: 'Nova',    tone: 'friendly and confident',    focus: 'AI chatbot use cases, pricing, integration, demo booking' },
  'automation':          { name: 'Quinn',   tone: 'efficient and reassuring',  focus: 'workflow automation use cases, ROI, integration scope, demo booking' },
  'digital-marketing':   { name: 'Luna',    tone: 'energetic and consultative', focus: 'campaign goals, channel mix, pricing, sample case studies' },
  // Round-9G: new service industries
  'travel':              { name: 'Maya',    tone: 'warm and enthusiastic',     focus: 'destinations, package pricing, dates, group sizes, booking' },
  'insurance':           { name: 'Liam',    tone: 'trustworthy and clear',     focus: 'coverage questions, eligibility, premium estimates, advisor handoff' },
  'legal':               { name: 'Aaron',   tone: 'precise and respectful',    focus: 'matter intake, consultation booking, fee estimates, advisor handoff' },
  'repair':              { name: 'Sam',     tone: 'practical and helpful',     focus: 'fault description, service area, pricing, appointment booking' },
  'home-services':       { name: 'Riley',   tone: 'friendly and reliable',     focus: 'service scope, on-site availability, pricing, appointment booking' },
  'wholesale':           { name: 'Yara',    tone: 'concise and trade-friendly', focus: 'wholesale pricing, MOQ, stock availability, delivery, B2B onboarding' },
  'logistics':           { name: 'Theo',    tone: 'efficient and dependable',  focus: 'pickup/delivery scope, lead time, pricing, tracking' },
  'fitness':             { name: 'Kai',     tone: 'energetic and supportive',  focus: 'class types, membership pricing, trial booking, schedule' },
  'events':              { name: 'Iris',    tone: 'creative and organised',    focus: 'event type, date, budget range, vendor scope, planner handoff' },
  'default':             { name: 'Omni',    tone: 'professional and helpful',  focus: 'product inquiries, pricing, appointments, support' },
}

// ── Industry → FAQ templates ──────────────────────────────────────────────────
const INDUSTRY_FAQS: Record<string, FaqSample[]> = {
  'real-estate': [
    { question: 'What is the price range of your properties?',   answer: 'Our properties vary in price depending on location, size, and features. Please contact us or provide your budget range so we can recommend the best options for you.' },
    { question: 'Can I arrange a viewing appointment?',          answer: 'Absolutely! We can arrange a property viewing at your convenience. Please let us know your preferred date and time.' },
    { question: 'What is included in the price?',               answer: 'Property prices typically include basic fixtures and fittings. Additional features such as furnished units or parking may vary. We will provide full details for each property.' },
  ],
  'education': [
    { question: 'What courses do you offer?',                    answer: 'We offer a wide range of courses. Please tell me what subject or skill you are interested in, and I can recommend the best programme for you.' },
    { question: 'How do I register or enrol?',                  answer: 'Enrolment is simple! You can register online or visit us. Shall I share the registration steps with you?' },
    { question: 'What is the course fee?',                      answer: 'Course fees vary by programme. Please let me know which course you are interested in so I can share the exact pricing.' },
  ],
  'retail': [
    { question: 'Do you offer delivery?',                        answer: 'Yes, we offer delivery! Please share your location and the items you are interested in, and I will provide delivery details and estimated time.' },
    { question: 'What is your return policy?',                  answer: 'We have a [RETURN_PERIOD]-day return policy for items in original condition. Please keep your receipt for easy processing.' },
    { question: 'Are there any promotions available?',          answer: 'We regularly have promotions and special offers! Let me check what is currently available for you.' },
  ],
  'food-beverage': [
    { question: 'What are your opening hours?',                  answer: 'We are open [BUSINESS_HOURS]. For reservations outside normal hours, please contact us directly.' },
    { question: 'Can I make a reservation?',                    answer: 'Of course! Please let me know your preferred date, time, and number of guests for your reservation.' },
    { question: 'Do you cater for dietary restrictions?',       answer: 'Yes, we accommodate various dietary requirements including vegetarian, vegan, halal, and allergen-free options. Please inform us of your needs.' },
  ],
  // Round-9G: tech / digital industries
  'saas': [
    { question: '你们的 SaaS 有哪些功能？',     answer: '我们的 SaaS 提供完整的功能套件。可以告诉我您的具体使用场景，我帮您匹配最合适的方案。' },
    { question: '价格 / 套餐怎么算？',         answer: '我们有多个套餐供选择。请告诉我您的团队规模和使用情景，我帮您推荐合适的套餐。' },
    { question: '有免费试用吗？',             answer: '可以的。请告诉我您方便的时间，我帮您开通试用或安排 Demo。' },
  ],
  'software-dev': [
    { question: '你们能做什么样的项目？',       answer: '我们承接各种软件项目。请告诉我您要开发的产品类型和大致需求，我帮您评估或转人工。' },
    { question: '一个项目大概多少钱？',         answer: '项目费用因范围而异。可以告诉我功能清单 / 预算 / 时间，我转人工为您准确报价。' },
    { question: '多久可以交付？',             answer: '交付时间取决于项目复杂度。请简单描述需求，我转人工为您评估时间表。' },
  ],
  'ai-chatbot': [
    { question: 'AI Chatbot 能做什么？',      answer: '我们的 AI Chatbot 可处理客户咨询 / 销售引导 / FAQ 回答 / 自动跟进 / 转人工。具体场景需要哪些功能？' },
    { question: '需要懂技术吗？',             answer: '不需要。您只需提供产品资料，我们会自动建好整套 AI 客服系统。' },
    { question: '价格 / 套餐怎么算？',         answer: '我们有 Starter / Pro 套餐。请告诉我您预计每月对话量，我帮您匹配合适方案。' },
  ],
  'automation': [
    { question: '自动化系统能解决什么问题？',   answer: '我们帮您把重复性工作（客户分配 / 跟进 / 报表 / 数据流转）自动化。请告诉我目前哪些环节最耗时？' },
    { question: '能跟我现有系统整合吗？',       answer: '可以。请告诉我您正在用什么系统（CRM / WhatsApp / 电商 / 财务等），我帮您评估或转人工。' },
    { question: '多久可以上线？',             answer: '简单场景几天即可。请告诉我您的需求，我帮您评估或转人工详谈。' },
  ],
  'digital-marketing': [
    { question: '你们提供哪些营销服务？',       answer: '我们提供广告投放 / SEO / 内容 / 社交媒体 / 自动化漏斗等。您主要想加强哪一块？' },
    { question: '一个 campaign 大概多少钱？',  answer: '费用取决于渠道、预算、目标。请告诉我您的目标客户和预算范围，我转人工为您准确报价。' },
    { question: '多久能看到效果？',           answer: '不同渠道周期不同。请告诉我您的行业和目标，我帮您评估或转人工详谈。' },
  ],
  // Round-9G: service industries
  'travel': [
    { question: '你们有哪些行程 / 套餐？',     answer: '我们有多个行程和定制方案。请告诉我您计划的目的地、出发日期和人数，我帮您推荐。' },
    { question: '价格大概多少？',             answer: '价格因季节、人数、酒店等级而异。请告诉我您的预算和偏好，我转人工为您准确报价。' },
    { question: '如何预订？',                 answer: '请告诉我您选定的行程和出发日期，我帮您安排预订或转人工确认。' },
  ],
  'insurance': [
    { question: '你们有哪些保险产品？',       answer: '我们提供多种保险方案。可以告诉我您的需求（个人 / 家庭 / 商业），我帮您匹配最合适的方案。' },
    { question: '保费大概多少？',             answer: '保费因年龄、保额、保障范围而异。请提供基本资料，我转人工为您准确报价。' },
    { question: '理赔流程是什么？',           answer: '理赔涉及多步流程，建议转人工详细说明。请告诉我您具体的情况。' },
  ],
  'legal': [
    { question: '你们处理什么类型的案件？',     answer: '我们处理多种法律事务。请简单描述您的情况，我转人工安排律师为您评估。' },
    { question: '律师费怎么收？',             answer: '律师费因案件复杂度而异。请告诉我事项类型，我转人工为您准确报价。' },
    { question: '可以预约咨询吗？',           answer: '可以。请告诉我您方便的时间，我帮您预约或转人工对接。' },
  ],
  'repair': [
    { question: '你们修什么？',               answer: '我们提供多种维修服务。请告诉我故障类型和品牌型号，我帮您评估或转人工。' },
    { question: '修一次多少钱？',             answer: '维修费因故障类型而异。请描述问题或上传图片，我转人工为您估价。' },
    { question: '上门吗？',                   answer: '可以上门服务。请告诉我您所在区域和方便的时间，我帮您安排。' },
  ],
  'home-services': [
    { question: '你们提供哪些家政服务？',     answer: '我们提供清洁、家电、维修、搬家等多项服务。请告诉我您需要哪一项。' },
    { question: '价格怎么算？',               answer: '价格按服务类型和面积 / 时长而异。请告诉我您的需求，我帮您评估或转人工。' },
    { question: '可以预约吗？',               answer: '可以。请告诉我您方便的时间和地址，我帮您安排或转人工确认。' },
  ],
  'wholesale': [
    { question: '最少起订量（MOQ）是多少？',  answer: '不同产品 MOQ 不同。请告诉我您感兴趣的产品和预计数量，我转人工为您准确报价。' },
    { question: '批发价格怎么算？',           answer: '批发价按数量阶梯计算。请告诉我您的预计量和地区，我转人工准确报价。' },
    { question: '可以发货到 [地区] 吗？',     answer: '我们支持多地区发货。请告诉我目的地和数量，我帮您评估物流和成本。' },
  ],
  'logistics': [
    { question: '你们提供什么样的运输服务？',   answer: '我们提供多种运输方案（陆运 / 空运 / 海运 / 快递）。请告诉我货物类型、起点、目的地。' },
    { question: '运费大概多少？',             answer: '运费因路线、货物大小、紧急程度而异。请提供基本资料，我转人工为您准确报价。' },
    { question: '可以追踪订单吗？',           answer: '可以。请提供运单号，我帮您查询或转人工跟进。' },
  ],
  'fitness': [
    { question: '你们有哪些课程 / 会员？',     answer: '我们提供多种课程和会员方案。请告诉我您的健身目标，我帮您推荐合适的方案。' },
    { question: '会员费多少？',               answer: '会员费按时长和会员等级而异。请告诉我您感兴趣的方案，我转人工详细说明。' },
    { question: '可以先试一节课吗？',         answer: '可以。请告诉我您方便的时间，我帮您安排试课或转人工预约。' },
  ],
  'events': [
    { question: '你们能办什么样的活动？',     answer: '我们承接各种活动（婚礼 / 企业 / 庆典）。请告诉我活动类型、日期、人数。' },
    { question: '一场活动大概多少钱？',       answer: '费用因规模、场地、服务范围而异。请告诉我活动详情和预算，我转人工为您准确报价。' },
    { question: '需要提前多久预订？',         answer: '建议提前 1-3 个月。具体看活动规模，我转人工为您评估。' },
  ],
  'default': [
    { question: '你们提供什么服务 / 产品？',   answer: '我们提供多种产品和服务。可以告诉我您主要想了解什么吗？我帮您快速找到答案。' },
    { question: '价格怎么算？',               answer: '价格因方案而异。请告诉我您的需求 / 预算 / 使用场景，我帮您匹配合适方案。' },
    { question: '怎么开始 / 购买？',           answer: '请告诉我您准备好开始时，我帮您引导下一步或转人工对接。' },
  ],
}

// ── Goal → follow-up scenario mapping ────────────────────────────────────────
const GOAL_SCENARIOS: Record<string, string[]> = {
  'lead-conversion':      ['PRICE_ASKED_NO_REPLY', 'CONSIDERING'],
  'appointment':          ['BOOKING_NOT_CONFIRMED'],
  'demo-trial':           ['HIGH_INTENT_UNHANDLED', 'CONSIDERING'],
  'pre-sales':            ['PRICE_ASKED_NO_REPLY', 'HIGH_INTENT_UNHANDLED'],
  'after-sales':          ['LONG_NO_REPLY'],
  'quotation':            ['PRICE_ASKED_NO_REPLY', 'CONSIDERING'],
  'transfer-human':       ['HIGH_INTENT_UNHANDLED'],
}

// ── Scoring rules templates ────────────────────────────────────────────────────
const SCORING_RULES: ScoringRule[] = [
  { trigger: 'Customer asks about pricing',     adjustment: 20, description: 'Price inquiry signals purchase intent' },
  { trigger: 'Customer requests a demo/trial',  adjustment: 25, description: 'Demo request is a strong buying signal' },
  { trigger: 'Customer mentions purchase/buy',  adjustment: 30, description: 'Purchase intent = highest signal' },
  { trigger: 'Customer complains or requests refund', adjustment: -15, description: 'Negative sentiment reduces score' },
  { trigger: 'Customer replies to follow-up',   adjustment: 5,  description: 'Engagement increases score' },
]

// ── Build missing info warnings ───────────────────────────────────────────────
function buildWarnings(draft: { companyName?: string | null; industry?: string | null; aiGoals?: string[]; materialsText?: string | null; businessHours?: string | null; website?: string | null }): string[] {
  const w: string[] = []
  if (!draft.companyName)   w.push('Company name is missing — add it to personalise the AI greeting.')
  if (!draft.industry)      w.push('Industry not set — persona will use default template.')
  if (!draft.aiGoals?.length) w.push('No AI goals selected — follow-up scenarios may not be optimal.')
  if (!draft.materialsText) w.push('No product/service materials provided — FAQ answers will be generic templates.')
  if (!draft.businessHours) w.push('Business hours not set — the AI cannot answer hours-related questions accurately.')
  if (!draft.website)       w.push('Website URL not provided — the AI cannot direct customers to your website.')
  return w
}

// ── Build global system prompt ────────────────────────────────────────────────
function buildSystemPrompt(params: { company: string; personaName: string; tone: string; focus: string; goals: string[]; businessHours?: string | null }): string {
  const hours = params.businessHours ? `Business hours: ${params.businessHours}.` : ''
  const goalText = params.goals.length
    ? `Key objectives: ${params.goals.map(g => g.replace(/-/g, ' ')).join(', ')}.`
    : ''
  return `You are ${params.personaName}, an AI customer service assistant for ${params.company}. Your tone is ${params.tone}. You specialise in ${params.focus}. ${goalText} ${hours} Always be helpful, accurate, and escalate to a human agent when the customer requests it or when the issue is complex. Never fabricate information. If you don't know the answer, admit it and offer to connect the customer with a team member.`.trim()
}

// ── Deterministic preview generator ──────────────────────────────────────────
function generateDeterministicPreview(
  draft: {
    companyName?:   string | null
    industry?:      string | null
    aiGoals?:       string[]
    materialsText?: string | null
    businessHours?: string | null
    website?:       string | null
  },
  extras?: { ingestedAt?: string; ingestedKbCount?: number },
): EnrichedPreview {
  const industry = draft.industry?.toLowerCase() ?? 'default'
  const persona  = INDUSTRY_PERSONAS[industry] ?? INDUSTRY_PERSONAS['default']!
  const company  = draft.companyName ?? 'Your Company'
  const goals    = draft.aiGoals ?? []

  const scenarios = new Set<string>()
  for (const goal of goals) (GOAL_SCENARIOS[goal] ?? []).forEach((s) => scenarios.add(s))
  if (scenarios.size === 0) scenarios.add('PRICE_ASKED_NO_REPLY')

  const keywords: string[] = []
  if (draft.materialsText) {
    const words = draft.materialsText.match(/\b[A-Z][a-z]{2,}/g) ?? []
    keywords.push(...new Set(words).values())
  }

  const welcomeMsg = `Hello! 👋 Welcome to ${company}. I'm ${persona.name}, your AI assistant. ${
    goals.includes('lead-conversion') ? 'I can help you find the perfect solution and get pricing information.' :
    goals.includes('appointment')     ? 'I can help you book an appointment at your convenience.' :
    goals.includes('after-sales')     ? "I'm here to assist with any questions or support you need." :
    "I'm here to help answer your questions and connect you with our team."
  } How can I help you today?`

  const faqCategories = [
    'Pricing & Packages',
    goals.includes('appointment') ? 'Bookings & Availability' : 'Product Details',
    'About Us',
    goals.includes('after-sales') ? 'Support & Returns' : 'How to Get Started',
    draft.businessHours ? 'Business Hours' : 'Contact Us',
  ]

  const faqSamples = (INDUSTRY_FAQS[industry] ?? INDUSTRY_FAQS['default']!).slice(0, 3)

  const tags = [
    'high_intent', 'price_inquiry', 'needs_follow_up',
    ...(goals.includes('appointment') ? ['appointment_requested'] : []),
    ...(goals.includes('after-sales') ? ['after_sales'] : []),
    ...(keywords.slice(0, 3).map((k) => k.toLowerCase())),
  ]

  const globalSystemPrompt = buildSystemPrompt({
    company, personaName: persona.name, tone: persona.tone, focus: persona.focus,
    goals, businessHours: draft.businessHours,
  })

  const handoffTriggers = [
    'USER_REQUESTS_HUMAN',
    'SCORE_GTE_80',
    'QUOTE_PAYMENT_COMPLAINT',
    ...(goals.includes('transfer-human') ? ['HIGH_INTENT_NO_REPLY_30MIN'] : []),
  ]

  return {
    aiPersona:           { name: persona.name, tone: persona.tone, focus: persona.focus, company },
    globalSystemPrompt,
    welcomeMessage:      welcomeMsg,
    faqCategories,
    faqSamples,
    leadStages:          ['NEW', 'INTERESTED', 'HIGH_INTENT', 'QUOTED', 'BOOKED', 'WON', 'LOST'],
    recommendedTags:     [...new Set(tags)].slice(0, 8),
    followUpScenarios:   [...scenarios],
    handoffTriggers,
    scoringRules:        SCORING_RULES,
    missingInfoWarnings: buildWarnings(draft),
    replyLanguagePolicy: 'AUTO',
    generatedAt:         new Date().toISOString(),
    generationMode:      'DETERMINISTIC_TEMPLATE',
    note:                'Generated from deterministic templates. No real AI provider was called. Set mode=ai with an AI API key to generate personalised content.',
    ...extras,
  }
}

// ── AI-gated preview generation ───────────────────────────────────────────────
// Called only when mode=ai, OMNI_ENABLE_ONBOARDING_AI=true, and provider is configured.
// Validates output; falls back to deterministic on any failure.
async function tryAiPreviewGeneration(
  tenantId: string,
  draft: Parameters<typeof generateDeterministicPreview>[0],
): Promise<EnrichedPreview | null> {
  if (process.env.OMNI_ENABLE_ONBOARDING_AI !== 'true') return null

  try {
    const aiConfig = await prisma.aiConfig.findUnique({ where: { tenantId } })
    if (!aiConfig || aiConfig.aiProvider === 'DRY_RUN') return null

    // Check if provider API key is configured
    const hasKey = aiConfig.useTenantApiKey && !!aiConfig.apiKeyRef
    if (!hasKey) return null

    // Decrypt key for AI call
    const { decryptApiKey, isVaultConfigured } = await import('@omni/shared')
    if (!isVaultConfigured() || !aiConfig.apiKeyRef) return null
    const apiKey = decryptApiKey(aiConfig.apiKeyRef)

    // Build a structured prompt asking the AI to generate preview config
    const company   = draft.companyName ?? 'this company'
    const industry  = draft.industry ?? 'general'
    const goals     = draft.aiGoals?.join(', ') ?? 'customer service'
    const materials = draft.materialsText?.slice(0, 1500) ?? ''  // cap to avoid token overflow

    const prompt = `You are configuring an AI WhatsApp customer service assistant for ${company} (industry: ${industry}).

Business goals: ${goals}
${materials ? `\nBusiness materials:\n${materials}\n` : ''}
Generate a JSON configuration with EXACTLY this structure (no extra fields):
{
  "systemPrompt": "<2-4 sentence AI persona instructions>",
  "faqSamples": [
    {"question": "<question>", "answer": "<1-2 sentence answer>"},
    {"question": "<question>", "answer": "<answer>"},
    {"question": "<question>", "answer": "<answer>"}
  ],
  "additionalTags": ["<tag1>", "<tag2>"],
  "businessInsights": "<1 sentence about key sales opportunity>"
}

Respond with ONLY valid JSON. No explanation, no markdown code blocks.`

    // Use existing AI factory to call the provider
    const { AiProviderFactory } = await import('@omni/ai-core')
    const provider = AiProviderFactory.create(
      { aiProvider: aiConfig.aiProvider as AiProvider, model: aiConfig.model },
      { hasKey: true, apiKey },
    )

    // Build minimal AiAgentInput for the generation call
    const genInput: AiAgentInput = {
      tenantId,
      conversationId:  'onboarding-preview',
      customerId:      'onboarding',
      messageId:       'onboarding-preview',
      messageBody:     prompt,
      conversationHistory: [],
      knowledgeContext: [],
      customerProfile: { id: 'onboarding', stage: 'NEW', score: 0, tags: [], phone: '' },
      aiConfig: {
        aiProvider:          aiConfig.aiProvider as AiProvider,
        model:               aiConfig.model,
        systemPrompt:        '',
        persona:             null,
        goals:               [],
        temperature:         0.3,
        maxTokens:           600,
        replyLanguagePolicy: 'en' as const,
      },
    }

    const result = await provider.complete(genInput)
    const raw    = result.reply

    // Strip DRY_RUN prefix if any
    const jsonStr = raw.replace(/^\[AI_DRY_RUN\][^{]*/, '').trim()

    // Parse and validate JSON
    const parsed: { systemPrompt?: string; faqSamples?: FaqSample[]; additionalTags?: string[]; businessInsights?: string } = JSON.parse(jsonStr)

    if (!parsed.systemPrompt || !Array.isArray(parsed.faqSamples) || parsed.faqSamples.length === 0) {
      return null  // invalid shape → fallback
    }

    // Merge AI output with deterministic base
    const base = generateDeterministicPreview(draft)
    return {
      ...base,
      globalSystemPrompt:  parsed.systemPrompt,
      faqSamples:          parsed.faqSamples.slice(0, 5),
      recommendedTags:     [...new Set([...base.recommendedTags, ...(parsed.additionalTags ?? [])])].slice(0, 10),
      generationMode:      'AI_GENERATED',
      note:                `AI-generated preview using ${aiConfig.aiProvider}/${aiConfig.model}. Review carefully before enabling.`,
    }
  } catch (err) {
    // Any error (parse fail, provider error, decryption fail) → return null → caller falls back
    console.warn('[onboarding] AI preview generation failed (non-fatal):', (err as Error).message)
    return null
  }
}

// ── Material text parser ──────────────────────────────────────────────────────
function parseMaterialsToKbItems(text: string, tenantId: string): Array<{
  tenantId: string; type: KnowledgeItemType; question: string | null; answer: string; language: string; isActive: boolean
}> {
  const items: ReturnType<typeof parseMaterialsToKbItems> = []
  if (!text || !text.trim()) return items

  // Split by double newlines or section separators
  const paragraphs = text
    .split(/\n{2,}|\r\n{2,}|---+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20)  // skip very short paragraphs

  for (const para of paragraphs) {
    // Detect Q&A pattern: starts with Q: or a ? somewhere + A:
    const qaMatch = para.match(/^(?:Q[:.?]?\s*)(.+?[?])\s*(?:A[:.?]?\s*)(.+)$/is)
    if (qaMatch) {
      items.push({
        tenantId,
        type:     KnowledgeItemType.PRODUCT_FAQ,
        question: qaMatch[1]!.trim().slice(0, 500),
        answer:   qaMatch[2]!.trim().slice(0, 2000),
        language: 'zh',
        isActive: true,
      })
    } else if (para.includes('?')) {
      // Heuristic: paragraph ending in ? is likely a FAQ
      const lines = para.split(/\n/).map((l) => l.trim()).filter(Boolean)
      const question = lines.find((l) => l.endsWith('?')) ?? null
      const answerLines = lines.filter((l) => l !== question)
      if (question && answerLines.length > 0) {
        items.push({
          tenantId,
          type:     KnowledgeItemType.PRODUCT_FAQ,
          question: question.slice(0, 500),
          answer:   answerLines.join(' ').slice(0, 2000),
          language: 'zh',
          isActive: true,
        })
      } else {
        items.push({
          tenantId,
          type:     KnowledgeItemType.KNOWLEDGE_CHUNK,
          question: null,
          answer:   para.slice(0, 2000),
          language: 'zh',
          isActive: true,
        })
      }
    } else {
      // Plain chunk
      items.push({
        tenantId,
        type:     KnowledgeItemType.KNOWLEDGE_CHUNK,
        question: null,
        answer:   para.slice(0, 2000),
        language: 'zh',
        isActive: true,
      })
    }
  }

  return items.slice(0, 20)  // cap at 20 KB items per ingestion
}

export async function onboardingRoutes(app: FastifyInstance) {

  // ── GET /onboarding/status ─────────────────────────────────────────────────
  app.get('/status', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)

    const draft = await prisma.onboardingDraft.findUnique({
      where:  { tenantId },
      select: {
        id: true, status: true, completedSteps: true,
        companyName: true, industry: true, aiGoals: true,
        enabledAt: true, createdAt: true, updatedAt: true,
        generatedPreview: true,
      },
    })

    const preview = draft?.generatedPreview as EnrichedPreview | null | undefined

    return {
      tenantId,
      hasStarted:     !!draft,
      status:         draft?.status ?? null,
      completedSteps: draft?.completedSteps ?? 0,
      companyName:    draft?.companyName ?? null,
      industry:       draft?.industry ?? null,
      goalsCount:     draft?.aiGoals?.length ?? 0,
      hasPreview:     !!preview,
      generationMode: preview?.generationMode ?? null,
      ingestedKbCount: (preview as unknown as Record<string, unknown>)?.ingestedKbCount as number ?? 0,
      enabledAt:      draft?.enabledAt ?? null,
      createdAt:      draft?.createdAt ?? null,
    }
  })

  // ── POST /onboarding/draft ────────────────────────────────────────────────
  app.post<{
    Body: {
      companyName?:   string
      industry?:      string
      whatsappNumber?: string
      website?:       string
      serviceArea?:   string
      businessHours?: string
      aiGoals?:       string[]
      materialsText?: string
      materialsUrl?:  string
      completedSteps?: number
    }
  }>('/draft', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)
    const body = req.body ?? {}

    const data: Record<string, unknown> = { tenantId }
    if (body.companyName    !== undefined) data.companyName    = body.companyName
    if (body.industry       !== undefined) data.industry       = body.industry
    if (body.whatsappNumber !== undefined) data.whatsappNumber = body.whatsappNumber
    if (body.website        !== undefined) data.website        = body.website
    if (body.serviceArea    !== undefined) data.serviceArea    = body.serviceArea
    if (body.businessHours  !== undefined) data.businessHours  = body.businessHours
    if (body.aiGoals        !== undefined) data.aiGoals        = body.aiGoals
    if (body.materialsText  !== undefined) data.materialsText  = body.materialsText
    if (body.materialsUrl   !== undefined) data.materialsUrl   = body.materialsUrl
    if (body.completedSteps !== undefined) data.completedSteps = body.completedSteps

    const draft = await prisma.onboardingDraft.upsert({
      where:  { tenantId },
      create: data as Parameters<typeof prisma.onboardingDraft.upsert>[0]['create'],
      update: data as Parameters<typeof prisma.onboardingDraft.upsert>[0]['update'],
      select: { id: true, status: true, completedSteps: true, companyName: true, industry: true, aiGoals: true, updatedAt: true },
    })

    return reply.status(200).send({ saved: true, draft })
  })

  // ── POST /onboarding/ingest-materials ─────────────────────────────────────
  // Parse materialsText from the OnboardingDraft into KnowledgeItem records.
  // Idempotent: checks generatedPreview.ingestedAt to avoid re-ingestion.
  app.post('/ingest-materials', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)

    const draft = await prisma.onboardingDraft.findUnique({
      where:  { tenantId },
      select: { id: true, materialsText: true, generatedPreview: true },
    })
    if (!draft) {
      return reply.status(400).send({ error: 'No draft found. Start the wizard first.' })
    }

    // Idempotency: check if already ingested
    const prevPreview = draft.generatedPreview as Record<string, unknown> | null
    if (prevPreview?.ingestedAt) {
      // Already ingested — return existing count
      const existingCount = await prisma.knowledgeItem.count({
        where: { tenantId, isActive: true },
      })
      return {
        ingested:      false,
        alreadyDone:   true,
        ingestedAt:    prevPreview.ingestedAt,
        kbItemCount:   existingCount,
        note:          'Materials already ingested. Delete existing KB items and re-ingest if needed.',
      }
    }

    if (!draft.materialsText?.trim()) {
      return reply.status(400).send({ error: 'No materials text in draft. Add product/service information in Step 3 first.' })
    }

    const parsed = parseMaterialsToKbItems(draft.materialsText, tenantId)
    if (parsed.length === 0) {
      return reply.status(400).send({ error: 'Could not parse meaningful content from materials. Please ensure paragraphs are separated by blank lines.' })
    }

    // Batch create KB items
    await prisma.knowledgeItem.createMany({ data: parsed })

    // Mark ingested in generatedPreview metadata
    const now = new Date().toISOString()
    await prisma.onboardingDraft.update({
      where: { tenantId },
      data:  {
        generatedPreview: {
          ...(prevPreview ?? {}),
          ingestedAt:   now,
          ingestedKbCount: parsed.length,
        },
      },
    })

    return reply.status(201).send({
      ingested:     true,
      kbItemCount:  parsed.length,
      ingestedAt:   now,
      sourceTypes:  {
        faq:   parsed.filter((i) => i.type === KnowledgeItemType.PRODUCT_FAQ).length,
        chunk: parsed.filter((i) => i.type === KnowledgeItemType.KNOWLEDGE_CHUNK).length,
      },
      note:         'Materials ingested as KB items. Review them at /knowledge to add, edit, or delete entries.',
    })
  })

  // ── POST /onboarding/generate-preview ─────────────────────────────────────
  // ?mode=deterministic (default) — no AI provider call (safe for all tests)
  // ?mode=ai                      — AI-enhanced if configured + env flag set; fallback to deterministic
  app.post<{ Querystring: { mode?: string } }>(
    '/generate-preview',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const mode = req.query.mode ?? 'deterministic'

      const draft = await prisma.onboardingDraft.findUnique({ where: { tenantId } })
      if (!draft) {
        return reply.status(400).send({ error: 'No draft found. Call POST /onboarding/draft first.' })
      }

      let preview: EnrichedPreview

      if (mode === 'ai') {
        // Try AI generation (gated: requires OMNI_ENABLE_ONBOARDING_AI=true + configured key)
        const aiPreview = await tryAiPreviewGeneration(tenantId, draft)
        if (aiPreview) {
          preview = aiPreview
        } else {
          // Fallback to deterministic
          preview = generateDeterministicPreview(draft)
          preview = { ...preview, generationMode: 'AI_FALLBACK', note: 'AI generation unavailable (provider not configured, env flag not set, or generation failed). Showing deterministic template as fallback.' }
        }
      } else {
        preview = generateDeterministicPreview(draft)
      }

      // Preserve any existing ingestion metadata
      const existingPreview = draft.generatedPreview as Record<string, unknown> | null
      if (existingPreview?.ingestedAt) {
        preview.ingestedAt    = existingPreview.ingestedAt as string
        preview.ingestedKbCount = existingPreview.ingestedKbCount as number
      }

      await prisma.onboardingDraft.update({
        where: { tenantId },
        data:  { generatedPreview: JSON.parse(JSON.stringify(preview)), status: OnboardingStatus.PREVIEWED },
      })

      return { preview, saved: true }
    },
  )

  // ── POST /onboarding/enable ────────────────────────────────────────────────
  app.post('/enable', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)

    const draft = await prisma.onboardingDraft.findUnique({ where: { tenantId } })
    if (!draft) {
      return reply.status(400).send({ error: 'No draft found. Complete the wizard first.' })
    }
    if (!draft.companyName || !draft.industry) {
      return reply.status(400).send({ error: 'Complete at least company basics (name + industry) before enabling.' })
    }

    const updated = await prisma.onboardingDraft.update({
      where: { tenantId },
      data:  { status: OnboardingStatus.ENABLED, enabledAt: new Date() },
      select: { id: true, status: true, enabledAt: true, companyName: true },
    })

    return {
      enabled:               true,
      status:                updated.status,
      enabledAt:             updated.enabledAt,
      companyName:           updated.companyName,
      note:                  'Configuration saved as ENABLED. WhatsApp channel connection and real send are separate steps — configure under Settings > Channels.',
      realWhatsAppConnected: false,
      realMetaSendEnabled:   false,
    }
  })

  // ════════════════════════════════════════════════════════════════════════
  // Round-9D: One-click Activation guided journey
  // ════════════════════════════════════════════════════════════════════════

  // ── GET /onboarding/progress ──────────────────────────────────────────
  // Returns the 6 step computation: company / goals / products / generated /
  // channel / activation. Tenant-facing; no internalNotes / no secrets.
  app.get('/progress', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    const [draft, channelDraft, channelCount] = await Promise.all([
      prisma.onboardingDraft.findUnique({
        where:  { tenantId },
        select: { companyName: true, industry: true, aiGoals: true, generatedPreview: true, status: true },
      }),
      prisma.channelSetupDraft.findFirst({
        where:  { tenantId },
        select: { id: true, channelType: true, displayName: true, setupStatus: true, activationStatus: true, activationRequestedAt: true },
        orderBy:{ updatedAt: 'desc' },
      }),
      prisma.channel.count({ where: { tenantId, isActive: true } }),
    ])

    const preview = (draft?.generatedPreview as Record<string, unknown> | null) ?? null
    const products = (preview?.products as Array<{ productId?: string; productName?: string; salesConfig?: unknown }> | undefined) ?? []
    const hasGeneratedConfig = products.some(p => !!p.salesConfig)

    const companyComplete  = !!(draft?.companyName && draft.industry)
    const goalsComplete    = !!(draft?.aiGoals && draft.aiGoals.length > 0)
    const productsComplete = products.length > 0 && products.some(p => !!p.productName)
    const configComplete   = hasGeneratedConfig
    const channelComplete  = !!(channelDraft && channelDraft.displayName)
    // activationStatus comes off channelDraft; we pretend "not started" if no draft yet.
    const activationStatus = channelDraft?.activationStatus ?? 'NOT_STARTED'
    const activationComplete = activationStatus === 'REQUESTED' || activationStatus === 'APPROVED_BY_SAAS_ADMIN' || activationStatus === 'LIVE' || channelCount > 0

    const steps = [
      { key: 'company',    title: '公司资料',           completed: companyComplete,  cta: companyComplete  ? '更新公司资料'           : '确认公司资料',  href: '/onboarding?step=0' },
      { key: 'goals',      title: 'AI 客服目标',        completed: goalsComplete,    cta: goalsComplete    ? '调整 AI 目标'           : '选择 AI 目标',  href: '/onboarding?step=1' },
      { key: 'products',   title: '产品 / 服务资料',    completed: productsComplete, cta: productsComplete ? '编辑产品资料'           : '添加产品资料',  href: '/onboarding?step=2' },
      { key: 'config',     title: '一键生成成交配置',   completed: configComplete,   cta: configComplete   ? '查看生成的成交配置'     : '一键生成成交配置', href: '/onboarding?step=2' },
      { key: 'channel',    title: '连接 WhatsApp',      completed: channelComplete,  cta: channelComplete  ? '编辑渠道设置'           : '连接 WhatsApp',  href: '/channels/setup' },
      { key: 'activation', title: '安全演练与上线申请', completed: activationComplete, cta: activationComplete ? '查看激活状态'      : '提交上线申请',  href: '/channels/setup' },
    ]
    const completedCount = steps.filter(s => s.completed).length
    const totalCount     = steps.length
    const percent        = Math.round((completedCount / totalCount) * 100)
    const currentStep    = steps.find(s => !s.completed) ?? steps[steps.length - 1]
    const isComplete     = completedCount === totalCount

    return {
      steps,
      completedCount,
      totalCount,
      percent,
      currentStepKey:        currentStep.key,
      nextActionLabel:       currentStep.cta,
      nextActionHref:        currentStep.href,
      isComplete,
      activationRequestStatus: activationStatus,
      // explicit safety flags
      realWhatsAppStarted:   false,
      realMetaCalled:        false,
      realAiProviderCalled:  false,
    }
  })

  // ── POST /onboarding/submit-activation-request ────────────────────────
  // Tenant submits an activation request; SaaS Admin will approve in a later
  // Round. Tenant CANNOT approve. Does NOT start any real WhatsApp session
  // or call any real Meta API. Stores REQUESTED status on the ChannelSetupDraft.
  app.post('/submit-activation-request', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)

    // Service-access guard: SUSPENDED / EXPIRED / CANCELLED tenants cannot submit.
    const { getTenantServiceAccess } = await import('../lib/service-access')
    const access = await getTenantServiceAccess(tenantId)
    if (access.isBlocked) {
      return reply.status(403).send({
        error: 'Service is paused or expired — cannot submit activation request',
        serviceStatus: access.serviceStatus,
        serviceBlocked: true,
        tenantFacingBanner: access.tenantFacingBanner,
        cta: '请联系服务商续费 / 恢复服务',
        realWhatsAppStarted:  false,
        realMetaCalled:       false,
      })
    }

    const channelDraft = await prisma.channelSetupDraft.findFirst({
      where:  { tenantId },
      orderBy:{ updatedAt: 'desc' },
    })
    if (!channelDraft) {
      return reply.status(400).send({ error: '请先在「连接 WhatsApp」中保存渠道资料后再提交。' })
    }

    const updated = await prisma.channelSetupDraft.update({
      where: { id: channelDraft.id },
      data:  { activationStatus: 'REQUESTED', activationRequestedAt: new Date() },
      select:{ id: true, activationStatus: true, activationRequestedAt: true, channelType: true, displayName: true },
    })

    await (await import('../lib/audit')).createAuditLog({
      tenantId,
      actorUserId: getAuthUser(req).userId,
      actorRole:   getAuthUser(req).role,
      action:      'ACTIVATION_REQUEST_SUBMITTED',
      entityType:  'ChannelSetupDraft',
      entityId:    updated.id,
      metadata:    { channelType: updated.channelType, requestedAt: updated.activationRequestedAt?.toISOString() ?? null },
    })

    return reply.status(200).send({
      submitted:           true,
      activationStatus:    updated.activationStatus,
      activationRequestedAt: updated.activationRequestedAt?.toISOString() ?? null,
      tenantCanApprove:    false,
      note:                '已提交上线申请。服务商会检查安全设置并开启连接权限；当前不会启动真实 WhatsApp 会话。',
      realWhatsAppStarted: false,
      realMetaCalled:      false,
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Round-8: Product Intelligence Setup + Sales Config Generator
  // ════════════════════════════════════════════════════════════════════════

  // ── POST /onboarding/products/generate-sales-config ────────────────────
  // Deterministic stub generator. NEVER calls AI provider. Returns FAQ drafts +
  // sales scripts + qualification questions + tags + scoring + follow-up +
  // handoff rules. Tenant reviews and edits before saving.
  app.post<{ Body: ProductSetupInput }>(
    '/products/generate-sales-config',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const body = req.body ?? ({} as ProductSetupInput)

      if (!body.productName || !body.productName.trim()) {
        return reply.status(400).send({ error: 'productName is required' })
      }
      // Reject raw file bytes — uploaded-file metadata only.
      if (body.uploadedFile && typeof (body.uploadedFile as Record<string, unknown>).rawBytes !== 'undefined') {
        return reply.status(400).send({ error: 'Raw file bytes are not accepted. Send metadata + extractedText only.' })
      }

      // Round-9B service-access guard: SUSPENDED / EXPIRED / CANCELLED tenants
      // cannot generate new product configs. Manual data viewing remains allowed.
      const access = await getTenantServiceAccess(tenantId)
      if (access.isBlocked) {
        return reply.status(403).send({
          error: 'Service is paused or expired',
          serviceStatus:       access.serviceStatus,
          serviceBlocked:      true,
          cta:                 '请联系服务商续费 / 恢复服务',
          tenantFacingBanner:  access.tenantFacingBanner,
          realAiProviderCalled: false,
        })
      }

      // Round-9A quota: 1 click = 1 FAQ generation. Monthly first, then purchased credits.
      const tenantRow = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } })
      const quota = await tryDeductFaqGeneration(tenantId, tenantRow?.plan ?? 'trial')
      if (!quota.ok) {
        return reply.status(429).send({
          error: 'AI FAQ generation quota exhausted',
          quotaExhausted: true,
          cta: quota.cta ?? '购买 AI FAQ 生成包',
          realAiProviderCalled: false,
        })
      }

      const config = generateProductSalesConfig(body)

      return reply.status(200).send({
        config,
        tenantId,
        mode:                  config.mode,
        realAiProviderCalled:  false,
        realWhatsAppSent:      false,
        realMetaCalled:        false,
        note: '本结果为确定性草稿；不会自动保存到知识库或自动跟进规则表。请检查后再保存。',
      })
    },
  )

  // ── POST /onboarding/products/save-sales-config ────────────────────────
  // Persist tenant-edited product setup (basic fields + generated config) into
  // OnboardingDraft.generatedPreview.products[]. No schema migration required.
  app.post<{
    Body: {
      products: Array<{
        productId:        string
        productName:      string
        productCategory?: string
        suitableCustomers?: string
        sellingPoints?:   string
        pricing?:         string
        purchaseFlow?:    string
        requiredCustomerInfo?: string
        handoffConditions?: string
        extraNotes?:      string
        pastedMaterialText?: string
        referenceUrl?:    string
        uploadedFile?: { filename?: string; sizeBytes?: number; mimeType?: string }
        salesConfig?:     ProductSalesConfig
        status?:          'PENDING_INPUT' | 'PENDING_GENERATION' | 'GENERATED' | 'FAQ_SAVED' | 'ENABLED'
        lastUpdatedAt?:   string
      }>
    }
  }>(
    '/products/save-sales-config',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const products = req.body?.products
      if (!Array.isArray(products)) {
        return reply.status(400).send({ error: 'products[] is required' })
      }
      if (products.length > 20) {
        return reply.status(400).send({ error: 'Maximum 20 products per tenant supported' })
      }
      for (const p of products) {
        if (!p.productId || !p.productName) {
          return reply.status(400).send({ error: 'Each product needs productId + productName' })
        }
      }

      // Round-9B service-access guard: SUSPENDED / EXPIRED / CANCELLED tenants cannot
      // add new products. Detected by comparing incoming product ids against the
      // already-persisted set in the draft. Editing existing products is allowed.
      const accessSave = await getTenantServiceAccess(tenantId)
      if (accessSave.isBlocked) {
        const existing = await prisma.onboardingDraft.findUnique({ where: { tenantId }, select: { generatedPreview: true } })
        const existingProducts = ((existing?.generatedPreview as Record<string, unknown> | null)?.products as Array<{ productId?: string }> | undefined) ?? []
        const existingIds = new Set(existingProducts.map(p => p.productId).filter(Boolean) as string[])
        const newOnes = products.filter(p => !existingIds.has(p.productId))
        if (newOnes.length > 0) {
          return reply.status(403).send({
            error: 'Service is paused or expired — cannot add new products',
            serviceStatus:       accessSave.serviceStatus,
            serviceBlocked:      true,
            blockedNewProductIds: newOnes.map(p => p.productId),
            cta:                 '请联系服务商续费 / 恢复服务',
            tenantFacingBanner:  accessSave.tenantFacingBanner,
            realAiProviderCalled: false,
          })
        }
      }

      // Strip any accidental sensitive keys before storing
      const sanitized = products.map(p => {
        // Defensive: remove any unknown sensitive-looking keys
        const { uploadedFile, ...rest } = p
        const safeFile = uploadedFile
          ? { filename: uploadedFile.filename, sizeBytes: uploadedFile.sizeBytes, mimeType: uploadedFile.mimeType }
          : undefined
        return {
          ...rest,
          uploadedFile: safeFile,
          lastUpdatedAt: p.lastUpdatedAt ?? new Date().toISOString(),
        }
      })

      // Upsert: merge into existing generatedPreview JSON
      const existing = await prisma.onboardingDraft.findUnique({
        where:  { tenantId },
        select: { id: true, generatedPreview: true },
      })
      const prevPreview = (existing?.generatedPreview as Record<string, unknown> | null) ?? {}

      const nextPreview = { ...prevPreview, products: sanitized, productsUpdatedAt: new Date().toISOString() }
      // Round-trip through JSON to satisfy Prisma's InputJsonValue (same pattern as generate-preview).
      const nextPreviewJson = JSON.parse(JSON.stringify(nextPreview))

      const draft = await prisma.onboardingDraft.upsert({
        where:  { tenantId },
        create: { tenantId, generatedPreview: nextPreviewJson },
        update: { generatedPreview: nextPreviewJson },
        select: { id: true, updatedAt: true },
      })

      return reply.status(200).send({
        saved:           true,
        productCount:    sanitized.length,
        draftId:         draft.id,
        updatedAt:       draft.updatedAt,
        realAiProviderCalled: false,
      })
    },
  )

  // ── POST /onboarding/products/save-faq-to-knowledge ────────────────────
  // Bulk-save selected FAQ drafts as PRODUCT_FAQ KnowledgeItem rows.
  // Duplicate detection: (tenantId + normalised question text + active).
  // Returns counts: saved, skippedDuplicates, knowledgeItemIds.
  app.post<{
    Body: {
      productName: string
      faqs: Array<{ question: string; answer: string; category?: string; language?: string }>
    }
  }>(
    '/products/save-faq-to-knowledge',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { tenantId } = getAuthUser(req)
      const { productName, faqs } = req.body ?? ({} as Record<string, unknown>) as {
        productName?: string
        faqs?: Array<{ question?: string; answer?: string; category?: string; language?: string }>
      }

      if (!productName || !productName.trim()) {
        return reply.status(400).send({ error: 'productName is required' })
      }
      if (!Array.isArray(faqs) || faqs.length === 0) {
        return reply.status(400).send({ error: 'faqs[] must be a non-empty array' })
      }
      if (faqs.length > 100) {
        return reply.status(400).send({ error: 'Maximum 100 FAQ items per call' })
      }
      for (const f of faqs) {
        if (!f.question || !f.question.trim()) return reply.status(400).send({ error: 'every FAQ needs a question' })
        if (!f.answer   || !f.answer.trim())   return reply.status(400).send({ error: 'every FAQ needs an answer' })
      }

      const trimmedProduct = productName.trim()
      // Stored questions are prefixed `[ProductName] ` for tenant-visible context (no schema migration).
      // For dedupe we compare the FULL stored form so the same incoming question can be saved
      // separately under a different product (correct per-product scoping).
      const productPrefix = `[${trimmedProduct}] `

      // Fetch existing active PRODUCT_FAQ questions for duplicate detection
      const existing = await prisma.knowledgeItem.findMany({
        where:  { tenantId, type: KnowledgeItemType.PRODUCT_FAQ, isActive: true, question: { not: null } },
        select: { id: true, question: true },
      })
      const existingQs = new Set(existing.map(e => (e.question ?? '').trim().toLowerCase()))

      let skippedDuplicates = 0
      const toCreate: Array<{ tenantId: string; type: KnowledgeItemType; question: string; answer: string; language: string; isActive: boolean }> = []
      const seenInBatch = new Set<string>()

      for (const f of faqs) {
        const q = f.question!.trim()
        const fullQ = `${productPrefix}${q}`
        const norm = fullQ.toLowerCase()
        if (existingQs.has(norm) || seenInBatch.has(norm)) {
          skippedDuplicates++
          continue
        }
        seenInBatch.add(norm)
        toCreate.push({
          tenantId,
          type:     KnowledgeItemType.PRODUCT_FAQ,
          question: fullQ,
          answer:   f.answer!.trim(),
          language: f.language?.trim() || 'zh',
          isActive: true,
        })
      }

      if (toCreate.length === 0) {
        return reply.status(200).send({
          saved:               0,
          skippedDuplicates,
          knowledgeItemIds:    [],
          productName:         trimmedProduct,
          realAiProviderCalled: false,
          note: '所有 FAQ 已经存在或重复，未新增。',
        })
      }

      // Bulk insert
      await prisma.knowledgeItem.createMany({ data: toCreate })

      // Fetch the inserted rows (Prisma createMany doesn't return ids on PG with @id default cuid)
      const inserted = await prisma.knowledgeItem.findMany({
        where: {
          tenantId,
          type:     KnowledgeItemType.PRODUCT_FAQ,
          question: { in: toCreate.map(t => t.question) },
        },
        select: { id: true, question: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: toCreate.length,
      })

      return reply.status(201).send({
        saved:               inserted.length,
        skippedDuplicates,
        knowledgeItemIds:    inserted.map(i => i.id),
        productName:         trimmedProduct,
        realAiProviderCalled: false,
        note: '已保存到知识库（type=PRODUCT_FAQ）。可在知识库页面查看 / 编辑 / 停用。',
      })
    },
  )
}
