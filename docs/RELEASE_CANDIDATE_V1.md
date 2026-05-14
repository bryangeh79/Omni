# Omni v1 — Release Candidate

## At a Glance

| Field | Value |
|---|---|
| Product | Omni Ai Chatbot｜WhatsApp AI 客服 CRM 成交系统 |
| Positioning | WhatsApp AI customer service + CRM + Lead Scoring + Automatic Follow-up + Boss Dashboard + Mobile PWA |
| **Not** | broadcast / ads / bulk-sending |
| Repo | `bryangeh79/Omni` |
| Branch | `main` |
| Smoke baseline | **1494 passed / 0 failed** (Phase 18B) |
| Last accepted commit before this final pack | `47ca5a8` (feat: Phase 18B Audit UI Migration + metadataJson Removal) |

> The final-pack commit SHA is recorded in `docs/V1_HANDOFF_PACKAGE.md` and in the git log after this commit lands.

---

## Test Commands

```bash
# API + Web type safety
pnpm --filter @omni/api typecheck
pnpm --filter @omni/web typecheck

# Web production build
pnpm --filter @omni/web build

# Full smoke regression
pnpm --filter @omni/api smoke
```

Expected results for v1:
- API typecheck: **PASS**
- Web typecheck: **PASS**
- Web build: **PASS** (27 routes)
- Smoke: **1494 passed / 0 failed** (or higher with any added Phase 19+ checks)

---

## Known Limitations

The following are **by-design** v1 limits, not bugs:

1. **No real WhatsApp / Meta sends.** `OMNI_ALLOW_WA_SESSION` and `OMNI_ENABLE_REAL_META_SEND` ship as `false`. Operator must opt-in per `docs/ACTIVATION_GUIDE.md`.
2. **No real email.** All email flows are stub (`emailSent: false`).
3. **No real payment.** Plan selection is a draft preference; `paymentGateway: NOT_CONFIGURED`.
4. **No real AI provider calls by default.** Onboarding preview uses deterministic templates; AI provider integration requires `OMNI_ENABLE_ONBOARDING_AI=true` plus vault-encrypted provider key.
5. **Single-instance assumption.** HMAC replay cache is process-local; multi-instance production needs Redis-backed cache (deferred).
6. **No full conversation export.** `/account/export` deliberately excludes raw customer messages.
7. **No broadcast / ads / bulk-sending.** This is a permanent positioning boundary.

---

## Safety Guarantees (always true regardless of env)

- Bulk/broadcast/marketing-blast endpoints **do not exist** in the API.
- `BLOCKED_BULK` guard enforced at send time.
- `passwordHash` is never returned in any API response.
- `credentialRef`, `metaAccessTokenRef`, `webhookVerifyTokenRef`, `metaAppSecretRef`, `apiKeyRef` are never returned in any tenant-facing response.
- Raw `metadataJson` is never returned in any tenant-facing endpoint (Phase 18B).
- All audit metadata exposed externally passes through `apps/api/src/lib/audit-safe.ts` whitelist.
- All multi-tenant data access is tenant-scoped via JWT (`tenantId`).
- 5-tier RBAC (OWNER / ADMIN / MANAGER / AGENT / VIEWER) enforced on sensitive routes.

---

## Activation Gates

Real WhatsApp send only goes live when **all** of these are true:

- [ ] Operator has set `OMNI_ALLOW_WA_SESSION=true` **or** `OMNI_ENABLE_REAL_META_SEND=true` (never both unless two channels)
- [ ] Channel credentials are stored encrypted (credential vault active)
- [ ] `/activation/preflight` returns `READY_FOR_LIVE_REVIEW`
- [ ] `/activation/dry-run` shows no `blockedReasons`
- [ ] Operator has reviewed `docs/ACTIVATION_GUIDE.md`
- [ ] Operator has reviewed `docs/FINAL_PRODUCTION_READINESS.md`
- [ ] Go-live rehearsal completed (`docs/GO_LIVE_REHEARSAL.md`)

---

## Deferred Items (Post-v1 Roadmap)

See `docs/PRODUCT_COMPLETENESS_MATRIX.md` § "Deferred — Post-v1 Roadmap". High-priority items:
- Real AI provider integrations
- Multi-instance Redis-backed HMAC replay cache
- Real email verification (link/SMTP)
- Real payment gateway integration
- Real conversation export (with redaction)

---

## Operator Start Steps

### Local development
```bash
# 1. Postgres (43113) + Redis (43114) must be running
# 2. Configure .env with DATABASE_URL, REDIS_URL, JWT_SECRET, OMNI_API_KEY_ENCRYPTION_SECRET

pnpm install
pnpm --filter @omni/db migrate dev    # or db push for dev
pnpm --filter @omni/db seed           # demo tenant
pnpm --filter @omni/api dev           # API on 43111
pnpm --filter @omni/worker dev        # optional worker on 43112
pnpm --filter @omni/web dev           # web on 43110
```

### Production (high-level)
See `docs/FINAL_PRODUCTION_READINESS.md` for the complete checklist. Outline:
1. Provision Postgres + Redis (private network)
2. Set env vars (no values committed to repo)
3. Run migrations
4. Build + deploy API, web (no worker until real AI is enabled)
5. Configure reverse proxy + TLS
6. Wire monitoring + backup
7. Run smoke against staging
8. Complete `GO_LIVE_REHEARSAL.md`
9. Only then consider flipping activation flags

---

## Rollback Plan

If anything goes wrong after activation:

1. Edit production `.env` → set `OMNI_ALLOW_WA_SESSION=false` and `OMNI_ENABLE_REAL_META_SEND=false`
2. Restart API server (graceful — by PID, never `taskkill /F`)
3. `curl /activation/health` → confirm `realSendCurrentlyOff: true`
4. Review `/audit/logs` for any send events since flag flip
5. If WA Web: disconnect via `/channels/setup/wa-web/disconnect`
6. File incident report; do not re-enable until root cause is addressed

Target rollback time: **≤ 5 minutes**.

---

## Final Acceptance Checklist

- [ ] All five final-pack docs exist (`FINAL_PRODUCTION_READINESS`, `GO_LIVE_REHEARSAL`, `PRODUCT_COMPLETENESS_MATRIX`, `RELEASE_CANDIDATE_V1`, `V1_HANDOFF_PACKAGE`)
- [ ] Smoke: 0 failed
- [ ] API + Web typecheck pass
- [ ] Web build passes
- [ ] No new real provider calls introduced
- [ ] No secrets exposed
- [ ] No broadcast/ads/bulk endpoints exist
- [ ] Safety flags default false
- [ ] Final commit pushed to `main`

---

## Cross-references

- `docs/FINAL_PRODUCTION_READINESS.md`
- `docs/GO_LIVE_REHEARSAL.md`
- `docs/PRODUCT_COMPLETENESS_MATRIX.md`
- `docs/V1_HANDOFF_PACKAGE.md`
- `docs/OPS_RUNBOOK.md`
- `docs/ACTIVATION_GUIDE.md`
- `docs/ACTIVATION_MONITORING.md`
- `docs/TENANT_ACCOUNT_MANAGEMENT.md`
- `docs/AUDIT_LOGS.md`
- `docs/RBAC_TEAM_MANAGEMENT.md`
- `docs/REAL_DELIVERY_READINESS.md`
