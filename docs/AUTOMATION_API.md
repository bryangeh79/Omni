# Omni — Automation Rules API Guide

## Overview

The Automation Rules API manages **follow-up** and **handoff** rule configurations. These rules define when the system should automatically follow up with a customer or hand a conversation over to a human agent.

> **Phase 3E is configuration-only.** Background scheduling, actual message sending, and rule evaluation are **not** implemented yet. Those will be added in Phase 4+.

---

## Authentication

All endpoints require a valid JWT access token:
```
Authorization: Bearer <accessToken>
```

---

## Follow-up Rules

A follow-up rule defines an automated outbound message to be sent to a customer after a configured delay when a specific trigger condition is detected.

### Trigger scenarios (product plan)

| Trigger | Description |
|---|---|
| `PRICE_ASKED_NO_REPLY` | Customer asked about price but didn't respond |
| `CONSIDERING` | Customer said they are considering |
| `BOOKING_NOT_CONFIRMED` | Appointment or booking was not confirmed |
| `HIGH_INTENT_UNHANDLED` | High-intent lead with no agent response |
| `LONG_NO_REPLY` | Long period of no response from customer |
| `APPOINTMENT_REMINDER` | Upcoming appointment reminder |
| `QUOTE_SENT_NO_RESPONSE` | Quote sent but no response received |

### Endpoints

#### GET /automation/follow-up-rules

```http
GET /automation/follow-up-rules?isActive=true&page=1&pageSize=50
Authorization: Bearer <token>
```

Query Parameters: `isActive` (`true`/`false`/omit for all), `page`, `pageSize`

Response includes `validTriggers` array for client reference.

#### POST /automation/follow-up-rules

```http
POST /automation/follow-up-rules
Authorization: Bearer <token>
Content-Type: application/json

{
  "trigger": "PRICE_ASKED_NO_REPLY",
  "delayHours": 24,
  "messageTemplate": "Hi! Following up on your price inquiry. Any questions?",
  "isActive": true
}
```

**Fields:**

| Field | Required | Constraints |
|---|---|---|
| `trigger` | Yes | Must be one of the valid trigger values |
| `delayHours` | Yes | Integer, 0–720 (0–30 days) |
| `messageTemplate` | Yes | Non-empty string |
| `isActive` | No | Default: `true` |

#### PATCH /automation/follow-up-rules/:id

Partial update. Updatable fields: `trigger`, `delayHours`, `messageTemplate`, `isActive`

Returns `404` if rule not found in current tenant.

---

## Handoff Rules

A handoff rule defines when a conversation should be escalated from AI to a human agent.

### Condition scenarios (product plan)

| Condition | Description |
|---|---|
| `USER_REQUESTS_HUMAN` | Customer explicitly asks for a human agent |
| `FAQ_NO_ANSWER` | AI cannot find an answer in the knowledge base |
| `AI_UNCERTAIN` | AI confidence score is too low |
| `SCORE_GTE_80` | Customer lead score reaches 80+ (urgent) |
| `QUOTE_PAYMENT_COMPLAINT` | Quote, payment, or complaint scenario |
| `REFUND_REQUEST` | Customer requests a refund |
| `REPEATED_QUESTIONING` | Customer asks the same question multiple times |
| `TECHNICAL_ISSUE` | Technical problem reported |
| `INSULT_OR_ABUSE` | Customer using abusive language |

### Endpoints

#### GET /automation/handoff-rules

```http
GET /automation/handoff-rules?isActive=true
Authorization: Bearer <token>
```

Response includes `validConditions` array for client reference.

#### POST /automation/handoff-rules

```http
POST /automation/handoff-rules
Authorization: Bearer <token>
Content-Type: application/json

{
  "condition": "USER_REQUESTS_HUMAN",
  "isActive": true
}
```

**Fields:**

| Field | Required | Constraints |
|---|---|---|
| `condition` | Yes | Must be one of the valid condition values |
| `isActive` | No | Default: `true` |

#### PATCH /automation/handoff-rules/:id

Partial update. Updatable fields: `condition`, `isActive`

Returns `404` if rule not found in current tenant.

---

## Seeded Demo Rules

The dev seed (`pnpm db:seed`) creates demo automation rules for the `omni-demo` tenant:

**Follow-up Rules (5):**
- `PRICE_ASKED_NO_REPLY` — 24h delay
- `CONSIDERING` — 48h delay
- `BOOKING_NOT_CONFIRMED` — 12h delay
- `HIGH_INTENT_UNHANDLED` — 2h delay
- `LONG_NO_REPLY` — 72h delay

**Handoff Rules (6):**
- `USER_REQUESTS_HUMAN`
- `FAQ_NO_ANSWER`
- `AI_UNCERTAIN`
- `SCORE_GTE_80`
- `QUOTE_PAYMENT_COMPLAINT`
- `REFUND_REQUEST`

---

## Phase Roadmap

| Phase | Feature |
|---|---|
| 3E (current) | Rule CRUD configuration only |
| 4 | Worker: evaluate follow-up rules against conversations, enqueue jobs |
| 4 | Worker: detect handoff conditions and trigger conversation takeover |
| 4 | Worker: actually send follow-up messages via WhatsApp adapter |
| 5 | Advanced: AI-driven rule suggestions, condition scoring |

---

## Tenant Isolation

- `tenantId` is **always** taken from `req.user.tenantId` (JWT token)
- Rules belonging to another tenant return `404`
- No cross-tenant existence is revealed

---

## Error Reference

| Status | Meaning |
|---|---|
| 400 | Validation error (invalid trigger/condition, delayHours out of range, empty messageTemplate) |
| 401 | Missing or invalid JWT |
| 404 | Rule not found (or belongs to another tenant) |
