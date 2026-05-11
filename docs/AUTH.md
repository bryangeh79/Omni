# Omni — Authentication & Authorization Guide

## Overview

Omni uses **JWT (JSON Web Tokens)** for stateless authentication.

- **Access token**: short-lived (15m), used for API requests
- **Refresh token**: longer-lived (7d), used to obtain new access tokens
- Every access token contains: `userId`, `tenantId`, `role`, `email`
- All tenant-owned routes derive `tenantId` from the token — **never from request body**

---

## Token Payload

```json
{
  "userId":   "cuid...",
  "tenantId": "demo-tenant-001",
  "role":     "OWNER",
  "email":    "admin@omni-demo.test",
  "type":     "access",
  "iat":      1234567890,
  "exp":      1234567890
}
```

---

## Auth Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | No | Login with tenantSlug + email + password |
| POST | `/auth/refresh` | No | Exchange refresh token for new access token |
| POST | `/auth/logout` | Yes | Logout (client should discard tokens) |
| GET | `/auth/me` | Yes | Get current user info |

---

## Why tenantSlug is Required for Login

Omni is a SaaS product. Multiple tenants can register users with the **same email address** (e.g., `admin@company.com`). Without a tenant discriminator, a global email lookup would be ambiguous and could authenticate a user into the wrong tenant.

**Example:** `alice@acme.com` exists under both tenant `acme-retail` and tenant `acme-wholesale`. A login with only `alice@acme.com` would match the first record found — which is undefined behavior.

By requiring `tenantSlug` at login, the authentication is always tenant-scoped and deterministic.

---

## Login

```http
POST /auth/login
Content-Type: application/json

{
  "tenantSlug": "my-company",
  "email":      "user@example.com",
  "password":   "..."
}
```

Response:
```json
{
  "accessToken":  "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id":         "...",
    "email":      "user@example.com",
    "role":     "OWNER",
    "tenantId": "..."
  }
}
```

---

## Using the Token

Pass the access token as a Bearer token in every authenticated request:

```
Authorization: Bearer eyJ...
```

---

## Refresh Token Flow

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJ..."
}
```

Returns `{ accessToken: "eyJ..." }`.

---

## Protected Routes

All tenant-owned routes require a valid access token:

| Prefix | Protection |
|---|---|
| `/channels/*` | requireAuth |
| `/customers/*` | requireAuth |
| `/conversations/*` | requireAuth |
| `/messages/send` | requireAuth |
| `/knowledge/*` | requireAuth |
| `/ai-config/*` | requireAuth |
| `/automation/*` | requireAuth |
| `/dashboard/*` | requireAuth |
| `/usage/*` | requireAuth |
| `/tenants/*` | requireAuth |

**Public routes (no token needed):**
- `GET /health`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /messages/webhook/:channelId` (internal, called by channel adapter)

---

## Tenant Isolation Rule

> **tenantId is always derived from req.user.tenantId — never from request body or query params.**

This prevents a malicious client from accessing another tenant's data by supplying a different `tenantId` in the request.

---

## Dev / Demo Credentials

> ⚠️ **DEV ONLY — NOT FOR PRODUCTION USE**
>
> These credentials exist only in the dev seed (`packages/db/src/seed-dev.ts`).
> Run `pnpm db:seed` to create them.

| Field | Value |
|---|---|
| Tenant Slug | `omni-demo` ← **required in login body** |
| Email | `admin@omni-demo.test` |
| Password | `OmniDemo2024!` |
| Role | `OWNER` |

**These credentials must never be used in any non-development environment.**

---

## Running the Auth Smoke Test

1. Start Docker: `docker compose up -d`
2. Seed database: `pnpm db:seed`
3. Start API: `pnpm dev:api` (in a separate terminal)
4. Run smoke test: `pnpm --filter @omni/api smoke`

---

## Security Notes

1. **JWT_SECRET** must be a random 64+ character string in `.env` — never commit it.
2. Access tokens expire in 15 minutes by default (`JWT_ACCESS_EXPIRES_IN`).
3. Refresh tokens expire in 7 days by default (`JWT_REFRESH_EXPIRES_IN`).
4. Phase 4+: add server-side token revocation (Redis blocklist) for logout.
5. **tenantSlug is required** at login (Phase 3A-2+) — prevents same-email ambiguity in multi-tenant SaaS.
6. Never log tokens, even partially. Never include tokens in error messages.

---

## Phase Roadmap

| Phase | Feature |
|---|---|
| 3A | JWT auth, token payload, protected routes, demo login |
| 3A-2 (current) | SaaS tenant-scoped login (tenantSlug required) |
| 4 | Token revocation, invite flow |
| 5 | SSO / OAuth (optional) |
