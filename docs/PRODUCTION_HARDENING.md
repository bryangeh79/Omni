# Omni Production Hardening — Phase 10A/10B → 15B → Post-v1 UAT Polish

## Post-v1 UAT Round-8 — Product Intelligence Setup + AI Sales Config Generator

继 Round-7 之后，Round-8 解决"租户上线时被要求自己写 FAQ / 自己搭流程"的 UX 痛点，让产品体验对齐核心价值主张「上传产品资料，Omni 自动生成 AI 客服、CRM、跟进规则」：

- **新增确定性生成器** `apps/api/src/lib/product-sales-config-generator.ts`：纯函数，无任何外部调用，根据产品基础字段 + 资料文本生成完整 sales-config bundle：
  - `productProfile` — 产品简介 / 适合客户 / 核心卖点 / 价格说明 / 购买流程 / 限制 / 售后 / AI 回复边界
  - `faqDrafts` — 30–50 条 FAQ 草稿（默认 40），分 11 类（产品介绍 / 适合对象 / 价格 / 套餐 / 付款 / 购买流程 / 预约 / Demo / 售后 / 限制条件 / 比较 / 犹豫处理 / 常见疑虑 / 转人工问题）；保证 ≥3 条价格、≥3 条转人工、≥3 条异议处理、≥3 条流程类；资料不足时答案标注「资料中未明确说明，建议转人工确认。」
  - `salesScripts` — 8 个销售场景（欢迎 / 问价 / 犹豫 / 求优惠 / 预约 Demo / 比较竞品 / 长时间无回复 / 要求人工）
  - `qualificationQuestions` — 客户资格问题（需求 / 预算 / 时间 / 团队规模等）
  - `suggestedTags` — 11 个 CRM 标签（含产品名 tag）
  - `leadScoringRules` — 9 条意向评分规则（问价 +20 / 问 Demo +25 / 问付款 +30 / 要真人 +30 / 投诉 -50 / 黑名单 -100 等）
  - `followUpRules` — 5 条跟进规则（PRICE_ASKED_NO_REPLY / CONSIDERING / BOOKING_NOT_CONFIRMED / HIGH_INTENT_UNHANDLED / LONG_NO_REPLY）
  - `handoffRules` — 8+ 条转人工触发器（要求人工 / 不确定 / 价格不全 / 付款 / 投诉 / 法律 / 医疗高风险 / 高意向阈值），+ 租户自定义规则
  - `summary` — 包含 coverageNote、missingFields、各类 FAQ 计数
  - **永不幻觉**：具体价格 / 保修期 / 配送承诺 / 医疗 / 法律声明若资料中缺失，输出"建议转人工确认"
- **三个新 API endpoint**（全部 `apps/api/src/routes/onboarding.ts` 内 tenant-scoped + JWT auth）：
  - `POST /onboarding/products/generate-sales-config` — 返回完整 ProductSalesConfig 草稿；拒绝原始文件 bytes；响应含 `realAiProviderCalled: false` / `realWhatsAppSent: false` / `realMetaCalled: false` 显式安全字段
  - `POST /onboarding/products/save-sales-config` — 持久化租户编辑后的 product setup 到 `OnboardingDraft.generatedPreview.products[]`（≤20 个产品 / 每租户），**无 schema migration** — 利用现有 JSON 字段；存储前剥离 `uploadedFile.rawBytes` 等敏感键
  - `POST /onboarding/products/save-faq-to-knowledge` — bulk 保存 FAQ 草稿到 `KnowledgeItem` 表 `type=PRODUCT_FAQ`；问题前缀 `[ProductName] ` 保留产品上下文；按 `(tenantId + question normalized lowercase)` 做去重（同问题幂等，安全跳过）；返回 `{ saved, skippedDuplicates, knowledgeItemIds }`
- **Web 端 (`apps/web/src/app/onboarding/page.tsx`) — Step 2 重设计**：
  - 多产品选择器（chips：产品 1 / 产品 2 / + 新增产品 / 删除当前产品；最多 20 个）
  - 每产品状态徽章（待填写资料 / 待生成配置 / 已生成配置 / 已保存 FAQ / 已启用）
  - 引导式基础字段（产品名 / 分类 / 适合客户 / 卖点 / 价格 / 流程 / 客户资料 / 转人工条件 / 补充）
  - 三种资料输入模式：粘贴 / URL / 文件上传（accept .pdf/.doc/.docx/.txt/.md/images；≤10 MB；.txt/.md 自动提取文本到粘贴区；PDF/DOCX/图片仅记录元数据并提示同时粘贴文字内容）
  - Primary action 「一键生成产品成交配置」+ 中文 helper copy 三段
  - Review section（生成后展开）：产品档案 / FAQ 草稿（可勾选 / 编辑问答 / 修改分类 / 删除）/ 销售话术 / 客户资格问题 / 标签 / 评分规则 / 跟进规则 / 转人工规则 / 覆盖提示
  - 操作按钮：「保存选中的 FAQ 到知识库」+「保存产品配置」+「继续下一步：预览 AI 配置」
  - **旧版单文本框 + URL + 「解析旧版资料」按钮**保留在 `<details>` 折叠区作为兼容回退，确保 `/onboarding/ingest-materials` 老流程不破坏
