# Omni v1 — Complete Handoff Package

This is the canonical handoff document. If you are receiving Omni v1, **start here**.

> **Post-v1 UAT Polish (applied 2026-05)：** UI 已切换到 **中文优先**（Chinese-first），AppNav 重构为 **可折叠分组式导航**，Boss Dashboard 视觉对齐企业级 SaaS 风格。API 注册了 `@fastify/cors`（origin 由 `OMNI_CORS_ORIGINS` env 控制）。
>
> **Post-v1 UAT Round-2 (2026-05)：** 完成深度中文化 — onboarding wizard 内部步骤、channels setup 子页、knowledge / launch / release / production-qa / ops / activation 全部内部清单、account/audit/billing/team/settings 内部 section header。装饰 emoji 替换为文字徽章。
>
> **Post-v1 UAT Round-3 (2026-05)：** Inbox / PWA / Signup 工作流全面中文化（对话气泡 / 阶段徽章 / 接管按钮 / 跟进卡片 / 注册表单），并新增 `apps/web/src/lib/errorText.ts` 前端错误文案中文映射工具。
>
> **Post-v1 UAT Round-4 (2026-05)：** 新增 `apps/web/src/lib/enumLabels.ts` 集中前端 enum → 中文 label 映射。Inbox / PWA / Channels Setup / Audit / Activation Monitoring / Team / Account / Settings / Boss 全部改用共用 util；关键操作按钮（人工接管 / 释放给 AI / 关闭对话 / 安全演练 / 保存凭据 / 激活）补充中文 `title` 与 `aria-label`。
>
> **Post-v1 UAT Round-5 (2026-05)：** `enumLabels.ts` 扩展 `planLabel` / `planPeriodLabel` / `launchStatusLabel` / `releaseStatusLabel` / `qaStatusLabel`；Billing / Settings / Account 套餐显示中文化（保留原始 plan ID 作为 `title`）；Launch / Release / Production QA 状态徽章统一走共用 util；`errorText.ts` 扩展 6 类计费 / 套餐错误；refresh / re-run 按钮补充中文 `title`。多语言切换框架仍延后到 post-v1 i18n。产品定位（**非**广播 / **非**广告 / **非**群发）未改变。真实发送门控仍默认关闭。
>
> **Post-v1 UAT Round-6 (2026-05)：** 修复点击侧边栏菜单时短暂闪登录表单的问题。18 个 client page 把 `authed` 改为三态 `boolean | null`，初次 SSR / hydration 渲染 `null`（什么都不渲染）而不是 `LoginForm`，等 `useEffect` 跑完才决定显示登录或内容，消除 1 帧 flash。
>
> **Post-v1 UAT Round-7 (2026-05)：** AppNav 信息架构重组 — 顶部 4 个分组为**租户日常**（日常工作 / 客户与成交 / 新客户上线 / 账户管理），底部新增 **SaaS Admin · 平台运维**分组（含分隔线 + section label + muted 视觉层级），把上线激活指南 / 激活监控 / 上线清单 / 审计日志 / 生产 QA / 运维手册 / 发布检查清单 / 演示流程从原"启动配置"和"运维与安全"两个分组合并到此处。`localStorage` 键升级为 `omni.nav.expanded.v2`；默认仅展开当前活跃分组（无活跃路由时默认展开"日常工作"）。所有路由与页面均保留可访问，无 RBAC 隐藏（comment 中标注 future RBAC hook 位置）。

---

## Product Summary

**Omni Ai Chatbot｜WhatsApp AI 客服 CRM 成交系统**

Omni is a **WhatsApp AI customer service + CRM + Lead Scoring + Automatic Follow-up + Boss Dashboard + Mobile PWA** SaaS for SMBs. The operator provides company / product info, and the system generates a working WhatsApp AI customer-service setup in one click.

**Omni is NOT** a broadcast, ads, marketing-blast, or bulk-sending platform. This is a permanent positioning boundary, not a configurable flag.

---

## Target User

- SMB owners running 1:1 WhatsApp customer conversations who want AI to handle first-touch, qualification, FAQ, follow-up, and lead pipeline
- Sales managers who want a "Boss Dashboard" view of high-intent leads and team activity
- Field salespeople who want a Mobile PWA inbox + alerts
- Operators / agencies onboarding clients through a self-service signup flow

---

## What Is Completed

