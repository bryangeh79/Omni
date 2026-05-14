# Tenant Onboarding Self-Service — Phase 17A

## Overview

Phase 17A adds self-service tenant creation to Omni, allowing operators and new customers to create their own Omni account through a guided, safe signup flow.

**Safety contract:**
- No real email is sent by default
- No real WhatsApp/Meta/AI/payment calls are made
- Real send remains disabled until the operator completes the activation guide
- Not for broadcast, ads, or bulk messaging — 1:1 AI customer service only
- Password hash is NEVER returned in any response

---

## API Endpoints

### POST /tenants/signup (Public — no auth required)

Creates a new tenant, owner user, and starter data in one atomic flow.

**Request body:**
```json
{
  "businessName":      "Sunrise Property",
  "slug":              "sunrise-property",
  "ownerName":         "Ahmad Zulkifli",
  "ownerEmail":        "ahmad@sunrise.com",
  "password":          "SecurePass123",
  "industry":          "real-estate",
  "channelPreference": "WA_WEB",
  "primaryGoal":       "sales"
}
```

**Validation:**
- `businessName`: required, min 2 chars
- `slug`: required (auto-derived from businessName if omitted), min 3 chars, alphanumeric+dashes, max 40 chars, must be globally unique
- `ownerName`: required, min 2 chars
- `ownerEmail`: required, valid email format
- `password`: required, min 8 chars
- `channelPreference`: WA_WEB (default) or META_WA_BUSINESS
- `primaryGoal`: sales, appointment, support, qualification, demo, other

**Response (HTTP 201):**
```json
{
  "tenantId": "...",
  "slug": "sunrise-property",
  "businessName": "Sunrise Property",
  "ownerUserId": "...",
  "ownerEmail": "ahmad@sunrise.com",
  "accessToken": "...",
  "refreshToken": "...",
  "emailVerificationRequired": false,
  "emailVerificationMode": "STUB",
  "emailSent": false,
  "nextRoute": "/onboarding",
  "onboardingDraftCreated": true,
  "channelDraftCreated": true,
  "starterKbCreated": true,
  "safety": {
    "realSendEnabled": false,
    "broadcastEnabled": false,
    "realMetaSendEnabled": false,
    "waSessionEnabled": false
  },
  "note": "No real email sent. Real WhatsApp sending disabled until activation guide checks complete."
}
```

**Error responses:**
- 400: Validation error (missing/invalid fields)
- 409: Slug already taken (includes `suggestion` field with an alternative slug)

**What is created:**
1. **Tenant** — with trial plan, zh default language, isActive=true
2. **User (OWNER)** — email as login, bcrypt-hashed password, OWNER role
3. **OnboardingDraft** — company name, industry, and goal pre-filled
4. **ChannelSetupDraft** — channel preference saved, no credentials, realSend=false
5. **KnowledgeItem** — industry-specific starter FAQ (1 item, zh language)
6. **AiConfig** — DRY_RUN provider stub (no real AI provider)
7. **FollowUpRules** — 5 default rules (PRICE_ASKED_NO_REPLY, BOOKING_NOT_CONFIRMED, etc.)
8. **HandoffRules** — 6 default rules (USER_REQUESTS_HUMAN, SCORE_GTE_80, etc.)

Access + refresh tokens are issued for seamless auto-login. The web page stores the token and redirects to /onboarding.

### POST /tenants/signup/verify-email-dry-run (Public — no auth required)

Email verification placeholder. **No real email is sent.**

**Request body:**
```json
{ "tenantId": "...", "email": "ahmad@sunrise.com" }
```

**Response (HTTP 200):**
```json
{
  "tenantId": "...",
  "email": "ahmad@sunrise.com",
  "dryRun": true,
  "emailSent": false,
  "verificationMode": "STUB",
  "note": "Email verification is not configured in this phase. No real email was sent."
}
```

---

## Web Page: /signup

Polished enterprise SaaS style signup form with:
- Business name + auto-derived slug (editable)
- Owner name + email
- Password (with show/hide toggle)
- Industry dropdown (9 options)
- WhatsApp channel preference radio (WA Web vs Meta Business API)
- Primary goal dropdown (6 options)
- Safety notice: "Real WhatsApp sending is disabled by default"
- After success: stores access token, redirects to /onboarding

---

## Post-signup Flow

1. User completes signup form → `POST /tenants/signup`
2. Access token stored in localStorage (same as login)
3. Web page redirects to `/onboarding` after 1.8s
4. User completes onboarding wizard (company profile, materials, AI persona preview)
5. User sets up channel at `/channels/setup`
6. When ready for live: follow `/activation-guide` for pre-flight checks and activation

---

## Slug Normalization

Slugs are auto-derived from business name:
1. Lowercase
2. Trim whitespace
3. Replace spaces with dashes
4. Remove non-alphanumeric/dash characters
5. Collapse multiple dashes
6. Trim leading/trailing dashes
7. Max 40 characters

Example: "Sunrise Property Sdn Bhd" → "sunrise-property-sdn-bhd"

---

## What Never Changes After Signup

- `OMNI_ALLOW_WA_SESSION` — stays `false` until operator explicitly enables
- `OMNI_ENABLE_REAL_META_SEND` — stays `false` until operator explicitly enables
- No real messages sent, no real provider called
- passwordHash is never returned in any API response
- No broadcast, ads, or bulk-messaging modules created

---

## Related Pages

- `/signup` — this signup form
- `/onboarding` — next step after signup
- `/activation-guide` — how to go live safely
- `/activation/monitoring` — activation readiness dashboard
- `/release-checklist` — SaaS v1 release status
- `/channels/setup` — channel configuration


## Phase 17B: Account Management Hub

- `/account` web page: self-service tenant management hub for OWNER/ADMIN
- `GET /account/overview`: safe tenant + user + onboarding + channel + checklist summary
- `PATCH /account/profile`: update businessName + defaultLanguage (OWNER/ADMIN only)
- Audit event `ACCOUNT_PROFILE_UPDATE` logged on successful update

See `docs/TENANT_ACCOUNT_MANAGEMENT.md` for full documentation.
