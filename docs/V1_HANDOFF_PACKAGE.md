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
>
> **Post-v1 UAT Round-8 (2026-05)：** 产品智能配置中心 + AI 成交配置生成器。Onboarding 第 3 步「产品资料」从单一大文本框升级为**多产品**配置中心 — 租户可创建/选择多个产品，每个产品提供基础引导字段（名称 / 分类 / 适合客户 / 卖点 / 价格 / 流程 / 客户资料 / 转人工条件 / 补充）+ 三种资料输入模式（粘贴 / URL / 文件上传）；点击「一键生成产品成交配置」由新增确定性生成器 `apps/api/src/lib/product-sales-config-generator.ts` 输出 30–50 条 FAQ 草稿 + 销售话术 + 客户资格问题 + 标签 + 评分规则 + 跟进规则 + 转人工规则；review UI 支持 FAQ 勾选 / 编辑 / 删除 / 批量保存到知识库。三个新 API：`POST /onboarding/products/generate-sales-config`、`POST /onboarding/products/save-sales-config`、`POST /onboarding/products/save-faq-to-knowledge`，全部 tenant-scoped、默认 **不调用真实 AI / Meta / WhatsApp / 邮件 / 支付**。产品配置持久化在 `OnboardingDraft.generatedPreview.products[]` JSON 字段（**无 schema 迁移**）。知识库页面对已保存的产品 FAQ 显示「产品：{name}」绿色徽章。文件上传当前版本只记录元数据 + .txt/.md 文本提取，PDF/DOCX/图片建议同时粘贴关键文字以生成 FAQ。
>
> **Post-v1 Round-9A (2026-05)：** Starter / Pro 套餐配额 + AI 智能回复 + Add-on Counter 商业基础层。新增单一新表 `TenantBillingState`（JSON 字段持 quota counter / smart-reply 开关 / 已购 credits / active add-ons / 存根 ledger）；新增 `apps/api/src/lib/plans.ts` 单一事实来源（Starter RM199/月 / Pro RM399 月、6 个月 Launch Commitment Offer RM299/月 — 仅 6 个月承诺、绝不作为常规月度价；9 个 add-on：产品扩容包 S/M/L · AI FAQ 生成包 S/M/L · AI 回复包 S/M/L）；新增 `apps/api/src/lib/quota.ts` 暴露 `tryDeductFaqGeneration` / `tryDeductAiReplyCredit` / `setAiSmartReplyEnabled` / `createPurchaseIntent` / `processStubPaymentEvent`（idempotent 通过 `externalEventId`）；四个新 endpoint：`GET /billing/plan-definitions`、`GET /billing/quota-summary`、`POST /billing/ai-smart-reply`、`POST /billing/purchase-intent`、`POST /billing/payment-event`。Round-8 `/onboarding/products/generate-sales-config` 现已挂钩 FAQ 配额（1 click = 1 deduction，资料不足 / 编辑 / 删除均不扣；配额耗尽返回 429 + CTA）。Web `/billing` 页面新增配额计数器（条形进度 + 80/90/100% 警示 + 一键购买 add-on 按钮模拟付款 stub flow），`/settings` 页面新增 AI 智能回复 ON/OFF 切换 + 扣费说明。**未集成真实支付网关**，所有 payment-event 通过 `paymentGateway: 'NOT_CONFIGURED'` + `realPaymentGatewayCalled: false` 明确标注。Meta 官方 WhatsApp API 费用为 pass-through，独立计费 — 不包含在套餐内。
>
> **Post-v1 Round-9D (2026-05)：** 一键开通引导式开通流程。**登录简化** — `/auth/login` 接受 `{ email, password }` 即可（无需 `tenantSlug`），后端 `findUniqueActiveUserByEmail` 按邮箱唯一解析租户；多租户绑定同一邮箱返回 409 + 安全错误"此邮箱绑定多个工作空间，请联系服务商。"；legacy `{ tenantSlug, email, password }` 完全保留兼容。21 个 inline LoginForm 中的"租户标识"输入框统一改为可选字段（placeholder 加"（可选 · 高级登录）"，移除 required）。新 endpoint `GET /onboarding/progress` 返回 6 步开通进度（company / goals / products / config / channel / activation）+ completedCount / totalCount=6 / percent / currentStepKey / nextActionLabel / nextActionHref / isComplete / activationRequestStatus；`POST /onboarding/submit-activation-request` 让租户提交上线申请（写入 ChannelSetupDraft.activationStatus='REQUESTED' + activationRequestedAt + 审计 `ACTIVATION_REQUEST_SUBMITTED`），**租户不能审批**，blocked 状态租户 403。ChannelSetupDraft 表加 2 个字段（activationStatus / activationRequestedAt）的 migration `20260517000000_add_channel_activation_request`。Web `/onboarding` 页顶部新增 6 步 journey 卡（标题 "Omni 开通进度 X/6"、进度条、checklist、活跃步骤蓝色高亮、下一步 CTA、激活状态徽章、step 5+ 出现"提交上线申请"按钮）；`/boss` 页未完成时显示 gradient 蓝色"还差 X 步即可上线"大卡片（含 6 步小 checklist + "继续开通 / 知识库 / 连接 WhatsApp" CTA）；`/knowledge` 空状态主 CTA 改为"去配置 AI 客服，自动生成 FAQ"+ 副"手动添加 FAQ"。AppNav "配置 AI 客服" → "**一键开通**"。Smoke 新增 6 个 block / ~30 check（test 270-275：email-only login / legacy login / 缺字段 400 / progress 6-step shape / submit-activation-request 200|400 + 401 + 安全 flag 全 false / progress 响应无 secrets / env var）。**未触碰**：API 现有 contract、真实 AI / Meta / WhatsApp / 邮件 / 支付调用全部 false。

