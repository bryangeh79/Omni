# Omni — Meta WhatsApp Business Platform Connector

## Overview

Phase 7A implements the Meta WhatsApp Business Platform (official API) connector foundation. This is the **enterprise/official API path**, separate from the WhatsApp Web connector.

**Ordinary WhatsApp / WhatsApp Business App** uses the WhatsApp Web connector (Baileys session).  
**Meta WhatsApp Business Platform** uses the official Meta Cloud API via Graph API endpoints.

---

## Default Safety Mode

By default, **real Meta API sends are disabled**. The `POST /messages/send` route returns `sendStatus: META_SEND_DISABLED` for Meta channels until `OMNI_ENABLE_REAL_META_SEND=true` is set server-side.

No real Meta API calls are made in default smoke tests.

---

## Architecture

```
Inbound (Meta → Omni):
  Meta Cloud API → POST /webhooks/meta/whatsapp/:channelId
    → parse payload
    → idempotency check by wamid
    → find/create Customer
    → find/create Conversation
    → create INBOUND Message in DB
    → enqueue BullMQ PROCESS_INBOUND_MESSAGE job
    → return 200 (no reply here)

Outbound (Omni → Meta):
  POST /messages/send
    → check channel type = META_API
    → default: return META_SEND_DISABLED (real send disabled)
    → OMNI_ENABLE_REAL_META_SEND=true: MetaApiAdapter.sendMessage()
      → POST graph.facebook.com/v19.0/{phoneNumberId}/messages
      → Bearer token used in-memory only, never logged
```

---

## Setup: Create Meta Channel Config

```http
POST /channels/meta
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "displayName":        "Business WhatsApp",
  "phoneNumberId":      "1234567890",
  "wabaId":             "0987654321",
  "displayPhoneNumber": "+60 12-345 6789",
  "metaAccessToken":    "EAA...",
  "webhookVerifyToken": "your-chosen-verify-token"
}
```

Response **never** contains the raw or encrypted token. Only `hasAccessToken: true` and `accessTokenLast4` are returned.

---

## Webhook Configuration

### GET (verification handshake)

Meta calls this when you register the webhook in Meta App Settings:

```
GET /webhooks/meta/whatsapp/:channelId
  ?hub.mode=subscribe
  &hub.verify_token=<your-verify-token>
  &hub.challenge=<random-challenge>
```

Omni decrypts the stored verify token, compares using constant-time comparison, and returns the challenge as plain text on match. Returns 403 on mismatch.

### POST (inbound messages)

Meta sends message notifications here:

```
POST /webhooks/meta/whatsapp/:channelId
Content-Type: application/json
X-Hub-Signature-256: sha256=<hmac>  ← TODO Phase 7B: verify this

{ "object": "whatsapp_business_account", "entry": [...] }
```

Supported in Phase 7A: **text messages only**. Media/templates/interactive are TODO.

**Idempotency:** Messages are de-duplicated by Meta message ID (`wamid`). Duplicate webhooks are silently ignored.

---

## Token Safety

| Token | Storage | Returned in API? |
|---|---|---|
| Meta access token | AES-256-GCM encrypted in `Channel.metaAccessTokenRef` | Never — `hasAccessToken` bool + `accessTokenLast4` only |
| Webhook verify token | AES-256-GCM encrypted in `Channel.webhookVerifyTokenRef` | Never |

Both tokens use the same vault as AI API keys (`OMNI_API_KEY_ENCRYPTION_SECRET`).

---

## Cost Separation

Meta official message fees are **NOT** included in `UsageRecord.llmCostUsd`. They are a separate billing line item charged by Meta. Tracking Meta message costs is a future phase.

---

## Environment Variables

```env
# Enable real Meta API sends (default: disabled — stub mode)
OMNI_ENABLE_REAL_META_SEND=false
```

---

## What This Phase Does NOT Implement

- HMAC signature verification for webhook POST (TODO Phase 7B)
- Media message sending/receiving
- Template message sending
- Meta token refresh / long-lived token exchange
- WhatsApp Web session activation (remains OMNI_ALLOW_WA_SESSION guarded)
- Marketing broadcast / ads
- Meta message fee tracking in UsageRecord
