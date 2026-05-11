# Omni — SaaS Tenancy Rules

## What is a Tenant?

Every company/business that subscribes to Omni is a **tenant**. Each tenant:
- Has a unique `slug` (e.g., `acme-retail`) used for login and routing
- Has its own users, channels, customers, conversations, and knowledge base
- Is completely isolated from all other tenants at the data layer

---

## The SaaS Tenancy Problem

In a single-tenant app, a user's identity is unambiguous: there's only one `alice@acme.com`.

In a SaaS product like Omni, **multiple tenants can have users with the same email**:

```
Tenant: acme-retail   → user: alice@acme.com (OWNER)
Tenant: acme-wholesale → user: alice@acme.com (AGENT)
```

If login only required `{ email, password }`, the backend would return the first match —
authenticating Alice into the **wrong tenant**. This is a security bug.

---

## Rule 1: Login Must Include tenantSlug

```http
POST /auth/login
{
  "tenantSlug": "acme-retail",
  "email":      "alice@acme.com",
  "password":   "..."
}
```

The backend:
1. Finds the tenant by `slug` (not by any client-supplied `tenantId`)
2. Finds the user by `tenantId + email`
3. Verifies the password
4. Issues a JWT that contains the correct `tenantId`

This ensures Alice is always authenticated into exactly the tenant she logged into.

---

## Rule 2: tenantId Comes From the Token — Never From the Client

After login, the `tenantId` is embedded in the JWT access token:
```json
{ "userId": "...", "tenantId": "...", "role": "OWNER", "email": "..." }
```

**Every protected API route reads `req.user.tenantId` from the decoded token.**

The frontend (or any API client) must **never** supply `tenantId` in request bodies or query strings for data operations. A malicious client could otherwise read another tenant's data by crafting a request with a different `tenantId`.

### ✅ Correct flow
```
1. Login with { tenantSlug, email, password }
2. Receive { accessToken, refreshToken }
3. Call API with Authorization: Bearer <accessToken>
4. API decodes token → req.user.tenantId
5. API scopes all DB queries to req.user.tenantId
```

### ❌ Incorrect (blocked)
```
1. Login
2. Receive token
3. Call PATCH /customers/:id with body { tenantId: "other-tenant" }
```
The `tenantId` in the body is ignored. The route always uses `req.user.tenantId`.

---

## Rule 3: All Tenant-Owned Models Include tenantId

Every major model in the database has `tenantId`:

| Model | Tenant-scoped |
|---|---|
| User | ✅ |
| Channel | ✅ |
| Customer | ✅ |
| Conversation | ✅ |
| Message | via Conversation |
| KnowledgeItem | ✅ |
| AiConfig | ✅ |
| FollowUpRule | ✅ |
| HandoffRule | ✅ |
| UsageRecord | ✅ |

All queries must use `scopeToTenant(prisma, tenantId)` or include `WHERE tenantId = ?`.

---

## Rule 4: Webhook / Internal Routes Need Channel Secrets

WhatsApp Web inbound messages arrive via an internal call from the Baileys adapter
(not from the browser). These routes cannot use JWT auth because no browser session exists.

**Current (Phase 2B):** The message router is called directly from the adapter in-process.

**Future (Phase 4+):** If the adapter runs in a separate process, the message webhook endpoint
(`POST /messages/webhook/:channelId`) must be protected by a **channel secret** —
a pre-shared token tied to the channel record, not a user JWT.

---

## Error Handling (Anti-Enumeration)

Login failures **always return the same generic `401 Invalid credentials`** regardless of whether:
- The tenant slug doesn't exist
- The tenant is inactive
- The user doesn't exist in the tenant
- The password is wrong
- The user is inactive

This prevents attackers from enumerating valid tenant slugs or user emails by probing the login API.

The only case that returns a `400` is missing required fields (`tenantSlug`, `email`, `password`).

---

## Dev / Demo Values

> ⚠️ DEV ONLY — NOT FOR PRODUCTION

| Value | What it is |
|---|---|
| `omni-demo` | Demo tenant slug (login + routing) |
| `demo-tenant-001` | Demo tenant ID (internal only, never used in login) |
| `admin@omni-demo.test` | Demo user email |

The demo tenant is created by `pnpm db:seed` and should only exist in development databases.