### Customer-facing
- ✅ Tenant signup (`/signup`) with auto-derived slug, owner account, starter knowledge base, default follow-up rules
- ✅ Onboarding wizard (`/onboarding`) — company profile → AI goals → materials → deterministic preview → enable
- ✅ Knowledge base CRUD (`/knowledge`) in zh / en / ms
- ✅ Channel setup wizard (`/channels/setup`) for WA Web and Meta WhatsApp Business — credential vault, stub tests
- ✅ Inbox (`/inbox`) — AI / human handling, takeover, release, close
- ✅ Boss Dashboard (`/boss`) — today's priorities, lead stages, channel health
- ✅ Mobile PWA (`/pwa`) — responsive view with add-to-home-screen support
- ✅ Account self-management hub (`/account`) — profile editor, setup checklist, safety status, activity, security, export

### Operator-facing
- ✅ Activation guide (`/activation-guide`)
- ✅ Activation monitoring dashboard (`/activation/monitoring`)
- ✅ Release checklist (`/release-checklist`)
- ✅ Production QA checklist (`/production-qa`)
- ✅ Audit log timeline (`/audit`)
- ✅ Ops runbook (`/ops/runbook`)
- ✅ Demo-flow walkthrough (`/demo-flow`)

### API surface
- ✅ Auth: JWT bearer + httpOnly cookie modes
- ✅ Tenant signup + email verification stub
- ✅ Customer / Conversation / Message CRUD
- ✅ Channel setup (WA Web + Meta) with vault-encrypted credentials
- ✅ Onboarding draft + AI persona generation (deterministic)
- ✅ Knowledge base + AI config (DRY_RUN provider)
- ✅ Follow-up engine (5 default rules)
- ✅ Handoff rules (6 default conditions)
- ✅ Billing draft (no real payment)
- ✅ Team RBAC (5 tiers)
- ✅ Audit log with shared whitelist sanitizer
- ✅ Activation preflight / dry-run / health / timeline / go-live-checklist / test-message dry-run
- ✅ Account overview / profile / activity (filtered) / security-events / export

---

## What Is Safe / Dry-run Only

| Capability | Behaviour |
|---|---|
| WA Web session start | Blocked unless `OMNI_ALLOW_WA_SESSION=true` |
| Meta WhatsApp API send | Blocked unless `OMNI_ENABLE_REAL_META_SEND=true` |
| AI provider call | Stub (DRY_RUN) unless `OMNI_ENABLE_ONBOARDING_AI=true` |
| Email verification | Stub — `emailSent: false` always |
| Payment / billing charge | Stub — `paymentGateway: NOT_CONFIGURED` |
| Bulk / broadcast / marketing-blast | Not implemented — categorically excluded |
| Test-message dry-run | Always `realSendAttempted: false, providerCalled: false` |

---

## How to Start (Local / Dev)

```bash
# Prereqs: Postgres on 43113, Redis on 43114, Node 20+, pnpm 9+

# 1. Configure .env at repo root (do NOT commit)
#    DATABASE_URL, REDIS_URL, JWT_SECRET, OMNI_API_KEY_ENCRYPTION_SECRET
#    Leave OMNI_ALLOW_WA_SESSION and OMNI_ENABLE_REAL_META_SEND unset (= false)

# 2. Install + migrate + seed
pnpm install
pnpm --filter @omni/db migrate deploy
pnpm --filter @omni/db seed           # demo tenant — omit on production

# 3. Run dev services
pnpm --filter @omni/api dev           # API → :43111
pnpm --filter @omni/web dev           # Web → :43110
pnpm --filter @omni/worker dev        # Worker → :43112 (optional for v1)

# 4. Open http://localhost:43110/signup OR sign in with demo tenant (omni-demo)
```

---

## How to Prepare Production

See `docs/FINAL_PRODUCTION_READINESS.md` for the complete 12-section checklist. Summary:

1. Provision Postgres + Redis in a private network
2. Configure env vars (no values in repo): DATABASE_URL, REDIS_URL, JWT_SECRET, OMNI_API_KEY_ENCRYPTION_SECRET, NODE_ENV=production
3. Run `prisma migrate deploy` against production DB
4. Build + deploy API and web (worker optional)
5. Place behind HTTPS reverse proxy
6. Configure backup (`pg_dump` daily, off-server)
7. Configure monitoring (UptimeRobot or equivalent on `/ops/health`)
8. Run `docs/GO_LIVE_REHEARSAL.md` against staging
9. **Only then** consider flipping activation flags (`docs/ACTIVATION_GUIDE.md`)

---

## How to Onboard a Tenant

