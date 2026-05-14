# Omni Production Hardening — Phase 10A/10B → 15B → Post-v1 UAT Polish

## Post-v1 UAT — UI Polish (Chinese-first + Collapsible Nav)

Applied after the v1 final handoff:

- **AppNav 重构为可折叠分组式导航。** 6 个顶级分组（工作台 / 客户与成交 / 启动配置 / 账户与团队 / 运维与安全 / 演示），点击展开子项，活动项高亮父分组，展开状态持久化到 `localStorage` 键 `omni.nav.expanded.v1`。
- **UI 中文化（Chinese-first）。** 所有用户 / 操作者可见页面的导航标签、登录表单、页面标题、按钮、空状态已切到中文。后端 API 字段名、env var、技术标识符保持英文不变。
- **CORS 已注册。** API 现注册 `@fastify/cors`，origin 由 `OMNI_CORS_ORIGINS` env 控制，默认 `http://localhost:43110,http://127.0.0.1:43110`，credentials 启用。这是浏览器跨端口（Web :43110 → API :43111）访问的必要条件。
- **Boss Dashboard 排版优化。** Header / KPI / 跟进 / 建议动作 / 管道分区合并，字号 / 字重 / 间距对齐企业级 SaaS 风格（Intercom / Linear 风格借鉴），不复制任何第三方品牌资产。
- **真实发送门控保持关闭。** `OMNI_ALLOW_WA_SESSION` 与 `OMNI_ENABLE_REAL_META_SEND` 均未触动。产品定位（**非**广播 / **非**广告 / **非**群发）未改变。
- **i18n 多语言延后到 post-v1**（roadmap）。目前为中文优先单语，未引入 i18n 框架。



## Health Endpoints

### GET /health (liveness)

Simple liveness check. Always fast, always returns 200 if the process is alive.

```json
{ "status": "ok", "service": "omni-api" }
```

### GET /ops/health (readiness)

Detailed readiness check for deployment probes, load balancers, and monitoring.

Returns HTTP 200 if all critical components are healthy, HTTP 503 otherwise.

```json
{
  "status": "healthy" | "degraded",
  "timestamp": "...",
  "service": "omni-api",
  "checks": {
    "database":    { "ok": true, "latencyMs": 3 },
    "redis":       { "ok": true, "latencyMs": 1 },
    "realtimeBus": { "ok": true, "mode": "redis-pubsub" }
  },
  "safetyFlags": {
    "realMetaSendEnabled":  false,
    "waSessionEnabled":     false,
    "jwtConfigured":        true,
    "dbConfigured":         true,
    "redisConfigured":      true
  }
}
```

**Security:** No raw env values, no secrets, no connection strings in the response. Only boolean flags and latency numbers.

### GET /ops/version

Build/version metadata.

```json
{
  "service": "omni-api",
  "phase": "10B",
  "nodeVersion": "v20.x.x",
  "uptime": 3600
}
```

---

## Auth Modes

See `docs/AUTH_HARDENING.md` for full documentation on Bearer vs cookie auth modes.

---

## Redis Pub/Sub Reconnect (Phase 10B)

The `realtime-bus` now handles runtime Redis reconnects:

1. On `error` event: `_live` → `false`, localBus fallback activates
2. On `ready` event (reconnect): re-psubscribes to `omni:realtime:tenant:*` and restores `_live = true`
3. Retry strategy: up to 30 retries with exponential backoff (up to 5s per attempt, ~2.5 min total)
4. After 30 retries: connection gives up; API restart required to restore Redis pub/sub

**SSE clients:** On Redis disconnect, clients still receive in-process events (inbound webhook, human send, takeover/release). Worker AI reply events are missed until reconnect.

**Status check:** `GET /realtime/status` returns `redisLive: true/false` and current mode.

---

## Environment Variables (Production Checklist)

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | `redis://localhost:43114` | BullMQ + pub/sub |
| `JWT_SECRET` or `APP_SECRET` | Yes | — | Min 32-char random string |
| `PORT_API` | No | `43111` | API server port |
| `NODE_ENV` | No | `development` | Set to `production` in prod |
| `OMNI_ENABLE_REAL_META_SEND` | No | (unset = disabled) | Set `true` to enable real WhatsApp |
| `OMNI_ALLOW_WA_SESSION` | No | (unset = disabled) | WhatsApp Web — not implemented |
| `VAPID_PUBLIC_KEY` | No | (unset = push disabled) | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Phase 11 | — | Web Push VAPID private key |

---

## Pre-Production Checklist

