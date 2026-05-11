# Omni — Worker Queue Guide (Phase 4B)

## Overview

Omni uses **BullMQ** (built on Redis) for async job processing. The API enqueues jobs when inbound messages arrive; the Worker consumes and processes them.

**Phase 4B is stub mode:**
- Worker writes an AI placeholder reply to DB
- No real LLM call
- No real WhatsApp send
- Real AI: Phase 5+

---

## Stack

| Component | Technology | Port |
|---|---|---|
| Queue broker | Redis 7 (Docker) | **43114** |
| Queue library | BullMQ v5 | — |
| Redis client | ioredis v5 | — |
| Worker runtime | tsx / Node.js | no public port |

---

## Queue Names

| Queue | Name |
|---|---|
| Inbound messages | `omni-inbound-messages` |

---

## Job Types

### PROCESS_INBOUND_MESSAGE

Triggered when an inbound WhatsApp message is received.

**Payload (`InboundMessageJobData`):**
```typescript
{
  tenantId:       string   // tenant safety check before processing
  channelId:      string
  conversationId: string
  customerId:     string
  messageId:      string
  createdAt:      string   // ISO 8601
}
```

**What the worker does (Phase 4B):**
1. Verify conversation belongs to `tenantId` (safety check)
2. Skip if conversation is `CLOSED` or `HUMAN_HANDLING`
3. Write AI stub reply: `Direction.OUTBOUND / SenderType.AI`
4. Update `conversation.lastMessageAt`
5. **Does NOT call sendMessage** — no WhatsApp delivery yet

**What the worker does NOT do (Phase 5+):**
- Call real LLM / AI Agent Orchestrator
- Send outbound WhatsApp message
- Call adapter registry

---

## How API Enqueues

`apps/api/src/message-router.ts` calls `enqueueInboundMessage()` after writing the message to DB:

```
Inbound WhatsApp → WhatsAppWebAdapter
  → routeInboundMessage()
      → write Customer/Conversation/Message to DB  ← always happens
      → enqueueInboundMessage()                    ← non-fatal if Redis down
```

If Redis is unavailable, the DB write still succeeds and the API continues. The worker job is missed but the system remains operational.

---

## How to Run the Worker

### Long-running mode (production / dev)

```bash
# From project root
pnpm dev:worker

# Or directly
pnpm --filter @omni/worker dev
```

### Drain mode (smoke test / manual)

Process all pending jobs and exit:

```bash
pnpm worker:once

# Or directly
pnpm --filter @omni/worker once
```

---

## Smoke Test

Prerequisites: Redis on port 43114, Postgres on port 43113, demo seed applied.

The smoke test (`pnpm --filter @omni/api smoke`) includes queue verification:

1. Checks Redis availability on 43114
2. Creates a test conversation via Prisma
3. Enqueues a `PROCESS_INBOUND_MESSAGE` job directly via BullMQ
4. Runs `worker:once` to drain the queue
5. Verifies AI stub reply (`[AI_STUB]`) was written to DB
6. Verifies queue depth returns to 0
7. Cleans up test conversation

---

## Safety Rules

| Rule | Status |
|---|---|
| `sendMessage()` called | ❌ Never in Phase 4B |
| `OMNI_ALLOW_WA_SESSION=true` required | No — pure backend job |
| Real LLM called | ❌ Never in Phase 4B |
| DB write on job failure | ❌ — job retries up to 3 times |
| Tenant isolation check before processing | ✅ Always |
| PII in job payload | Job contains IDs only, not message content |

---

## Environment Variables

```
REDIS_URL=redis://localhost:43114
```

---

## Starting Docker (Redis + Postgres)

```powershell
# From C:\AI_WORKSPACE\Omni Ai Chatbot
docker compose up -d
```

---

## Future Phases

| Phase | Feature |
|---|---|
| 4B (current) | BullMQ queue, worker stub, AI placeholder reply |
| 5 | Real AI Agent Orchestrator + LLM call (OpenAI/Claude) |
| 5 | Follow-up scheduler: Worker evaluates automation rules on schedule |
| 5 | WhatsApp outbound delivery via adapter.sendMessage() |
| 6 | BullMQ Scheduler for follow-up jobs (delay + cron) |
