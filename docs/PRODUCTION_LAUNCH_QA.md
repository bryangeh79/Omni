# Omni Production Launch QA — Phase 15A

## Overview

The Production QA Checklist (`/production-qa`) provides an operator-facing launch readiness report with 20 deterministic checks across 5 categories.

**No real API calls. No secrets in responses. Auth-required.**

---

## API

### GET /production-qa/checklist

Returns a deterministic checklist. No DB writes. No external calls.

```json
{
  "tenantId": "...",
  "asOf": "2026-05-13T...",
  "overallStatus": "MANUAL_REVIEW_NEEDED",
  "summary": { "passed": 14, "failed": 2, "warned": 2, "manual": 3, "total": 20 },
  "items": [...],
  "operatorNote": "Items marked MANUAL require operator review..."
}
```

### Item Status Values

| Status | Meaning |
|--------|---------|
| `PASS` | Check passed |
| `FAIL` | Must be fixed before launch |
| `WARN` | Recommended but not blocking |
| `MANUAL` | Requires operator review / cannot be automated |

### Overall Status

| Status | Meaning |
|--------|---------|
| `PASS` | All checks pass, no manual review items |
| `FAIL` | Critical items failing |
| `WARN` | Non-critical warnings present |
| `MANUAL_REVIEW_NEEDED` | Some checks require operator review |

---

## Checklist Categories

### Product Flow
- Onboarding wizard completed
- Knowledge base has active items
- Channel type selected and draft saved
- Channel stub test completed
- Inbox is accessible
- Boss Dashboard accessible
- Follow-up automation rules configured

### Safety
- Real send disabled by default
- No broadcast/ads/bulk sending
- Credential vault configured
- AI provider calls gated

### Data
- Tenant is active
- At least one user configured
- Tenant isolation (JWT-scoped)

### Ops
- Health endpoint available
- Ops readiness check passes (MANUAL)
- Backup strategy documented (MANUAL)

### Commercial
- Plan selected
- Meta API fees understood — pass-through (MANUAL)
- No real payment configured (safe)

---

## Web Page `/production-qa`

- Overall status banner (🟢/🟡/🔴/🔵)
- Category filter (All / Product Flow / Safety / Data / Ops / Commercial)
- Per-item cards with status badge and detail
- "Fix →" link for failing items
- Re-run button (refreshes checks from API)

---

## Manual Operator Steps Before Live Activation

These cannot be automated and must be reviewed by the operator:

1. **Ops readiness** — run `GET /ops/health` and verify DB/Redis/worker are all healthy
2. **Backup strategy** — configure PostgreSQL backup (pg_dump, RDS snapshots, etc.)
3. **Meta fees** — confirm with customer that Meta per-conversation fees are pass-through
4. **Env flags** — review before enabling `OMNI_ALLOW_WA_SESSION` or `OMNI_ENABLE_REAL_META_SEND`
5. **Plan review** — confirm plan selection and customer acceptance

---

## No Broadcast/Ads Boundary

All items confirm that Omni is a 1:1 AI customer service product. The `no_broadcast` item always returns `PASS` because broadcast/ads/bulk sending are structurally not implemented.

---

## Limitations (Phase 15A)

- Checklist is tenant-scoped only — no cross-tenant admin view
- Manual items cannot be auto-resolved
- No historical pass/fail tracking
- No CI/CD integration