- [ ] `DATABASE_URL` points to production PostgreSQL
- [ ] `REDIS_URL` points to production Redis
- [ ] `JWT_SECRET` is a long random string (not shared with dev)
- [ ] `NODE_ENV=production` (enables httpOnly cookie Secure flag)
- [ ] `OMNI_API_KEY_ENCRYPTION_SECRET` set (32-byte hex/base64) — required for credential vault
- [ ] `OMNI_ENABLE_REAL_META_SEND` reviewed and set intentionally
- [ ] Channel credentials saved via `/channels/setup/credentials-draft` (encrypted)
- [ ] Channel activation flow completed (`request-activation` → `confirm-activation`)
- [ ] HTTPS / TLS configured (nginx/reverse proxy)
- [ ] Rate limiting enabled on auth and send endpoints
- [ ] Log aggregation configured for `[delivery-audit]` entries
- [ ] `/ops/health` responds 200 before traffic is sent

---

## Phase 13A: Credential Vault Hardening

### OMNI_API_KEY_ENCRYPTION_SECRET

- **Required** for storing channel credentials and AI API keys
- Must be 32-byte hex (64 hex chars), base64 (44 chars), or any string (SHA-256 hashed)
- Never commit to version control
- Rotate by re-encrypting stored `credentialRef` blobs (tooling in Phase 14)

### Channel Credential Storage Rules

| Data | Storage | Never stored |
|------|---------|-------------|
| WABA ID | Plaintext (non-secret) | — |
| Phone Number ID | Plaintext (non-secret) | — |
| Access Token | AES-256-GCM encrypted `credentialRef` | Raw value |
| App Secret | AES-256-GCM encrypted `credentialRef` | Raw value |
| Phone Number | `phoneLast4` (last 4 digits only) | Full number |

### Safety Flag Defaults

| Flag | Default | Purpose |
|------|---------|---------|
| `OMNI_ALLOW_WA_SESSION` | `false` | Required for WA Web session activation |
| `OMNI_ENABLE_REAL_META_SEND` | `false` | Required for Meta API message send |
| `OMNI_ENABLE_ONBOARDING_AI` | `false` | Required for AI-generated onboarding preview |

---

## Phase 15B: Ops Hardening Checklist Items

Four new MANUAL items added to `GET /production-qa/checklist` under the Ops category:

### monitoring_configured
Configure uptime monitoring (UptimeRobot, Grafana, Better Uptime) pointed at `/health` or `/ops/health`. Set up alert channels (email, Slack, PagerDuty) for API/worker failures.

### log_retention
Define log retention policy (e.g. 30-day rolling). Configure log aggregation (AWS CloudWatch, Datadog, Logtail) to ship and retain Fastify API logs and worker stderr output.

### incident_response
Document on-call escalation path, SLA targets (e.g. P1 response in 30 min), and a runbook URL covering: how to restart API/worker, how to check DB/Redis health, and what to do if a WhatsApp session drops.

### support_contact
Set up a customer-facing support channel (support email, WhatsApp, Intercom, or help desk) before live activation.

## Phase 15B: RBAC Hardening

Write endpoints now require OWNER/ADMIN role:
- `POST /billing/select-plan-draft`
- `PATCH /settings/company-profile`
- `POST /team/invite-draft`
- `PATCH /team/members/:id/role`
- `PATCH /team/members/:id/status`

Read endpoints (GET /settings/overview, GET /billing/plans, GET /team/members) require any valid auth token. MANAGER+ required for team member list.

## Phase 15C: Audit Log Foundation

Admin actions are now recorded in the `AuditLog` DB table (tenant-scoped, immutable append-only log). See `docs/AUDIT_LOGS.md` for full details.

New pages:
- `/audit` — admin activity timeline (all roles)
- `/ops/runbook` — production monitoring/backup runbook (all roles)

Production QA checklist now includes audit readiness, backup runbook review, and monitoring runbook review items. See `docs/OPS_RUNBOOK.md` for the full runbook.

## Phase 15D: SaaS v1 Polish + Navigation + Demo + Release Checklist

Final SaaS v1 polish layer. See `docs/RELEASE_CHECKLIST.md` and `docs/DEMO_FLOW.md`.

New pages:
- `/demo-flow` — Guided 9-step sales demo and internal QA walkthrough
- `/release-checklist` — SaaS v1 release readiness status (static + live API checks)

New API:
- `GET /release-checklist/status` — aggregated v1 release readiness with dynamic tenant checks

App shell:
- `AppNav` sidebar component added to root layout — all 15+ routes navigable from sidebar
- Mobile: hamburger toggle with slide-in drawer
- Desktop: fixed left sidebar (220px) with dark indigo theme

Copy updates:
- Title: "Omni — WhatsApp AI 客服 · CRM · Follow-up"
- Description: positions as AI customer service + CRM + follow-up conversion, not ads/broadcast
- Meta fee pass-through and WA stability boundary documented in billing/channel pages

