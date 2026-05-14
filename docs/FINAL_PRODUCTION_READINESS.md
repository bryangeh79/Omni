# Omni — Final Production Readiness Checklist

This is the authoritative checklist before exposing Omni to production traffic. Every section must be reviewed by an operator. Items marked **MANUAL** require human verification — they cannot be automated.

**Omni positioning:** WhatsApp AI 客服 + CRM + Lead Scoring + Automatic Follow-up + Boss Dashboard + Mobile PWA. **Not a broadcast / ads / bulk-sending platform.**

---

## 1. Environment Variables (names only — never commit values)

### Required
- [ ] `DATABASE_URL` — production PostgreSQL connection string
- [ ] `REDIS_URL` — production Redis connection string (BullMQ + realtime pub/sub)
- [ ] `JWT_SECRET` (or `APP_SECRET`) — min 32-char random string, never shared with dev
- [ ] `NODE_ENV=production` — enables `Secure` cookie flag
- [ ] `OMNI_API_KEY_ENCRYPTION_SECRET` — required for credential vault (AES-256-GCM)

### Optional / port overrides
- [ ] `PORT_API` (default 43111)
- [ ] `PORT_WEB` (default 43110)
- [ ] `JWT_ACCESS_EXPIRES_IN` (default `15m`)
- [ ] `JWT_REFRESH_EXPIRES_IN` (default `7d`)
- [ ] `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — only if web push is enabled

### Safety gates — **MUST remain unset / false until operator activation**
- [ ] `OMNI_ALLOW_WA_SESSION` — leave unset/`false`
- [ ] `OMNI_ENABLE_REAL_META_SEND` — leave unset/`false`
- [ ] `OMNI_ENABLE_ONBOARDING_AI` — leave unset/`false` (uses deterministic templates by default)

---

## 2. Database Migration Checklist

- [ ] Baseline migration list verified against `packages/db/prisma/migrations/`
- [ ] `pnpm --filter @omni/db migrate deploy` (or equivalent) run successfully
- [ ] `_prisma_migrations` table reflects every migration as applied
- [ ] No unintended schema drift between dev and prod
- [ ] DB user has `CREATE`, `ALTER`, `SELECT`, `INSERT`, `UPDATE`, `DELETE` permissions only — no `SUPERUSER`

## 3. Seed / Demo Data

- [ ] Decide: production tenant created via `/signup` self-service OR via seed script
- [ ] Demo seed (`pnpm --filter @omni/db seed`) NOT run on production unless intentionally desired
- [ ] If running seed, demo password is **changed immediately** after first login
- [ ] No demo-only test data ships to production

## 4. Domain / TLS / Reverse Proxy

- [ ] Public domain points to web (port 43110) via reverse proxy
- [ ] Public domain points to API (port 43111) via reverse proxy
- [ ] HTTPS / TLS certificate valid and auto-renewing
- [ ] `Secure`, `HttpOnly`, `SameSite=Strict` cookies confirmed in browser
- [ ] CORS configured if web + API are on different origins

## 5. Backup Checklist

- [ ] `pg_dump` scheduled — minimum daily
- [ ] Backup retention policy defined — minimum 7 days
- [ ] Off-server backup copy verified (S3 / GCS / SFTP / external disk)
- [ ] Restore procedure **tested** in a staging database
- [ ] Backup failure alert configured

## 6. Monitoring Checklist

- [ ] External uptime probe on `GET /ops/health` (60 s interval)
- [ ] Probe alert: 2 consecutive failures → page on-call
- [ ] Error-rate alert: > 1 % 5xx over 5 minutes → page on-call
- [ ] Disk-usage alert: > 80 % full
- [ ] PostgreSQL connection-pool exhaustion alert
- [ ] Redis memory + eviction-policy alert
- [ ] BullMQ worker stalled-job alert (if worker is deployed)

## 7. Log Retention

- [ ] API stdout/stderr shipped to log aggregator (CloudWatch / Datadog / Logtail / etc.)
- [ ] Retention ≥ 30 days
- [ ] No raw secrets in logs — verify via spot-check (`grep -i 'JWT_SECRET\|passwordHash\|credentialRef'`)
- [ ] Audit log retention policy decided (DB-side `AuditLog` table — minimum 90 days recommended)

## 8. Rollback Checklist

- [ ] Previous release commit SHA recorded
- [ ] Database migration rollback strategy documented
- [ ] `OMNI_ALLOW_WA_SESSION=false` + `OMNI_ENABLE_REAL_META_SEND=false` reset path verified
- [ ] Operator knows how to disable real send within < 5 minutes
- [ ] Rollback rehearsal completed (see `docs/GO_LIVE_REHEARSAL.md`)

## 9. Activation Safety Gates

- [ ] `/activation/preflight` returns `READY_FOR_OPERATOR_REVIEW` or `READY_FOR_STAGING`
- [ ] `/activation/dry-run` executed for the chosen channel type — no blockers
- [ ] `/account/security-events` shows zero unexplained warnings
- [ ] `/release-checklist/status` returns `saasV1Ready: true`
- [ ] Manual items in `/activation/go-live-checklist` confirmed by operator

## 10. Real Provider Activation Gate

Real WhatsApp / Meta / AI / email sending is **disabled by default**. To enable each:

| Capability | Required flag | Default | Operator action |
|---|---|---|---|
| WhatsApp Web session | `OMNI_ALLOW_WA_SESSION=true` | `false` | Restart API, scan QR at `/channels/setup/wa-web/qr` |
| Meta WhatsApp Business send | `OMNI_ENABLE_REAL_META_SEND=true` | `false` | Restart API after storing encrypted creds + verifying webhook |
| AI onboarding generation | `OMNI_ENABLE_ONBOARDING_AI=true` | `false` | Restart API after AI provider key stored in vault |
| Email | (not implemented) | n/a | All email is stub — no real provider wired |
| Payment | (not implemented) | n/a | All billing is draft — no real payment provider wired |

**Never set both `OMNI_ALLOW_WA_SESSION=true` and `OMNI_ENABLE_REAL_META_SEND=true` simultaneously** unless you have two independent active channels and have verified isolation.

## 11. Meta API Fee — Pass-through Note

Meta WhatsApp Business Platform charges **per-conversation fees** that are billed **separately by Meta**, not by Omni. These fees are pass-through credits:

- Omni plan pricing does **not** include Meta API message fees
- Operator must monitor Meta billing console independently
- `/billing/usage-summary` shows Omni-side usage estimate only; real Meta charges may differ
- This is documented in customer-facing copy at `/signup`, `/billing`, `/demo-flow`

## 12. No Broadcast / Ads / Bulk-sending Statement

Omni is a **1:1 WhatsApp AI customer service + CRM + follow-up** system. It is structurally not a broadcast, ads, or bulk-sending platform:

- No bulk-send endpoint exists in the API
- `/messages/send` is gated by per-conversation `BLOCKED_BULK` checks
- Plan pricing copy explicitly states "Bulk broadcast and marketing blast are not supported"
- This is a permanent product-positioning boundary, not a configurable flag

---

## Related Documents

- `docs/GO_LIVE_REHEARSAL.md` — dry-run rehearsal steps before flipping flags
- `docs/RELEASE_CANDIDATE_V1.md` — v1 release-candidate summary + acceptance
- `docs/V1_HANDOFF_PACKAGE.md` — final handoff bundle
- `docs/PRODUCT_COMPLETENESS_MATRIX.md` — feature completeness vs. positioning
- `docs/OPS_RUNBOOK.md` — operational runbook (backup / monitoring / incident)
- `docs/PRODUCTION_HARDENING.md` — security hardening accumulation
- `docs/REAL_DELIVERY_READINESS.md` — guardrail architecture detail
- `docs/ACTIVATION_GUIDE.md` — step-by-step activation
- `docs/ACTIVATION_MONITORING.md` — post-activation monitoring
- `docs/TENANT_ACCOUNT_MANAGEMENT.md` — `/account` self-service hub
- `docs/AUDIT_LOGS.md` — audit log schema and safety contract
- `docs/RBAC_TEAM_MANAGEMENT.md` — role tiers and RBAC enforcement
