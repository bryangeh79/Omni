// Development seed script — safe demo data only.
// No real customer data. Idempotent via upsert.
// Run: pnpm db:seed

import dotenv from 'dotenv'
import path from 'path'

// __dirname is available in CommonJS context (packages/db uses module: "CommonJS")
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { PrismaClient, UserRole, KnowledgeItemType } from '@prisma/client'

const prisma = new PrismaClient({ log: ['warn', 'error'] })

const DEMO_TENANT_ID   = 'demo-tenant-001'
const DEMO_TENANT_SLUG = 'omni-demo'
const DEMO_USER_EMAIL  = 'admin@omni-demo.test'

async function seed() {
  console.log('[seed] Starting demo seed...')

  // ── 1. Demo Tenant ──────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where:  { id: DEMO_TENANT_ID },
    create: {
      id:              DEMO_TENANT_ID,
      name:            'Omni Demo Company',
      slug:            DEMO_TENANT_SLUG,
      defaultLanguage: 'zh',
      plan:            'trial',
      isActive:        true,
    },
    update: { name: 'Omni Demo Company', defaultLanguage: 'zh' },
  })
  console.log(`[seed] Tenant: ${tenant.name} (${tenant.id})`)

  // ── 2. Demo Admin User (placeholder, NOT for production) ────────────────────
  const user = await prisma.user.upsert({
    where:  { tenantId_email: { tenantId: DEMO_TENANT_ID, email: DEMO_USER_EMAIL } },
    create: {
      tenantId:     DEMO_TENANT_ID,
      email:        DEMO_USER_EMAIL,
      passwordHash: '$2a$10$tkwcfiNpwlb2sK9EqalFeOcR/gzTh./0o6bMDgo2J9Kj3qtiMtB.y',
      name:         'Demo Admin',
      role:         UserRole.OWNER,
      isActive:     true,
    },
    update: {
      name:         'Demo Admin',
      role:         UserRole.OWNER,
      passwordHash: '$2a$10$tkwcfiNpwlb2sK9EqalFeOcR/gzTh./0o6bMDgo2J9Kj3qtiMtB.y',
    },
  })
  console.log(`[seed] User: ${user.email} (${user.role})`)

  // ── 3. Knowledge Base — zh / en / ms samples ────────────────────────────────
  const kbItems = [
    // Chinese
    { q: '你们的服务是什么？',  a: 'Omni 是一个 WhatsApp AI 客服 CRM 成交系统。',                lang: 'zh', type: KnowledgeItemType.GLOBAL_FAQ },
    { q: '如何开始使用？',      a: '请联系我们的销售团队，我们将为您提供一对一演示。',           lang: 'zh', type: KnowledgeItemType.GLOBAL_FAQ },
    { q: '价格是多少？',        a: '我们提供灵活的定价方案，请联系我们获取报价。',               lang: 'zh', type: KnowledgeItemType.PRODUCT_FAQ },
    // English
    { q: 'What is Omni?',       a: 'Omni is a WhatsApp AI customer service CRM conversion system.', lang: 'en', type: KnowledgeItemType.GLOBAL_FAQ },
    { q: 'How do I get started?', a: 'Contact our sales team for a one-on-one demo.',             lang: 'en', type: KnowledgeItemType.GLOBAL_FAQ },
    { q: 'What are your prices?', a: 'We offer flexible pricing. Contact us for a quote.',        lang: 'en', type: KnowledgeItemType.PRODUCT_FAQ },
    // Malay
    { q: 'Apa itu Omni?',       a: 'Omni adalah sistem CRM perkhidmatan pelanggan AI WhatsApp.', lang: 'ms', type: KnowledgeItemType.GLOBAL_FAQ },
    { q: 'Bagaimana untuk mula?', a: 'Hubungi pasukan jualan kami untuk demo.',                   lang: 'ms', type: KnowledgeItemType.GLOBAL_FAQ },
  ]

  for (const item of kbItems) {
    const id = `kb-${DEMO_TENANT_ID}-${item.lang}-${item.type}-${Buffer.from(item.q).toString('base64').slice(0, 12)}`
    await prisma.knowledgeItem.upsert({
      where:  { id },
      create: { id, tenantId: DEMO_TENANT_ID, question: item.q, answer: item.a, language: item.lang, type: item.type, isActive: true },
      update: { answer: item.a },
    })
  }
  console.log(`[seed] KnowledgeItems: ${kbItems.length} items (zh/en/ms)`)

  // ── 4. Default Follow-up Rules ───────────────────────────────────────────────
  const followUpRules = [
    { id: 'fur-001', trigger: 'PRICE_ASKED_NO_REPLY',  delayHours: 24, messageTemplate: '您好，请问您对我们的报价有什么疑问吗？' },
    { id: 'fur-002', trigger: 'CONSIDERING',            delayHours: 48, messageTemplate: '您好，请问您是否已决定好了呢？' },
    { id: 'fur-003', trigger: 'BOOKING_NOT_CONFIRMED', delayHours: 12, messageTemplate: '您好，您的预约尚未确认，请问您方便确认一下吗？' },
    { id: 'fur-004', trigger: 'HIGH_INTENT_UNHANDLED', delayHours: 2,  messageTemplate: '您好，我们的团队会尽快联系您！' },
    { id: 'fur-005', trigger: 'LONG_NO_REPLY',         delayHours: 72, messageTemplate: '您好，请问有什么我们可以协助您的吗？' },
  ]
  for (const rule of followUpRules) {
    await prisma.followUpRule.upsert({
      where:  { id: rule.id },
      create: { ...rule, tenantId: DEMO_TENANT_ID, isActive: true },
      update: { delayHours: rule.delayHours, messageTemplate: rule.messageTemplate },
    })
  }
  console.log(`[seed] FollowUpRules: ${followUpRules.length} default rules`)

  // ── 5. Default Handoff Rules ─────────────────────────────────────────────────
  const handoffRules = [
    { id: 'hfr-001', condition: 'USER_REQUESTS_HUMAN' },
    { id: 'hfr-002', condition: 'FAQ_NO_ANSWER' },
    { id: 'hfr-003', condition: 'AI_UNCERTAIN' },
    { id: 'hfr-004', condition: 'SCORE_GTE_80' },
    { id: 'hfr-005', condition: 'QUOTE_PAYMENT_COMPLAINT' },
    { id: 'hfr-006', condition: 'REFUND_REQUEST' },
  ]
  for (const rule of handoffRules) {
    await prisma.handoffRule.upsert({
      where:  { id: rule.id },
      create: { ...rule, tenantId: DEMO_TENANT_ID, isActive: true },
      update: {},
    })
  }
  console.log(`[seed] HandoffRules: ${handoffRules.length} default rules`)

  // ── 6. AI Config stub ────────────────────────────────────────────────────────
  await prisma.aiConfig.upsert({
    where:  { tenantId: DEMO_TENANT_ID },
    create: {
      tenantId: DEMO_TENANT_ID,
      persona:  'You are a helpful AI customer service agent for Omni Demo Company.',
      goals:    ['QUALIFY_LEADS', 'ANSWER_FAQ', 'SCHEDULE_DEMO'],
      model:    'gpt-4o',
    },
    update: {},
  })
  console.log('[seed] AiConfig: stub created')

  console.log('[seed] ✅ Demo seed complete')
}

seed()
  .catch((e) => { console.error('[seed] ❌ Failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
