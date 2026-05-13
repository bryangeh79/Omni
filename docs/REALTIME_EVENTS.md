# Omni Real-Time Events — Phase 8B

## Overview

Omni uses **Server-Sent Events (SSE)** backed by **Redis pub/sub** to push real-time updates to connected dashboard clients across multiple API instances and the worker process.

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│  API Process                                           │
│  ┌──────────┐    publishEvent()                        │
│  │ Routes   │──→ Redis PUBLISH                         │
│  └──────────┘    omni:realtime:tenant:<tenantId>       │
│                          │                             │
│  ┌──────────┐    Redis PMESSAGE (sub connection)       │
│  │ realtime │←─ localBus.emit()                        │
│  │  -bus    │──→ SSE write to client                   │
│  └──────────┘                                          │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  Worker Process                                        │
│  ┌──────────────────┐    workerPublishEvent()          │
│  │ job-processor.ts │──→ Redis PUBLISH                 │
│  └──────────────────┘    omni:realtime:tenant:<id>     │
└────────────────────────────────────────────────────────┘
           │
           ▼ (Redis distributes to all subscribers)
           API Process sub connection → localBus → SSE client
```

### Components

| Component | File | Role |
|-----------|------|------|
| Realtime bus | `apps/api/src/realtime-bus.ts` | Redis pub/sub + in-memory dispatch |
| SSE route | `apps/api/src/routes/realtime.ts` | HTTP SSE endpoint + status |
| Worker publisher | `apps/worker/src/realtime-publisher.ts` | Redis publish after AI writes |
| Shared types | `packages/shared/src/realtime-events.ts` | Types, channel names |

---

## Redis Channel Naming

| Scope | Channel |
|-------|---------|
| Tenant-scoped | `omni:realtime:tenant:<tenantId>` |
| PSUBSCRIBE pattern | `omni:realtime:tenant:*` |

The API subscriber uses `PSUBSCRIBE` on the pattern so one connection covers all tenants.

---

## SSE Endpoint

### Authentication

`GET /realtime/events?token=<access_jwt>`

Accepts the JWT access token via:
- `?token=` query parameter — required for browser `EventSource` (cannot set headers)
- `Authorization: Bearer <token>` header — for non-browser clients

No token or invalid token → HTTP 401.

### Status Endpoint

`GET /realtime/status` — no auth required

```json
{
  "redisLive": true,
  "mode": "redis-pubsub",
  "limitation": null
}
```

When Redis is unavailable:
```json
{
  "redisLive": false,
  "mode": "in-memory-fallback",
  "limitation": "Redis unavailable: events are in-process only; worker AI reply events not delivered"
}
```

---

## Event Format

```
id: <integer>
event: <event_type>
data: <JSON>

```

The `data` JSON always includes a `ts` field (ISO-8601 timestamp). No secrets, tokens, or encrypted blobs may appear in any event payload.

### Heartbeat

A comment-only keepalive is sent every 30 seconds:

```
:heartbeat
```

### Connected Confirmation

Sent immediately on connection success:

```
event: connected
data: {"tenantId": "...", "transport": "redis"}
```

`transport` is `"redis"` when Redis pub/sub is active, `"memory"` when falling back to in-process only.

---

## Event Types

### `conversation.message.created`

A new message was created (inbound via webhook or outbound via human agent send).

```json
{
  "conversationId": "...",
  "messageId": "...",
  "direction": "INBOUND" | "OUTBOUND",
  "senderType": "CUSTOMER" | "HUMAN_AGENT",
  "ts": "..."
}
```

Published from:
- `apps/api/src/message-router.ts` (inbound webhook messages — API process)
- `POST /messages/send` (human agent manual send — API process)

### `ai.reply.created`

The AI worker has written an AI reply to the database.

```json
{
  "conversationId": "...",
  "direction": "OUTBOUND",
  "senderType": "AI",
  "ts": "..."
}
```

Published from:
- `apps/worker/src/job-processor.ts` → Redis → API SSE

### `conversation.updated`

A conversation's status or `lastMessageAt` changed.

```json
{
  "conversationId": "...",
  "status": "AI_HANDLING" | "HUMAN_HANDLING" | "PENDING_HANDOFF" | "CLOSED",
  "lastMessageAt": "...",
  "ts": "..."
}
```

Published from: takeover, release-ai, close, message send, worker AI reply.

### `conversation.handoff.updated`

Specifically when takeover or release-ai changes handoff state.

```json
{
  "conversationId": "...",
  "status": "HUMAN_HANDLING" | "AI_HANDLING" | "PENDING_HANDOFF",
  "assignedUserId": "..." | null,
  "ts": "..."
}
```

### `customer.updated`

Reserved for customer stage/score/tag changes (Phase 9).

### `worker.job.failed`

Reserved for worker job failure notifications (Phase 9).

---

## Frontend Usage

```typescript
import { createRealtimeConnection } from '@/lib/api'

const src = createRealtimeConnection(
  (type, data) => {
    // 'ai.reply.created', 'conversation.updated', etc.
    const convId = (data as { conversationId?: string }).conversationId
    if (convId === openConversationId) refreshThread(convId)
    refreshList()
  },
  (transport) => {
    // transport: 'redis' | 'memory' | 'unknown'
    console.log('SSE connected, transport:', transport)
  },
)

// Close on unmount:
return () => src?.close()
```

The inbox status indicator shows:
- Green dot = Redis pub/sub live (all events including worker AI replies)
- Yellow dot = In-memory fallback (API-process events only; worker events may lag)
- Grey dot = Disconnected

---

## Fallback Behavior (Redis Unavailable)

When Redis is not reachable at API startup:

1. `initRealtimeBus()` catches the connection failure, logs a warning, and operates in **in-memory mode**.
2. `publishEvent()` emits directly to the local `EventEmitter` (`localBus`).
3. SSE clients connected to the **same API instance** receive in-process events (inbound webhook, human send, takeover/release).
4. **Worker AI reply events are NOT delivered** — the worker's `workerPublishEvent()` will also fail (Redis unavailable) and log a warning without interrupting the DB write.
5. DB writes in both API and worker always succeed regardless of Redis state.
6. The `/realtime/status` endpoint returns `redisLive: false` so operators can detect degraded mode.

**Recovery**: If Redis comes back online, restart the API to re-establish connections. Auto-reconnect is not implemented in Phase 8B (retryStrategy gives up after 2 retries on startup).

---

## Phase 8B Limitations

- **Worker events require Redis**: AI reply events from `apps/worker` only reach SSE when Redis is live.
- **Startup-only retry**: IORedis retries 2 times on startup then gives up. Post-startup Redis loss requires API restart to recover subscription.
- **No client-side reconnect logic**: Browser `EventSource` auto-reconnects but will re-send the `connected` event; the inbox refreshes the list on reconnect.
- **No event fan-out filtering**: All tenant SSE clients receive all tenant events. Per-conversation filtering is Phase 9.

---

## TODO (Phase 9+)

- Auto-reconnect Redis pub/sub after runtime failure without API restart
- Publish `customer.updated` events from customer stage/score/tag routes
- Publish `worker.job.failed` events on worker errors
- Per-conversation SSE subscription filtering
- Replace SSE with WebSocket if bidirectional communication needed