> **Post-v1 Round-9C (2026-05)：** SaaS Admin 模式下的租户 UX 清理。Billing 页面从"选择套餐"改为「**套餐与额度**」纯展示（移除 plan-card grid，保留当前套餐 + 服务状态 + 合约 + quota counter + add-on 加购）；quota-summary 响应新增 `faqDirectReplies` 计数器（来自 FAQ 直发，不扣 AI 回复额度的基础字段）+ `tenantCanChangePlan: false` + `platformHostedAi: true` + 内联 `serviceAccess` 块。Settings AI 智能回复段加上"当前使用：平台 AI 服务"徽章 + 5 条扣费规则文案，明确告知租户**不需要 / 不能自行填写 API Key**。新 SaaS Admin 页 `/admin/ai-settings` 展示平台 AI provider / key 状态（只读，绝不显示明文 key）+ 关联工具入口；AppNav SaaS Admin 分组加「**平台 AI 设置**」入口。WhatsApp 渠道页（`/channels/setup` + `/channels/setup/wa-web/qr` + `/channels/setup/meta-webhook`）租户可见区域**剥离所有 OMNI_ env var 文案**，换成业务语言（"为保护账号安全，真实连接需由服务商完成平台审核后开启"）；`/activation-guide` 与 `/activation/monitoring`（SaaS Admin 内部页）保留 env var 但加 amber 徽章"SaaS Admin / 平台运维 内部诊断 — 普通租户无需操作"。Knowledge 页顶部加紫色 purpose copy 块"知识库 = 管理 / 微调，配置 AI 客服 = 一键生成"+ 主 CTA「+ 从产品资料生成 FAQ」直跳 /onboarding。AppNav 退出登录按钮从侧栏底部移到**右上角浮动账户菜单**（我的账户 / 设置 / 退出），侧栏底部仅显示 v1·UAT 版本。Smoke 新增 5 个 block / ~25+ check（test 237 扩展 + 265-269）覆盖 tenant-cant-change-plan / platform-hosted-ai / faqDirectReplies / no API key leak / no env var leak / smart-reply 切换无 provider key fields。**未触碰**：Round-9A/9B endpoint shape、真实 AI / Meta / WhatsApp / 邮件 / 支付调用全部仍 false。
>
> **Post-v1 Round-9B (2026-05)：** SaaS Admin 租户开户 + License/Contract 服务接入控制。Omni 商业模式确认为 **SaaS Admin 开户制** — 普通租户不再"自助注册"，由 SaaS 公司签约 / 收款 / 审核后由 SaaS Admin 创建租户账号、设定套餐 / 合约 / 授权码 / 服务状态、生成临时密码手动交付客户。Tenant 表新增 6 个字段（`serviceStatus` / `contractStartAt` / `contractEndAt` / `licenseCode` / `suspensionReason` / `internalNotes`）。新 helper `apps/api/src/lib/service-access.ts` 暴露 `getTenantServiceAccess` + `requireServiceActive` + `suggestLicenseCode`；服务状态枚举 6 个值（TRIAL / ACTIVE / PAST_DUE / SUSPENDED / EXPIRED / CANCELLED）+ 中文 label。新 route 模块 `apps/api/src/routes/admin-tenants.ts` 提供：`GET /admin/tenants`、`GET /admin/tenants/:id`、`POST /admin/tenants`、`PATCH /admin/tenants/:id/service-status`、`PATCH /admin/tenants/:id/contract`、`POST /admin/tenants/:id/reset-password-stub`，新 endpoint `GET /account/service-status` 提供租户侧只读状态（不暴露 internalNotes）。Round-8 `generate-sales-config` 与 `save-sales-config`（新增产品场景）现已挂钩 service-access guard — SUSPENDED / EXPIRED / CANCELLED 返回 403 + tenantFacingBanner + CTA，**不删除已有数据**；ACTIVE / TRIAL / PAST_DUE 正常通过。AppNav 重排：移除「新建账号」(自助注册项)、重命名「上线向导」→「配置 AI 客服」/「渠道设置」→「连接 WhatsApp」/「新客户上线」→「开始使用」/「套餐与计费」→「套餐与额度」+ 新增「上线检查」入口；SaaS Admin 分组顶部新增「租户管理 / 创建租户 / 套餐 / 授权 / 到期 / 暂停管理」4 项。新 web 页 `/admin/tenants` + `/admin/tenants/new` 提供完整 list / 创建 / 暂停 / 恢复 / 延长合约 / 重置临时密码 UI（临时密码仅显示一次 + 手动交付提示）。`/signup` 路由保留但前置黄色 banner 明确"SaaS Admin 内部 / 测试入口"，`/account` 页面顶端新增服务状态横幅（试用 / 逾期 / 暂停 / 到期 / 取消的租户可见对应文案 + CTA）。审计事件：TENANT_PROVISIONED_BY_ADMIN / TENANT_SUSPENDED / TENANT_REACTIVATED / TENANT_SERVICE_STATUS_CHANGED / TENANT_CONTRACT_EXTENDED / TENANT_PASSWORD_RESET_STUB — 全部不包含 passwordHash / 明文临时密码 / 完整 internalNotes。**未发真实邮件**、未集成真实支付、未启用真实 AI / Meta / WhatsApp 调用。Smoke 新增 14 个 block / 60+ check（test 250–264）。

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
