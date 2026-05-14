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
const INDUSTRY_PERSONAS: Record<string, { name: string; tone: string; focus: string }> = {
  'real-estate':    { name: 'Alex',     tone: 'professional and warm',   focus: 'property inquiries, viewing appointments, pricing questions' },
  'education':      { name: 'Aisha',    tone: 'helpful and encouraging', focus: 'course inquiries, enrollment, schedules, pricing' },
  'retail':         { name: 'Mei',      tone: 'friendly and efficient',  focus: 'product questions, orders, availability, promotions' },
  'food-beverage':  { name: 'Jamie',    tone: 'friendly and appetizing', focus: 'menu questions, reservations, delivery, opening hours' },
  'beauty-wellness':{ name: 'Sophie',   tone: 'warm and reassuring',     focus: 'services, bookings, pricing, products' },
  'automotive':     { name: 'Daniel',   tone: 'knowledgeable and clear', focus: 'vehicle inquiries, test drives, service bookings, pricing' },
  'healthcare':     { name: 'Dr. Kim',  tone: 'professional and caring', focus: 'appointments, services, clinic hours, referrals' },
  'finance':        { name: 'Raj',      tone: 'precise and trustworthy', focus: 'product inquiries, eligibility, documentation, appointments' },
  'default':        { name: 'Sam',      tone: 'professional and helpful', focus: 'product inquiries, pricing, appointments, support' },
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
  'default': [
    { question: 'What services/products do you offer?',         answer: 'We offer a comprehensive range of products and services tailored to your needs. Could you tell me more about what you are looking for?' },
    { question: 'What are your pricing options?',               answer: 'Our pricing depends on your specific requirements. Please share more details and I will provide a tailored quote.' },
    { question: 'How can I get started?',                       answer: 'Getting started is easy! I can guide you through the process. What aspect would you like to begin with?' },
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
        const norm = q.toLowerCase()
        if (existingQs.has(norm) || seenInBatch.has(norm)) {
          skippedDuplicates++
          continue
        }
        seenInBatch.add(norm)
        // Prefix question with product tag so 知识库 list shows context without schema migration.
        toCreate.push({
          tenantId,
          type:     KnowledgeItemType.PRODUCT_FAQ,
          question: `[${trimmedProduct}] ${q}`,
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