- **Knowledge page 集成**：列表项若 `question` 以 `[ProductName] ` 前缀开头，提取出绿色「产品：{name}」徽章；问题正文显示时自动剥离前缀（向后兼容 — 旧条目无前缀仍正常显示）
- **Smoke tests 新增 15 个 block / 60+ check**（test 220-234）：endpoint auth / 必填校验 / FAQ 数量与分类约束 / sales scripts / qualification / tags / scoring / follow-up / handoff 形状 / response 无 secrets 扫描 / save-sales-config 持久化 / FAQ 重复保存幂等性 / 知识库可检索性 / 拒绝 raw file bytes / safety flags 未被改动
- **持久化策略**：`OnboardingDraft.generatedPreview` 已是 JSON 列；Round-8 在该 JSON 下新增 `products[]` / `productsUpdatedAt` 子键，**保留** Round-7 之前的 `EnrichedPreview` 字段（aiPersona / faqSamples / ingestedAt 等），后续 `generate-preview` 与 `ingest-materials` 行为完全兼容
- **未触碰**：API contract（仅新增 endpoint）、route paths、enum value、schema、真实发送门控、产品定位（非广播 / 非广告 / 非群发）；旧 onboarding 流程（textarea + ingest-materials + generate-preview + enable）保持工作

## Post-v1 UAT Round-7 — Sidebar IA Cleanup / SaaS Admin Separation

继 Round-6 之后，Round-7 在 UAT 反馈基础上重组 `AppNav.tsx` 的信息架构，让租户日常功能与 SaaS Admin / 平台运维清晰分离：

- **顶部租户日常分组（4 个）**：
  1. **日常工作** — `/boss`, `/inbox`, `/pwa`
  2. **客户与成交** — `/knowledge`
  3. **新客户上线** — `/signup`, `/onboarding`, `/channels/setup`（子页 meta-webhook / wa-web-qr 仍由 `/channels/setup` 内部入口可达，避免菜单过长）
  4. **账户管理** — `/account`, `/team`, `/billing`, `/settings`
- **底部 SaaS Admin / 平台运维分组**（视觉分隔 + section label "SaaS Admin · 平台运维"）：
  - `/activation-guide`, `/activation/monitoring`, `/launch-checklist`, `/audit`, `/production-qa`, `/ops/runbook`, `/release-checklist`, `/demo-flow`
- **视觉层级**：admin 分组使用更小字号（0.75rem）、更暗颜色（TEXT_DIM）、`opacity: 0.85`，与顶部租户分组形成主次对比；分隔线 + uppercase letter-spacing 的小标签 "SaaS Admin · 平台运维" 前置。
- **默认展开行为**：仅展开当前活跃分组；无活跃路由时回退到展开"日常工作"。`localStorage` 键升级为 `omni.nav.expanded.v2`，旧 v1 键（含 `ops`）自然失效。
- **未实现 RBAC 隐藏**：组件源码包含 comment "Future: hide SaaS Admin group for non-platform roles when platform RBAC is available."；当前对所有租户均显示，仅做视觉分离，未变更 route 可达性。
- **所有路由保留**：未删除任何页面或链接；mobile drawer / collapsible 行为 / active 高亮 / sticky / scroll 行为均不变。
- **未触碰**：API 合约、route paths、enum value、smoke 用例、真实发送门控、产品定位（非广播 / 非广告 / 非群发）。

## Post-v1 UAT Round-6 — Eliminate Login Form Flash on Navigation

继 Round-5 之后，Round-6 修复点击菜单切换页面时短暂闪登录页的问题：

- **根因**：每个 client page 用 `useState(false)` 初始化 `authed`，再用 `useEffect(() => setAuthed(!!getToken()), [])` 异步读取 localStorage。Next.js SSR 阶段无 localStorage 访问，初始渲染必为 `authed=false`，因此每次切页都先渲染 1 帧 `<LoginForm>` 才切到真实内容。
- **修复**：将 18 个 client page 的 `authed` 改为三态 `boolean | null`，初始 `null` 表示"检查中"，渲染 `null`（layout AppNav 保留，主区域空白一瞬不可见）；`useEffect` 跑完后再切到 `true / false`。SSR + 客户端首次渲染都返回 `null`，无 hydration mismatch、无闪烁。
- **未改动**：`activation-guide` 页面 — 该页不整页 swap 到登录表单，仅在内部条件渲染中使用 `authed`，无闪烁问题。
- **未触碰**：API、DB schema、enum、smoke 用例、真实发送门控。

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
