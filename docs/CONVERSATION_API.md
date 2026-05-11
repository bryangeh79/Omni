# Omni — Conversation & Message API Guide

## Overview

The Conversation API powers the **Inbox**, **human takeover / release**, and **message send** features. All endpoints are **tenant-scoped** via the JWT access token. `tenantId` is never trusted from the request body.

---

## Authentication

All endpoints require a valid JWT access token:
```
Authorization: Bearer <accessToken>
```

---

## Conversation Endpoints

### GET /conversations — List Conversations (Inbox)

```http
GET /conversations?page=1&pageSize=20&status=AI_HANDLING&channelId=...&q=alice
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `page` | integer | Page number (default: 1) |
| `pageSize` | integer | Items per page (default: 20, max: 100) |
| `status` | string | Filter by status: `AI_HANDLING`, `HUMAN_HANDLING`, `PENDING_HANDOFF`, `CLOSED` |
| `channelId` | string | Filter by channel |
| `customerId` | string | Filter by customer |
| `q` | string | Search by customer name / phone / whatsappName |

Sorted by `lastMessageAt` desc by default.

**Response:**
```json
{
  "data": [
    {
      "id": "clx...",
      "tenantId": "...",
      "status": "AI_HANDLING",
      "assignedUserId": null,
      "lastMessageAt": "2026-05-11T10:00:00.000Z",
      "customer": {
        "id": "...",
        "name": "Alice Lim",
        "phone": "+60123456789",
        "whatsappName": "Alice",
        "stage": "HIGH_INTENT",
        "score": 75
      },
      "channel": {
        "id": "...",
        "type": "WHATSAPP_WEB",
        "displayName": "WhatsApp"
      },
      "lastMessage": {
        "content": "I'm interested in Plan A",
        "direction": "INBOUND",
        "senderType": "CUSTOMER",
        "createdAt": "2026-05-11T09:55:00.000Z"
      }
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 12, "totalPages": 1 }
}
```

---

### GET /conversations/:id — Conversation Detail

```http
GET /conversations/clx...
Authorization: Bearer <token>
```

Returns full conversation with customer card (including tags), channel details, and up to 50 recent messages (oldest first).

**Response:**
```json
{
  "id": "clx...",
  "status": "AI_HANDLING",
  "customer": {
    "id": "...",
    "name": "Alice Lim",
    "phone": "+60123456789",
    "stage": "HIGH_INTENT",
    "score": 75,
    "tags": ["high_intent", "price_inquiry"]
  },
  "channel": { "id": "...", "type": "WHATSAPP_WEB", "displayName": "WhatsApp" },
  "messages": [...],
  "messageCount": 7
}
```

Returns `404` if conversation does not exist in current tenant.

---

### POST /conversations/:id/takeover — Human Takeover

```http
POST /conversations/clx.../takeover
Authorization: Bearer <token>
```

Sets conversation status to `HUMAN_HANDLING` and assigns `req.user.userId` as the handler. Writes a SYSTEM message to the conversation.

**Response:**
```json
{ "conversationId": "clx...", "status": "HUMAN_HANDLING", "assignedUserId": "user-cuid..." }
```

Returns `400` if conversation is already `CLOSED`.

---

### POST /conversations/:id/release — Release to AI

```http
POST /conversations/clx.../release
Authorization: Bearer <token>
```

Sets status back to `AI_HANDLING` and clears `assignedUserId`. Writes a SYSTEM message.

**Response:**
```json
{ "conversationId": "clx...", "status": "AI_HANDLING", "assignedUserId": null }
```

---

### POST /conversations/:id/close — Close Conversation

```http
POST /conversations/clx.../close
Authorization: Bearer <token>
```

Sets status to `CLOSED`. Re-closing an already closed conversation is idempotent (returns 200). Writes a SYSTEM message.

**Response:**
```json
{ "conversationId": "clx...", "status": "CLOSED" }
```

---

## Message Endpoints

### GET /messages?conversationId= — List Messages

```http
GET /messages?conversationId=clx...&page=1&pageSize=50
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `conversationId` | string | **Required.** Conversation to list messages for |
| `page` | integer | Page number (default: 1) |
| `pageSize` | integer | Items per page (default: 50, max: 200) |

Sorted by `createdAt` ASC (oldest first — suitable for chat display).

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "conversationId": "clx...",
      "direction": "INBOUND",
      "senderType": "CUSTOMER",
      "content": "Hello, I need help",
      "isRead": false,
      "createdAt": "2026-05-11T09:00:00.000Z"
    },
    {
      "id": "...",
      "direction": "OUTBOUND",
      "senderType": "AI",
      "content": "Hi! How can I help you today?",
      "isRead": true,
      "createdAt": "2026-05-11T09:00:05.000Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 50, "total": 7, "totalPages": 1 }
}
```

Returns `404` if `conversationId` belongs to a different tenant.

---

### POST /messages/send — Human Agent Sends Message

```http
POST /messages/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "conversationId": "clx...",
  "body": "Hello, I have reviewed your request and..."
}
```

Writes an `OUTBOUND / HUMAN_AGENT` message to the database and updates `lastMessageAt` on the conversation.

**Phase 3C**: Real WhatsApp delivery is NOT implemented. The response includes `sendStatus: "STUB_NOT_SENT"`. Real delivery via the channel adapter will be added in Phase 4.

**Response (201):**
```json
{
  "id": "...",
  "conversationId": "clx...",
  "direction": "OUTBOUND",
  "senderType": "HUMAN_AGENT",
  "content": "Hello, I have reviewed your request and...",
  "isRead": true,
  "createdAt": "2026-05-11T10:00:00.000Z",
  "sendStatus": "STUB_NOT_SENT"
}
```

Returns `400` if `body` is empty, `404` if conversation not found in tenant, `400` if conversation is `CLOSED`.

---

## Message Types (senderType)

| senderType | Description |
|---|---|
| `CUSTOMER` | Message sent by the customer via WhatsApp |
| `AI` | AI agent auto-reply |
| `HUMAN_AGENT` | Message sent by a human agent via this API |
| `SYSTEM` | System event (takeover, release, close) — not visible to customer |

---

## Conversation Statuses

| Status | Description |
|---|---|
| `AI_HANDLING` | AI agent is managing this conversation |
| `HUMAN_HANDLING` | A human agent has taken over |
| `PENDING_HANDOFF` | Waiting for human agent to pick up |
| `CLOSED` | Conversation is closed |

---

## Inbox Use Case

For the **Inbox** feature in the mobile PWA:

1. `GET /conversations?status=AI_HANDLING` → show all active AI conversations
2. `GET /conversations?status=HUMAN_HANDLING` → conversations assigned to humans
3. `POST /conversations/:id/takeover` → agent picks up a conversation
4. `GET /messages?conversationId=:id` → load message history
5. `POST /messages/send` → agent replies
6. `POST /conversations/:id/release` → give back to AI
7. `POST /conversations/:id/close` → close the conversation

---

## Tenant Isolation

- `tenantId` is **always** taken from `req.user.tenantId` (JWT token)
- Fetching a conversation or message that belongs to another tenant returns `404`
- No cross-tenant existence is revealed to the client

---

## Internal Webhook

`POST /messages/webhook/:channelId` is an internal route used by channel adapters to deliver inbound messages. It does **not** require a JWT token (secured by network boundary + future channel secret in Phase 4).
