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


## Phase 17C: Activity History + Safe Export

### GET /account/activity (Auth required, all roles)

Returns recent safe audit events for the current tenant. Query: `?limit=N` (max 100, default 20).

Filtered to account/setup-relevant actions:
- `ACCOUNT_PROFILE_UPDATE`, `TENANT_SIGNUP`
- `TEAM_INVITE_DRAFT`, `TEAM_ROLE_UPDATE`, `TEAM_STATUS_UPDATE`
- `BILLING_PLAN_SELECTED`, `SETTINGS_PROFILE_UPDATE`
- `ACTIVATION_DRY_RUN`, `ACTIVATION_TEST_MESSAGE_DRY_RUN`

Each event includes a human-readable `summary` and `safeMetadata` filtered to a whitelist (updatedFields, newRole, isActive, planId, priceRm, channelType, intendedMode, dryRunStatus, blockedCount, industry, goal, channelPreference, recipientLabel). Raw metadata values outside this whitelist are excluded.

`actorUserId`, `ip`, and `userAgent` are intentionally omitted from the response.

### GET /account/export (Auth required, OWNER/ADMIN only)

Returns a safe JSON summary of the tenant — NOT a full database backup.

**Included safely:**
- Tenant profile fields (id, slug, name, defaultLanguage, plan, isActive, createdAt)
- Users (id, email, name, role, isActive, createdAt) — passwordHash NEVER included
- Onboarding draft (status, companyName, industry, goals, businessHours)
- Channel setup status (channelType, displayName, phoneLast4, setupStatus, credentialStatus label, testStatus, real-send flags) — credentialRef/credentialLast4 NEVER included
- Active channels list (id, type, displayName, isActive) — metaAccessTokenRef/webhookVerifyTokenRef/metaAppSecretRef NEVER included
- Knowledge base: questions list only (NOT answers), max 50 items
- AiConfig provider label (aiProvider, model, isActive) — apiKeyRef/apiKeyLast4 NEVER included
- Follow-up rules: trigger + delay (NOT messageTemplate)
- Handoff rules: condition + isActive
- Counts: users, customers, conversations, knowledge items, audit events
- Safety flags, setup checklist, links, redaction summary, notes

**Excluded entirely (redaction guarantees):**
- passwordHash
- credentialRef, metaAccessTokenRef, webhookVerifyTokenRef, metaAppSecretRef, apiKeyRef
- Raw tokens of any kind
- Encrypted blobs
- Raw WhatsApp/Meta provider session or QR data
- Full customer conversations and message content
- Knowledge base answers (only questions exported)
- Follow-up message templates

The response includes an explicit `redaction` block with `passwordHashExcluded`, `credentialRefsExcluded`, `tokensExcluded`, `encryptedBlobsExcluded`, `rawProviderDataExcluded`, `rawConversationsExcluded`, `rawKnowledgeAnswersExcluded`, `rawFollowUpTemplatesExcluded`, `apiKeyRefsExcluded`, `metaAccessTokenRefExcluded`, `webhookVerifyTokenRefExcluded` — all `true`.

### /account UI

Three tabs: Overview / Activity / Export.
- Activity tab: live audit feed with action, role, timestamp, summary, safeMetadata.
- Export tab: clear "included" / "excluded" lists, Generate button, JSON preview, Download JSON button.


## Phase 17D: Activity Filtering + Security Events

### GET /account/activity (extended)

New optional query parameters:
- `actionGroup` — one of `account` / `team` / `billing` / `settings` / `activation` / `security`
- `action` — specific action name (must be a recognized account action)
- `from` — ISO 8601 timestamp (lower bound on createdAt)
- `to` — ISO 8601 timestamp (upper bound on createdAt)
- `limit` — 1–100 (default 20)

Invalid values return HTTP 400 with a safe error message. The response now also includes:
- `filters`: echo of the applied filters
- `availableActionGroups`: list of valid action group keys for client UIs

Action group mapping:
| Group | Actions included |
|---|---|
| account | ACCOUNT_PROFILE_UPDATE, TENANT_SIGNUP |
| team | TEAM_INVITE_DRAFT, TEAM_ROLE_UPDATE, TEAM_STATUS_UPDATE |
| billing | BILLING_PLAN_SELECTED |
| settings | SETTINGS_PROFILE_UPDATE |
| activation | ACTIVATION_DRY_RUN, ACTIVATION_TEST_MESSAGE_DRY_RUN |
| security | TEAM_ROLE_UPDATE, TEAM_STATUS_UPDATE, ACCOUNT_PROFILE_UPDATE |

### GET /account/security-events (OWNER/ADMIN only)

Returns a tenant-scoped security-focused event summary over the last 7 days.

Severity classification (deterministic):
- `info`: routine profile/billing/plan changes
- `warning`: privilege escalation (promote to OWNER/ADMIN), member deactivation, activation dry-run with blockers
- `critical`: reserved for future use; currently not assigned

Response shape:
```json
{
  "tenantId": "...",
  "asOf": "...",
  "windowDays": 7,
  "last24h": { "total": 0, "info": 0, "warning": 0, "critical": 0 },
  "severityCounts": { "info": 0, "warning": 0, "critical": 0 },
  "events": [
    {
      "id": "...",
      "action": "TEAM_ROLE_UPDATE",
      "actorRole": "OWNER",
      "createdAt": "...",
      "severity": "warning",
      "reason": "Member promoted to elevated role",
      "summary": "Team member role updated",
      "safeMetadata": { "newRole": "ADMIN" },
      "within24h": true
    }
  ],
  "recommendedActions": [ "..." ],
  "safetyFlags": { ... }
}
```

**Never includes:** `passwordHash`, `credentialRef`, raw tokens, encrypted blobs, raw provider data, `actorUserId`, `ip`, `userAgent`.

### /account UI

Tabs now: **Overview** / **Activity** / **Security** / **Export**.

Activity tab adds:
- Action group dropdown (all groups + "All groups")
- From / To datetime pickers
- Apply / Clear buttons

Security tab includes:
- Three severity summary cards (critical / warning / info, 7-day window) with red/yellow/green styling
- Last-24h breakdown row
- Recommended operator actions list
- Recent events list with severity badge, reason, action code, role, timestamp
- Footer showing live `realSendEnabled` / `realWaSessionEnabled` / `realMetaSendEnabled` flags
- OWNER/ADMIN gate — non-admin users see a restriction notice
