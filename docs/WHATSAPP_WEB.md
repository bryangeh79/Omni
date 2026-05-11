# Omni — WhatsApp Web Channel Guide

## What is WhatsApp Web Channel?

Omni's WhatsApp Web channel allows a tenant to connect an **ordinary WhatsApp number** or **WhatsApp Business App number** by scanning a QR code — the same mechanism used by WhatsApp Web in a browser.

This is powered by [Baileys](https://github.com/WhiskeySockets/Baileys), an open-source Node.js library.

---

## ⚠️ Important Boundary

| | WhatsApp Web Channel | Meta WhatsApp Business API |
|---|---|---|
| Auth | QR code scan | Meta phone number + token |
| Type | Unofficial, web-based | Official Meta platform |
| Stability | Moderate (Meta may block) | High |
| Scale | Single device session | Multi-device, enterprise |
| Phase | Phase 2B (current) | Phase 5 (future) |

**Do NOT market the WhatsApp Web channel as an official Meta API integration.** It is a quick-start channel for testing and small-scale use.

---

## Quick Start

### 1. Start Omni Docker services

```powershell
# From C:\AI_WORKSPACE\Omni Ai Chatbot
docker compose up -d
```

### 2. Start API server

```powershell
pnpm dev:api
```

### 3. (Optional) Enable real WhatsApp connection

By default, the adapter runs in **STUB MODE** (no real WhatsApp connection).
To enable real connections:

```
OMNI_ALLOW_WA_SESSION=true
```

Add to your `.env` file. **Do not enable on a machine where real session scanning is not approved.**

### 4. Login and obtain access token

All WhatsApp Web routes require authentication (Phase 3A+).

```http
POST http://localhost:43111/auth/login
Content-Type: application/json

{
  "email": "admin@omni-demo.test",
  "password": "OmniDemo2024!"
}
```

Use the returned `accessToken` as `Authorization: Bearer <token>` in all subsequent calls.

### 5. Connect a channel

**Requires: Authorization: Bearer <accessToken>**
`tenantId` is derived from the token — do NOT pass it in the body.

```http
POST http://localhost:43111/channels/whatsapp-web/connect
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "displayName": "My WhatsApp"
}
```

Response includes `channelId` and `status`.

### 6. Poll for QR code

**Requires: Authorization: Bearer <accessToken>**

```http
GET http://localhost:43111/channels/whatsapp-web/{channelId}/qr
Authorization: Bearer <accessToken>
```

- Returns `{ qr: "<opaque-string>" }` when QR is ready
- Returns `204 No Content` if no QR available yet
- The `qr` string must be rendered as a QR image (e.g., using `qrcode.js`) — never logged

### 6. Scan QR

Open the QR rendering in a browser or mobile app. Scan with the WhatsApp number you want to connect.

### 7. Check status

```http
GET http://localhost:43111/channels/whatsapp-web/{channelId}/status
```

### 8. Disconnect

```http
POST http://localhost:43111/channels/whatsapp-web/{channelId}/disconnect
```

---

## Session Storage

Sessions are stored under:
```
C:\AI_WORKSPACE\Omni Ai Chatbot\data\wa-sessions\{channelId}\
```

**Security rules:**
- Session directory is strictly enforced to be under `data/wa-sessions/`
- Session files are in `.gitignore` — never commit them
- Session files contain auth credentials — treat as secrets
- Never log, print, or transmit session file contents

---

## Message Flow (Phase 2B)

```
WhatsApp (customer) ─→ Baileys socket ─→ WhatsAppWebAdapter
                                              │
                                              ▼
                                    normalize → InboundEnvelope
                                              │
                                              ▼
                                    message-router.ts
                                    ├─ find/create Customer (by phone)
                                    ├─ find/create Conversation
                                    ├─ write Message to DB
                                    └─ workerStub_processInbound()
                                              │
                                              ▼
                                    worker/process-message.ts
                                    └─ Phase 3: AI Agent call
```

---

## Stability Boundaries

The WhatsApp Web approach has known risks:

1. **Meta may block or limit** accounts using unofficial clients — use at your own risk.
2. **Session expiry** — sessions can expire; users must re-scan QR periodically.
3. **Number bans** — high-volume or spammy usage can result in number bans.
4. **Multi-device** — Baileys supports multi-device but the session is still single-account.
5. **Rate limiting** — do not send bulk messages; the system is for conversational use only.

---

## Troubleshooting

### Adapter stuck at CONNECTING
- Check if `OMNI_ALLOW_WA_SESSION=true` is set (default is STUB mode)
- Verify Postgres is running: `docker exec omni-postgres-dev pg_isready`

### QR not appearing
- Poll `GET /channels/whatsapp-web/:id/qr` — returns 204 if not ready yet
- In STUB mode, a synthetic QR string is returned (starts with `STUB_QR::`)

### ERR_REQUIRE_ESM or import errors
- Baileys may require a newer Node.js version
- Check `node --version` (requires ≥ 20)
- Try `pnpm db:generate` first to ensure Prisma client is ready

### Session lost after restart
- Adapter registry is in-memory — re-call `/connect` after API restart
- Phase 3 will add persistent session registry

---

## Security Rules

- **Never log QR content** — QR contains auth credentials
- **Never log session file content** — treat as secrets
- **Never commit `data/wa-sessions/`** — it's in `.gitignore`
- **Never expose QR via public API** — should be tenant-authenticated (Phase 3)
- **One session = one phone number** — do not share sessions between tenants
- **Audit log** all connect/disconnect events (Phase 4)