## Phase 16A: Production Activation Operator Guide

Added operator-safe activation workflow. Real send remains disabled until operator manually changes env flags.

New API:
- `GET /activation/preflight` — pre-flight readiness checks
- `POST /activation/dry-run` — simulate activation (never enables real send)
- `GET /activation/health` — post-activation health monitoring

New page: `/activation-guide` — step-by-step guide for WA Web and Meta activation paths, rollback plan, post-activation monitoring.

See `docs/ACTIVATION_GUIDE.md` for full documentation.

## Phase 16B: Activation Monitoring Dashboard

New endpoints:
- `GET /activation/timeline` — local audit events for activation
- `GET /activation/go-live-checklist` — automated + manual checklist
- `POST /activation/test-message/dry-run` — never sends, dryRun=true, realSendAttempted=false

New page: `/activation/monitoring` — unified dashboard.
See `docs/ACTIVATION_MONITORING.md`.

## Phase 17A: Tenant Self-service Signup

- `POST /tenants/signup` — public endpoint, creates tenant + owner + OnboardingDraft + ChannelSetupDraft + starter KB + AiConfig + default rules; issues access/refresh tokens
- `POST /tenants/signup/verify-email-dry-run` — stub only, dryRun=true, emailSent=false
- `/signup` web page — polished enterprise SaaS signup form

See `docs/TENANT_ONBOARDING_SELF_SERVICE.md` for full documentation.

## Phase 17B: Account Management Hub

New endpoints + page:
- `GET /account/overview` — safe local read of tenant/user/onboarding/channel/checklist
- `PATCH /account/profile` — OWNER/ADMIN only, updates name + defaultLanguage
- `/account` web page — self-service management hub

No new permission tiers added. Existing RBAC (OWNER/ADMIN/MANAGER/AGENT/VIEWER) used.
See `docs/TENANT_ACCOUNT_MANAGEMENT.md`.


## Phase 17C: Tenant Activity History + Safe Account Export

- `GET /account/activity` — safe tenant-scoped activity feed (audit-log derived); whitelisted metadata only
- `GET /account/export` — OWNER/ADMIN only; safe JSON summary; explicit `redaction` block; NEVER includes passwordHash, credentialRef, raw tokens, encrypted blobs, raw provider data, full conversations, KB answers, or follow-up templates
- `/account` UI: three tabs (Overview / Activity / Export) with Generate + Download JSON button

See `docs/TENANT_ACCOUNT_MANAGEMENT.md` for full reference.


## Phase 17D: Activity Filtering + Security Events

- `GET /account/activity` extended with `actionGroup` / `action` / `from` / `to` / `limit` filters; invalid values rejected with 400
- `GET /account/security-events` (OWNER/ADMIN only) returns severity-classified summary over last 7 days
- /account UI adds Security tab and Activity filter controls
- No new permission tiers introduced — uses existing OWNER/ADMIN gate via `requireRole`

See `docs/TENANT_ACCOUNT_MANAGEMENT.md` for full reference.


## Phase 18A: Audit Metadata Sanitization Consolidation

- New module: `apps/api/src/lib/audit-safe.ts`
- Single whitelist (`SAFE_AUDIT_METADATA_KEYS`) governs what audit metadata can be returned by any tenant-facing endpoint
- Refactored: `/account/activity`, `/account/security-events`, `/activation/timeline`, `/audit/logs`
- Future audit/event endpoints MUST use this utility — do not duplicate sanitization logic
- Raw `metadataJson` is NOT exposed by `/account/*` or `/activation/timeline`; `/audit/logs` keeps it for legacy UI compat and tests assert no secret substrings


## Phase 18B: metadataJson Removal From /audit/logs

- `/audit/logs` response no longer contains `metadataJson` (removed entirely)
- Each log entry now exposes only `safeMetadata` + `summary` for metadata-derived info
- Audit UI (`/audit`) migrated to use `safeMetadata` and `summary`
- Activation monitoring UI no longer carries a metadataJson fallback path
- Smoke tests 214 / 216 / 218 / 219 now hard-scan for `metadataJson` substring and fail if it appears anywhere in audit/activity/timeline/security responses

Future tenant-facing audit/event endpoints MUST NOT include raw `metadataJson` in responses. Use `apps/api/src/lib/audit-safe.ts`.


## Final v1 Landing Pack

See `docs/V1_HANDOFF_PACKAGE.md` for the complete v1 handoff. Production readiness checklist at `docs/FINAL_PRODUCTION_READINESS.md`. Go-live rehearsal at `docs/GO_LIVE_REHEARSAL.md`.