### Self-service path
1. Tenant visits `/signup` → fills business + owner info
2. POST `/tenants/signup` creates tenant + OWNER user + starter data (1 FAQ, channel draft, 5 follow-up rules, 6 handoff rules)
3. Access token issued; auto-redirect to `/onboarding`
4. Tenant completes onboarding wizard (deterministic preview)
5. Tenant adds knowledge items at `/knowledge`
6. Tenant configures channel at `/channels/setup` (stub mode — no real connection)

### Operator-assisted path
1. Operator runs `pnpm --filter @omni/db seed` (creates `omni-demo` tenant) OR creates via `/signup`
2. Operator logs in, completes onboarding on tenant's behalf
3. Operator hands off credentials

---

## How to Configure Knowledge Base

- Web: `/knowledge` → add Q&A pairs, set language (zh / en / ms), set type (GLOBAL_FAQ / PRODUCT_FAQ / KNOWLEDGE_CHUNK)
- API: `POST /knowledge/items` with `{ type, question, answer, language }`
- All items are tenant-scoped; isolation enforced via JWT

---

## How to Configure Channel (Safely)

1. `/channels/setup` → choose channel type (WA Web or Meta WhatsApp Business)
2. Save draft (display name, phoneLast4)
3. Run stub test → expect `testResult: "STUB"`
4. For Meta: save credentials via `/channels/setup/credentials-draft` (vault-encrypted)
5. Stop here unless you explicitly want to go live
6. If going live, follow `docs/ACTIVATION_GUIDE.md` step by step

---

## How to Use Activation Guide / Monitoring

1. Visit `/activation-guide` — operator-facing step-by-step
2. Click "Run Pre-flight" — confirms all readiness conditions
3. Run `POST /activation/dry-run` with `channelType` + `intendedMode`
4. Visit `/activation/monitoring` — unified dashboard with readiness / health / timeline / go-live checklist
5. Only after all green: flip env flag in production `.env` and restart API

---

## How to Use Audit / Security / Account Export

- **Audit log:** `/audit` (admin view) → all actions tenant-scoped, severity-classified at `/account` → Security tab
- **Activity filters:** `/account` → Activity tab → action group dropdown + date range
- **Security events:** `/account` → Security tab (OWNER/ADMIN only) → 7-day window, severity badges
- **Account export:** `/account` → Export tab → generate safe JSON (explicit `redaction` block; no passwordHash / credentialRef / tokens / encrypted blobs / raw conversations)

---

## How to Run Tests

```bash
pnpm --filter @omni/api typecheck     # API TypeScript
pnpm --filter @omni/web typecheck     # Web TypeScript
pnpm --filter @omni/web build         # Web production build
pnpm --filter @omni/api smoke         # Full API smoke (requires API + DB + Redis running)
```

For the smoke suite, the API server must be running on 43111. Smoke creates and cleans up its own test data.

---

## Smoke Result (latest)

**Baseline before final pack: 1494 passed / 0 failed** (Phase 18B commit `47ca5a8`)

Final-pack commit re-verifies this baseline (no new smoke checks introduced unless a gap was found in Phase 19). Run smoke yourself with the command above to confirm.

---

## Safety Boundaries (permanent)

1. **No real WhatsApp / Meta sends by default.** Both safety flags ship `false`. Real send requires explicit operator action documented in `docs/ACTIVATION_GUIDE.md`.
2. **No raw secrets in API responses.** Enforced by:
   - `apps/api/src/lib/audit.ts` (write-side filter)
   - `apps/api/src/lib/audit-safe.ts` (read-side whitelist sanitizer)
   - Per-route field selection + explicit exclusion
   - Smoke tests with hard substring scans (tests 199 / 211–219)
3. **No broadcast / ads / bulk sending.** No such endpoints exist; `BLOCKED_BULK` guard enforced at send time.
4. **Tenant isolation.** Every data query is scoped by `tenantId` from JWT. Cross-tenant access is structurally impossible.
5. **5-tier RBAC.** OWNER / ADMIN / MANAGER / AGENT / VIEWER. Sensitive routes use `requireRole`.
6. **Credential vault.** All channel credentials (Meta tokens, app secrets) stored AES-256-GCM encrypted using `OMNI_API_KEY_ENCRYPTION_SECRET`.

---

## No Broadcast / Ads / Bulk-sending Statement

**Omni does not implement, and will not implement, broadcast / ads / bulk-sending / marketing-blast functionality.** This is a permanent product-positioning boundary, not a configurable flag. Plan pricing copy, signup page, and documentation all state this explicitly.

