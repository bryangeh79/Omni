# Omni — CRM Customer API Guide

## Overview

The `/customers` API is the core CRM layer of Omni. It manages customer profiles, lead stages, scores, and tags. All endpoints are **tenant-scoped**: `tenantId` is always derived from the JWT access token — never from request body or query string.

---

## Authentication

All `/customers` endpoints require a valid JWT access token:

```
Authorization: Bearer <accessToken>
```

Obtain a token via `POST /auth/login` — see [docs/AUTH.md](./AUTH.md).

---

## Endpoints

### GET /customers — List Customers

```http
GET /customers?page=1&pageSize=20&stage=NEW&minScore=30&tag=high_intent&language=zh&q=alice
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `page` | integer | Page number (default: 1) |
| `pageSize` | integer | Items per page (default: 20, max: 100) |
| `stage` | string | Filter by lead stage (see LeadStage enum) |
| `minScore` | integer | Minimum score (0-100) |
| `maxScore` | integer | Maximum score (0-100) |
| `tag` | string | Filter customers that have this tag |
| `language` | string | Filter by languagePreference (`zh`, `en`, `ms`) |
| `source` | string | Filter by source (exact match) |
| `q` | string | Free-text search: name, phone, company, whatsappName |

**Response:**
```json
{
  "data": [
    {
      "id": "clx...",
      "tenantId": "...",
      "phone": "+60123456789",
      "name": "Alice Lim",
      "stage": "HIGH_INTENT",
      "score": 75,
      "tags": ["high_intent", "price_inquiry"],
      "updatedAt": "2026-05-11T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

---

### GET /customers/:id — Get Customer Detail

```http
GET /customers/clx...
Authorization: Bearer <token>
```

Returns full customer card including tags, recent conversations, and conversation count.

**Response:**
```json
{
  "id": "clx...",
  "tenantId": "...",
  "phone": "+60123456789",
  "name": "Alice Lim",
  "whatsappName": "Alice",
  "company": "Acme Corp",
  "industry": "Retail",
  "region": "Kuala Lumpur",
  "languagePreference": "zh",
  "source": "WhatsApp",
  "interestedProduct": "Plan A",
  "need": "Looking for automation",
  "budget": "RM 500/month",
  "purchaseTiming": "This month",
  "urgency": 4,
  "painPoint": "Manual follow-ups take too long",
  "stage": "HIGH_INTENT",
  "score": 75,
  "ownerId": null,
  "nextFollowUpAt": null,
  "notes": "Very interested, awaiting demo",
  "isBlacklisted": false,
  "tags": ["high_intent", "price_inquiry"],
  "conversationCount": 3,
  "lastMessageAt": "2026-05-11T09:30:00.000Z",
  "recentConversations": [...]
}
```

Returns `404` if the customer does not exist in the current tenant.

---

### POST /customers — Create Customer

```http
POST /customers
Authorization: Bearer <token>
Content-Type: application/json

{
  "phone": "+60123456789",
  "name": "Alice Lim",
  "company": "Acme Corp",
  "languagePreference": "zh",
  "stage": "NEW",
  "score": 0
}
```

**Required:** `phone`

**Optional CRM fields:** `whatsappName`, `name`, `company`, `industry`, `region`, `languagePreference`, `source`, `interestedProduct`, `need`, `budget`, `purchaseTiming`, `urgency` (1-5), `painPoint`, `stage`, `score` (0-100), `ownerId`, `nextFollowUpAt` (ISO 8601), `notes`, `isBlacklisted`

**Validation:**
- `phone` is required and must be non-empty
- `score` must be 0–100
- `urgency` must be 1–5
- `languagePreference` must be `zh`, `en`, or `ms`
- `stage` must be a valid LeadStage value

**Duplicate phone:** Returns `409` with `{ error: "...", customerId: "<existingId>" }`

**Response:** `201 Created` with the created customer object.

---

### PATCH /customers/:id — Update Customer

```http
PATCH /customers/clx...
Authorization: Bearer <token>
Content-Type: application/json

{
  "stage": "HIGH_INTENT",
  "score": 75,
  "notes": "Called today, very interested",
  "nextFollowUpAt": "2026-05-15T10:00:00.000Z"
}
```

Updatable fields: `name`, `whatsappName`, `company`, `industry`, `region`, `languagePreference`, `source`, `interestedProduct`, `need`, `budget`, `purchaseTiming`, `urgency`, `painPoint`, `stage`, `score`, `ownerId`, `nextFollowUpAt`, `notes`, `isBlacklisted`

Only fields present in the body are updated (partial update). Pass `null` to clear an optional field.

Returns `404` if customer not found in the current tenant. Returns `400` for validation errors.

---

### POST /customers/:id/tags — Add Tag

```http
POST /customers/clx.../tags
Authorization: Bearer <token>
Content-Type: application/json

{
  "tag": "high_intent"
}
```

Adding a tag that already exists is idempotent (returns `201`, no error).

**Response:** `201` with `{ customerId, tags: string[] }`

---

### DELETE /customers/:id/tags/:tag — Remove Tag

```http
DELETE /customers/clx.../tags/high_intent
Authorization: Bearer <token>
```

**Response:** `200` with `{ customerId, tags: string[] }` (remaining tags)

---

## Lead Stages

| Stage | Description |
|---|---|
| `NEW` | New customer, not yet engaged |
| `INTERESTED` | Showed interest |
| `HIGH_INTENT` | Strong purchase intent |
| `QUOTED` | Quote sent |
| `BOOKED` | Booking confirmed |
| `WON` | Purchase completed |
| `LOST` | Deal lost |
| `AFTER_SALES` | Post-purchase support |

---

## Lead Score Bands

| Range | Label |
|---|---|
| 0–29 | Normal |
| 30–59 | Interested |
| 60–79 | High Intent |
| 80–100 | Urgent |

---

## Common Customer Tags

Suggested tags (any string is valid; below are recommended conventions):

```
new_customer     old_customer     high_intent      price_inquiry
quoted           booked           waiting_reply    needs_follow_up
needs_human      complaint        after_sales      technical_issue
payment_issue    won              lost             blacklist
```

---

## Tenant Isolation

- `tenantId` is **always** taken from `req.user.tenantId` (the JWT token)
- The request body and query string cannot supply or override `tenantId`
- Requests for a customer ID that exists in a different tenant return `404` (no cross-tenant existence leak)

---

## Error Reference

| Status | Meaning |
|---|---|
| 400 | Validation error (missing required field, invalid enum/range) |
| 401 | Missing or invalid JWT |
| 404 | Customer not found (or belongs to another tenant) |
| 409 | Duplicate phone in the same tenant |
