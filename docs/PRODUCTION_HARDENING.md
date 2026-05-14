# Omni Production Hardening — Phase 10A/10B → 15B → Post-v1 UAT Polish

## Post-v1 UAT Round-5 — Billing Plan + Status Label Unification

继 Round-4 之后，Round-5 完成最后一组共用化：

- **enumLabels 扩展**：新增 `planLabel` / `planPeriodLabel`（starter→Starter 基础版、pro/growth→Pro 成长版、business/enterprise→Business 企业版、trial→试用版、free→免费版、custom→自定义套餐；周期 monthly→月 / yearly→年 / one_time→一次性）、`launchStatusLabel` / `releaseStatusLabel` / `qaStatusLabel`（DONE / PENDING / WARN / BLOCKED / SKIP / OPTIONAL / PASS / FAIL / MANUAL / READY_FOR_*）。
- **Billing page**：PlanCard title / 当前套餐 / 套餐通知文案使用 `planLabel`；周期使用 `planPeriodLabel`；选择按钮添加 `title` 与 `aria-label`。
- **Settings / Account**：`o.company.plan` / `tenant.plan` 显示用 `planLabel`，悬停 title 保留原始 plan ID。
- **Launch / Release / Production QA**：本地 STATUS_CFG / OVERALL_CFG 拆分为「视觉样式 STATUS_STYLE / OVERALL_STYLE + 共用 label util」单一事实来源；refresh / re-run 按钮添加中文 `title`。
- **errorText 扩展**：6 类计费 / 套餐错误（plan_not_eligible / payment_not_configured / billing_disabled / 402 payment required / quota exceeded / subscription inactive）。
- **未触碰**：后端 API plan.id 与 plan.period 字符串、route paths、enum value、smoke 用例。
- **真实发送门控、产品定位（非广播 / 非广告 / 非群发）不变。**

## Post-v1 UAT Round-4 — Enum Label Utility + Operator Tooltips

继 Round-3 之后，Round-4 集中前端 enum → 中文 label 映射并接入操作者帮助提示：

- **新增 `apps/web/src/lib/enumLabels.ts`**：单一事实来源，导出 `stageLabel / conversationStatusLabel / channelTypeLabel / channelSetupStatusLabel / credentialStatusLabel / actorRoleLabel / messageSenderLabel / messageDirectionLabel / followUpScenarioLabel / followUpStatusLabel / activationStatusLabel / auditActionLabel / severityLabel / booleanLabel / safeEnumLabel`，未知值安全回退到原始字符串或 `—`。
- **Inbox / PWA**：移除重复的 STAGE_LABEL / STATUS_LABEL 本地副本，全部改用共用 util；MsgBubble 用 `messageSenderLabel`、PWA FollowUp 用 `followUpScenarioLabel`。
- **Channels Setup**：StatusBadge 抽取「颜色 class + 共用 label」，移除冗余 CFG dict；waWeb / Meta 真实激活状态显示用 `activationStatusLabel`。
- **Audit**：ACTION_LABELS 移至共用 util；actorRole 显示用 `actorRoleLabel`。
- **Activation Monitoring**：就绪等级 / 健康等级 / actor / action 全部走共用 util。
- **Team**：RoleBadge / 顶部 myRole / 角色更新通知 / 邀请草稿通知用 `actorRoleLabel`；ROLES select option 显示中文。
- **Account**：currentUser.role / channel.channelType / setupStatus / credentialStatus 全部走共用 util。
- **Settings**：team users / channel section 同步走共用 util。
- **Boss Dashboard**：管道阶段、紧急客户表格 stage、阶段分布、渠道健康度 channelType 全部走共用 util。
- **操作者 tooltips**：Inbox 人工接管 / 释放给 AI / 关闭对话 / 发送 + PWA 同样 + Channels 保存草稿 / 安全演练 / 保存凭据 / 发起激活 / 确认激活 — 添加 `title` 与 `aria-label`，简短说明影响（如「暂停 AI 自动回复，由人工客服处理此对话」「仅检查配置，不会发送真实 WhatsApp 消息」「保存前会加密处理，不会在页面回显原始凭据」）。
- **未触碰**：API 字段名、env、route paths、enum value 本体、smoke 测试。
- **真实发送门控、产品定位（非广播 / 非广告 / 非群发）不变。**

## Post-v1 UAT Round-3 — Inbox / PWA / Signup + Error Mapping

继 Round-2 之后，Round-3 完成 Inbox 工作流、PWA 移动端与 Signup 注册流的深度中文化，并引入前端错误文案中文映射工具：

- **Inbox 全流程中文化**：login 表单、对话列表、状态徽章、消息气泡、composer placeholder、人工接管 / 释放 AI / 关闭对话按钮、客户卡片（阶段 / 意向评分 / 标签 / 渠道 / 状态）、阶段编辑器、空状态、错误提示
- **PWA 全流程中文化**：移动登录、Boss Today（KPI 卡片 / Sections）、Inbox / Human / Intent / Follow-up tabs、对话气泡 + 接管按钮、客户资料 sheet、跟进卡片（已逾期 / 打开对话 / 已完成 / 跳过）、底部导航、状态指示
- **Signup 注册流中文化**：industry 9 项、AI 目标 6 项、channelPreference 选项（普通 WhatsApp / Meta WhatsApp Business 官方 API）、表单 label / placeholder / hint、密码切换、安全说明、注册成功页（移除 🎉，使用 ✓ 圆形徽章）、登录链接、底部声明
- **错误文案中文映射** (`apps/web/src/lib/errorText.ts`)：`toChineseError()` 工具将常见 API / 网络错误（Failed to fetch / 401 / 403 / 404 / 409 / 422 / 429 / 5xx / real send disabled / broadcast blocked）映射为友好中文。Inbox / PWA / Signup 已接入。已含中文的消息原样返回，避免双重转换。
- **未触碰**：API 字段名、env、route paths、enum value、smoke test 已存的 1494 项。
- **真实发送门控、产品定位（非广播 / 非广告 / 非群发）不变。**



继 Round-1 之后，Round-2 完成更深层的中文化与企业级 SaaS 一致性优化：

- **深度中文化**：覆盖 onboarding 5 步向导内部（行业 / AI 目标 / 资料 / 预览 / 启用）、channels/setup + meta-webhook + wa-web/qr 子页、knowledge 表格 / 编辑表单、launch / release / production-qa / ops/runbook 内部检查清单、activation-guide 全部 BEFORE / WA_WEB / META 步骤、activation/monitoring 仪表板、account 全部 tab（overview / activity / security / export）、audit ACTION_LABELS、team / billing / settings 全部 section header。
- **装饰性 emoji 清理**：移除导航装饰 emoji，文字徽章（KB / WA / API / QA / WH / QR 等）替代；保留少量语义性符号（✓ / × / ↻）。
- **专业用语一致**：上线向导 / 知识库 / 渠道设置 / 上线激活指南 / 激活监控 / 审计日志 / 生产 QA / 运维手册 / 发布检查清单 / 套餐与计费 / 团队成员 / 自动跟进 / 安全演练 全局对齐 Round-1 术语表。
- **后端 API 字段名、env、route paths、数据库字段、开发者标识符未翻译**。
- **smoke 维持 1494 / 0 failed**，web build 24 路由静态化成功，lint 零 error（8 pre-existing warning）。
- **真实发送门控、产品定位（非广播 / 非广告 / 非群发）不变。**

## Post-v1 UAT Round-1 — UI Polish (Chinese-first + Collapsible Nav)

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
