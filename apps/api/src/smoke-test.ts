// API smoke test — auth + CRM + Conversation + Message.
// Prerequisites: API running on port 43111, demo seed applied (pnpm db:seed).
// Run: pnpm smoke   (from apps/api, with API already started)

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const BASE = `http://localhost:${process.env.PORT_API ?? 43111}`

// Demo credentials — DEV ONLY.
const DEMO_SLUG     = 'omni-demo'
const DEMO_EMAIL    = 'admin@omni-demo.test'
const DEMO_PASSWORD = process.env.OMNI_SMOKE_PASSWORD ?? 'OmniDemo2024!'

let passed = 0
let failed = 0

function check(label: string, ok: boolean): void {
  if (ok) { console.log(`  ✅ ${label}`); passed++ }
  else     { console.error(`  ❌ ${label}`); failed++ }
}

async function post(url: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`${BASE}${url}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body:    JSON.stringify(body),
  })
}
async function get(url: string, token?: string): Promise<Response> {
  return fetch(`${BASE}${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
}
async function patch(url: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`${BASE}${url}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body:    JSON.stringify(body),
  })
}
async function del(url: string, token?: string): Promise<Response> {
  return fetch(`${BASE}${url}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} })
}

// ── Smoke test ─────────────────────────────────────────────────────────────

