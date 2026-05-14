// Tenant routes — Phase 17A adds self-service signup
//
// GET  /tenants/me           — tenant profile (requireAuth, stub)
// PATCH /tenants/me          — update tenant (requireAuth, stub)
// GET  /tenants/me/users     — list users (requireAuth, stub)
// POST /tenants/me/users     — create user (requireAuth, stub)
//
// Phase 17A (public — no auth required):
// POST /tenants/signup                     — create tenant + owner + seed data
// POST /tenants/signup/verify-email-dry-run — email verification placeholder (stub, no real email)
//
// Safety:
//   - passwordHash NEVER returned in any response
//   - No real email sent
//   - No real WhatsApp/Meta/AI/payment calls
//   - Access token issued for seamless auto-login (same as login endpoint)

import type { FastifyInstance } from 'fastify'
import { prisma }               from '@omni/db'
import { requireAuth, getAuthUser, hashPassword, issueAccessToken, issueRefreshToken } from '../auth'
import { createAuditLog } from '../lib/audit'

const VALID_CHANNEL_PREFS = ['WA_WEB', 'META_WA_BUSINESS'] as const
const VALID_GOALS         = ['sales', 'appointment', 'support', 'qualification', 'demo', 'other'] as const
const VALID_INDUSTRIES    = [
  'real-estate', 'education', 'retail', 'food-beverage', 'beauty-wellness',
  'automotive', 'healthcare', 'finance', 'other',
]

function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

// Starter FAQ text by industry
function starterFaq(industry: string, businessName: string) {
  const maps: Record<string, { q: string; a: string }> = {
    'real-estate':     { q: '你们有哪些房源可以介绍？', a: `${businessName} 提供多种优质房源，请联系我们获取最新资讯。` },
    'education':       { q: '你们有哪些课程？', a: `${businessName} 提供多种培训课程，请联系我们了解详情。` },
    'retail':          { q: '你们的产品有哪些？', a: `${businessName} 提供多种优质产品，请联系我们获取最新目录。` },
    'food-beverage':   { q: '你们的营业时间是什么？', a: `请联系 ${businessName} 了解最新营业时间及菜单。` },
    'beauty-wellness': { q: '你们提供哪些服务？', a: `${businessName} 提供专业美容及健康服务，请联系我们预约。` },
    'automotive':      { q: '你们有哪些车型可以选择？', a: `${businessName} 提供多种车型，请联系我们了解详情。` },
    'healthcare':      { q: '如何预约诊疗？', a: `请联系 ${businessName} 预约，我们将尽快安排。` },
    'finance':         { q: '你们提供哪些金融产品？', a: `${businessName} 提供多种金融解决方案，请联系我们。` },
    'other':           { q: '你们提供什么服务？', a: `${businessName} 提供专业服务，请联系我们了解更多。` },
  }
  return maps[industry] ?? maps['other']
}

// Default follow-up rules (same structure as seed)
const DEFAULT_FOLLOW_UP_RULES = [
  { trigger: 'PRICE_ASKED_NO_REPLY',   delayHours: 2,  messageTemplate: '[FOLLOW-UP] Hi, you asked about our pricing. Are you still interested? We\'d love to help.' },
  { trigger: 'BOOKING_NOT_CONFIRMED',   delayHours: 3,  messageTemplate: '[FOLLOW-UP] Hi, your booking is pending confirmation. Shall we proceed?' },
  { trigger: 'CONSIDERING',            delayHours: 24, messageTemplate: '[FOLLOW-UP] Hi, just checking in — are you still considering? We\'re happy to answer any questions.' },
  { trigger: 'LONG_NO_REPLY',          delayHours: 48, messageTemplate: '[FOLLOW-UP] Hi, we haven\'t heard from you in a while. Can we help with anything?' },
  { trigger: 'HIGH_INTENT_UNHANDLED',  delayHours: 1,  messageTemplate: '[HUMAN REMINDER] High-intent customer has not been followed up. Please review ASAP.' },
]

