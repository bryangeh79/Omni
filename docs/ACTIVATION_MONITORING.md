# Activation Monitoring — Phase 16B

## Overview

The activation monitoring dashboard at `/activation/monitoring` provides operators with a unified, local-only view of activation readiness, health, and audit activity. **All data is DB-derived — no external provider calls are made.**

Real sends remain disabled by default (`OMNI_ALLOW_WA_SESSION=false`, `OMNI_ENABLE_REAL_META_SEND=false`) unless an operator explicitly changes these env flags outside the default flow.

Omni is a **WhatsApp AI 客服 + CRM + follow-up + conversion** system — not a broadcast, ads, or bulk-sending platform.

---

## API Endpoints (Phase 16B additions)

### GET /activation/timeline

Auth-required. Returns recent activation-related audit events from the local DB.

- Filters to activation-relevant actions: ACTIVATION_DRY_RUN, ACTIVATION_TEST_MESSAGE_DRY_RUN, TEAM_INVITE_DRAFT, BILLING_PLAN_SELECTED, SETTINGS_PROFILE_UPDATE, TEAM_ROLE_UPDATE, TEAM_STATUS_UPDATE
- Returns max 20 recent events
- Includes: id, action, entityType, actorRole, createdAt, metadataJson (safe preview)
- Never includes raw credentials, tokens, or secrets

Response shape:
```json
{
  "tenantId": "...",
  "asOf": "...",
  "totalActivationDryRuns": 3,
  "recentEventCount": 8,
  "events": [
    { "id": "...", "action": "ACTIVATION_DRY_RUN", "actorRole": "ADMIN", "createdAt": "...", "metadataJson": "..." }
  ]
}
```

### GET /activation/go-live-checklist

Auth-required. Returns a deterministic go-live readiness checklist.

Items include:
- **Automated checks** (DB-derived, pass/fail): onboarding_complete, knowledge_base_ready, channel_configured, credentials_safe_summary, credential_vault_configured, admin_owner_exists, real_send_flags_reviewed, audit_log_active
- **Manual items** (`requiresManualConfirmation: true`, always default `passed: false`): backup_configured, monitoring_configured, rollback_plan_reviewed, billing_pricing_notes_reviewed, meta_api_fee_noted (if Meta channel), no_broadcast_acknowledged

Response shape:
```json
{
  "tenantId": "...",
  "overallStatus": "READY_FOR_MANUAL_REVIEW",
  "summary": { "automatedPassed": 8, "automatedFailed": 0, "manualRequired": 5 },
  "items": [ { "key": "backup_configured", "requiresManualConfirmation": true, "passed": false, ... } ]
}
```

### POST /activation/test-message/dry-run

Auth-required. Safe placeholder for pre-activation test message validation.

- **NEVER sends a real message**
- **NEVER calls WhatsApp/Meta API**
- **NEVER accepts or echoes raw phone numbers**
- Accepts `channelType` (WA_WEB or META_WA_BUSINESS) and optional `recipientLabel` (a safe label like "test-contact-1", not a phone number)
- Phone-number-like strings in `recipientLabel` are rejected (400)
- Returns `dryRun: true`, `realSendAttempted: false`, `providerCalled: false`, `rawPhoneIncluded: false`
- Logs `ACTIVATION_TEST_MESSAGE_DRY_RUN` audit event

Response shape:
```json
{
  "tenantId": "...",
  "dryRun": true,
  "realSendAttempted": false,
  "providerCalled": false,
  "channelType": "META_WA_BUSINESS",
  "recipientLabel": "test-contact-1",
  "rawPhoneIncluded": false,
  "whatWouldBeRequired": ["OMNI_ENABLE_REAL_META_SEND=true must be set", "..."],
  "safetyNote": "This is a dry-run placeholder. No real WhatsApp/Meta connection was made."
}
```

---

## Dashboard Page: /activation/monitoring

The monitoring page aggregates data from four endpoints in parallel:
- `GET /activation/preflight` — readiness level and check results
- `GET /activation/health` — health level and channel summary
- `GET /activation/timeline` — recent audit events
- `GET /activation/go-live-checklist` — go-live checklist items

### Panels

| Panel | Data source | Purpose |
|---|---|---|
| Status row (4 cards) | preflight + health | Readiness, health, real-send status, go-live summary |
| Pre-flight checks | /activation/preflight | 12 automated checks with PASS/FAIL |
| Go-live checklist | /activation/go-live-checklist | Auto + manual items |
| Channel health | /activation/health | Active channels + last webhook time |
| Manual blockers | /activation/go-live-checklist | Manual items only with links |
| Audit timeline | /activation/timeline | Recent operator actions |

---

## Safety Contract

All monitoring endpoints:
- Require authentication (JWT Bearer token, tenant-scoped)
- Never call external providers
- Never expose raw tokens, credentials, or encrypted blobs
- Never log or return `.env` values
- `realSendEnabled`/`realSendAttempted`/`providerCalled` are always `false` in dry-run mode
- `OMNI_ALLOW_WA_SESSION` and `OMNI_ENABLE_REAL_META_SEND` are never changed by these endpoints

---

## What Requires Manual Operator Action

The following cannot be automated and require operator confirmation:
1. **Backup**: pg_dump schedule + off-server storage + restore test (see /ops/runbook)
2. **Monitoring**: Uptime probe on /ops/health + error rate alert (see /ops/runbook)
3. **Rollback plan**: Reviewed and understood (see /activation-guide)
4. **Billing/pricing notes**: Plan pricing and payment gateway status confirmed (see /billing)
5. **Meta API fee**: Pass-through per-conversation fee noted (NOT bundled in Omni plan price)
6. **No-broadcast acknowledgment**: Confirmed 1:1 AI customer service only — no broadcast/ads/bulk

---

## Related Pages

- `/activation/monitoring` — this dashboard (web UI)
- `/activation-guide` — step-by-step activation guide
- `/activation/preflight` — API: pre-flight checks
- `/activation/health` — API: post-activation health
- `/activation/dry-run` — API: simulate activation
- `/activation/go-live-checklist` — API: go-live checklist
- `/activation/timeline` — API: recent audit timeline
- `/activation/test-message/dry-run` — API: test message placeholder (never sends)
- `/release-checklist` — SaaS v1 release status
- `/ops/runbook` — backup, monitoring, incident response
- `/audit` — full admin activity audit log
