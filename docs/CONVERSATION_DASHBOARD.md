# Omni Conversation Dashboard — Phase 8A

## Overview

Phase 8A adds the Web Admin Inbox dashboard at `/inbox`.

The dashboard provides operators with:
- A real-time conversation list with filters
- A message thread view
- A customer card sidebar
- Manual takeover and release-to-AI controls
- A message composer (DB write; stub send status)

---

## Routes

### Frontend

| Route     | Description                              |
|-----------|------------------------------------------|
| `/`       | Redirects to `/inbox`                    |
| `/inbox`  | Operator Inbox dashboard (client page)   |
| `/pwa`    | Mobile PWA placeholder (Phase 9)         |

### API (additions / enhancements in Phase 8A)

| Method | Endpoint                              | Description                                   |
|--------|---------------------------------------|-----------------------------------------------|
| GET    | `/conversations`                      | Enhanced list with `needsHuman`, `unreadCount`, `tags`, `handoff` filter |
| GET    | `/conversations/:id`                  | Detail with pagination, `needsHuman`, `unreadCount` |
| GET    | `/conversations/:id/messages`         | Paginated message list for a conversation     |
| POST   | `/conversations/:id/takeover`         | Human takes over — sets `HUMAN_HANDLING`      |
| POST   | `/conversations/:id/release-ai`       | Release back to AI — sets `AI_HANDLING`       |
| POST   | `/conversations/:id/release`          | Legacy alias for release-ai                   |
| GET    | `/realtime/events`                    | SSE stream of tenant-scoped real-time events  |

---

## Conversation List API

### Query Parameters

| Param      | Type    | Default        | Description                                                  |
|------------|---------|----------------|--------------------------------------------------------------|
| `page`     | int     | 1              | Page number                                                  |
| `pageSize` | int     | 20             | Items per page (max 100)                                     |
| `limit`    | int     | same as above  | Alias for `pageSize`                                         |
| `status`   | string  | all            | Filter by `ConversationStatus` enum value                    |
| `handoff`  | boolean | —              | `true` → filter `PENDING_HANDOFF` only (overrides `status`) |
| `q`        | string  | —              | Search customer name / phone / whatsappName                  |
| `sort`     | string  | `lastMessageAt`| `lastMessageAt` (default) or `createdAt`                     |
| `channelId`| string  | —              | Filter by channel                                            |
| `customerId`| string | —              | Filter by customer                                           |

### Response Fields (per conversation)

Each item in `data[]` includes all base `Conversation` fields plus:

| Field         | Type    | Description                                              |
|---------------|---------|----------------------------------------------------------|
| `customer`    | object  | `{ id, name, phone, whatsappName, stage, score, tags[] }` |
| `channel`     | object  | `{ id, type, displayName }`                              |
| `lastMessage` | object  | `{ id, content, direction, senderType, createdAt }` or null |
| `unreadCount` | number  | Count of unread INBOUND messages                         |
| `needsHuman`  | boolean | `true` when `status === PENDING_HANDOFF`                 |

---

## Takeover / Release AI

### POST `/conversations/:id/takeover`

Sets conversation to `HUMAN_HANDLING` and assigns the calling user.
Creates a system audit message.
Publishes `conversation.handoff.updated` + `conversation.updated` SSE events.

**Error cases:**
- `404` — conversation not found or cross-tenant
- `400` — conversation is `CLOSED`

### POST `/conversations/:id/release-ai`

Sets conversation to `AI_HANDLING` and clears `assignedUserId`.
Creates a system audit message.
Publishes `conversation.handoff.updated` + `conversation.updated` SSE events.

**Error cases:**
- `404` — conversation not found or cross-tenant
- `400` — conversation is `CLOSED`

---

## Frontend Dashboard `/inbox`

### Layout

```
┌─────────────────┬───────────────────────────────┬──────────────┐
│  Conversation   │  Message Thread               │  Customer    │
│  List (left)    │  (center)                     │  Card        │
│                 │                               │  (right)     │
│  [filters]      │  [messages scrollable]        │              │
│  [search]       │                               │  name        │
│                 │  ─────────────────────────────│  phone       │
│  ConvItem       │  [composer + Send button]     │  stage       │
│  ConvItem       │                               │  score       │
│  ...            │  [Take Over] [Release to AI]  │  tags        │
└─────────────────┴───────────────────────────────┴──────────────┘
```

### Filter Tabs

| Filter       | API query                        |
|--------------|----------------------------------|
| All          | (no filter)                      |
| Needs Human  | `?handoff=true`                  |
| AI Handling  | `?status=AI_HANDLING`            |
| High Intent  | `?status=AI_HANDLING` (UI note)  |

### Real-Time Connection

The inbox connects to `/realtime/events?token=<jwt>` using the browser `EventSource` API.

On each event, the list and open thread are refreshed.

The SSE connection status is shown as a colored dot (green = connected, grey = polling/disconnected).

### Takeover / Release Buttons

- **Take Over** — shown when `status !== HUMAN_HANDLING` and `!= CLOSED`
- **Release to AI** — shown when `status === HUMAN_HANDLING`

Both call the corresponding API endpoint and refresh the UI.

### Message Composer

The composer sends messages via `POST /messages/send`.

Response includes `sendStatus`:
- `META_SEND_DISABLED` — Meta channel, real delivery requires `OMNI_ENABLE_REAL_META_SEND=true`
- `STUB_NOT_SENT` — WhatsApp Web or other channel, stub send

No real WhatsApp messages are sent from the dashboard in Phase 8A.

---

## What Is Still Stub-Only

| Feature                          | Status     | Phase |
|----------------------------------|------------|-------|
| Real WhatsApp delivery           | Stub       | 9+    |
| Worker AI reply SSE events       | Not wired  | 8B    |
| Mobile PWA (/pwa)                | Placeholder| 9     |
| Full role/permission UI          | Not built  | 9+    |
| Customer stage/tag edit in UI    | Not built  | 9     |
| Conversation close in UI         | Not built  | 9     |
| Message pagination in thread UI  | Not built  | 9     |
| Redis pub/sub for multi-instance | Not built  | 8B    |

---

## Safety Notes

- All API endpoints are JWT-protected and tenant-scoped.
- No secrets, tokens, or `.env` values appear in responses or SSE payloads.
- `OMNI_ALLOW_WA_SESSION` is NOT enabled.
- `OMNI_ENABLE_REAL_META_SEND` is NOT enabled.
- No real Meta API calls are made from the dashboard.
- The SSE bus is process-scoped; see `docs/REALTIME_EVENTS.md` for multi-instance limitations.