async function smoke() {
  console.log(`[smoke] API smoke test — ${BASE}\n`)
  let accessToken  = ''
  let refreshToken = ''
  let createdId    = ''  // customer id
  let channelId    = ''  // WA Web channel id
  let convId       = ''  // test conversation id
  const kbIds: string[] = []    // knowledge item ids for cleanup
  const furIds: string[] = []   // follow-up rule ids for cleanup
  const hfrIds: string[] = []   // handoff rule ids for cleanup

  // ── 1. Health ──────────────────────────────────────────────────────────
  console.log('1. Health check')
  check('GET /health → 200', (await get('/health')).status === 200)

  // ── 2. Login validation ────────────────────────────────────────────────
  console.log('\n2. Login validation')
  check('missing tenantSlug → 400', (await post('/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD })).status === 400)
  check('missing email → 400',      (await post('/auth/login', { tenantSlug: DEMO_SLUG, password: DEMO_PASSWORD })).status === 400)
  check('missing password → 400',   (await post('/auth/login', { tenantSlug: DEMO_SLUG, email: DEMO_EMAIL })).status === 400)
  check('empty body → 400',         (await post('/auth/login', {})).status === 400)

  // ── 3. Wrong credentials ───────────────────────────────────────────────
  console.log('\n3. Wrong credentials rejection')
  const wrongSlugRes  = await post('/auth/login', { tenantSlug: 'nonexistent-xyz', email: DEMO_EMAIL, password: DEMO_PASSWORD })
  const wrongSlugBody = await wrongSlugRes.json() as Record<string, unknown>
  check('wrong tenantSlug → 401', wrongSlugRes.status === 401)
  check('wrong slug → generic error', wrongSlugBody.error === 'Invalid credentials')
  check('wrong password → 401', (await post('/auth/login', { tenantSlug: DEMO_SLUG, email: DEMO_EMAIL, password: 'bad' })).status === 401)

  // ── 4. Valid login ─────────────────────────────────────────────────────
  console.log('\n4. Valid login')
  const loginRes  = await post('/auth/login', { tenantSlug: DEMO_SLUG, email: DEMO_EMAIL, password: DEMO_PASSWORD })
  const loginBody = await loginRes.json() as Record<string, unknown>
  check('POST /auth/login → 200', loginRes.status === 200)
  const hasTokens = typeof loginBody.accessToken === 'string' && typeof loginBody.refreshToken === 'string'
  check('login returns tokens', hasTokens)
  check('login returns user.tenantId',   typeof (loginBody.user as Record<string, unknown>)?.tenantId === 'string')
  check('login returns user.tenantSlug', (loginBody.user as Record<string, unknown>)?.tenantSlug === DEMO_SLUG)
  if (!hasTokens) { console.error('[smoke] Cannot continue without tokens'); process.exit(1) }
  accessToken  = loginBody.accessToken  as string
  refreshToken = loginBody.refreshToken as string

  // ── 5. /auth/me ────────────────────────────────────────────────────────
  console.log('\n5. GET /auth/me')
  const meBody = await (await get('/auth/me', accessToken)).json() as Record<string, unknown>
  check('/auth/me → 200', typeof meBody.tenantId === 'string')
  check('/auth/me returns email', meBody.email === DEMO_EMAIL)
  check('/auth/me no password leak', !meBody.passwordHash)

  // ── 6. Token auth checks ───────────────────────────────────────────────
  console.log('\n6. Token auth checks')
  check('protected route with token → 200',    (await get('/customers', accessToken)).status === 200)
  check('protected route without token → 401', (await get('/customers')).status === 401)
  check('protected route bad token → 401',     (await get('/customers', 'bad-token')).status === 401)

  // ── 7. Token refresh ───────────────────────────────────────────────────
  console.log('\n7. Token refresh')
  const refBody = await (await post('/auth/refresh', { refreshToken })).json() as Record<string, unknown>
  check('refresh → new accessToken', typeof refBody.accessToken === 'string')
  if (refBody.accessToken) accessToken = refBody.accessToken as string
  check('new token valid', (await get('/auth/me', accessToken)).status === 200)

  // ── 8. Create customer ─────────────────────────────────────────────────
  const SMOKE_PHONE = '+60-SMOKE-TEST-001'
  console.log('\n8. Create customer')
  const createRes = await post('/customers', {
    phone: SMOKE_PHONE, name: 'Smoke Test Customer', company: 'Smoke Corp',
    languagePreference: 'zh', stage: 'NEW', score: 30, urgency: 2, notes: 'smoke test',
  }, accessToken)
  check('POST /customers → 201', createRes.status === 201)
  const created = await createRes.json() as Record<string, unknown>
  check('create returns id',    typeof created.id === 'string')
  check('create returns phone', created.phone === SMOKE_PHONE)
  check('create score is 30',   created.score === 30)
  createdId = created.id as string

  // ── 9. Duplicate phone ─────────────────────────────────────────────────
  console.log('\n9. Duplicate phone rejection')
  const dupRes  = await post('/customers', { phone: SMOKE_PHONE }, accessToken)
  const dupBody = await dupRes.json() as Record<string, unknown>
  check('duplicate phone → 409', dupRes.status === 409)
  check('409 returns existingId', dupBody.customerId === createdId)

  // ── 10. Create validation ──────────────────────────────────────────────
  console.log('\n10. Create validation')
  check('missing phone → 400',      (await post('/customers', {}, accessToken)).status === 400)
  check('invalid stage → 400',      (await post('/customers', { phone: '+60-sv2', stage: 'INVALID' }, accessToken)).status === 400)
  check('score out of range → 400', (await post('/customers', { phone: '+60-sv3', score: 150 }, accessToken)).status === 400)
  check('urgency out of range → 400', (await post('/customers', { phone: '+60-sv4', urgency: 9 }, accessToken)).status === 400)

  // ── 11. List customers ─────────────────────────────────────────────────
  console.log('\n11. List customers')
  const listRes  = await get('/customers?page=1&pageSize=10', accessToken)
  const listBody = await listRes.json() as Record<string, unknown>
  check('GET /customers → 200', listRes.status === 200)
  check('list has data array',  Array.isArray(listBody.data))
  const pag = listBody.pagination as Record<string, unknown>
  check('pagination.total >= 1', Number(pag.total) >= 1)

  // ── 12. Filters ────────────────────────────────────────────────────────
  console.log('\n12. Filters')
  const stageData = ((await (await get('/customers?stage=NEW', accessToken)).json() as Record<string, unknown>).data as Record<string, unknown>[])
  check('filter stage=NEW: all NEW', stageData.every((c) => c.stage === 'NEW'))
  const scoreData = ((await (await get('/customers?minScore=25&maxScore=50', accessToken)).json() as Record<string, unknown>).data as Record<string, unknown>[])
  check('filter score range: all in range', scoreData.every((c) => Number(c.score) >= 25 && Number(c.score) <= 50))
  check('filter language=zh → 200', (await get('/customers?language=zh', accessToken)).status === 200)

  // ── 13. Get customer by ID ─────────────────────────────────────────────
  console.log('\n13. Get customer by ID')
  const detail = await (await get(`/customers/${createdId}`, accessToken)).json() as Record<string, unknown>
  check('GET /customers/:id → 200', detail.id === createdId)
  check('detail has tags array', Array.isArray(detail.tags))
  check('detail has conversationCount', typeof detail.conversationCount === 'number')
  check('GET /customers/nonexistent → 404', (await get('/customers/nonexistent', accessToken)).status === 404)

  // ── 14. Update customer ────────────────────────────────────────────────
  console.log('\n14. Update customer')
  const patched = await (await patch(`/customers/${createdId}`, { stage: 'INTERESTED', score: 55, notes: 'updated' }, accessToken)).json() as Record<string, unknown>
  check('PATCH → stage INTERESTED', patched.stage === 'INTERESTED')
  check('PATCH → score 55',         patched.score === 55)
  check('invalid stage PATCH → 400', (await patch(`/customers/${createdId}`, { stage: 'NOPE' }, accessToken)).status === 400)

  // ── 15. Tags ───────────────────────────────────────────────────────────
  console.log('\n15. Tags')
  const tag1Body = await (await post(`/customers/${createdId}/tags`, { tag: 'high_intent' }, accessToken)).json() as Record<string, unknown>
  check('add tag → 201', (tag1Body.tags as string[])?.includes('high_intent'))
  await post(`/customers/${createdId}/tags`, { tag: 'price_inquiry' }, accessToken)
  check('duplicate tag → 201 idempotent', (await post(`/customers/${createdId}/tags`, { tag: 'high_intent' }, accessToken)).status === 201)
  const tagFilterData = ((await (await get('/customers?tag=high_intent', accessToken)).json() as Record<string, unknown>).data as Record<string, unknown>[])
  check('filter by tag: includes created customer', tagFilterData.some((c) => c.id === createdId))
  const delTagBody = await (await del(`/customers/${createdId}/tags/price_inquiry`, accessToken)).json() as Record<string, unknown>
  check('delete tag: price_inquiry removed', !(delTagBody.tags as string[])?.includes('price_inquiry'))
  check('empty tag → 400', (await post(`/customers/${createdId}/tags`, { tag: '' }, accessToken)).status === 400)

  // ── 16. WA Web connect (capture channelId) ─────────────────────────────
  console.log('\n16. WA Web connect (stub mode)')
  const waRes  = await post('/channels/whatsapp-web/connect', { displayName: 'Smoke Channel' }, accessToken)
  const waBody = await waRes.json() as Record<string, unknown>
  check('WA connect → 201',     waRes.status === 201)
  check('WA returns channelId', typeof waBody.channelId === 'string')
  check('WA is stubMode',       waBody.stubMode === true)
  channelId = waBody.channelId as string

  // ════════════════════════════════════════════════════════════════════════
  // Conversation & Message API (Phase 3C)
  // ════════════════════════════════════════════════════════════════════════

  // Setup: create test conversation + initial inbound message via Prisma
  console.log('\n17. Conversation setup (Prisma)')
  const setupResult = await prismaSetupConversation(channelId, createdId)
  convId = setupResult.convId
  check('conversation created via DB setup', !!convId)

  // ── 18. List conversations ─────────────────────────────────────────────
  console.log('\n18. List conversations')
  const convListRes  = await get('/conversations?page=1&pageSize=10', accessToken)
  const convListBody = await convListRes.json() as Record<string, unknown>
  check('GET /conversations → 200', convListRes.status === 200)
  check('list has data array',      Array.isArray(convListBody.data))
  const convPag = convListBody.pagination as Record<string, unknown>
  check('conversation count >= 1', Number(convPag.total) >= 1)
  const convData = convListBody.data as Record<string, unknown>[]
  check('list includes created conversation', convData.some((c) => c.id === convId))
  const convEntry = convData.find((c) => c.id === convId) as Record<string, unknown> | undefined
  check('list entry has customer summary', typeof (convEntry?.customer as Record<string, unknown>)?.phone === 'string')
  check('list entry has lastMessage or null', 'lastMessage' in (convEntry ?? {}))

  // ── 19. Filter conversations by status ─────────────────────────────────
  console.log('\n19. Filter conversations')
  const aiHandlingRes  = await get('/conversations?status=AI_HANDLING', accessToken)
  const aiHandlingBody = await aiHandlingRes.json() as Record<string, unknown>
  check('filter status=AI_HANDLING → 200', aiHandlingRes.status === 200)
  const aiData = aiHandlingBody.data as Record<string, unknown>[]
  check('all results have AI_HANDLING', aiData.every((c) => c.status === 'AI_HANDLING'))
  check('invalid status → 400', (await get('/conversations?status=INVALID', accessToken)).status === 400)

  // ── 20. Get conversation detail ────────────────────────────────────────
  console.log('\n20. Get conversation detail')
  const detailRes  = await get(`/conversations/${convId}`, accessToken)
  const convDetail = await detailRes.json() as Record<string, unknown>
  check('GET /conversations/:id → 200', detailRes.status === 200)
  check('detail id matches', convDetail.id === convId)
  check('detail has customer with tags', Array.isArray((convDetail.customer as Record<string, unknown>)?.tags))
  check('detail has channel', typeof convDetail.channel === 'object')
  check('detail has messages array', Array.isArray(convDetail.messages))
  check('detail has messageCount', typeof convDetail.messageCount === 'number')
  check('GET /conversations/nonexistent → 404', (await get('/conversations/nonexistent', accessToken)).status === 404)

  // ── 21. List messages ──────────────────────────────────────────────────
  console.log('\n21. List messages')
  const msgListRes  = await get(`/messages?conversationId=${convId}`, accessToken)
  const msgListBody = await msgListRes.json() as Record<string, unknown>
  check('GET /messages → 200', msgListRes.status === 200)
  check('messages has data array', Array.isArray(msgListBody.data))
  const msgData = msgListBody.data as Record<string, unknown>[]
  check('initial message present', msgData.length >= 1)
  check('initial message is INBOUND', msgData[0]?.direction === 'INBOUND')
  check('GET /messages without conversationId → 400', (await get('/messages', accessToken)).status === 400)
  check('GET /messages for nonexistent conv → 404', (await get('/messages?conversationId=nonexistent', accessToken)).status === 404)

  // ── 22. Send message ───────────────────────────────────────────────────
  console.log('\n22. Send message')
  const sendRes  = await post('/messages/send', { conversationId: convId, body: 'Hello, I am the agent!' }, accessToken)
  const sendBody = await sendRes.json() as Record<string, unknown>
  check('POST /messages/send → 201', sendRes.status === 201)
  check('send returns message id', typeof sendBody.id === 'string')
  check('send returns OUTBOUND direction', sendBody.direction === 'OUTBOUND')
  check('send returns HUMAN_AGENT senderType', sendBody.senderType === 'HUMAN_AGENT')
  check('send returns STUB_NOT_SENT status', sendBody.sendStatus === 'STUB_NOT_SENT')
  check('send without body → 400', (await post('/messages/send', { conversationId: convId, body: '' }, accessToken)).status === 400)
  check('send without conversationId → 400', (await post('/messages/send', { body: 'test' }, accessToken)).status === 400)
  check('send to nonexistent conv → 404', (await post('/messages/send', { conversationId: 'nonexistent', body: 'test' }, accessToken)).status === 404)

  // ── 23. Verify message count increased ────────────────────────────────
  console.log('\n23. Messages after send')
  const msgList2 = await (await get(`/messages?conversationId=${convId}`, accessToken)).json() as Record<string, unknown>
  const msgData2 = msgList2.data as Record<string, unknown>[]
  check('message count increased after send', msgData2.length > msgData.length)
  check('sent message in list', msgData2.some((m) => m.senderType === 'HUMAN_AGENT'))

  // ── 24. Takeover ──────────────────────────────────────────────────────
  console.log('\n24. Takeover')
  const takeoverRes  = await post(`/conversations/${convId}/takeover`, {}, accessToken)
  const takeoverBody = await takeoverRes.json() as Record<string, unknown>
  check('POST /conversations/:id/takeover → 200', takeoverRes.status === 200)
  check('status changed to HUMAN_HANDLING', takeoverBody.status === 'HUMAN_HANDLING')
  check('assignedUserId set', typeof takeoverBody.assignedUserId === 'string')

  // Verify via GET detail
  const afterTakeover = await (await get(`/conversations/${convId}`, accessToken)).json() as Record<string, unknown>
  check('detail confirms HUMAN_HANDLING', afterTakeover.status === 'HUMAN_HANDLING')

  // Verify system message written
  const msgsAfterTakeover = ((await (await get(`/messages?conversationId=${convId}`, accessToken)).json() as Record<string, unknown>).data) as Record<string, unknown>[]
  check('takeover wrote SYSTEM message', msgsAfterTakeover.some((m) => m.senderType === 'SYSTEM'))

  // ── 25. Release ───────────────────────────────────────────────────────
  console.log('\n25. Release')
  const releaseRes  = await post(`/conversations/${convId}/release`, {}, accessToken)
  const releaseBody = await releaseRes.json() as Record<string, unknown>
  check('POST /conversations/:id/release → 200', releaseRes.status === 200)
  check('status changed to AI_HANDLING', releaseBody.status === 'AI_HANDLING')
  check('assignedUserId cleared', releaseBody.assignedUserId === null)

  // ── 26. Close ─────────────────────────────────────────────────────────
  console.log('\n26. Close')
  const closeRes  = await post(`/conversations/${convId}/close`, {}, accessToken)
  const closeBody = await closeRes.json() as Record<string, unknown>
  check('POST /conversations/:id/close → 200', closeRes.status === 200)
  check('status changed to CLOSED', closeBody.status === 'CLOSED')

  // Verify closed conversation blocks send
  check('send to CLOSED conv → 400', (await post('/messages/send', { conversationId: convId, body: 'test' }, accessToken)).status === 400)

  // Re-close is safe
  const reCloseRes = await post(`/conversations/${convId}/close`, {}, accessToken)
  check('re-close already closed → 200 (idempotent)', reCloseRes.status === 200)

  // ════════════════════════════════════════════════════════════════════════
  // Knowledge Base CRUD (Phase 3D)
  // ════════════════════════════════════════════════════════════════════════

  // ── 27. Create knowledge items ────────────────────────────────────────
  console.log('\n27. Create knowledge items')

  // GLOBAL_FAQ zh
  const kbGfRes  = await post('/knowledge', { type: 'GLOBAL_FAQ', question: '你们的服务是什么？', answer: 'Omni 是 WhatsApp AI 客服 CRM 系统。', language: 'zh' }, accessToken)
  const kbGf     = await kbGfRes.json() as Record<string, unknown>
  check('POST GLOBAL_FAQ zh → 201', kbGfRes.status === 201)
  check('GLOBAL_FAQ has id',        typeof kbGf.id === 'string')
  check('GLOBAL_FAQ type correct',  kbGf.type === 'GLOBAL_FAQ')
  check('GLOBAL_FAQ language zh',   kbGf.language === 'zh')
  check('GLOBAL_FAQ isActive true', kbGf.isActive === true)
  if (kbGf.id) kbIds.push(kbGf.id as string)

  // PRODUCT_FAQ en
  const kbPfRes  = await post('/knowledge', { type: 'PRODUCT_FAQ', question: 'What are your prices?', answer: 'We offer flexible pricing. Contact us for a quote.', language: 'en' }, accessToken)
  const kbPf     = await kbPfRes.json() as Record<string, unknown>
  check('POST PRODUCT_FAQ en → 201', kbPfRes.status === 201)
  check('PRODUCT_FAQ language en',   kbPf.language === 'en')
  if (kbPf.id) kbIds.push(kbPf.id as string)

  // KNOWLEDGE_CHUNK ms (no question required)
  const kbKcRes  = await post('/knowledge', { type: 'KNOWLEDGE_CHUNK', answer: 'Omni menyokong bahasa Melayu, Cina, dan Inggeris.', language: 'ms' }, accessToken)
  const kbKc     = await kbKcRes.json() as Record<string, unknown>
  check('POST KNOWLEDGE_CHUNK ms → 201', kbKcRes.status === 201)
  check('KNOWLEDGE_CHUNK no question OK', kbKc.question === null)
  if (kbKc.id) kbIds.push(kbKc.id as string)

  // ── 28. Create validation ─────────────────────────────────────────────
  console.log('\n28. Create validation')
  check('missing type → 400',              (await post('/knowledge', { answer: 'test' }, accessToken)).status === 400)
  check('invalid type → 400',             (await post('/knowledge', { type: 'INVALID', answer: 'test' }, accessToken)).status === 400)
  check('missing answer → 400',           (await post('/knowledge', { type: 'GLOBAL_FAQ', question: 'Q?' }, accessToken)).status === 400)
  check('invalid language → 400',         (await post('/knowledge', { type: 'GLOBAL_FAQ', question: 'Q?', answer: 'A', language: 'ja' }, accessToken)).status === 400)
  check('FAQ missing question → 400',     (await post('/knowledge', { type: 'GLOBAL_FAQ', answer: 'A' }, accessToken)).status === 400)
  check('PRODUCT_FAQ missing Q → 400',    (await post('/knowledge', { type: 'PRODUCT_FAQ', answer: 'A' }, accessToken)).status === 400)

  // ── 29. List knowledge ────────────────────────────────────────────────
  console.log('\n29. List knowledge')
  const kbListRes  = await get('/knowledge?page=1&pageSize=20', accessToken)
  const kbListBody = await kbListRes.json() as Record<string, unknown>
  check('GET /knowledge → 200', kbListRes.status === 200)
  check('list has data array',  Array.isArray(kbListBody.data))
  const kbPag = kbListBody.pagination as Record<string, unknown>
  check('pagination.total >= 3', Number(kbPag.total) >= 3)

  // ── 30. Filter by type ────────────────────────────────────────────────
  console.log('\n30. Filter by type')
  const kbTypeRes  = await get('/knowledge?type=GLOBAL_FAQ', accessToken)
  const kbTypeBody = await kbTypeRes.json() as Record<string, unknown>
  check('filter type=GLOBAL_FAQ → 200', kbTypeRes.status === 200)
  const kbTypeData = kbTypeBody.data as Record<string, unknown>[]
  check('all results are GLOBAL_FAQ', kbTypeData.every((k) => k.type === 'GLOBAL_FAQ'))
  check('invalid type filter → 400',   (await get('/knowledge?type=NOPE', accessToken)).status === 400)

  // ── 31. Filter by language ────────────────────────────────────────────
  console.log('\n31. Filter by language')
  const kbLangRes  = await get('/knowledge?language=en', accessToken)
  const kbLangBody = await kbLangRes.json() as Record<string, unknown>
  check('filter language=en → 200', kbLangRes.status === 200)
  const kbLangData = kbLangBody.data as Record<string, unknown>[]
  check('all results lang en',       kbLangData.every((k) => k.language === 'en'))
  check('ms filter → 200', (await get('/knowledge?language=ms', accessToken)).status === 200)
  check('invalid lang filter → 400', (await get('/knowledge?language=jp', accessToken)).status === 400)

  // ── 32. Get knowledge detail ──────────────────────────────────────────
  console.log('\n32. Get knowledge detail')
  const kbGfId    = kbGf.id as string
  const kbDetailRes  = await get(`/knowledge/${kbGfId}`, accessToken)
  const kbDetail     = await kbDetailRes.json() as Record<string, unknown>
  check('GET /knowledge/:id → 200', kbDetailRes.status === 200)
  check('detail id matches',        kbDetail.id === kbGfId)
  check('detail has answer',        typeof kbDetail.answer === 'string')
  check('GET /knowledge/nonexistent → 404', (await get('/knowledge/nonexistent', accessToken)).status === 404)

  // ── 33. Patch knowledge ───────────────────────────────────────────────
  console.log('\n33. Patch knowledge')
  const kbPatchRes  = await patch(`/knowledge/${kbGfId}`, { answer: 'Updated answer for smoke test.', language: 'zh' }, accessToken)
  const kbPatched   = await kbPatchRes.json() as Record<string, unknown>
  check('PATCH /knowledge/:id → 200', kbPatchRes.status === 200)
  check('answer updated', kbPatched.answer === 'Updated answer for smoke test.')
  check('invalid type PATCH → 400', (await patch(`/knowledge/${kbGfId}`, { type: 'NOPE' }, accessToken)).status === 400)
  check('empty answer PATCH → 400', (await patch(`/knowledge/${kbGfId}`, { answer: '' }, accessToken)).status === 400)

  // ── 34. Search knowledge ──────────────────────────────────────────────
  console.log('\n34. Search knowledge')
  const searchRes  = await post('/knowledge/search', { q: '你们', language: 'zh' }, accessToken)
  const searchBody = await searchRes.json() as Record<string, unknown>
  check('POST /knowledge/search → 200', searchRes.status === 200)
  check('search has data array',        Array.isArray(searchBody.data))
  const searchData = searchBody.data as Record<string, unknown>[]
  check('search finds zh item',         searchData.length >= 1)
  check('search missing q → 400',       (await post('/knowledge/search', {}, accessToken)).status === 400)
  check('search empty q → 400',         (await post('/knowledge/search', { q: '' }, accessToken)).status === 400)
  check('search invalid type → 400',    (await post('/knowledge/search', { q: 'test', type: 'BAD' }, accessToken)).status === 400)

  // Search by answer text
  const searchEnRes  = await post('/knowledge/search', { q: 'flexible pricing', language: 'en' }, accessToken)
  const searchEnBody = await searchEnRes.json() as Record<string, unknown>
  check('search by answer content → 200', searchEnRes.status === 200)
  check('answer match found', ((searchEnBody.data as Record<string, unknown>[])?.length ?? 0) >= 1)

  // ── 35. Soft delete and isActive filter ───────────────────────────────
  console.log('\n35. Soft delete and isActive filter')
  const kbKcId    = kbKc.id as string
  const delRes    = await del(`/knowledge/${kbKcId}`, accessToken)
  const delBody   = await delRes.json() as Record<string, unknown>
  check('DELETE /knowledge/:id → 200', delRes.status === 200)
  check('isActive = false after delete', delBody.isActive === false)

  // Confirm still findable by ID (soft-deleted, not hard-deleted)
  const afterDelDetail = await (await get(`/knowledge/${kbKcId}`, accessToken)).json() as Record<string, unknown>
  check('soft-deleted item still findable by ID', afterDelDetail.id === kbKcId)
  check('soft-deleted isActive is false', afterDelDetail.isActive === false)

  // Confirm excluded from isActive=true filter
  const activeListBody = await (await get('/knowledge?isActive=true&language=ms', accessToken)).json() as Record<string, unknown>
  const activeData = activeListBody.data as Record<string, unknown>[]
  check('soft-deleted excluded from isActive=true filter', !activeData.some((k) => k.id === kbKcId))

  // Re-delete idempotent
  check('re-delete already soft-deleted → 200', (await del(`/knowledge/${kbKcId}`, accessToken)).status === 200)

  // ── 36. Knowledge auth check ──────────────────────────────────────────
  console.log('\n36. Knowledge auth check')
  check('/knowledge without token → 401', (await get('/knowledge')).status === 401)
  check('/knowledge/search without token → 401', (await post('/knowledge/search', { q: 'test' })).status === 401)

  // ════════════════════════════════════════════════════════════════════════
  // Automation Rules (Phase 3E)
  // ════════════════════════════════════════════════════════════════════════

  // ── 37. List seeded follow-up rules ───────────────────────────────────
  console.log('\n37. List seeded follow-up rules')
  const furListRes  = await get('/automation/follow-up-rules', accessToken)
  const furListBody = await furListRes.json() as Record<string, unknown>
  check('GET /automation/follow-up-rules → 200', furListRes.status === 200)
  check('follow-up list has data array', Array.isArray(furListBody.data))
  const furData = furListBody.data as Record<string, unknown>[]
  check('seeded follow-up rules exist (>= 5)', furData.length >= 5)
  check('validTriggers in response', Array.isArray(furListBody.validTriggers))
  check('follow-up rule has trigger',          typeof furData[0]?.trigger === 'string')
  check('follow-up rule has delayHours',       typeof furData[0]?.delayHours === 'number')
  check('follow-up rule has messageTemplate',  typeof furData[0]?.messageTemplate === 'string')

  // ── 38. Create follow-up rule ─────────────────────────────────────────
  console.log('\n38. Create follow-up rule')
  const furCreateRes  = await post('/automation/follow-up-rules', {
    trigger:         'PRICE_ASKED_NO_REPLY',
    delayHours:      6,
    messageTemplate: 'Hi! Following up on your price inquiry 😊',
    isActive:        true,
  }, accessToken)
  const furCreated = await furCreateRes.json() as Record<string, unknown>
  check('POST follow-up-rules → 201',      furCreateRes.status === 201)
  check('created trigger correct',          furCreated.trigger === 'PRICE_ASKED_NO_REPLY')
  check('created delayHours correct',       furCreated.delayHours === 6)
  check('created messageTemplate correct',  typeof furCreated.messageTemplate === 'string')
  check('created isActive true',            furCreated.isActive === true)
  if (furCreated.id) furIds.push(furCreated.id as string)

  // ── 39. Follow-up rule validation ─────────────────────────────────────
  console.log('\n39. Follow-up rule validation')
  check('invalid trigger → 400',     (await post('/automation/follow-up-rules', { trigger: 'INVALID_TRIGGER', delayHours: 1, messageTemplate: 'Hi' }, accessToken)).status === 400)
  check('missing trigger → 400',     (await post('/automation/follow-up-rules', { delayHours: 1, messageTemplate: 'Hi' }, accessToken)).status === 400)
  check('negative delayHours → 400', (await post('/automation/follow-up-rules', { trigger: 'CONSIDERING', delayHours: -1, messageTemplate: 'Hi' }, accessToken)).status === 400)
  check('delayHours > 720 → 400',    (await post('/automation/follow-up-rules', { trigger: 'CONSIDERING', delayHours: 999, messageTemplate: 'Hi' }, accessToken)).status === 400)
  check('missing messageTemplate → 400', (await post('/automation/follow-up-rules', { trigger: 'CONSIDERING', delayHours: 1 }, accessToken)).status === 400)
  check('empty messageTemplate → 400',   (await post('/automation/follow-up-rules', { trigger: 'CONSIDERING', delayHours: 1, messageTemplate: '' }, accessToken)).status === 400)

  // ── 40. Patch follow-up rule ──────────────────────────────────────────
  console.log('\n40. Patch follow-up rule')
  const furId = furCreated.id as string
  const furPatchRes = await patch(`/automation/follow-up-rules/${furId}`, { delayHours: 12, isActive: false }, accessToken)
  const furPatched  = await furPatchRes.json() as Record<string, unknown>
  check('PATCH follow-up-rules → 200',   furPatchRes.status === 200)
  check('delayHours updated to 12',       furPatched.delayHours === 12)
  check('isActive updated to false',      furPatched.isActive === false)
  check('invalid trigger PATCH → 400',   (await patch(`/automation/follow-up-rules/${furId}`, { trigger: 'BAD' }, accessToken)).status === 400)
  check('404 nonexistent rule',          (await patch('/automation/follow-up-rules/nonexistent', { isActive: true }, accessToken)).status === 404)

  // ── 41. Filter active follow-up rules ────────────────────────────────
  console.log('\n41. Filter active follow-up rules')
  const furActiveRes  = await get('/automation/follow-up-rules?isActive=true', accessToken)
  const furActiveBody = await furActiveRes.json() as Record<string, unknown>
  check('filter isActive=true → 200', furActiveRes.status === 200)
  const furActiveData = furActiveBody.data as Record<string, unknown>[]
  check('all results isActive=true', furActiveData.every((r) => r.isActive === true))
  check('patched inactive rule excluded', !furActiveData.some((r) => r.id === furId))

  // ── 42. List seeded handoff rules ─────────────────────────────────────
  console.log('\n42. List seeded handoff rules')
  const hfrListRes  = await get('/automation/handoff-rules', accessToken)
  const hfrListBody = await hfrListRes.json() as Record<string, unknown>
  check('GET /automation/handoff-rules → 200', hfrListRes.status === 200)
  check('handoff list has data array', Array.isArray(hfrListBody.data))
  const hfrData = hfrListBody.data as Record<string, unknown>[]
  check('seeded handoff rules exist (>= 6)', hfrData.length >= 6)
  check('validConditions in response', Array.isArray(hfrListBody.validConditions))
  check('handoff rule has condition', typeof hfrData[0]?.condition === 'string')

  // ── 43. Create handoff rule ───────────────────────────────────────────
  console.log('\n43. Create handoff rule')
  const hfrCreateRes  = await post('/automation/handoff-rules', { condition: 'INSULT_OR_ABUSE', isActive: true }, accessToken)
  const hfrCreated    = await hfrCreateRes.json() as Record<string, unknown>
  check('POST handoff-rules → 201',     hfrCreateRes.status === 201)
  check('created condition correct',     hfrCreated.condition === 'INSULT_OR_ABUSE')
  check('created isActive true',         hfrCreated.isActive === true)
  if (hfrCreated.id) hfrIds.push(hfrCreated.id as string)

  // ── 44. Handoff rule validation ───────────────────────────────────────
  console.log('\n44. Handoff rule validation')
  check('invalid condition → 400', (await post('/automation/handoff-rules', { condition: 'INVALID_COND' }, accessToken)).status === 400)
  check('missing condition → 400', (await post('/automation/handoff-rules', {}, accessToken)).status === 400)

  // ── 45. Patch handoff rule ────────────────────────────────────────────
  console.log('\n45. Patch handoff rule')
  const hfrId        = hfrCreated.id as string
  const hfrPatchRes  = await patch(`/automation/handoff-rules/${hfrId}`, { isActive: false }, accessToken)
  const hfrPatched   = await hfrPatchRes.json() as Record<string, unknown>
  check('PATCH handoff-rules → 200',   hfrPatchRes.status === 200)
  check('isActive updated to false',    hfrPatched.isActive === false)
  check('invalid condition PATCH → 400', (await patch(`/automation/handoff-rules/${hfrId}`, { condition: 'BAD' }, accessToken)).status === 400)
  check('404 nonexistent handoff rule',  (await patch('/automation/handoff-rules/nonexistent', { isActive: true }, accessToken)).status === 404)

  // ── 46. Automation auth checks ────────────────────────────────────────
  console.log('\n46. Automation auth checks')
  check('/automation/follow-up-rules without token → 401', (await get('/automation/follow-up-rules')).status === 401)
  check('/automation/handoff-rules without token → 401',   (await get('/automation/handoff-rules')).status === 401)

  // ════════════════════════════════════════════════════════════════════════
  // Worker Queue (Phase 4B) — BullMQ + Redis
  // ════════════════════════════════════════════════════════════════════════

  console.log('\n47. Worker queue (BullMQ + Redis)')
  const redisOk = await checkRedis()
  check('Redis available on 43114', redisOk)

  if (redisOk && convId) {
    // Create a fresh test conversation + message via Prisma for queue test
    const queueTestSetup = await prismaSetupConversation(channelId, createdId)
    const qConvId = queueTestSetup.convId

    // Enqueue a PROCESS_INBOUND_MESSAGE job directly via BullMQ
    const enqueued = await enqueueBullmqJob({
      tenantId:       'demo-tenant-001',
      channelId,
      conversationId: qConvId,
      customerId:     createdId,
      messageId:      'smoke-msg-placeholder',
      createdAt:      new Date().toISOString(),
    })
    check('Job enqueued successfully', enqueued)

    if (enqueued) {
      // Verify queue has 1 pending job
      const queueDepth = await getBullmqQueueDepth()
      check('Queue depth >= 1 after enqueue', queueDepth >= 1)

      // Run worker:once to drain the queue
      const workerOk = await runWorkerOnce()
      check('worker:once exited cleanly', workerOk)

      // Verify AI stub reply was written to DB
      await new Promise((r) => setTimeout(r, 500)) // brief settle
      const aiReply = await prismaGetAiStubReply(qConvId)
      check('AI stub reply written to DB',           aiReply !== null)
      check('AI reply senderType is AI',             aiReply?.senderType === 'AI')
      check('AI reply direction is OUTBOUND',        aiReply?.direction === 'OUTBOUND')
      check('AI reply content contains [AI_STUB]',   String(aiReply?.content ?? '').includes('[AI_STUB]'))

      // Verify queue is now empty
      const finalDepth = await getBullmqQueueDepth()
      check('Queue drained to 0 after worker:once', finalDepth === 0)

      // Cleanup queue test conversation
      await prismaCleanupConversation(qConvId)
    }
  } else {
    console.log('  ⚠️  Queue tests skipped (Redis unavailable or no convId)')
  }

  // ── 48. Conversation auth checks ──────────────────────────────────────
  console.log('\n48. Conversation auth checks')
  check('/conversations without token → 401', (await get('/conversations')).status === 401)
  check('/conversations/:id without token → 401', (await get(`/conversations/${convId}`)).status === 401)
  check('/messages without token → 400 or 401', [400, 401].includes((await get(`/messages?conversationId=${convId}`)).status))

  // ── 48. Logout ────────────────────────────────────────────────────────
  console.log('\n48. Logout')
  check('POST /auth/logout → 200', (await post('/auth/logout', {}, accessToken)).status === 200)

  // ── Cleanup ───────────────────────────────────────────────────────────
  console.log('\nCleaning up smoke test records...')
  if (convId)    await prismaCleanupConversation(convId)
  if (createdId) await prismaDeleteCustomer(createdId)
  if (kbIds.length  > 0) await prismaDeleteKnowledge(kbIds)
  if (furIds.length > 0 || hfrIds.length > 0) await prismaDeleteAutomation(furIds, hfrIds)
  console.log('  🗑️  smoke test records cleaned')

  // ── Result ────────────────────────────────────────────────────────────
  console.log(`\n[smoke] Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) { console.error('[smoke] ❌ SMOKE TEST FAILED'); process.exit(1) }
  else             { console.log('[smoke] ✅ ALL SMOKE TESTS PASSED') }
}

// ── DB helpers ─────────────────────────────────────────────────────────────

async function prismaSetupConversation(channelId: string, customerId: string): Promise<{ convId: string }> {
  const { PrismaClient } = await import('@omni/db')
  const p   = new PrismaClient()
  const conv = await p.conversation.create({
    data: {
      tenantId:      'demo-tenant-001',
      channelId,
      customerId,
      status:        'AI_HANDLING',
      lastMessageAt: new Date(),
    },
  })
  // Initial inbound message from customer
  await p.message.create({
    data: {
      conversationId: conv.id,
      direction:      'INBOUND',
      senderType:     'CUSTOMER',
      content:        'Hello, I am interested in your product',
    },
  })
  await p.$disconnect()
  return { convId: conv.id }
}

async function prismaCleanupConversation(convId: string): Promise<void> {
  try {
    const { PrismaClient } = await import('@omni/db')
    const p = new PrismaClient()
    await p.message.deleteMany({ where: { conversationId: convId } })
    await p.conversation.delete({ where: { id: convId } })
    await p.$disconnect()
    console.log(`  🗑️  conversation ${convId} deleted`)
  } catch (e) { console.warn('  ⚠️  conversation cleanup warning:', e) }
}

async function prismaDeleteCustomer(customerId: string): Promise<void> {
  try {
    const { PrismaClient } = await import('@omni/db')
    const p = new PrismaClient()
    await p.customerTag.deleteMany({ where: { customerId } })
    await p.customer.delete({ where: { id: customerId } })
    await p.$disconnect()
    console.log(`  🗑️  customer ${customerId} deleted`)
  } catch (e) { console.warn('  ⚠️  customer cleanup warning:', e) }
}

async function prismaDeleteKnowledge(ids: string[]): Promise<void> {
  try {
    const { PrismaClient } = await import('@omni/db')
    const p = new PrismaClient()
    await p.knowledgeItem.deleteMany({ where: { id: { in: ids } } })
    await p.$disconnect()
    console.log(`  🗑️  ${ids.length} knowledge items deleted`)
  } catch (e) { console.warn('  ⚠️  knowledge cleanup warning:', e) }
}

// ── Queue helpers ──────────────────────────────────────────────────────────

async function checkRedis(): Promise<boolean> {
  const net = await import('net')
  return new Promise((resolve) => {
    const s = net.createConnection(43114, 'localhost')
    s.setTimeout(2000)
    s.on('connect', () => { s.destroy(); resolve(true) })
    s.on('error',   () => resolve(false))
    s.on('timeout', () => { s.destroy(); resolve(false) })
  })
}

async function enqueueBullmqJob(data: Record<string, string>): Promise<boolean> {
  try {
    const { Queue } = await import('bullmq')
    const { default: IORedis } = await import('ioredis')
    const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:43114', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
    const queue = new Queue('omni-inbound-messages', { connection: redis })
    await queue.add('PROCESS_INBOUND_MESSAGE', data, { attempts: 1 })
    await queue.close()
    await redis.quit()
    return true
  } catch (e) {
    console.warn('  ⚠️  enqueueBullmqJob error:', e)
    return false
  }
}

async function getBullmqQueueDepth(): Promise<number> {
  try {
    const { Queue } = await import('bullmq')
    const { default: IORedis } = await import('ioredis')
    const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:43114', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
    const queue = new Queue('omni-inbound-messages', { connection: redis })
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed')
    const depth = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0)
    await queue.close()
    await redis.quit()
    return depth
  } catch { return -1 }
}

async function runWorkerOnce(): Promise<boolean> {
  try {
    const { spawnSync } = await import('child_process')
    const projectRoot = path.resolve(__dirname, '../../../')
    // Use pnpm worker:once — resolves tsx + paths automatically
    const result = spawnSync('pnpm', ['worker:once'], {
      cwd:     projectRoot,
      env:     { ...process.env },
      timeout: 35_000,
      stdio:   'pipe',
      shell:   true,
    })
    const out = result.stdout?.toString().trim()
    const err = result.stderr?.toString().trim()
    if (out) console.log(out)
    if (err && result.status !== 0) console.error(err)
    return result.status === 0
  } catch (e) {
    console.warn('  ⚠️  runWorkerOnce error:', e)
    return false
  }
}

async function prismaGetAiStubReply(
  conversationId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { PrismaClient } = await import('@omni/db')
    const p = new PrismaClient()
    const msg = await p.message.findFirst({
      where: { conversationId, senderType: 'AI', direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' },
    })
    await p.$disconnect()
    return msg as Record<string, unknown> | null
  } catch { return null }
}

async function prismaDeleteAutomation(furIds: string[], hfrIds: string[]): Promise<void> {
  try {
    const { PrismaClient } = await import('@omni/db')
    const p = new PrismaClient()
    if (furIds.length > 0) await p.followUpRule.deleteMany({ where: { id: { in: furIds } } })
    if (hfrIds.length > 0) await p.handoffRule.deleteMany({ where: { id: { in: hfrIds } } })
    await p.$disconnect()
    console.log(`  🗑️  ${furIds.length} follow-up + ${hfrIds.length} handoff rules deleted`)
  } catch (e) { console.warn('  ⚠️  automation cleanup warning:', e) }
}

smoke().catch((e) => { console.error('[smoke] Fatal:', e); process.exit(1) })
