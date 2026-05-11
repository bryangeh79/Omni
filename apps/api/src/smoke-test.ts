// API auth smoke test.
// Prerequisites: API running on port 43111, demo seed applied (pnpm db:seed).
// Run: pnpm smoke   (from apps/api, with API already started)

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const BASE = `http://localhost:${process.env.PORT_API ?? 43111}`

// Demo credentials — DEV ONLY. These are for automated testing of the dev seed.
const DEMO_EMAIL    = 'admin@omni-demo.test'
// Password kept in env or AUTH.md — not repeated here for safety
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

  // ── 2. Login ─────────────────────────────────────────────────────────────
  console.log('\n2. Login')
  const loginRes = await post('/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD })
  check('POST /auth/login → 200', loginRes.status === 200)

  const loginBody = await loginRes.json() as Record<string, unknown>
  const hasTokens = typeof loginBody.accessToken === 'string' && typeof loginBody.refreshToken === 'string'
  check('response contains accessToken + refreshToken', hasTokens)
  check('response contains user.tenantId', !!(loginBody.user as Record<string, unknown>)?.tenantId)

  if (!hasTokens) {
    console.error('[smoke] Cannot continue without tokens')
    process.exit(1)
  }

  const accessToken  = loginBody.accessToken  as string
  const refreshToken = loginBody.refreshToken as string
  // Tokens never printed to console

  // ── 3. /auth/me ──────────────────────────────────────────────────────────
  console.log('\n3. GET /auth/me')
  const meRes = await get('/auth/me', accessToken)
  check('GET /auth/me with token → 200', meRes.status === 200)
  const meBody = await meRes.json() as Record<string, unknown>
  check('/auth/me returns email', meBody.email === DEMO_EMAIL)
  check('/auth/me returns tenantId', typeof meBody.tenantId === 'string')
  check('/auth/me does NOT return password', !meBody.passwordHash && !meBody.password)

  // ── 4. Protected route with token ─────────────────────────────────────────
  console.log('\n4. Protected route — with token')
  const custRes = await get('/customers', accessToken)
  check('GET /customers with token → 200', custRes.status === 200)

  // ── 5. Protected route without token → 401 ────────────────────────────────
  console.log('\n5. Protected route — without token')
  const noAuthRes = await get('/customers')
  check('GET /customers without token → 401', noAuthRes.status === 401)

  // ── 6. Invalid token → 401 ───────────────────────────────────────────────
  console.log('\n6. Invalid token rejection')
  const badAuthRes = await get('/customers', 'not-a-real-token')
  check('GET /customers with bad token → 401', badAuthRes.status === 401)

  // ── 7. Refresh token flow ─────────────────────────────────────────────────
  console.log('\n7. Token refresh')
  const refreshRes = await post('/auth/refresh', { refreshToken })
  check('POST /auth/refresh → 200', refreshRes.status === 200)
  const refreshBody = await refreshRes.json() as Record<string, unknown>
  check('refresh returns new accessToken', typeof refreshBody.accessToken === 'string')

  // Verify new token works
  const meRes2 = await get('/auth/me', refreshBody.accessToken as string)
  check('new access token valid for /auth/me', meRes2.status === 200)

  // ── 8. Wrong credential rejection ────────────────────────────────────────
  console.log('\n8. Wrong credentials rejection')
  const badLogin = await post('/auth/login', { email: DEMO_EMAIL, password: 'wrong-password' })
  check('wrong password → 401', badLogin.status === 401)

  // ── 9. WA Web connect (stub mode, auth required) ─────────────────────────
  console.log('\n9. WA Web connect (stub mode)')
  const waRes = await post('/channels/whatsapp-web/connect', { displayName: 'Smoke Test Channel' }, accessToken)
  check('POST /channels/whatsapp-web/connect with token → 201', waRes.status === 201)
  const waBody = await waRes.json() as Record<string, unknown>
  check('WA connect returns channelId', typeof waBody.channelId === 'string')
  check('WA connect is in stubMode',    waBody.stubMode === true)
  // QR content never logged

  // ── 10. Logout ───────────────────────────────────────────────────────────
  console.log('\n10. Logout')
  const logoutRes = await post('/auth/logout', {}, accessToken)
  check('POST /auth/logout with token → 200', logoutRes.status === 200)

  // ── Result ───────────────────────────────────────────────────────────────
  console.log(`\n[smoke] Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) { console.error('[smoke] ❌ SMOKE TEST FAILED'); process.exit(1) }
  else             { console.log('[smoke] ✅ ALL SMOKE TESTS PASSED') }
}

smoke().catch((e) => { console.error('[smoke] Fatal:', e); process.exit(1) })