// Default handoff rules
const DEFAULT_HANDOFF_RULES = [
  'USER_REQUESTS_HUMAN',
  'SCORE_GTE_80',
  'FAQ_NO_ANSWER',
  'URGENT_DETECTED',
  'MULTIPLE_TRIES_NO_ANSWER',
  'PAYMENT_MENTIONED',
]

export async function tenantRoutes(app: FastifyInstance) {

  // ── Existing stub routes ─────────────────────────────────────────────────
  app.get('/me', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })

  app.patch('/me', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })

  app.get('/me/users', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })

  app.post('/me/users', { preHandler: requireAuth }, async (req) => {
    const { tenantId } = getAuthUser(req)
    return { todo: 'Phase 3 implementation', tenantId }
  })

  // ── POST /tenants/signup — Phase 17A ──────────────────────────────────────
  // Public — no auth required. Creates tenant + owner + starter data.
  app.post<{
    Body: {
      businessName?:      string
      slug?:              string
      ownerName?:         string
      ownerEmail?:        string
      password?:          string
      industry?:          string
      channelPreference?: string
      primaryGoal?:       string
    }
  }>('/signup', async (req, reply) => {
    const {
      businessName, slug: rawSlug, ownerName, ownerEmail,
      password, industry, channelPreference, primaryGoal,
    } = req.body ?? {}

    // ── Validation ─────────────────────────────────────────────────────────
    if (!businessName || businessName.trim().length < 2) {
      return reply.status(400).send({ error: 'businessName is required (min 2 characters)' })
    }
    if (!ownerName || ownerName.trim().length < 2) {
      return reply.status(400).send({ error: 'ownerName is required (min 2 characters)' })
    }
    if (!ownerEmail || !isValidEmail(ownerEmail)) {
      return reply.status(400).send({ error: 'Valid ownerEmail is required' })
    }
    if (!password || password.length < 8) {
      return reply.status(400).send({ error: 'password is required (min 8 characters)' })
    }

    // Normalize slug — fall back to businessName if not provided
    const slug = normalizeSlug(rawSlug ?? businessName)
    if (!slug || slug.length < 3) {
      return reply.status(400).send({ error: 'slug must be at least 3 characters (alphanumeric and dashes only)' })
    }

    const channelPref = VALID_CHANNEL_PREFS.includes(channelPreference as typeof VALID_CHANNEL_PREFS[number])
      ? channelPreference!
      : 'WA_WEB'
    const goal = VALID_GOALS.includes(primaryGoal as typeof VALID_GOALS[number])
      ? primaryGoal!
      : 'other'
    const industryNorm = VALID_INDUSTRIES.includes(industry ?? '')
      ? industry!
      : 'other'

    // ── Uniqueness checks ──────────────────────────────────────────────────
    const existingSlug = await prisma.tenant.findUnique({ where: { slug } })
    if (existingSlug) {
      return reply.status(409).send({
        error:       'Tenant slug already taken',
        field:       'slug',
        suggestion:  `${slug}-${Math.random().toString(36).slice(2, 6)}`,
      })
    }

    // ── Create tenant + owner user + starter data ─────────────────────────
    const passwordHash = await hashPassword(password)
    const faq = starterFaq(industryNorm, businessName.trim())

    const tenant = await prisma.tenant.create({
      data: {
        name:            businessName.trim(),
        slug,
        defaultLanguage: 'zh',
        plan:            'trial',
        isActive:        true,
      },
    })

    // Owner user
    const owner = await prisma.user.create({
      data: {
        tenantId:     tenant.id,
        email:        ownerEmail.trim().toLowerCase(),
        passwordHash,
        name:         ownerName.trim(),
        role:         'OWNER',
        isActive:     true,
      },
    })

    // Onboarding draft
    await prisma.onboardingDraft.create({
      data: {
        tenantId:    tenant.id,
        status:      'DRAFT',
        companyName: businessName.trim(),
        industry:    industryNorm,
        aiGoals:     [goal],
      },
    })

    // Channel setup draft (no credentials — just the preference)
    await prisma.channelSetupDraft.create({
      data: {
        tenantId:               tenant.id,
        channelType:            channelPref,
        displayName:            `${businessName.trim()} WhatsApp`,
        setupStatus:            'DRAFT',
        credentialStatus:       'NONE',
        realWaSessionEnabled:   false,
        realMetaSendEnabled:    false,
      },
    })

    // Starter knowledge item
    await prisma.knowledgeItem.create({
      data: {
        tenantId: tenant.id,
        type:     'GLOBAL_FAQ',
        question: faq.q,
        answer:   faq.a,
        language: 'zh',
        isActive: true,
      },
    })

    // AI config (stub/dry-run provider)
    await prisma.aiConfig.create({
      data: {
        tenantId:           tenant.id,
        aiProvider:         'DRY_RUN',
        model:              'dry-run',
        useTenantApiKey:    false,
        replyLanguagePolicy: 'AUTO',
        isActive:           true,
      },
    })

    // Default follow-up rules
    await prisma.followUpRule.createMany({
      data: DEFAULT_FOLLOW_UP_RULES.map(r => ({
        tenantId:        tenant.id,
        trigger:         r.trigger,
        delayHours:      r.delayHours,
        messageTemplate: r.messageTemplate,
        isActive:        true,
      })),
    })

    // Default handoff rules
    await prisma.handoffRule.createMany({
      data: DEFAULT_HANDOFF_RULES.map(condition => ({
        tenantId:  tenant.id,
        condition,
        isActive:  true,
      })),
    })

    // Issue tokens for seamless auto-login (same pattern as /auth/login)
    const tokenUser    = { id: owner.id, tenantId: tenant.id, role: owner.role, email: owner.email }
    const accessToken  = issueAccessToken(app, tokenUser)
    const refreshToken = issueRefreshToken(app, tokenUser)

    // Audit log (non-blocking)
    void createAuditLog({
      tenantId:    tenant.id,
      actorUserId: owner.id,
      actorRole:   owner.role,
      action:      'TENANT_SIGNUP',
      entityType:  'Tenant',
      entityId:    tenant.id,
      metadata:    { slug, industry: industryNorm, channelPreference: channelPref, goal },
    })

    return reply.status(201).send({
      tenantId:                tenant.id,
      slug:                    tenant.slug,
      businessName:            tenant.name,
      ownerUserId:             owner.id,
      ownerEmail:              owner.email,
      accessToken,
      refreshToken,
      emailVerificationRequired: false,
      emailVerificationMode:   'STUB',
      emailSent:               false,
      nextRoute:               '/onboarding',
      onboardingDraftCreated:  true,
      channelDraftCreated:     true,
      starterKbCreated:        true,
      safety: {
        realSendEnabled:    false,
        broadcastEnabled:   false,
        realMetaSendEnabled: false,
        waSessionEnabled:   false,
      },
      note: 'No real email sent. Real WhatsApp sending is disabled until activation guide checks are complete. Not a broadcast or marketing platform.',
    })
  })

  // ── POST /tenants/signup/verify-email-dry-run — Phase 17A ────────────────
  // Email verification placeholder. No real email is sent. Always returns stub status.
  app.post<{
    Body: { tenantId?: string; email?: string }
  }>('/signup/verify-email-dry-run', async (req, reply) => {
    const { tenantId, email } = req.body ?? {}

    if (!tenantId || !email) {
      return reply.status(400).send({ error: 'tenantId and email are required' })
    }
    if (!isValidEmail(email)) {
      return reply.status(400).send({ error: 'Valid email is required' })
    }

    // Verify the tenant exists (basic sanity check)
    const tenant = await prisma.tenant.findUnique({
      where:  { id: tenantId },
      select: { id: true, slug: true },
    })
    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant not found' })
    }

    return {
      tenantId:      tenant.id,
      email,
      dryRun:        true,
      emailSent:     false,
      verificationMode: 'STUB',
      note: 'Email verification is not configured in this phase. No real email was sent. Tenant is active by default.',
    }
  })
}
