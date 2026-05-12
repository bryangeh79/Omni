# Omni — Internal Billing Cost Calculator

## Purpose

The cost calculator (`POST /usage/cost-calculator`) is an **internal planning tool** for estimating monthly operating costs for a given usage profile. It is:

- Protected by tenant JWT (not publicly accessible)
- NOT customer-facing
- NOT enforced in the product
- Useful for internal pricing analysis and package design

---

## Endpoint

```http
POST /usage/cost-calculator
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### Required Input Fields

| Field | Type | Description |
|---|---|---|
| `monthlyActiveCustomers` | number | Number of active customers per month |
| `avgAiRepliesPerCustomer` | number | Average AI replies generated per customer per month |
| `avgInputTokensPerReply` | number | Average input tokens per AI call |
| `avgOutputTokensPerReply` | number | Average output tokens per AI call |
| `provider` | string | AI provider: OPENAI, GEMINI, DEEPSEEK |
| `model` | string | Provider model name |

### Optional Input Fields

| Field | Type | Description |
|---|---|---|
| `whatsappChannels` | number | Number of WhatsApp channels |
| `metaMessageCostUsd` | number | Estimated Meta message fee per reply (USD) |
| `serverCostUsd` | number | Monthly server/infrastructure cost (USD) |
| `supportCostUsd` | number | Monthly support cost (USD) |
| `targetGrossMarginPct` | number | Target gross margin % (0–99) |

### Example Request

```json
{
  "monthlyActiveCustomers":  200,
  "avgAiRepliesPerCustomer": 8,
  "avgInputTokensPerReply":  700,
  "avgOutputTokensPerReply": 120,
  "provider":                "OPENAI",
  "model":                   "gpt-4o-mini",
  "serverCostUsd":           80,
  "supportCostUsd":          50,
  "targetGrossMarginPct":    40
}
```

### Example Response

```json
{
  "note": "Internal cost calculator — NOT customer-facing. Verify provider pricing before any billing use.",
  "inputs": { "...": "echoed back" },
  "estimatedAiReplies":          1600,
  "estimatedTokens":             1312000,
  "estimatedAiCostUsd":          0.2136,
  "estimatedMetaMessageCostUsd": null,
  "estimatedTotalCostUsd":       130.2136,
  "suggestedMinimumPriceUsd":    217.0227
}
```

---

## Calculation Logic

```
estimatedAiReplies    = monthlyActiveCustomers × avgAiRepliesPerCustomer
estimatedInputTokens  = estimatedAiReplies × avgInputTokensPerReply
estimatedOutputTokens = estimatedAiReplies × avgOutputTokensPerReply
estimatedTokens       = estimatedInputTokens + estimatedOutputTokens

perReplyAiCost        = calculateAiCostUsd(provider, model, avgInput, avgOutput)
estimatedAiCostUsd    = perReplyAiCost × estimatedAiReplies  (or null if pricing unknown)

estimatedTotalCostUsd = estimatedAiCostUsd + metaMessageCost + serverCost + supportCost
                        (null if any required component is null)

suggestedMinimumPriceUsd = estimatedTotalCostUsd / (1 - targetGrossMarginPct / 100)
```

---

## Null Handling

When AI provider pricing is not confirmed (e.g. `gemini-2.5-pro`):
- `estimatedAiCostUsd` → `null`
- `estimatedTotalCostUsd` → `null`
- `suggestedMinimumPriceUsd` → `null`

This prevents accidentally using unverified pricing in business decisions. Always verify current rates at the provider's pricing page before using these numbers.

---

## Business Context (Planning Only)

The following package tiers are business planning context only. **They are not enforced in this phase.**

| Package | Price Range (MYR/month) | Target Segment |
|---|---|---|
| Starter | ~RM199 | Small businesses, few WhatsApp channels |
| Pro | ~RM499 | Growing SMBs, multiple channels |
| Business | RM999+ | Larger operations, high volume |

Use the cost calculator to validate whether these price points achieve the target gross margin at expected usage levels. AI cost is typically a small fraction of total operating cost at moderate usage.

---

## Notes

- AI costs use estimated token pricing from `packages/shared/src/ai-pricing.ts`
- WhatsApp/Meta message fees are separate from AI costs and must be calculated independently
- This calculator does not access real provider APIs
- All costs are in USD; convert to MYR using current exchange rate for local pricing
