# Omni Real Delivery Readiness — Phase 10B

## Overview

Phase 10B establishes the guardrail architecture for real WhatsApp/Meta message delivery. **Real sending is NOT enabled by default.** All outbound operations go through a formal guard layer that checks multiple conditions before allowing any API call.

---

## Default Mode (Safe)

By default, all outbound sends produce a stub status and no external API call is made:

| Channel | Default sendStatus | Real send condition |
|---------|-------------------|---------------------|
| META_API | `META_SEND_DISABLED` | `OMNI_ENABLE_REAL_META_SEND=true` |
| WHATSAPP_WEB | `STUB_NOT_SENT` | `OMNI_ALLOW_WA_SESSION=true` (not implemented) |
| Any | `BLOCKED_CLOSED` | N/A — CLOSED conversations always blocked |
| Any | `BLOCKED_BULK` | N/A — bulk sending categorically rejected |

---

## Meta Send Guardrail (`apps/api/src/meta-send-guard.ts`)

All outbound Meta sends must pass `checkMetaSendGuard()`:

| Check | Condition | Blocked status |
|-------|-----------|---------------|
| Bulk/broadcast | `isBulk=true` | `BLOCKED_BULK` |
| CLOSED conversation | status = CLOSED | `BLOCKED_CLOSED` |
| Global flag | `OMNI_ENABLE_REAL_META_SEND` ≠ true | `META_SEND_DISABLED` |
| Channel type | must be `META_API` | `STUB_NOT_SENT` |
| Access token | channel must have `metaAccessTokenRef` | `BLOCKED_CHANNEL` |

Guards are checked in priority order. The first failure blocks the send.

### Enabling Real Send (Production Only)

Set `OMNI_ENABLE_REAL_META_SEND=true` in your production `.env`. All other guards still apply. This flag alone is not sufficient — the channel must also have a valid access token configured.

**Warning:** Never enable this in development or staging without reviewing all safety checks.

---

## Delivery Audit Logging

Every send attempt (including blocked/stub attempts) produces a structured log entry via `auditSendAttempt()`:

```json
{
  "ts": "2026-05-13T...",
  "tenantId": "...",
  "conversationId": "...",
  "messageId": "...",
  "channelId": "...",
  "provider": "META" | "STUB" | "SYSTEM",
  "status": "META_SEND_DISABLED" | "SENT" | "BLOCKED_CLOSED" | ...,
  "dryRun": true,
  "errorCode": "OPTIONAL_SAFE_STRING"
}
```

**Phase 10B:** Audit entries are written to structured console logs (`[delivery-audit]` prefix).
**Phase 11:** Replace with `DeliveryLog` DB table for querying and alerting.

**Safety:** No secrets, tokens, access keys, or raw API error messages are included in audit entries.

---

## Send Status Types

| Status | Meaning |
|--------|---------|
| `STUB_NOT_SENT` | Default — real send disabled or channel type not supported |
| `META_SEND_DISABLED` | Meta channel but env flag not set |
| `DRY_RUN` | Explicit dry-run check result |
| `SENT` | Real send succeeded (Phase 11 when enabled) |
| `FAILED` | Real send attempted but API returned error |
| `BLOCKED_CLOSED` | Conversation is CLOSED |
| `BLOCKED_BULK` | Bulk/broadcast attempt — always rejected |
| `BLOCKED_CHANNEL` | Channel missing required config |

---

## AI Follow-up Scenario Auto-trigger (`apps/worker/src/scenario-mapper.ts`)

After each AI reply, the worker maps conversation context to a follow-up scenario:

| Signal | Mapped Scenario |
|--------|----------------|
| Customer message contains price/cost keywords | `PRICE_ASKED_NO_REPLY` |
| Customer message contains booking/appointment keywords | `BOOKING_NOT_CONFIRMED` |
| Customer message contains considering/maybe keywords | `CONSIDERING` |
| AI `shouldHandoff=true` + score ≥ 80 | `HIGH_INTENT_UNHANDLED` |
| Stage HIGH_INTENT/QUOTED + score ≥ 60 (no handoff) | `CONSIDERING` |
| Blocked tags (complaint/refund/blacklist) | `null` — no follow-up |

No AI provider calls — purely deterministic keyword matching.

---

## Production Steps Before Enabling Live Send

1. ✅ Guard layer exists (`checkMetaSendGuard`)
2. ✅ Audit logging exists (`auditSendAttempt`)
3. ✅ `OMNI_ENABLE_REAL_META_SEND=false` default
4. ✅ Channel Setup Wizard with guarded activation (Phase 13A)
5. ✅ Credential vault with AES-256-GCM encryption (Phase 13A)
6. ☐ Set `OMNI_ENABLE_REAL_META_SEND=true` in production env
7. ☐ Configure channel credentials via `/channels/setup/credentials-draft`
8. ☐ Complete activation flow: request-activation → confirm-activation
9. ☐ Real WA Web QR scan (Phase 14)
10. ☐ Meta webhook registration (Phase 14)
11. ☐ Rate limiting on `/messages/send` (Phase 14)
12. ☐ Test real send in staging environment first

---

