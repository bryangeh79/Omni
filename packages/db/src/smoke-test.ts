// DB smoke test — proves connectivity, tenant isolation, and CRUD round-trip.
// Uses only test-prefixed records; cleans up after itself.
// Run: pnpm db:smoke

import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

import { PrismaClient, ChannelType, Direction, SenderType } from '@prisma/client'
import { scopeToTenant } from './tenant-scope'

const prisma = new PrismaClient({ log: ['error'] })

const DEMO_TENANT_ID = 'demo-tenant-001'
const SMOKE_PREFIX   = 'smoke-test-'

let passed = 0
let failed = 0

function check(label: string, condition: boolean): void {
  if (condition) { console.log(`  ✅ ${label}`); passed++ }
  else           { console.error(`  ❌ ${label}`); failed++ }
}

async function smoke() {
  console.log('[smoke] Starting DB smoke test...\n')

  const cleanup: { type: string; id: string }[] = []

  try {
    // ── 1. Connection ──────────────────────────────────────────────────────────
    console.log('1. Connection')
    await prisma.$connect()
    check('DB connected', true)

    // ── 2. Demo tenant ─────────────────────────────────────────────────────────
    console.log('\n2. Demo tenant')
    const tenant = await prisma.tenant.findUnique({ where: { id: DEMO_TENANT_ID } })
    check('demo tenant exists', tenant !== null)
    check('demo tenant slug is omni-demo',  tenant?.slug === 'omni-demo')
    check('demo tenant language is zh',     tenant?.defaultLanguage === 'zh')

    if (!tenant) throw new Error('Demo tenant not found — run pnpm db:seed first')

    // ── 3. Tenant-scoped helpers ───────────────────────────────────────────────
    console.log('\n3. Tenant scope')
    const db = scopeToTenant(prisma, DEMO_TENANT_ID)
    check('scopeToTenant tenantId matches', db.tenantId === DEMO_TENANT_ID)

    // ── 4. Channel CRUD ────────────────────────────────────────────────────────
    console.log('\n4. Channel CRUD')
    const testChannel = await db.channels.create({
      type:        ChannelType.WHATSAPP_WEB,
      displayName: `${SMOKE_PREFIX}channel`,
      isActive:    false,
    })
    cleanup.push({ type: 'channel', id: testChannel.id })
    check('channel created with correct tenantId', testChannel.tenantId === DEMO_TENANT_ID)
    check('channel type is WHATSAPP_WEB',           testChannel.type === ChannelType.WHATSAPP_WEB)

    const foundChannel = await db.channels.byId(testChannel.id)
    check('channel readable via tenant scope', foundChannel?.id === testChannel.id)

    // ── 5. Customer CRUD ───────────────────────────────────────────────────────
    console.log('\n5. Customer CRUD')
    const testCustomer = await db.customers.create({
      phone:         `${SMOKE_PREFIX}+60123456789`,
      name:          'Smoke Test Customer',
      isBlacklisted: false,
    })
    cleanup.push({ type: 'customer', id: testCustomer.id })
    check('customer created with correct tenantId', testCustomer.tenantId === DEMO_TENANT_ID)
    check('customer phone stored',                  testCustomer.phone.startsWith(SMOKE_PREFIX))

    const byPhone = await db.customers.byPhone(`${SMOKE_PREFIX}+60123456789`)
    check('customer findable by phone', byPhone?.id === testCustomer.id)

    const count = await db.customers.count()
    check('customer count >= 1', count >= 1)

    // ── 6. Conversation & Message ──────────────────────────────────────────────
    console.log('\n6. Conversation & Message')
    const testConv = await db.conversations.create({
      channelId:  testChannel.id,
      customerId: testCustomer.id,
      status:     'AI_HANDLING',
    })
    cleanup.push({ type: 'conversation', id: testConv.id })
    check('conversation created', testConv.tenantId === DEMO_TENANT_ID)

    const testMsg = await db.messages.create({
      conversationId: testConv.id,
      direction:      Direction.INBOUND,
      senderType:     SenderType.CUSTOMER,
      content:        `${SMOKE_PREFIX}Hello, is this working?`,
    })
    cleanup.push({ type: 'message', id: testMsg.id })
    check('message created', testMsg.conversationId === testConv.id)

    const msgs = await db.messages.inConversation(testConv.id)
    check('message readable via conversation', msgs.length === 1)

    // ── 7. Knowledge Base ──────────────────────────────────────────────────────
    console.log('\n7. Knowledge Base')
    const zhKb = await db.knowledge.list('zh')
    const enKb = await db.knowledge.list('en')
    const msKb = await db.knowledge.list('ms')
    check('zh knowledge items exist', zhKb.length > 0)
    check('en knowledge items exist', enKb.length > 0)
    check('ms knowledge items exist', msKb.length > 0)

    // ── 8. Tenant isolation ────────────────────────────────────────────────────
    console.log('\n8. Tenant isolation')
    const otherDb          = scopeToTenant(prisma, 'non-existent-tenant-xyz')
    const otherCustomers   = await otherDb.customers.list()
    const otherConversations = await otherDb.conversations.list()
    check('other tenant sees 0 customers',     otherCustomers.length === 0)
    check('other tenant sees 0 conversations', otherConversations.length === 0)

  } finally {
    // ── Cleanup: reverse insertion order for FK constraints ────────────────────
    console.log('\nCleaning up test records...')
    for (const item of [...cleanup].reverse()) {
      try {
        switch (item.type) {
          case 'message':      await prisma.message.delete({ where: { id: item.id } }); break
          case 'conversation': await prisma.conversation.delete({ where: { id: item.id } }); break
          case 'customer':     await prisma.customer.delete({ where: { id: item.id } }); break
          case 'channel':      await prisma.channel.delete({ where: { id: item.id } }); break
        }
        console.log(`  🗑️  ${item.type} ${item.id} deleted`)
      } catch (e) {
        console.warn(`  ⚠️  failed to delete ${item.type} ${item.id}:`, e)
      }
    }
    await prisma.$disconnect()
  }

  console.log(`\n[smoke] Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) { console.error('[smoke] ❌ SMOKE TEST FAILED'); process.exit(1) }
  else             { console.log('[smoke] ✅ ALL SMOKE TESTS PASSED') }
}

smoke().catch((e) => { console.error('[smoke] Fatal:', e); process.exit(1) })
