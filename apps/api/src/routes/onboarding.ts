// Onboarding Wizard API — Phase 11B
//
// GET  /onboarding/status          — check current onboarding state
// POST /onboarding/draft           — save/update wizard draft
// POST /onboarding/generate-preview — generate deterministic AI config preview (no real provider)
// POST /onboarding/enable          — mark onboarding complete (does NOT connect WhatsApp or enable real send)
//
// Safety:
//   - All endpoints are tenant-scoped via JWT.
//   - generate-preview uses deterministic template engine only. No real AI provider calls.
//   - enable does NOT set OMNI_ENABLE_REAL_META_SEND or connect WhatsApp session.
//   - No secrets in responses.

import type { FastifyInstance } from 'fastify'
import { prisma, OnboardingStatus } from '@omni/db'
import { requireAuth, getAuthUser } from '../auth'

// ── Industry → AI persona templates ──────────────────────────────────────────
const INDUSTRY_PERSONAS: Record<string, { name: string; tone: string; focus: string }> = {
  'real-estate':    { name: 'Alex',    tone: 'professional and warm',   focus: 'property inquiries, viewing appointments, pricing questions' },
  'education':      { name: 'Aisha',   tone: 'helpful and encouraging', focus: 'course inquiries, enrollment, schedules, pricing' },
  'retail':         { name: 'Mei',     tone: 'friendly and efficient',  focus: 'product questions, orders, availability, promotions' },
  'food-beverage':  { name: 'Jamie',   tone: 'friendly and appetizing', focus: 'menu questions, reservations, delivery, opening hours' },
  'beauty-wellness':{ name: 'Sophie',  tone: 'warm and reassuring',     focus: 'services, bookings, pricing, products' },
  'automotive':     { name: 'Daniel',  tone: 'knowledgeable and clear', focus: 'vehicle inquiries, test drives, service bookings, pricing' },
  'healthcare':     { name: 'Dr. Kim', tone: 'professional and caring', focus: 'appointments, services, clinic hours, referrals' },
  'finance':        { name: 'Raj',     tone: 'precise and trustworthy', focus: 'product inquiries, eligibility, documentation, appointments' },
  'default':        { name: 'Sam',     tone: 'professional and helpful', focus: 'product inquiries, pricing, appointments, support' },
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

// ── Deterministic preview generator ──────────────────────────────────────────
function generatePreview(draft: {
  companyName?:  string | null
  industry?:     string | null
  aiGoals?:      string[]
  materialsText?: string | null
  businessHours?: string | null
}) {
  const industry  = draft.industry?.toLowerCase() ?? 'default'
  const persona   = INDUSTRY_PERSONAS[industry] ?? INDUSTRY_PERSONAS['default']!
  const company   = draft.companyName ?? 'Your Company'
  const goals     = draft.aiGoals ?? []

  // Generate follow-up scenarios from goals
  const scenarios = new Set<string>()
  for (const goal of goals) {
    const mapped = GOAL_SCENARIOS[goal] ?? []
    mapped.forEach((s) => scenarios.add(s))
  }
  if (scenarios.size === 0) scenarios.add('PRICE_ASKED_NO_REPLY')

  // Extract keywords from materials text (simple word extraction)
  const keywords: string[] = []
  if (draft.materialsText) {
    const words = draft.materialsText.match(/\b[A-Z][a-z]{2,}/g) ?? []
    keywords.push(...new Set(words).values())
  }

  // Generate welcome message
  const welcomeMsg = `Hello! 👋 Welcome to ${company}. I'm ${persona.name}, your AI assistant. ${
    goals.includes('lead-conversion') ? 'I can help you find the perfect solution and get pricing information.' :
    goals.includes('appointment')     ? 'I can help you book an appointment at your convenience.' :
    goals.includes('after-sales')     ? 'I\'m here to assist with any questions or support you need.' :
    'I\'m here to help answer your questions and connect you with our team.'
  } How can I help you today?`

  // Generate FAQ categories based on goals + industry
  const faqCategories = [
    'Pricing & Packages',
    goals.includes('appointment') ? 'Bookings & Availability' : 'Product Details',
    'About Us',
    goals.includes('after-sales') ? 'Support & Returns' : 'How to Get Started',
    draft.businessHours ? 'Business Hours' : 'Contact Us',
  ]

  // Lead stages based on industry
  const leadStages = ['NEW', 'INTERESTED', 'HIGH_INTENT', 'QUOTED', 'BOOKED', 'WON', 'LOST']

  // Recommended tags
  const tags = [
    'high_intent', 'price_inquiry', 'needs_follow_up',
    ...(goals.includes('appointment')  ? ['appointment_requested'] : []),
    ...(goals.includes('after-sales')  ? ['after_sales'] : []),
    ...(keywords.slice(0, 3).map((k) => k.toLowerCase())),
  ]

  return {
    aiPersona: {
      name:  persona.name,
      tone:  persona.tone,
      focus: persona.focus,
      company,
    },
    welcomeMessage: welcomeMsg,
    faqCategories,
    leadStages,
    recommendedTags:        [...new Set(tags)].slice(0, 8),
    followUpScenarios:      [...scenarios],
    handoffTriggers:        ['USER_REQUESTS_HUMAN', 'SCORE_GTE_80', 'QUOTE_PAYMENT_COMPLAINT'],
    replyLanguagePolicy:    'AUTO',
    generatedAt:            new Date().toISOString(),
    generationMode:         'DETERMINISTIC_TEMPLATE',
    note:                   'Preview generated from deterministic templates. No real AI provider was called. For AI-personalised generation, set up an AI API key in Settings.',
  }
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

    return {
      tenantId,
      hasStarted:     !!draft,
      status:         draft?.status ?? null,
      completedSteps: draft?.completedSteps ?? 0,
      companyName:    draft?.companyName ?? null,
      industry:       draft?.industry ?? null,
      goalsCount:     draft?.aiGoals?.length ?? 0,
      hasPreview:     !!draft?.generatedPreview,
      enabledAt:      draft?.enabledAt ?? null,
      createdAt:      draft?.createdAt ?? null,
    }
  })

  // ── POST /onboarding/draft ────────────────────────────────────────────────
  // Save or update wizard draft. Partial updates are supported.
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

    const data: Parameters<typeof prisma.onboardingDraft.upsert>[0]['create'] = {
      tenantId,
    }

    if (body.companyName   !== undefined) data.companyName   = body.companyName
    if (body.industry      !== undefined) data.industry      = body.industry
    if (body.whatsappNumber !== undefined) data.whatsappNumber = body.whatsappNumber
    if (body.website       !== undefined) data.website       = body.website
    if (body.serviceArea   !== undefined) data.serviceArea   = body.serviceArea
    if (body.businessHours !== undefined) data.businessHours = body.businessHours
    if (body.aiGoals       !== undefined) data.aiGoals       = body.aiGoals
    if (body.materialsText !== undefined) data.materialsText = body.materialsText
    if (body.materialsUrl  !== undefined) data.materialsUrl  = body.materialsUrl
    if (body.completedSteps !== undefined) data.completedSteps = body.completedSteps

    const draft = await prisma.onboardingDraft.upsert({
      where:  { tenantId },
      create: data,
      update: data,
      select: {
        id: true, status: true, completedSteps: true,
        companyName: true, industry: true, aiGoals: true,
        updatedAt: true,
      },
    })

    return reply.status(200).send({ saved: true, draft })
  })

  // ── POST /onboarding/generate-preview ─────────────────────────────────────
  // Generate deterministic AI config preview from current draft.
  // NO real AI provider calls — uses template engine only.
  app.post('/generate-preview', { preHandler: requireAuth }, async (req, reply) => {
    const { tenantId } = getAuthUser(req)

    const draft = await prisma.onboardingDraft.findUnique({ where: { tenantId } })
    if (!draft) {
      return reply.status(400).send({ error: 'No draft found. Call POST /onboarding/draft first.' })
    }

    const preview = generatePreview({
      companyName:   draft.companyName,
      industry:      draft.industry,
      aiGoals:       draft.aiGoals,
      materialsText: draft.materialsText,
      businessHours: draft.businessHours,
    })

    await prisma.onboardingDraft.update({
      where: { tenantId },
      data:  { generatedPreview: preview, status: OnboardingStatus.PREVIEWED },
    })

    return { preview, saved: true }
  })

  // ── POST /onboarding/enable ────────────────────────────────────────────────
  // Mark onboarding as ENABLED (configuration saved).
  // Does NOT connect WhatsApp. Does NOT enable real Meta send.
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
      enabled:                   true,
      status:                    updated.status,
      enabledAt:                 updated.enabledAt,
      companyName:               updated.companyName,
      note:                      'Configuration saved as ENABLED. WhatsApp channel connection and real send are separate steps — configure under Settings > Channels.',
      realWhatsAppConnected:     false,  // explicit: not connected
      realMetaSendEnabled:       false,  // explicit: not enabled
    }
  })
}
