# Omni Real-Time Events — Phase 8A

## Overview

Omni uses **Server-Sent Events (SSE)** to push real-time updates to connected dashboard clients.

The SSE endpoint is available at:

```
GET /realtime/events
```

All events are **tenant-scoped** — a connected client only receives events for the tenant encoded in the JWT.

---

## Authentication

The SSE endpoint requires a valid JWT access token. Because browser `EventSource` does not support custom headers, the token is passed as a query parameter:

```
GET /realtime/events?token=<access_jwt>
```

Non-browser clients can also use the standard header:

```
Authorization: Bearer <access_jwt>
```

An invalid or missing token returns HTTP 401 immediately (before opening the stream).

---

## Event Format

Each event uses the SSE standard format:

```
id: <integer>
event: <event_type>
data: <JSON>

```

The `data` JSON always includes a `ts` field (ISO-8601 timestamp).

### Heartbeat

A comment-only heartbeat is sent every 30 seconds to prevent proxy/browser timeouts:

```
:heartbeat
```

### Connected confirmation

On successful connection, a `connected` event is sent once:

```
event: connected
data: {"tenantId": "..."}
```

---

## Event Types

### `conversation.message.created`

Fired when a new message is written to a conversation.

```json
{
  "conversationId": "...",
  "messageId": "...",
  "direction": "INBOUND" | "OUTBOUND",
  "senderType": "CUSTOMER" | "HUMAN_AGENT" | "AI" | "SYSTEM",
  "ts": "2026-05-13T..."
}
```

Published from:
- `message-router.ts` — inbound messages arriving via webhooks (API process only)
- `POST /messages/send` — human agent manual send

**Not published from:** Worker AI replies (see limitation below).

### `conversation.updated`

Fired when a conversation's status, assignment, or `lastMessageAt` changes.

```json
{
  "conversationId": "...",
  "status": "AI_HANDLING" | "HUMAN_HANDLING" | "PENDING_HANDOFF" | "CLOSED",
  "lastMessageAt": "2026-05-13T...",
  "ts": "2026-05-13T..."
}
```

Published from:
- Takeover / release-ai / close endpoints
- After message write (updates `lastMessageAt`)

### `conversation.handoff.updated`

Fired specifically when takeover or release-ai changes the handoff state.

```json
{
  "conversationId": "...",
  "status": "HUMAN_HANDLING" | "AI_HANDLING",
  "assignedUserId": "..." | null,
  "ts": "2026-05-13T..."
}
```

### `customer.updated`

Reserved for future customer stage / score / tag changes.

---

## Frontend Usage

```typescript
import { createRealtimeConnection } from '@/lib/api'

const src = createRealtimeConnection(
  (type, data) => {
    if (type === 'conversation.message.created') { /* refresh thread */ }
    if (type === 'conversation.updated')         { /* refresh list item */ }
  },
  () => console.log('SSE connected'),
)

// Close on unmount
return () => src?.close()
```

---

## Phase 8A Limitations

### Process-scoped bus

The event bus is implemented as a Node.js `EventEmitter` inside the API process. This means:

- Events are **not shared** across multiple API instances.
- If you run multiple API pods, clients connected to different pods may miss events from other pods.
- **Workaround (Phase 8B+):** Replace with Redis pub/sub (`ioredis` already in dependencies).

### Worker AI replies not delivered

The BullMQ worker runs in a **separate Node.js process** (`apps/worker`). AI reply events (when the AI writes a message to the DB) are not published to the SSE bus because in-process event emitters do not cross process boundaries.

**Dashboard behavior:** The inbox page polls `loadThread()` when the conversation is selected, and `loadList()` on all SSE events. When an AI reply arrives (from the worker), the client will see it on the next poll cycle or when the next user interaction triggers a refresh.

**Phase 8B fix:** Use Redis pub/sub from both the API and worker processes.

---

## TODO (Phase 8B+)

- Replace `EventEmitter` bus with Redis pub/sub
- Publish AI reply events from `apps/worker/src/job-processor.ts`
- Publish `customer.updated` from customer stage/score/tag update routes
- Add `conversation.created` event for new conversation routing
- Add per-event filtering (client subscribes to specific conversation IDs)
