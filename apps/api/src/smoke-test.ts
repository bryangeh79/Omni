// API smoke test — auth + CRM Customer CRUD.
// Prerequisites: API running on port 43111, demo seed applied (pnpm db:seed).
// Run: pnpm smoke   (from apps/api, with API already started)

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const BASE = `http://localhost:${process.env.PORT_API ?? 43111}`

// Demo credentials — DEV ONLY. Defined in docs/AUTH.md and docs/SAAS_TENANCY.md.
const DEMO_SLUG     = 'omni-demo'
const DEMO_EMAIL    = 'admin@omni-demo.test'
const DEMO_PASSWORD = process.env.OMNI_SMOKE_PASSWORD ?? 'OmniDemo2024!'

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) { console.log(`  ✅ ${label}`); passed++ }
  else     { console.error(`  ❌ ${label}${detail ? ': ' + detail : ''}`); failed++ }
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
  return fetch(`${BASE}${url}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

// ── Smoke test ─────────────────────────────────────────────────────────────

async function smoke() {
  console.log(`[smoke] API smoke test — ${BASE}\n`)
  let accessToken  = ''
  let refreshToken = ''
  let createdId    = ''

  // ── 1. Health ──────────────────────────────────────────────────────────
  console.log('1. Health check')
  check('GET /health → 200', (await get('/health')).status === 200)

  // ── 2. Login validation ────────────────────────────────────────────────
  console.log('\n2. Login validation')
  check('missing tenantSlug → 400', (await post('/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD })).status === 400)
  check('missing email → 400',      (await post('/auth/login', { tenantSlug: DEMO_SLUG, password: DEMO_PASSWORD })).status === 400)
  check('missing password → 400',   (await post('/auth/login', { tenantSlug: DEMO_SLUG, email: DEMO_EMAIL })).status === 400)
  check('empty body → 400',         (await post('/auth/login', {})).status === 400)

  // ── 3. Wrong tenant / password ─────────────────────────────────────────
  console.log('\n3. Wrong credentials rejection')
  const wrongSlugRes  = await post('/auth/login', { tenantSlug: 'nonexistent-xyz', email: DEMO_EMAIL, password: DEMO_PASSWORD })
  const wrongSlugBody = await wrongSlugRes.json() as Record<string, unknown>
  check('wrong tenantSlug → 401', wrongSlugRes.status === 401)
  check('wrong slug → generic error (no tenant detail)', wrongSlugBody.error === 'Invalid credentials')
  check('wrong password → 401',   (await post('/auth/login', { tenantSlug: DEMO_SLUG, email: DEMO_EMAIL, password: 'bad' })).status === 401)

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

  // ════════════════════════════════════════════════════════════════════════
  // CRM Customer CRUD
  // ════════════════════════════════════════════════════════════════════════

  const SMOKE_PHONE = '+60-SMOKE-TEST-001'

  // ── 8. Create customer ─────────────────────────────────────────────────
  console.log('\n8. Create customer')
  const createRes  = await post('/customers', {
    phone:              SMOKE_PHONE,
    name:               'Smoke Test Customer',
    company:            'Smoke Corp',
    languagePreference: 'zh',
    stage:              'NEW',
    score:              30,
    urgency:            2,
    notes:              'created by smoke test',
  }, accessToken)
  check('POST /customers → 201', createRes.status === 201)
  const created = await createRes.json() as Record<string, unknown>
  check('create returns id',       typeof created.id === 'string')
  check('create returns phone',    created.phone === SMOKE_PHONE)
  check('create returns tenantId', typeof created.tenantId === 'string')
  check('create returns tags []',  Array.isArray(created.tags) && (created.tags as unknown[]).length === 0)
  check('create score is 30',      created.score === 30)
  createdId = created.id as string

  // ── 9. Duplicate phone → 409 ───────────────────────────────────────────
  console.log('\n9. Duplicate phone rejection')
  const dupRes = await post('/customers', { phone: SMOKE_PHONE }, accessToken)
  check('duplicate phone → 409', dupRes.status === 409)
  const dupBody = await dupRes.json() as Record<string, unknown>
  check('409 returns customerId of existing', dupBody.customerId === createdId)

  // ── 10. Create validation errors ───────────────────────────────────────
  console.log('\n10. Create validation')
  check('missing phone → 400',      (await post('/customers', {}, accessToken)).status === 400)
  check('invalid stage → 400',      (await post('/customers', { phone: '+60-smoke-v2', stage: 'INVALID' }, accessToken)).status === 400)
  check('score out of range → 400', (await post('/customers', { phone: '+60-smoke-v3', score: 150 }, accessToken)).status === 400)
  check('urgency out of range → 400', (await post('/customers', { phone: '+60-smoke-v4', urgency: 9 }, accessToken)).status === 400)

  // ── 11. List customers (pagination) ───────────────────────────────────
  console.log('\n11. List customers (pagination)')
  const listRes  = await get('/customers?page=1&pageSize=10', accessToken)
  const listBody = await listRes.json() as Record<string, unknown>
  check('GET /customers → 200', listRes.status === 200)
  check('list has data array',     Array.isArray(listBody.data))
  check('list has pagination',     typeof listBody.pagination === 'object')
  const pag = listBody.pagination as Record<string, unknown>
  check('pagination.page is 1',    pag.page === 1)
  check('pagination.pageSize ≤ 10', Number(pag.pageSize) <= 10)
  check('pagination.total >= 1',   Number(pag.total) >= 1)

  // ── 12. Filter by stage ────────────────────────────────────────────────
  console.log('\n12. Filter by stage')
  const stageListRes  = await get('/customers?stage=NEW', accessToken)
  const stageListBody = await stageListRes.json() as Record<string, unknown>
  check('filter stage=NEW → 200', stageListRes.status === 200)
  const stageData = stageListBody.data as Record<string, unknown>[]
  check('all results have stage NEW', stageData.every((c) => c.stage === 'NEW'))

  // ── 13. Filter by score range ──────────────────────────────────────────
  console.log('\n13. Filter by score range')
  const scoreRes  = await get('/customers?minScore=25&maxScore=50', accessToken)
  const scoreBody = await scoreRes.json() as Record<string, unknown>
  check('filter minScore=25&maxScore=50 → 200', scoreRes.status === 200)
  const scoreData = scoreBody.data as Record<string, unknown>[]
  check('all results in score range', scoreData.every((c) => Number(c.score) >= 25 && Number(c.score) <= 50))

  // ── 14. Filter by language ────────────────────────────────────────────
  console.log('\n14. Filter by language')
  const langRes = await get('/customers?language=zh', accessToken)
  check('filter language=zh → 200', langRes.status === 200)

  // ── 15. Get customer by ID ────────────────────────────────────────────
  console.log('\n15. Get customer by ID')
  const detailRes  = await get(`/customers/${createdId}`, accessToken)
  const detail     = await detailRes.json() as Record<string, unknown>
  check('GET /customers/:id → 200', detailRes.status === 200)
  check('detail id matches',        detail.id === createdId)
  check('detail has tags array',    Array.isArray(detail.tags))
  check('detail has conversationCount', typeof detail.conversationCount === 'number')

  // ── 16. Get non-existent → 404 ────────────────────────────────────────
  console.log('\n16. Non-existent customer → 404')
  check('GET /customers/nonexistent-id → 404', (await get('/customers/nonexistent-id', accessToken)).status === 404)

  // ── 17. Update customer ───────────────────────────────────────────────
  console.log('\n17. Update customer')
  const patchRes  = await patch(`/customers/${createdId}`, {
    stage:  'INTERESTED',
    score:  55,
    notes:  'updated by smoke test',
    urgency: 3,
  }, accessToken)
  const patched = await patchRes.json() as Record<string, unknown>
  check('PATCH /customers/:id → 200', patchRes.status === 200)
  check('stage updated to INTERESTED', patched.stage === 'INTERESTED')
  check('score updated to 55',         patched.score === 55)
  check('notes updated',               patched.notes === 'updated by smoke test')

  // ── 18. Update validation ─────────────────────────────────────────────
  console.log('\n18. Update validation')
  check('invalid stage PATCH → 400', (await patch(`/customers/${createdId}`, { stage: 'NOPE' }, accessToken)).status === 400)
  check('score 200 PATCH → 400',     (await patch(`/customers/${createdId}`, { score: 200 }, accessToken)).status === 400)

  // ── 19. Add tags ──────────────────────────────────────────────────────
  console.log('\n19. Add tags')
  const tag1Res  = await post(`/customers/${createdId}/tags`, { tag: 'high_intent' }, accessToken)
  const tag1Body = await tag1Res.json() as Record<string, unknown>
  check('POST tags → 201',           tag1Res.status === 201)
  check('tag high_intent added',     (tag1Body.tags as string[])?.includes('high_intent'))

  await post(`/customers/${createdId}/tags`, { tag: 'price_inquiry' }, accessToken)

  // Idempotent — adding same tag again must not error
  const idempRes = await post(`/customers/${createdId}/tags`, { tag: 'high_intent' }, accessToken)
  check('duplicate tag add → 201 (idempotent)', idempRes.status === 201)

  // ── 20. Filter by tag ─────────────────────────────────────────────────
  console.log('\n20. Filter by tag')
  const tagFilterRes  = await get('/customers?tag=high_intent', accessToken)
  const tagFilterBody = await tagFilterRes.json() as Record<string, unknown>
  check('filter tag=high_intent → 200', tagFilterRes.status === 200)
  const tagData = tagFilterBody.data as Record<string, unknown>[]
  check('filtered results include created customer', tagData.some((c) => c.id === createdId))

  // ── 21. Delete tag ────────────────────────────────────────────────────
  console.log('\n21. Delete tag')
  const delTagRes  = await del(`/customers/${createdId}/tags/price_inquiry`, accessToken)
  const delTagBody = await delTagRes.json() as Record<string, unknown>
  check('DELETE tag → 200',                   delTagRes.status === 200)
  check('price_inquiry removed',              !(delTagBody.tags as string[])?.includes('price_inquiry'))
  check('high_intent still present',          (delTagBody.tags as string[])?.includes('high_intent'))

  // ── 22. Tag validation ────────────────────────────────────────────────
  console.log('\n22. Tag validation')
  check('empty tag → 400', (await post(`/customers/${createdId}/tags`, { tag: '' }, accessToken)).status === 400)

  // ── 23. WA Web connect (stub mode) ───────────────────────────────────
  console.log('\n23. WA Web connect (stub mode)')
  const waRes  = await post('/channels/whatsapp-web/connect', { displayName: 'Smoke Channel' }, accessToken)
  const waBody = await waRes.json() as Record<string, unknown>
  check('WA connect → 201',     waRes.status === 201)
  check('WA returns channelId', typeof waBody.channelId === 'string')
  check('WA is stubMode',       waBody.stubMode === true)

  // ── 24. Logout ────────────────────────────────────────────────────────
  console.log('\n24. Logout')
  check('POST /auth/logout → 200', (await post('/auth/logout', {}, accessToken)).status === 200)

  // ── Cleanup ───────────────────────────────────────────────────────────
  if (createdId) {
    console.log('\nCleaning up smoke test customer...')
    // Delete tags first, then customer
    await prismaDelete(createdId)
    console.log('  🗑️  smoke test customer cleaned')
  }

  // ── Result ────────────────────────────────────────────────────────────
  console.log(`\n[smoke] Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) { console.error('[smoke] ❌ SMOKE TEST FAILED'); process.exit(1) }
  else             { console.log('[smoke] ✅ ALL SMOKE TESTS PASSED') }
}

// Direct DB cleanup via Prisma (not API, since we may have logged out)
async function prismaDelete(customerId: string): Promise<void> {
  try {
    const { PrismaClient } = await import('@omni/db')
    const p = new PrismaClient()
    await p.customerTag.deleteMany({ where: { customerId } })
    await p.customer.delete({ where: { id: customerId } })
    await p.$disconnect()
  } catch (e) {
    console.warn('  ⚠️  cleanup warning:', e)
  }
}

smoke().catch((e) => { console.error('[smoke] Fatal:', e); process.exit(1) })
