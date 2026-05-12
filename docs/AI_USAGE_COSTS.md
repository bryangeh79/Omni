# Omni — AI Usage & Cost Tracking

## Overview

Phase 6 implements the internal foundation for tracking AI token usage and estimated costs per tenant. This is **internal infrastructure only** — no customer-facing billing enforcement is applied in this phase.

---

## Cost Separation

Omni separates two distinct fee categories:

| Category | What it includes | Tracked in |
|---|---|---|
| **AI Costs** | LLM token usage (OpenAI / Gemini / DeepSeek) | `UsageRecord.llmCostUsd` |
| **WhatsApp / Meta fees** | Official message fees charged by Meta for Business API | Separate (future phase) |

Never conflate these two. A tenant's WhatsApp message fees are billed by Meta independently of AI processing costs.

---

## UsageRecord Schema

```prisma
model UsageRecord {
  id          String   @id @default(cuid())
  tenantId    String
  date        DateTime @db.Date
  llmTokens   Int      @default(0)   // total input + output tokens for the day
  llmCostUsd  Float    @default(0)   // estimated AI cost in USD (see note below)
  messages    Int      @default(0)   // number of AI-processed inbound messages
  createdAt   DateTime @default(now())

  @@unique([tenantId, date])
}
```

**Cost note:** `llmCostUsd` stores an estimated cost based on the provider pricing table in `packages/shared/src/ai-pricing.ts`. If pricing is unknown for the model used, the field stores `0`. This is an estimate — verify against provider invoices before any billing decisions.

---

## Pricing Table

All supported models and their pricing are defined in:

```
packages/shared/src/ai-pricing.ts
```

Each entry has:
- `inputCostPer1MTokensUsd` — cost per 1 million input tokens (null if unknown)
- `outputCostPer1MTokensUsd` — cost per 1 million output tokens (null if unknown)
- `isEstimate` — true if the price should be verified before use in billing
- `sourceNote` — the pricing page URL and date of last verification
- `lastVerifiedAt` — approximate YYYY-MM of last verification

**Null costs:** Models with `null` pricing (e.g. `gemini-2.5-pro`, `gemini-2.5-flash`) have unconfirmed pricing at the time of implementation. The cost calculator returns `null` for these, and `0` is written to `UsageRecord.llmCostUsd` as a safe fallback.

---

## Cost Calculation

```typescript
import { calculateAiCostUsd } from '@omni/shared'

const cost = calculateAiCostUsd({
  provider:     'OPENAI',
  model:        'gpt-4o-mini',
  inputTokens:  600,
  outputTokens: 100,
})
// Returns 0.000150 (USD) or null if pricing is unknown
```

- Returns `null` if the model is not in the pricing table or pricing is null
- Rounds to 6 decimal places for precision
- Worker falls back to `0` when `calculateAiCostUsd` returns `null` (schema requires non-nullable Float)

---

## API Endpoints

### `GET /usage/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
Returns tenant-scoped usage totals and daily breakdown.

```json
{
  "tenantId": "...",
  "from": "2025-01-01",
  "to": "2025-01-31",
  "totalMessages": 450,
  "totalAiReplies": 450,
  "totalLlmTokens": 315000,
  "totalLlmCostUsd": 0.047250,
  "costNote": "AI costs are internal estimates...",
  "records": [
    { "date": "2025-01-01", "messages": 15, "llmTokens": 10500, "llmCostUsd": 0.001575 }
  ]
}
```

### `GET /usage/ai-costs`
Returns the full provider pricing table. No tenant data included.

### `POST /usage/cost-calculator`
Internal estimation calculator. See `docs/BILLING_COST_CALCULATOR.md`.

---

## Future Platform AI Credits

The `UsageRecord` model is designed to support future platform-level AI:
- When Omni offers a **Platform Default** AI provider (not tenant key), the platform absorbs the API cost
- Per-tenant `UsageRecord` tracks usage against plan limits
- Package tiers (Starter / Pro / Business) will set monthly AI token quotas
- This phase lays the tracking foundation — quota enforcement is a future phase

---

## What This Phase Does NOT Do

- Does not enforce subscription limits
- Does not gate AI replies based on usage
- Does not implement payment collection
- Does not expose cost data in customer-facing UI
- Does not calculate WhatsApp / Meta official message fees
