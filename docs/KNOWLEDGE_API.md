# Omni — Knowledge Base API Guide

## Overview

The Knowledge Base stores FAQ and content that the AI Agent uses to answer customer questions. It supports **multilingual** content (zh/en/ms) and three item types. All endpoints are **tenant-scoped** via the JWT access token.

---

## Knowledge Item Types

| Type | Usage | question | answer |
|---|---|---|---|
| `GLOBAL_FAQ` | General company/service FAQ | **Required** | Required |
| `PRODUCT_FAQ` | Product or service-specific Q&A | **Required** | Required |
| `KNOWLEDGE_CHUNK` | Free-form content (brochure extracts, price list, etc.) | Optional | Required |

**When to use KNOWLEDGE_CHUNK:** For content that doesn't follow a Q&A format — e.g., product descriptions, terms, schedules. The AI Agent can still retrieve and use these chunks when answering customer questions.

---

## Multilingual Support

Each item has a `language` field:

| Language | Code |
|---|---|
| Chinese | `zh` |
| English | `en` |
| Malay | `ms` |

**Default:** `zh` if not specified at creation.

Items with different languages can coexist. The AI Agent should query items matching the customer's detected language (or the tenant default language) when building responses.

---

## Authentication

All endpoints require a valid JWT access token:
```
Authorization: Bearer <accessToken>
```

---

## Endpoints

### GET /knowledge — List Knowledge Items

```http
GET /knowledge?page=1&pageSize=20&type=GLOBAL_FAQ&language=zh&isActive=true&q=价格
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `page` | integer | Page number (default: 1) |
| `pageSize` | integer | Items per page (default: 20, max: 100) |
| `type` | string | Filter by type: `GLOBAL_FAQ`, `PRODUCT_FAQ`, `KNOWLEDGE_CHUNK` |
| `language` | string | Filter by language: `zh`, `en`, `ms` |
| `isActive` | boolean string | `true` = active only, `false` = inactive only, omit = all |
| `q` | string | Free-text search across question and answer (case-insensitive) |

Sorted by `updatedAt` desc by default.

**Response:**
```json
{
  "data": [
    {
      "id": "clx...",
      "tenantId": "...",
      "type": "GLOBAL_FAQ",
      "language": "zh",
      "question": "你们的服务是什么？",
      "answer": "Omni 是 WhatsApp AI 客服 CRM 成交系统。",
      "isActive": true,
      "createdAt": "2026-05-11T10:00:00.000Z",
      "updatedAt": "2026-05-11T10:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 8, "totalPages": 1 }
}
```

---

### GET /knowledge/:id — Get Knowledge Item Detail

```http
GET /knowledge/clx...
Authorization: Bearer <token>
```

Returns `404` if item does not exist in the current tenant.

---

### POST /knowledge — Create Knowledge Item

```http
POST /knowledge
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "GLOBAL_FAQ",
  "question": "你们的营业时间是？",
  "answer": "我们的 AI 全天候 24 小时服务。",
  "language": "zh",
  "isActive": true
}
```

**Fields:**

| Field | Required | Description |
|---|---|---|
| `type` | Yes | `GLOBAL_FAQ`, `PRODUCT_FAQ`, or `KNOWLEDGE_CHUNK` |
| `answer` | Yes | The answer or content |
| `question` | Required for FAQ types | Optional for `KNOWLEDGE_CHUNK` |
| `language` | No | Default: `zh` |
| `isActive` | No | Default: `true` |

**Response:** `201 Created` with the created item.

---

### PATCH /knowledge/:id — Update Knowledge Item

```http
PATCH /knowledge/clx...
Authorization: Bearer <token>
Content-Type: application/json

{
  "answer": "Updated answer text.",
  "isActive": true
}
```

Updatable fields: `type`, `question`, `answer`, `language`, `isActive`

Only fields present in the body are updated. Pass `null` to `question` to clear it (for KNOWLEDGE_CHUNK conversion).

Returns `404` if item not found in current tenant.

---

### DELETE /knowledge/:id — Soft Delete

```http
DELETE /knowledge/clx...
Authorization: Bearer <token>
```

**Soft delete:** sets `isActive = false`. The item remains in the database and is still retrievable by ID. Use `GET /knowledge?isActive=false` to list inactive items.

Re-deleting an already-inactive item is **idempotent** (returns 200).

**Response:**
```json
{ "id": "clx...", "isActive": false }
```

---

### POST /knowledge/search — Keyword Search

```http
POST /knowledge/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "q": "价格",
  "language": "zh",
  "type": "PRODUCT_FAQ",
  "limit": 10
}
```

**Fields:**

| Field | Required | Description |
|---|---|---|
| `q` | Yes | Search query (case-insensitive, non-empty) |
| `language` | No | Filter by language |
| `type` | No | Filter by type |
| `limit` | No | Max results (default: 20, max: 50) |

**Ranking:** Question matches are returned before answer-only matches. Within each group, sorted by `updatedAt` desc.

**Note:** This is a **keyword search placeholder**. Phase 4+ will add vector/semantic search (embeddings) for more accurate retrieval.

Only searches `isActive = true` items.

**Response:**
```json
{
  "data": [...],
  "total": 3,
  "note": "Keyword search placeholder — vector/semantic search in Phase 4"
}
```

---

## Tenant Isolation

- `tenantId` is **always** taken from `req.user.tenantId` (JWT token)
- Fetching an item that belongs to another tenant returns `404`
- Cross-tenant existence is never revealed

---

## Seeded Demo Data

The dev seed (`pnpm db:seed`) creates 8 demo KB items:
- 3 Chinese (zh): 2 GLOBAL_FAQ + 1 PRODUCT_FAQ
- 3 English (en): 2 GLOBAL_FAQ + 1 PRODUCT_FAQ
- 2 Malay (ms): 2 GLOBAL_FAQ

These are owned by the `omni-demo` tenant.

---

## Phase Roadmap

| Phase | Feature |
|---|---|
| 3D (current) | CRUD + keyword search |
| 4 | Vector embeddings, semantic search |
| 5 | File upload + parsing (PDF/brochure) → auto-generate chunks |
| 5+ | AI-driven FAQ generation from uploaded materials |
