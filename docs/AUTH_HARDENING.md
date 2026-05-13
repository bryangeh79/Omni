# Omni Auth Hardening — Phase 10A

## Overview

Phase 10A adds **httpOnly cookie-based authentication** as a secure alternative to the existing Bearer token flow. Both modes are supported simultaneously; existing Bearer-based clients (smoke tests, CLI, SSE) are unchanged.

---

## Auth Modes

### Bearer Token Mode (default, Phase 8A+)

Used by: smoke tests, CLI clients, EventSource SSE (`?token=`).

**Login:**
```
POST /auth/login
Body: { tenantSlug, email, password }
Response: { accessToken, refreshToken, user }
```

**API call:**
```
Authorization: Bearer <accessToken>
```

**Refresh:**
```
POST /auth/refresh
Body: { refreshToken }
Response: { accessToken }
```

### Cookie Mode (Phase 10A, browser PWA/dashboard)

Used by: browser sessions (PWA, Web Dashboard).

**Login:**
```
POST /auth/login?mode=cookie
Body: { tenantSlug, email, password }
Response: { user, cookieMode: true }
Sets: omni_at=<jwt> (httpOnly); omni_rt=<jwt> (httpOnly)
```

**API calls:** No Authorization header needed — browser sends cookies automatically.

**Refresh:**
```
POST /auth/refresh?mode=cookie
(no body — reads omni_rt cookie)
Response: { cookieMode: true }
Sets: new omni_at cookie
```

**Logout:**
```
POST /auth/logout
(clears both cookies regardless of mode)
```

---

## Cookie Properties

| Cookie | Value | Properties |
|--------|-------|------------|
| `omni_at` | JWT access token (15min) | `httpOnly; SameSite=Strict; path=/; Secure (prod)` |
| `omni_rt` | JWT refresh token (7d) | `httpOnly; SameSite=Strict; path=/; Secure (prod)` |

### CSRF Protection

`SameSite=Strict` prevents cross-site request forgery: cookies are never sent in cross-origin requests. No additional CSRF token is needed.

### Secure Flag

`Secure` is set only when `NODE_ENV=production`. Development (HTTP) mode works without HTTPS.

---

## SSE Limitation

The `EventSource` browser API cannot set custom headers. The `/realtime/events` SSE endpoint uses `?token=<jwt>` query parameter regardless of auth mode. In cookie mode, the frontend must extract the access token from the login response to pass to EventSource.

**Workaround (Phase 10A):** After cookie-mode login, store the access token for SSE use only. Keep it in memory (not localStorage) to avoid persistent XSS exposure.

---

## Migration Path (localStorage → Cookies)

| Phase | Storage | Approach |
|-------|---------|----------|
| 8A-9B | localStorage JWT | Default, dev/demo only |
| 10A   | httpOnly cookies  | `?mode=cookie` opt-in |
| 10B+  | httpOnly cookies  | Default for browser; localStorage removed |

**To migrate the PWA/inbox to cookie mode:**
1. Call `loginCookieMode()` from `@/lib/api.ts`
2. Remove `setToken()` / `getToken()` calls
3. Add `credentials: 'include'` to all fetch calls (or update `apiFetch`)
4. For SSE: use access token from login response body (not localStorage)

---

## Endpoint: /auth/cookie-mode-info

Public endpoint documenting the two modes (no credentials required):

```
GET /auth/cookie-mode-info
Response: { modes: { bearer: {...}, cookie: {...} } }
```

---

## Security Properties

| Property | Bearer Mode | Cookie Mode |
|----------|------------|-------------|
| XSS protection | localStorage is vulnerable | httpOnly = JS cannot read |
| CSRF protection | N/A (explicit header) | SameSite=Strict |
| Network sniffing | HTTPS recommended | HTTPS enforced in prod (Secure flag) |
| Logout revocation | Phase 11: Redis blocklist | Immediate via clearCookie |
| Cross-origin API | Works (explicit Authorization) | Requires `credentials: include` |

---

## Development Notes

- `NODE_ENV` defaults to development in dev mode → `Secure` flag is NOT set → works over HTTP
- All auth tests use Bearer mode → no existing smoke tests are affected
- Cookie mode tests added in Phase 10A smoke test (tests 88a-88e)
