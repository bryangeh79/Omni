# Omni Follow-up Automation — Phase 9B

## Overview

Follow-up automation sends safe, scenario-based follow-up messages to customers who have gone quiet after key interactions. It is NOT a broadcast or marketing system — it targets individual conversations at specific points in the sales/support lifecycle.

---

## Data Models

### FollowUpRule (config, Phase 3E)

Tenant-level rule configuration. Lists trigger types, delay hours, and message templates. CRUD at `GET/POST/PATCH /automation/follow-up-rules`.

### FollowUpTask (runtime, Phase 9B)

Concrete scheduled instance for a specific customer/conversation at a specific time.

| Field | Type | Description |
|-------|------|-------------|
| `id` | cuid | Task ID |
| `tenantId` | string | Tenant isolation |
| `conversationId` | string | Which conversation |
| `customerId` | string | Which customer |
| `ruleId` | string? | Source rule (optional) |
| `scenario` | string | Trigger key |
| `stepIndex` | int | Which step in the chain (0=first) |
| `dueAt` | DateTime | When to process |
| `status` | FollowUpStatus | PENDING / DONE / CANCELLED / SKIPPED |
| `requiresHuman` | boolean | If true: human/admin reminder, not customer send |
| `suggestedMessage` | string? | Template-generated suggested message |
| `cancelledReason` | string? | CUSTOMER_REPLIED / MANUAL / CONVERSATION_CLOSED |

---

## Scenarios

| Scenario | Steps | Notes |
|----------|-------|-------|
| `PRICE_ASKED_NO_REPLY` | +2h, +24h, +72h | Customer asked price, no reply |
| `CONSIDERING` | +24h, +72h, +7d | Customer said considering/maybe later |
| `BOOKING_NOT_CONFIRMED` | +2h, +24h | Appointment not confirmed |
| `HIGH_INTENT_UNHANDLED` | +30min (human), +2h (boss) | High-intent in queue, no human action |
| `LONG_NO_REPLY` | +24h, +72h, +7d | General long silence |

---

## Safety Rules

| Rule | Enforcement |
|------|-------------|
| No real WhatsApp send | All outbound tasks create stub messages — `sendStatus: STUB_NOT_SENT` in default mode |
| No CLOSED conversation | Tasks for CLOSED conversations are SKIPPED by processor |
| No auto-send to HUMAN_HANDLING | Auto-send steps skipped; only `requiresHuman` tasks process |
| No blocked customer auto-send | Customers with tags: `complaint`, `refund`, `unhappy`, `blacklist`, `stop_contact` are skipped |
| Stop on customer reply | `cancelFollowUpChain()` called in message-router when inbound message arrives |
| No duplicate tasks | Idempotent: same `conversationId+scenario+stepIndex+PENDING` → skip |
| No broadcast/ads | Individual conversation targeting only; no bulk send |

---

## HIGH_INTENT_UNHANDLED Safety

This scenario creates `requiresHuman: true` tasks. These tasks:
- Create a **SYSTEM message visible to operators** (not sent to customer)
- Are displayed in the PWA as "Human" tasks
- Do NOT auto-send any message to the customer
- Remind human agents (+30min) and admins (+2h) to follow up

---

## Stop Conditions

A follow-up chain is cancelled when:
1. **Customer replies** — `cancelFollowUpChain()` fires automatically via `message-router.ts`
2. **Conversation closed** — SKIPPED by processor
3. **Manual cancel** — `POST /follow-ups/:id/cancel`
4. **Conversation moved to HUMAN_HANDLING** — auto-send steps are SKIPPED

---

## Processor Behavior

The follow-up processor runs every 2 minutes in the worker process:

1. Query `FollowUpTask WHERE status=PENDING AND dueAt <= now`
2. For each task (max 50 per cycle):
   - Safety check: CLOSED → SKIPPED
   - Safety check: HUMAN_HANDLING + !requiresHuman → SKIPPED
   - Safety check: blocked customer tags → CANCELLED
   - `requiresHuman=true` → Create `SYSTEM` message (`[FOLLOW-UP REMINDER] ...`)
   - `requiresHuman=false` → Create `SYSTEM` message (`[FOLLOW-UP STUB — NOT SENT] ...`)
   - Mark task DONE
   - Publish `followup.due` + `conversation.updated` via Redis
   - Schedule next step if available

---

## API

### GET /follow-ups

List follow-up tasks for the tenant.

```
GET /follow-ups?status=PENDING&today=true&overdue=true&requiresHuman=true
```

Response includes customer summary, conversation ID, dueAt, scenario, status, suggested message.

### POST /follow-ups/:id/complete

Mark a PENDING task as DONE. Publishes `followup.updated`.

### POST /follow-ups/:id/cancel

Cancel a PENDING task. Publishes `followup.updated`.

Body: `{ "reason": "MANUAL" }` (optional)

### POST /follow-ups/schedule-demo

Create a test task for smoke testing or UI demo. Uses first available open conversation.

Body: `{ "scenario": "PRICE_ASKED_NO_REPLY", "dueOffsetMinutes": 2 }`

### GET /follow-ups/scenarios

List all valid scenarios with step counts.

---

## PWA Follow-up Tab

The `/pwa` Follow-up tab (📅) shows:

- **Overdue tasks** (highlighted in red)
- **Today's pending tasks** (due today)
- For each task: customer name, scenario, due time, suggested message preview
- Actions: **Open Chat**, **Done** (complete), **Skip** (cancel)

Human reminder tasks are labeled with an orange "Human" badge.

---

## Realtime Events

| Event | Published when |
|-------|---------------|
| `followup.created` | New task scheduled (engine + schedule-demo API) |
| `followup.updated` | Task completed, cancelled, or chain cancelled |
| `followup.due` | Task processed by worker (due time reached) |

Payloads contain: taskId, conversationId, scenario, stepIndex, requiresHuman. No secrets.

---

## Production Limitations (Phase 9B)

| Limitation | Description |
|-----------|-------------|
| No real WhatsApp send | Tasks create stub messages; enable real send in Phase 10 |
| No AI-generated messages | Templates are hardcoded; Phase 10 can use LLM for personalization |
| Manual scheduling only | `scheduleFollowUp()` must be called explicitly; no automatic trigger from inbound message analysis yet |
| 2-minute poll interval | Tasks may fire up to 2 minutes late |
| Worker must be running | Follow-ups only process while `apps/worker` is active |
| No follow-up UI in /inbox | Visible in /pwa follow-up tab only; Phase 10 adds /inbox widget |

---

## Not Implemented (Phase 9B)

- Auto-trigger on AI analysis (e.g., when AI detects "price asked" intent)
- Snooze/reschedule via UI
- Customer opt-out tracking
- SMS / email follow-up channels
- Bulk follow-up rules (marketing campaigns) — intentionally excluded
- Follow-up analytics dashboard
