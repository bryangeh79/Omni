# Omni Cost / Pricing Calculator — Phase 11A

## Purpose

Internal planning tool to model costs and margins for different customer scenarios. **Not customer-facing billing.**

Separates:
1. AI LLM costs (your infrastructure cost)
2. Meta WhatsApp message fees (passed-through platform cost)
3. Server / infrastructure costs
4. Support costs

---

## API Endpoints

### GET /admin/cost-calculator/defaults

Public — returns default pricing assumptions.

### GET /admin/cost-calculator/packages

Public — returns package definitions.

### POST /admin/cost-calculator/estimate

Requires OWNER or ADMIN role. Returns deterministic cost/margin model.

**Request body:**
```json
{
  "tenantCount": 10,
  "activeCustomersPerTenant": 100,
  "avgAiRepliesPerCustomer": 5,
  "aiCostPer1kRepliesUsd": 0.08,
  "metaConversationFeeUsd": 0.04,
  "serverCostUsdPerMonthBase": 100,
  "serverCostUsdPerTenant": 5,
  "supportCostUsdPerMonthBase": 50,
  "selectedPackageName": "Pro",
  "targetGrossMarginPct": 60
}
```

---

## Package Pricing (MYR)

| Package | Price | Max Agents | Max Customers |
|---------|-------|------------|---------------|
| Starter | RM 199/month | 3 | 500 |
| Pro | RM 499/month | 10 | 2000 |
| Business | RM 999+/month | Unlimited | Unlimited |

---

## Cost Separation

### AI LLM Cost

Charged by token usage. Reference: `gpt-4o-mini` at ~$0.15/$0.60 per 1M input/output tokens.

Default estimate: **$0.08 USD per 1,000 AI replies** (averaging ~600 input + 150 output tokens per reply).

**Formula:**
```
totalAiCostUsd = (totalReplies / 1000) × aiCostPer1kRepliesUsd
```

### Meta WhatsApp Message Fee

Meta charges per **conversation** (24-hour messaging window), not per message. Rates vary by country and conversation type (service vs utility vs marketing).

Default estimate: **$0.04 USD per conversation**. Verify at [Meta pricing page](https://developers.facebook.com/docs/whatsapp/pricing).

**Important:** Meta fees are a pass-through cost. Omni does NOT collect Meta fees from tenants directly — tenants pay Meta for their WhatsApp API access.

**Formula:**
```
metaConversations = tenants × customers × 1.2  (rough: 1.2 convs/customer/month)
totalMetaCostUsd = metaConversations × metaConversationFeeUsd
```

### Infrastructure Cost

- Server base: VPS + DB + Redis + CDN (shared across all tenants)
- Per-tenant share: fraction of infrastructure cost
- Support: customer support time estimate

---

## Currency

All calculations use **MYR (Malaysian Ringgit)** as primary, with USD secondary.
Default conversion: 1 USD = 4.70 MYR (approximate; update periodically).

---

## Margin Calculation

```
grossProfit = revenue - totalCost
grossMarginPct = (grossProfit / revenue) × 100

breakEvenRmPerTenant = totalCostRm / tenantCount
suggestedMinPriceRm = breakEvenRmPerTenant / (1 - targetMarginPct/100)
```

Target gross margin: 60% is a healthy SaaS target. Below 30% is risky at this scale.

---

## UI Route

`/admin/cost-calculator` — protected admin page. Inputs for all parameters, outputs cost breakdown and package recommendation.

---

## Assumptions and Limitations

- All figures are estimates — verify current AI provider and Meta pricing before any billing decisions
- Meta WhatsApp fees are NOT collected by Omni; they are paid directly by tenants to Meta
- AI cost assumes gpt-4o-mini reference pricing; other models will differ significantly
- Server costs are approximates based on typical small-scale VPS deployment
- Payment processor fees (2.9% + $0.30 per transaction) are not included in estimate
- Tax, VAT, and other compliance costs are not included
- This calculator is for internal planning only — not a customer billing system

---

## Production Steps Before Real Billing

1. Verify current AI provider token pricing per model
2. Confirm Meta WhatsApp Business API conversation pricing for target markets
3. Add actual server/infrastructure cost tracking
4. Integrate with payment processor (Stripe, etc.) in Phase 12+
5. Implement tenant subscription management
