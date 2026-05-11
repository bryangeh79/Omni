// API auth smoke test.
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
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

async function get(url: string, token?: string): Promise<Response> {
  return fetch(`${BASE}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

async function smoke() {
  console.log(`[smoke] API auth smoke test — ${BASE}\n`)

  // ── 1. Health ────────────────────────────────────────────────────────────
  console.log('1. Health check')
  const health = await get('/health')
  check('GET /health → 200', health.status === 200)

  // ── 2. Login — missing fields → 400 ──────────────────────────────────────
  console.log('\n2. Login validation')
  const noSlugRes = await post('/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD })
  check('missing tenantSlug → 400', noSlugRes.status === 400)

  const noEmailRes = await post('/auth/login', { tenantSlug: DEMO_SLUG, password: DEMO_PASSWORD })
  check('missing email → 400', noEmailRes.status === 400)

  const noPassRes = await post('/auth/login', { tenantSlug: DEMO_SLUG, email: DEMO_EMAIL })
  check('missing password → 400', noPassRes.status === 400)

  const emptyRes = await post('/auth/login', {})
  check('empty body → 400', emptyRes.status === 400)

  // ── 3. Login — wrong tenantSlug → 401 (generic, no enumeration) ─────────
  console.log('\n3. Wrong tenant rejection')
  const wrongSlugRes = await post('/auth/login', {
    tenantSlug: 'nonexistent-tenant-xyz',
    email:      DEMO_EMAIL,
    password:   DEMO_PASSWORD,
  })
  check('wrong tenantSlug → 401', wrongSlugRes.status === 401)
  const wrongSlugBody = await wrongSlugRes.json() as Record<string, unknown>
  check('wrong tenantSlug error is generic (no tenant detail)', wrongSlugBody.error === 'Invalid credentials')

  // ── 4. Login — wrong password → 401 ──────────────────────────────────────
  console.log('\n4. Wrong password rejection')
  const wrongPassRes = await post('/auth/login', {
    tenantSlug: DEMO_SLUG,
    email:      DEMO_EMAIL,
    password:   'wrong-password-123',
  })
  check('wrong password → 401', wrongPassRes.status === 401)

  // ── 5. Valid login ────────────────────────────────────────────────────────
  console.log('\n5. Valid login')
  const loginRes = await post('/auth/login', {
    tenantSlug: DEMO_SLUG,
    email:      DEMO_EMAIL,
    password:   DEMO_PASSWORD,
  })
  check('POST /auth/login → 200', loginRes.status === 200)

  const loginBody = await loginRes.json() as Record<string, unknown>
  const hasTokens = typeof loginBody.accessToken === 'string' && typeof loginBody.refreshToken === 'string'
  check('response contains accessToken + refreshToken', hasTokens)
  const userObj = loginBody.user as Record<string, unknown> | undefined
  check('response contains user.tenantId',   typeof userObj?.tenantId   === 'string')
  check('response contains user.tenantSlug', typeof userObj?.tenantSlug === 'string')
  check('tenantSlug matches requested slug', userObj?.tenantSlug === DEMO_SLUG)

  if (!hasTokens) {
    console.error('[smoke] Cannot continue without tokens')
    process.exit(1)
  }

  const accessToken  = loginBody.accessToken  as string
  const refreshToken = loginBody.refreshToken as string
  // Tokens never printed to console

  // ── 6. /auth/me ──────────────────────────────────────────────────────────
  console.log('\n6. GET /auth/me')
  const meRes = await get('/auth/me', accessToken)
  check('GET /auth/me with token → 200', meRes.status === 200)
  const meBody = await meRes.json() as Record<string, unknown>
  check('/auth/me returns email', meBody.email === DEMO_EMAIL)
  check('/auth/me returns tenantId', typeof meBody.tenantId === 'string')
  check('/auth/me does NOT return password', !meBody.passwordHash && !meBody.password)

  // ── 7. Protected route with token ─────────────────────────────────────────
  console.log('\n7. Protected route — with token')
  const custRes = await get('/customers', accessToken)
  check('GET /customers with token → 200', custRes.status === 200)

  // ── 8. Protected route without token → 401 ────────────────────────────────
  console.log('\n8. Protected route — without token')
  const noAuthRes = await get('/customers')
  check('GET /customers without token → 401', noAuthRes.status === 401)

  // ── 9. Invalid token → 401 ───────────────────────────────────────────────
  console.log('\n9. Invalid token rejection')
  const badAuthRes = await get('/customers', 'not-a-real-token')
  check('GET /customers with bad token → 401', badAuthRes.status === 401)

  // ── 10. Refresh token flow ─────────────────────────────────────────────────
  console.log('\n10. Token refresh')
  const refreshRes = await post('/auth/refresh', { refreshToken })
  check('POST /auth/refresh → 200', refreshRes.status === 200)
  const refreshBody = await refreshRes.json() as Record<string, unknown>
  check('refresh returns new accessToken', typeof refreshBody.accessToken === 'string')

  const meRes2 = await get('/auth/me', refreshBody.accessToken as string)
  check('new access token valid for /auth/me', meRes2.status === 200)

  // ── 11. WA Web connect (stub mode, auth required) ─────────────────────────
  console.log('\n11. WA Web connect (stub mode, auth required)')
  const waRes = await post('/channels/whatsapp-web/connect', { displayName: 'Smoke Test Channel' }, accessToken)
  check('POST /channels/whatsapp-web/connect with token → 201', waRes.status === 201)
  const waBody = await waRes.json() as Record<string, unknown>
  check('WA connect returns channelId', typeof waBody.channelId === 'string')
  check('WA connect is in stubMode',    waBody.stubMode === true)
  // QR content never logged

  // ── 12. Logout ───────────────────────────────────────────────────────────
  console.log('\n12. Logout')
  const logoutRes = await post('/auth/logout', {}, accessToken)
  check('POST /auth/logout with token → 200', logoutRes.status === 200)

  // ── Result ───────────────────────────────────────────────────────────────
  console.log(`\n[smoke] Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) { console.error('[smoke] ❌ SMOKE TEST FAILED'); process.exit(1) }
  else             { console.log('[smoke] ✅ ALL SMOKE TESTS PASSED') }
}

smoke().catch((e) => { console.error('[smoke] Fatal:', e); process.exit(1) })
