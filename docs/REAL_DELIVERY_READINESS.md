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
4. ☐ Set `OMNI_ENABLE_REAL_META_SEND=true` in production env
5. ☐ Configure channel with valid Meta access token
6. ☐ Review `DeliveryLog` DB table (Phase 11)
7. ☐ Rate limiting on `/messages/send` (Phase 11)
8. ☐ Test real send in staging environment first
