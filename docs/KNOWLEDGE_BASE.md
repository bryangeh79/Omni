# Omni Knowledge Base — Phase 12A

## Overview

The Knowledge Base stores FAQ and knowledge items derived from onboarding materials. These items are used by the AI agent to answer customer questions.

## Item Types

| Type | Description | Created by |
|------|-------------|-----------|
| `GLOBAL_FAQ` | General business FAQ (hours, location, contact) | Manual or admin |
| `PRODUCT_FAQ` | Product/service-specific Q&A | Materials ingestion |
| `KNOWLEDGE_CHUNK` | Unstructured knowledge paragraphs | Materials ingestion |

## API

### GET /knowledge

List knowledge items. Tenant-scoped via JWT.

Query params:
- `type` — filter by type (`GLOBAL_FAQ`, `PRODUCT_FAQ`, `KNOWLEDGE_CHUNK`)
- `isActive` — `true` / `false` (default: all)
- `page`, `pageSize`

### POST /knowledge

Create a knowledge item manually.

```json
{ "type": "GLOBAL_FAQ", "question": "...", "answer": "...", "language": "en" }
```

### PATCH /knowledge/:id

Update a knowledge item.

### DELETE /knowledge/:id

Soft-delete (sets `isActive=false`). Idempotent.

### POST /knowledge/search

Semantic search (Phase 12B — currently returns full list filtered by query).

---

## Materials Ingestion (Phase 12A)

### POST /onboarding/ingest-materials

Parses the onboarding draft's `materialsText` into `KnowledgeItem` records.

**Parsing rules:**
1. Split text on double-newlines or `---` separators
2. Q&A detection: paragraphs matching `Q: ... A: ...` or `Q. ... A. ...` → `PRODUCT_FAQ`
3. Paragraphs containing `?` → heuristic Q&A (question = first sentence, answer = rest) → `PRODUCT_FAQ`
4. Other paragraphs (>20 chars) → `KNOWLEDGE_CHUNK`
5. Maximum 20 items per ingestion

**Idempotency:** Stores `ingestedAt` timestamp in `OnboardingDraft.generatedPreview` JSON field. Calling again returns `alreadyDone: true` without duplicating items.

**Safety:** No AI provider calls. No WhatsApp sends. No schema migration needed.

---

## Web Page

`/knowledge` — lists all KB items for the tenant with:
- Type badge (Global FAQ / Product FAQ / Knowledge)
- Question (if present)
- Answer preview (3 lines)
- Created date
- Delete action (soft delete with confirm)
- Filter by type

---

## Limitations (Phase 12A)

- Materials text parsed deterministically — no AI-powered chunking or embedding
- No semantic vector search (Phase 12B)
- No duplicate detection on ingestion
- PDF/file upload not implemented
- No KB item edit UI (delete only)
- Max 20 items per ingestion run
