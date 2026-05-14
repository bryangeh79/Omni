# SaaS v1 Release Checklist — Phase 15D

## Status: Ready for manual production activation

All automatic checks pass. Items marked **MANUAL** require operator action before live traffic.

---

## Static V1 Gates (Always PASS)

| Gate | Status | Notes |
|---|---|---|
| Product flow complete | PASS | Onboarding → KB → Channel → Inbox → Boss → PWA → Billing → Team → Audit |
| No broadcast/ads/bulk sending | PASS | Not implemented on any plan. 1:1 AI 客服 only. |
| Real send disabled by default | PASS | `OMNI_ALLOW_WA_SESSION=false`, `OMNI_ENABLE_REAL_META_SEND=false` |
| Auth + RBAC enforced | PASS | 5-tier RBAC, JWT tenant-scoped, no cross-tenant access |
| Audit logs available | PASS | Admin actions recorded, secrets never logged |
| Ops runbook available | PASS | `/ops/runbook` covers backup, monitoring, incident response |
| Meta API fees separated | PASS | Meta per-conversation fees are pass-through credits, NOT bundled |
| Payment gateway not live | PASS | No real charges — plan selection is draft preference only |
| App shell / navigation | PASS | AppNav sidebar on all pages, 15+ routes reachable |

---

## Dynamic Checks (Tenant-Dependent)

| Check | Expected | Notes |
|---|---|---|
| Onboarding completed | PASS | Must complete onboarding wizard |
| Knowledge base items | PASS (>0 items) | Add KB items before going live |
| Channel configured | PASS | At least one channel type selected |
| Team users | PASS (≥1 user) | Seed user or register via /auth/register |
| Credential vault configured | PASS | Set OMNI_API_KEY_ENCRYPTION_SECRET |
| Safety flags default off | PASS | Must remain false until final activation |
| Billing plan selected | PASS (non-trial) | Select Starter/Pro/Business plan |
| Audit log active | PASS | AuditLog table has records |

---

## Manual Operator Actions (Required Before Live)

1. **Backup**: Schedule `pg_dump` daily, store off-server, test restore. See `/ops/runbook`.
2. **Monitoring**: Set up uptime probe on `/ops/health`, error rate alert, disk alert.
3. **Vault**: Set `OMNI_API_KEY_ENCRYPTION_SECRET` in production `.env`.
4. **Channel credentials**: Enter real Meta access token / WA Web setup via `/channels/setup`.
5. **Test in staging**: Run stub test → confirm webhook delivery → confirm safety flags.
6. **Activate**: Set `OMNI_ALLOW_WA_SESSION=true` (WA Web) OR `OMNI_ENABLE_REAL_META_SEND=true` (Meta API) — NOT both unless needed.
7. **Support**: Configure customer-facing support contact (email/WhatsApp/Intercom).
8. **Payment**: Configure payment gateway when ready to collect plan fees.

---

## API Reference

```
GET /release-checklist/status
Authorization: Bearer <token>
```

Returns:
```json
{
  "tenantId": "...",
  "overallStatus": "MANUAL_REVIEW_NEEDED",
  "saasV1Ready": true,
  "summary": { "passed": 17, "failed": 0, "warned": 2, "manual": 3 },
  "v1Gates": [...],
  "dynamicItems": [...],
  "safetyFlags": {
    "realWaSessionEnabled": false,
    "realMetaSendEnabled": false,
    "realSendDisabled": true,
    "vaultConfigured": false
  }
}
```

---

## Web Pages

- `/release-checklist` — SaaS v1 release status UI
- `/demo-flow` — Guided 9-step demo walkthrough
- `/production-qa` — Detailed production QA checklist
- `/ops/runbook` — Backup, monitoring, incident response

---

## What This Release Is Not

- **Not a broadcast platform** — no bulk/mass messaging
- **Not an ads platform** — no marketing automation
- **Not live WhatsApp** — real sends require manual operator activation
- **Not charged** — billing plan selection is a draft until payment gateway is configured


## Final v1 Landing Pack

This `/release-checklist` page is the **runtime** release status. For the **document-level** handoff package, see:
- `docs/V1_HANDOFF_PACKAGE.md` — complete handoff
- `docs/RELEASE_CANDIDATE_V1.md` — RC notes
- `docs/FINAL_PRODUCTION_READINESS.md` — production checklist
- `docs/GO_LIVE_REHEARSAL.md` — rehearsal
- `docs/PRODUCT_COMPLETENESS_MATRIX.md` — completeness matrix