## Phase 13A: Channel Setup Credential Vault

### Credential Encryption

All channel credentials (Meta access tokens, app secrets) are encrypted before storage using `encryptApiKey()` from `@omni/shared`:
- Algorithm: AES-256-GCM
- Key source: `OMNI_API_KEY_ENCRYPTION_SECRET` env var
- Encrypted blob: `base64(IV[12] + AuthTag[16] + Ciphertext)`

### What Is Never Stored/Returned
- Raw access tokens
- Raw app secrets
- Full phone numbers (only `phoneLast4`)
- Encrypted `credentialRef` blob is never in any API response

### Activation Gates (Default: Blocked)

| Channel | Required env flag | Default |
|---------|------------------|---------|
| WA_WEB | `OMNI_ALLOW_WA_SESSION=true` | false |
| META_WA_BUSINESS | `OMNI_ENABLE_REAL_META_SEND=true` | false |

Both `request-activation` and `confirm-activation` return `activated=false, blocked=true` unless the correct env flag is set by the operator.

---

## Phase 14A: Live Activation Foundation

### WA Web Guarded QR Activation

| Endpoint | Behavior when flag OFF | Behavior when flag ON |
|---------|----------------------|----------------------|
| `GET /channels/setup/wa-web/status` | `sessionStatus=BLOCKED`, missing conditions listed | Returns actual channel state |
| `POST /channels/setup/wa-web/request-qr` | `blocked=true`, `qrIssued=false` | `GUARDED_REDIRECT` → use `/channels/whatsapp-web/connect` |
| `GET /channels/setup/wa-web/session-status` | `hasSessionRef=false`, safe summary | Returns bool flags only; no raw session data |
| `POST /channels/setup/wa-web/disconnect` | Returns blocked note | Marks channel inactive; no broad process kill |

### Meta Live Webhook Verification

| Endpoint | Default (blocked) |
|---------|-----------------|
| `GET /channels/setup/meta-webhook/live-status` | Lists all missing conditions |
| `POST /channels/setup/meta-webhook/request-live-test` | `blocked=true`, `testInitiated=false` |
| `POST /channels/setup/meta-webhook/confirm-live-test` | `confirmed=false`, `realMetaApiCalled=false` |

### Channel Health

`GET /channels/setup/health` — deterministic health without external calls:
- `healthLevel`: OK / WARN / BLOCKED
- `waWebSessionStatus`: BLOCKED / NOT_CONNECTED / CONNECTED
- `metaWebhookStatus`: NOT_CONFIGURED / STUB_TESTED / LIVE_PENDING / LIVE_VERIFIED / BLOCKED
- `realSendEnabled`: always `false` in response
- `recommendedAction`: human-readable next step

`GET /boss/channel-health` — compact version for Boss Dashboard card.


## Phase 16A: Production Activation API

New endpoints added for operator-guided activation workflow:

- `GET /activation/preflight` — readiness checks (BLOCKED / READY_FOR_OPERATOR_REVIEW / READY_FOR_STAGING / READY_FOR_LIVE_REVIEW)
- `POST /activation/dry-run` — simulate activation without enabling real send; logs ACTIVATION_DRY_RUN audit event
- `GET /activation/health` — post-activation safety flags + channel health + recent audit activity

Web UI at `/activation-guide` with step-by-step guide for WA Web and Meta WhatsApp Business Platform paths.

See `docs/ACTIVATION_GUIDE.md` for full documentation.


## Phase 16B: Activation Monitoring

New endpoints added:
- `GET /activation/timeline` — recent activation-related audit events
- `GET /activation/go-live-checklist` — automated + manual confirmation checklist
- `POST /activation/test-message/dry-run` — safe placeholder, dryRun=true, never sends, never calls providers, never echoes phone numbers

New page: `/activation/monitoring` — operator monitoring dashboard.
See `docs/ACTIVATION_MONITORING.md` for documentation.


## Phase 17C: Activity + Export Safety

The new `/account/activity` and `/account/export` endpoints continue the no-real-send boundary:
- Neither endpoint calls WhatsApp, Meta, AI, email, or payment providers
- Export explicitly redacts: passwordHash, credentialRef, metaAccessTokenRef, webhookVerifyTokenRef, apiKeyRef, encrypted blobs, raw tokens
- Export does not include full customer conversations or KB answers in this phase
- Activity summaries filter metadata to a safe whitelist only


## Phase 17D: Activity Filtering + Security Events

The new `/account/activity` filters and `/account/security-events` endpoint continue the no-real-send boundary:
- Both endpoints are tenant-scoped and audit-log derived
- Neither calls WhatsApp, Meta, AI, email, or payment providers
- Both filter metadata through the same safe whitelist
- Security events do NOT include raw tokens, credential refs, encrypted blobs, actorUserId, ip, or userAgent
- The 7-day security window is deterministic and based on existing AuditLog records


## v1 Landing References

- `docs/V1_HANDOFF_PACKAGE.md` — complete v1 delivery
- `docs/FINAL_PRODUCTION_READINESS.md` — env vars + checklists
- `docs/GO_LIVE_REHEARSAL.md` — pre-go-live rehearsal
