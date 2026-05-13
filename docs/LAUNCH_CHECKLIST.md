# Omni Launch Checklist — Phase 13B

## Overview

The Launch Checklist (`/launch-checklist`) is a deterministic readiness check that shows a tenant exactly what is ready and what must be completed before going live with WhatsApp AI customer service.

**No real API calls are made.** The checklist queries only the local database.

---

## Launch Status Values

| Status | Description |
|--------|-------------|
| `NOT_READY` | Critical items missing (onboarding incomplete or no channel type) |
| `READY_FOR_STAGING` | All basic configuration done; real send flags not enabled (safe default) |
| `READY_FOR_PRODUCTION_REVIEW` | All config done, real send flag(s) enabled by operator; review before going live |

---

## Checklist Items

| Key | Label | Required |
|-----|-------|----------|
| `onboarding_completed` | Onboarding wizard completed (status=ENABLED) | Critical |
| `knowledge_base_ready` | Knowledge base has ≥1 active item | Recommended |
| `channel_type_saved` | Channel type selected and draft saved | Critical |
| `credentials_saved` | Channel credentials configured (Meta API only) | Required for Meta |
| `stub_test_done` | Stub connection test completed | Recommended |
| `activation_requested` | Activation requested (ACTIVATION_PENDING or ACTIVE) | Important |
| `follow_up_rules` | Follow-up automation rules configured | Optional |
| `real_wa_session_flag` | `OMNI_ALLOW_WA_SESSION=true` (WA Web only) | Operator action |
| `real_meta_send_flag` | `OMNI_ENABLE_REAL_META_SEND=true` (Meta API only) | Operator action |

### Item Status Values

| Status | Meaning | UI color |
|--------|---------|---------|
| `DONE` | Completed | Green |
| `PENDING` | Not yet done, needs action | Amber |
| `WARN` | Optional but recommended | Yellow |
| `BLOCKED` | Requires operator env flag | Red |
| `SKIP` | Not applicable for chosen channel type | Gray |

---

## API

### GET /channels/setup/launch-checklist

Requires auth. Returns deterministic checklist from DB + env flags.

```json
{
  "tenantId": "...",
  "launchStatus": "READY_FOR_STAGING",
  "launchNote": "...",
  "items": [
    { "key": "onboarding_completed", "label": "...", "status": "DONE", "action": "/onboarding", "detail": "Enabled" }
  ],
  "summary": { "done": 5, "pending": 2, "warn": 1, "blocked": 2, "skip": 0 },
  "safety": {
    "realWaSessionEnabled": false,
    "realMetaSendEnabled": false,
    "aiProviderEnabled": false,
    "realSendActive": false
  }
}
```

**Safety:** `safety.realSendActive` is always `false` in this response. The flags reflect actual env state (informational).

---

## Web UI `/launch-checklist`

- Launch status banner (🔴/🟡/🟢)
- "Needs Action Before Live" section
- "Ready Now" section
- "Optional / Recommended" section
- Quick action buttons (Onboarding, Knowledge, Channel Setup, Meta Webhook, Inbox, Dashboard)
- Dual channel path comparison (WA Web vs Meta API)
- Safety state grid (WA Session, Meta Send, AI Provider — all OFF by default)

---

## Safety Guarantees

- `realSendActive` is always `false` in checklist response
- `realWaSessionEnabled` reflects env var (never set by checklist)
- `realMetaSendEnabled` reflects env var (never set by checklist)
- No DB writes from checklist endpoint
- No external API calls from checklist endpoint
- All secrets redacted

---

## Activation Paths

### Ordinary WhatsApp (WA_WEB)

1. Complete onboarding
2. Select `WA_WEB` channel type, save draft
3. Run stub test
4. Request activation
5. **Operator** sets `OMNI_ALLOW_WA_SESSION=true` in `.env`
6. Restart API
7. QR scan session (Phase 14)

### Meta WhatsApp Business Platform

1. Complete onboarding
2. Select `META_WA_BUSINESS` channel type, save draft
3. Configure Meta App Dashboard (Meta Webhook Wizard)
4. Save credentials via `/channels/setup/credentials-draft`
5. Run stub test
6. Request + confirm activation
7. **Operator** sets `OMNI_ENABLE_REAL_META_SEND=true` in `.env`
8. Restart API
9. Verify first real webhook delivery

---

## Phase 14A Additions

### Channel Health Integration

The Boss Dashboard (`/boss`) now shows a Channel Health card derived from `GET /boss/channel-health`:
- `healthLevel`: OK / WARN / BLOCKED
- `liveStatus`: NOT_CONFIGURED / FLAGS_DISABLED / CONNECTED / LIVE / PENDING_ACTIVATION
- Links to `/channels/setup` and `/launch-checklist`

### WA Web Activation Status

`GET /channels/setup/wa-web/status` feeds into the launch checklist flow:
- When `OMNI_ALLOW_WA_SESSION=false`: checklist shows `BLOCKED` for WA Web activation
- When `OMNI_ALLOW_WA_SESSION=true` and channel connected: shows `OK`

### Meta Live Webhook Status

`GET /channels/setup/meta-webhook/live-status` provides detailed readiness:
- `BLOCKED_FLAG` → missing `OMNI_ENABLE_REAL_META_SEND`
- `BLOCKED_NO_CREDENTIALS` → credentials not saved
- `BLOCKED_NO_WEBHOOK` → webhook not subscribed in Meta App
- `READY_FOR_LIVE_TEST` → all conditions met

---

## Limitations (Phase 14A)

- Checklist is snapshot-based — does not poll live channel health
- Real WA Web QR activation requires `OMNI_ALLOW_WA_SESSION=true` (operator action) + Phase 14B implementation
- Real Meta live webhook test not yet implemented (guarded foundation only)
- `follow_up_rules` uses rule count as proxy — does not validate rule content
- No per-channel breakdown (only most recent `ChannelSetupDraft` per tenant)
