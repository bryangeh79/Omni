# Omni — Channel Types

Omni supports two WhatsApp channel entry points and a growing list of future channels.

---

## WhatsApp Channels

| Type | Entry Path | Status | Real Send |
|---|---|---|---|
| `WHATSAPP_WEB` | WhatsApp Web (Baileys session) | Phase 3+ | Requires `OMNI_ALLOW_WA_SESSION=true` |
| `META_API` | Meta WhatsApp Business Platform | Phase 7A+ | Requires `OMNI_ENABLE_REAL_META_SEND=true` |

### WhatsApp Web (Ordinary / Business App)
- Uses Baileys WebSocket library to connect a personal/business WhatsApp number
- Suitable for small businesses not yet on the official Meta Business Platform
- Session managed locally in `WHATSAPP_WEB_SESSION_DIR`
- QR code scan required to link
- **Not enabled by default** (`OMNI_ALLOW_WA_SESSION` guards activation)
- API path: `POST /channels/whatsapp-web/connect`

### Meta WhatsApp Business Platform (Official API)
- Official Meta Cloud API via Graph API
- Requires WhatsApp Business Account (WABA) + approved phone number
- Inbound messages delivered via Meta webhook: `POST /webhooks/meta/whatsapp/:channelId`
- Outbound text via `POST graph.facebook.com/v19.0/{phoneNumberId}/messages`
- Access token stored encrypted, never returned by API
- **Real sends disabled by default** (`OMNI_ENABLE_REAL_META_SEND` guards delivery)
- API path: `POST /channels/meta`
- See: `docs/META_WHATSAPP_API.md` for full details

---

## Channel Config Fields

| Field | WhatsApp Web | Meta API |
|---|---|---|
| `displayName` | Yes | Yes |
| `isActive` | Yes | Yes |
| `waWebSessionRef` | Yes | No |
| `metaPhoneNumberId` | No | Yes (required) |
| `wabaId` | No | Yes (optional) |
| `displayPhoneNumber` | No | Yes (optional) |
| `metaAccessTokenRef` | No | Yes (encrypted) |
| `webhookVerifyTokenRef` | No | Yes (encrypted) |
| `lastWebhookAt` | No | Yes |

---

## Future Channel Types (Schema Pre-defined)

The `ChannelType` enum includes: `FACEBOOK_MESSENGER`, `INSTAGRAM`, `WECHAT`, `ZALO`, `LINE`, `TIKTOK`.

These are not yet implemented but are reserved in the schema for future phases.

---

## Cost Separation (Important)

AI LLM costs (`UsageRecord.llmCostUsd`) and channel costs are **separate**:

- **AI costs**: tracked in `UsageRecord` per tenant per day
- **Meta message fees**: charged by Meta independently; NOT in `llmCostUsd`
- **WhatsApp Web**: no per-message fee (but Baileys TOS applies)

See: `docs/AI_USAGE_COSTS.md` for the AI cost model.
