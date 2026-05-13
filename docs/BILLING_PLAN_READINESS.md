# Omni Billing & Plan Readiness — Phase 15A

## Plan Overview

| Plan | Price | Channels | Users | AI Replies/mo |
|------|-------|----------|-------|--------------|
| Starter | RM 199/mo | 1 | 2 | 2,000 |
| Pro | RM 499/mo | 1–3 | 5 | 8,000 |
| Business | RM 999+/mo | 10 | 20 | 30,000 |

## Included Features

### Starter (RM 199/month)
- 1 WhatsApp channel (WA Web or Meta)
- AI customer service replies
- Basic CRM (customers, tags, lead stage)
- Basic FAQ knowledge base (up to 50 items)
- Basic follow-up automation
- Boss Today dashboard
- Mobile PWA

### Pro (RM 499/month)
- 1–3 WhatsApp channels
- Full AI customer service + lead scoring
- High-intent alerts and human escalation
- Automated follow-up + conversion rules
- Full Boss Dashboard + lead pipeline
- Multi-user team (up to 5)
- Knowledge base (up to 200 items)
- Mobile PWA + inbox

### Business (RM 999+/month)
- Multi-channel + multi-agent support
- Higher AI usage volume (30,000+ replies/month)
- Meta WhatsApp Business Platform official API
- Advanced Boss Dashboard + analytics
- Priority support and onboarding
- Custom follow-up automation
- Knowledge base (up to 1000 items)
- SLA-based uptime commitment

---

## Boundaries and Exclusions

### Meta Official API Fees (Pass-Through)

Meta WhatsApp Business Platform charges a per-conversation fee based on message volume and category (marketing, utility, authentication, service). These fees are:
- **NOT bundled** in the plan price
- Billed separately as pass-through credits at cost
- Volume pricing available for Business plan customers

### Ordinary WhatsApp Stability

WA Web (ordinary WhatsApp) sessions rely on WhatsApp Web / WhatsApp Business App connection:
- Available in all plans as a fast-start option
- Session stability is **best-effort** per WhatsApp ToS
- Not suitable for high-volume 24/7 operations
- Meta official API (Business plan) recommended for enterprise use

### No Broadcast / No Ads

**Bulk broadcast, marketing blasts, and advertising are NOT supported in any plan.** Omni is a 1:1 AI customer service and CRM product.

---

## API

### GET /billing/plans
Returns plan definitions with feature lists, limits, and boundary notes. `paymentGateway: 'NOT_CONFIGURED'` — no real charging.

### GET /billing/usage-summary
Returns current month AI replies, token usage, estimated cost (USD + RM), customer count, and KB item count.

### POST /billing/select-plan-draft
Body: `{ planId: 'starter' | 'pro' | 'business' }` — saves plan preference to DB. `charged: false` always. No payment gateway.

---

## RBAC (Phase 15B)

`POST /billing/select-plan-draft` now requires **OWNER or ADMIN** role. Other billing GET endpoints accept any authenticated user.

---

## Limitations (Phase 15A/15B)

- No real payment gateway — plan selection is a draft preference only
- No invoice generation
- No automatic overage billing
- No plan upgrade/downgrade enforcement
- Usage summary is approximate (based on UsageRecord table)
