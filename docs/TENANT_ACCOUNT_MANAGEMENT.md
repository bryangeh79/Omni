# Tenant Account Management — Phase 17B

## Overview

Phase 17B adds a self-service tenant management hub at `/account` for OWNER and ADMIN users to manage their tenant profile, see onboarding progress, and continue setup after signup.

**Safety contract:**
- All endpoints auth-required and tenant-scoped via JWT
- Profile updates restricted to OWNER and ADMIN roles
- `passwordHash` NEVER returned in any response
- `credentialRef` (encrypted blob) NEVER returned
- No raw tokens, encrypted blobs, or `.env` values exposed
- No real WhatsApp / Meta / AI / email / payment calls
- Real sends remain disabled until activation guide checks complete
- Team/email actions remain local stubs; no real email is sent
- Not a broadcast / ads / bulk-sending platform

---

## API Endpoints

### GET /account/overview (Auth required, all roles)

Returns a safe, comprehensive overview of the tenant, current user, onboarding state, channel state, setup checklist, and safety flags.

**Response shape:**
```json
{
  "tenant": {
    "id": "...", "slug": "...", "name": "...",
    "defaultLanguage": "zh", "plan": "trial",
    "isActive": true, "memberSince": "..."
  },
  "currentUser": {
    "id": "...", "email": "...", "name": "...",
    "role": "OWNER", "isActive": true, "memberSince": "..."
  },
  "onboarding": {
    "status": "DRAFT", "companyName": "...",
    "industry": "retail", "goals": ["sales"],
    "completedSteps": 0, "enabledAt": null
  },
  "channel": {
    "channelType": "META_WA_BUSINESS",
    "displayName": "...", "setupStatus": "DRAFT",
    "credentialStatus": "NONE", "testStatus": "NOT_TESTED",
    "activeChannelCount": 0
  },
  "knowledgeBase": { "activeItems": 1 },
  "activity":      { "totalAuditEvents": 5 },
  "setupChecklist": [
    { "key": "onboarding_complete", "label": "...", "passed": false, "action": "/onboarding" },
    ...
  ],
  "setupProgress": { "completed": 0, "total": 6, "percent": 0 },
  "safety": {
    "realSendEnabled": false,
    "broadcastEnabled": false,
    "realWaSessionEnabled": false,
    "realMetaSendEnabled": false,
    "realSendCurrentlyOff": true
  },
  "links": { ... }
}
```

**Never includes:** `passwordHash`, `credentialRef`, raw tokens, encrypted blobs, app secrets.

### PATCH /account/profile (Auth + OWNER/ADMIN only)

Updates tenant business name, default language, and optionally onboarding `companyName`.

**Request body:**
```json
{
  "businessName": "New Co. Name",
  "defaultLanguage": "en",
  "companyName": "Same as business name (optional)"
}
```

At least one field is required.

**Validation:**
- `businessName`: 2–120 characters
- `defaultLanguage`: must be one of `zh`, `en`, `ms`
- `companyName`: trimmed, no length limit beyond DB default

**Response:**
```json
{
  "saved": true,
  "tenant": {
    "id": "...", "slug": "...", "name": "...",
    "defaultLanguage": "en", "plan": "trial", "isActive": true
  },
  "onboarding": { "companyName": "..." },
  "note": "Profile updated. No secrets or credentials exposed."
}
```

**Error responses:**
- 400: validation error (no fields provided, invalid language, invalid length)
- 401: missing/invalid auth
- 403: non-OWNER/ADMIN attempting update (RBAC via `requireRole`)

**Audit:** Each successful update logs `ACCOUNT_PROFILE_UPDATE` to the audit log with the list of updated field keys (no values).

---

## Web Page: /account

A polished self-service management hub with:

1. **Tenant Profile card** — business name, slug, default language, plan, active status, member since. Has an "Edit" button (OWNER/ADMIN only) that opens an inline editor for business name + default language.
2. **Your Account card** — current user name, email, role, status.
3. **Onboarding Status card** — onboarding draft status, company name, industry, goals. Links to `/onboarding`.
4. **Channel Setup card** — channel type, setup status, credential status (label only), active channel count. Links to `/channels/setup`.
5. **Continue Setup checklist** — 6 items with progress bar:
   - Complete onboarding wizard → `/onboarding`
   - Add knowledge base items → `/knowledge`
   - Configure WhatsApp channel → `/channels/setup`
   - Invite team members → `/team`
   - Review activation guide → `/activation-guide`
   - Check activation monitoring → `/activation/monitoring`
6. **Safety Status card** — real send disabled, WA Web disabled, Meta API disabled, no broadcast/bulk on any plan.
7. **Quick links footer** — to Team, Knowledge, Channel Setup, Activation Guide, Activation Monitor, Release Checklist.

---

## Team Invite Self-service

The account hub links to `/team` (existing Phase 15B page) for team management. No new email invitation system is built in this phase. The existing `POST /team/invite-draft` already returns `emailSent: false` and is a local stub.

---

## RBAC Summary

| Action | Role required |
|---|---|
| View `/account` page | Any authenticated user |
| GET /account/overview | Any authenticated user |
| Edit profile button visible | OWNER or ADMIN only |
| PATCH /account/profile | OWNER or ADMIN only (403 otherwise) |

---

## Related Pages

- `/account` — this page
- `/onboarding` — onboarding wizard
- `/channels/setup` — channel configuration
- `/knowledge` — knowledge base
- `/team` — team members
- `/activation-guide` — activation operator guide
- `/activation/monitoring` — activation monitoring dashboard
- `/release-checklist` — SaaS v1 release readiness