If you are evaluating Omni for marketing-broadcast use cases, **this is the wrong product**.

---

## Handoff Checklist

Before declaring v1 handed-off:

- [ ] Recipient operator has read this document end-to-end
- [ ] Recipient has read `docs/FINAL_PRODUCTION_READINESS.md`
- [ ] Recipient has read `docs/ACTIVATION_GUIDE.md`
- [ ] Recipient has run the full smoke suite locally and confirmed `0 failed`
- [ ] Recipient has access to the git repo + production env-var management
- [ ] Recipient has a rollback plan and knows the rollback command
- [ ] Recipient has at least one alternative on-call contact
- [ ] Recipient has read and understood the "No Broadcast / Ads / Bulk-sending" statement
- [ ] Recipient knows where DB backups go and how to restore

---

## Next Optional Roadmap (Post-v1)

See `docs/PRODUCT_COMPLETENESS_MATRIX.md` § "Deferred — Post-v1 Roadmap" for the full list. Top items:

1. **Real AI provider integrations** (OpenAI / Gemini / DeepSeek) — vault-encrypted keys, fallback chain, per-tenant override
2. **Real conversation export with redaction** — extend `/account/export` to optionally include messages with PII redaction
3. **i18n** — `/account`, `/signup`, key API `note` fields → tenant `defaultLanguage`
4. **Multi-instance Redis-backed HMAC replay cache** — production multi-instance support
5. **Email verification (real SMTP)** — replace stub at `/tenants/signup/verify-email-dry-run`
6. **Payment integration** — Stripe / Razorpay; gate behind explicit operator opt-in
7. **Push notification VAPID + delivery worker**
8. **Tenant offboarding / data deletion flow** (GDPR-style)
9. **Advanced Boss Dashboard analytics** (conversion funnel, time-to-close, ROI)
10. **Webhook delivery retry queue** for multi-instance correctness

**None of these are required for v1 acceptance.**

---

## Document Index

| Doc | Purpose |
|---|---|
| `V1_HANDOFF_PACKAGE.md` | **This file** — start here |
| `RELEASE_CANDIDATE_V1.md` | RC summary + acceptance |
| `FINAL_PRODUCTION_READINESS.md` | Production go-live checklist |
| `GO_LIVE_REHEARSAL.md` | Staging rehearsal script |
| `PRODUCT_COMPLETENESS_MATRIX.md` | Feature completeness vs. positioning |
| `ACTIVATION_GUIDE.md` | Real-send activation steps (operator) |
| `ACTIVATION_MONITORING.md` | Post-activation monitoring |
| `OPS_RUNBOOK.md` | Backup / monitoring / incident response |
| `PRODUCTION_HARDENING.md` | Cumulative security hardening |
| `REAL_DELIVERY_READINESS.md` | Guardrail architecture |
| `TENANT_ACCOUNT_MANAGEMENT.md` | `/account` hub spec |
| `TENANT_ONBOARDING_SELF_SERVICE.md` | `/signup` spec |
| `AUDIT_LOGS.md` | Audit log schema |
| `RBAC_TEAM_MANAGEMENT.md` | Role tiers |
| `RELEASE_CHECKLIST.md` | SaaS v1 release readiness page |
| `DEMO_FLOW.md` | 9-step demo walkthrough |
| `BOSS_DASHBOARD.md` | Boss dashboard spec |
| `MOBILE_PWA.md` | Mobile PWA spec |
| `KNOWLEDGE_BASE.md` / `KNOWLEDGE_API.md` | KB spec |
| `CHANNELS.md` / `CHANNEL_SETUP.md` / `META_WHATSAPP_API.md` / `WHATSAPP_WEB.md` | Channel specs |
| `FOLLOW_UP_AUTOMATION.md` / `AUTOMATION_API.md` | Follow-up engine |
| `LEAD_PIPELINE.md` / `CRM_API.md` / `CONVERSATION_API.md` / `CONVERSATION_DASHBOARD.md` | CRM specs |
| `BILLING_PLAN_READINESS.md` / `BILLING_COST_CALCULATOR.md` / `COST_CALCULATOR.md` | Billing specs |
| `PRODUCTION_LAUNCH_QA.md` | Production QA checklist page |
| `DEVELOPMENT_SAFETY.md` | Dev-time safety rules |
| `ARCHITECTURE.md` / `DATABASE.md` / `PORTS.md` | Architecture refs |
