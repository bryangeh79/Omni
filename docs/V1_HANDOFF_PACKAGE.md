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
> **Post-v1 Round-9H-3 (2026-05)：** SaaS Platform Admin 独立角色 critical access-control fix。Round-9H/9H-2 用 `requireRole('OWNER','ADMIN')` 守 `/admin/ai-settings` + `/admin/tenants`，但**租户内的 OWNER/ADMIN 同样满足该 check** — 意味着任何租户管理员都能读到平台 Core Prompt 与跨租户管理面板，严重越权。本轮引入**平台运维独立标记 `User.isPlatformAdmin Boolean @default(false)`**（migration `20260520000000_add_user_is_platform_admin`，同时把 demo seed `admin@omni-demo.test` 设为 true 让现有部署不会被锁死）+ 新 middleware `requirePlatformAdmin()`（apps/api/src/auth/middleware.ts，DB-backed check，**不**信任 JWT cached claim）。所有 `/admin/ai-settings`(3) 与 `/admin/tenants`(6) 端点改用 `requirePlatformAdmin()`。403 响应含 `platformAdminRequired: true` + 中文文案"你没有权限访问平台运维设置。"。Demo seed 自动 promoted 为 platform admin 便于开发 / smoke。Web `/admin/ai-settings/page.tsx` 新增 `ForbiddenError` class + `forbidden` 状态 + 全页 gated view（🔒 平台运维设置受限 + 中文说明 + 返回首页 CTA），不再把 403 当普通 error 报红。Smoke 新增 6 个 block / ~30 check（test 302-307）：demo seed 是 platform admin ✓ / 新 provision 的租户 OWNER 访问 `/admin/ai-settings` + `/admin/tenants` 全部 403 ✓ / 403 body 不含 Core Prompt / corePromptOverride / PLATFORM_CORE_PROMPT 任何片段 ✓ / `prismaSetPlatformAdmin(email,true)` 提权后访问 200 ✓ / 降权后再次 403 ✓ / tenant-facing endpoints 不暴露 `isPlatformAdmin` 字段 ✓。**未触碰**：真实 AI / Meta / WhatsApp / 邮件 / 支付全部 false；租户 OWNER/ADMIN 仍能管理自己的工作空间，**仅**平台运维专属端点收紧。**生产部署须知**：rollout 后手动执行 `UPDATE "User" SET "isPlatformAdmin"=true WHERE email='<ops-email>'` 提权真实平台运维账号。

> **Post-v1 Round-9H-2 (2026-05)：** SaaS Admin 平台核心 AI Prompt UI 完成。Round-9H 完成 backend foundation 但 `/admin/ai-settings` 前端缺管理 UI。本轮在该页加完整「平台核心 AI Prompt」section：状态徽章组（平台托管 / Starter-Pro 不可编辑 / 当前模式：使用平台默认 Prompt 或 使用平台自定义 Prompt / 版本 `platform-core-v1` / 自定义 Prompt 长度）+ collapsible "查看平台默认 Core Prompt" `<details>` 面板展示完整 PLATFORM_CORE_PROMPT 全文（仅 SaaS Admin 可见，含"请勿截图分享给租户"提示）+ 10 行 textarea override 编辑器含 placeholder 指导（输入完整 Core Prompt 覆盖平台默认；建议参考默认结构；至少 32 字符；留空或过短回退默认）+ 长度计数器（"长度：X 字符 · 最低 32"）+ 3 个按钮（「保存自定义 Prompt」/「恢复平台默认」/「刷新」，clear 按钮在无 override 时禁用）+ amber 安全提醒卡 3 条（不影响租户 / 不填敏感资料 / foundation 阶段不发真实 AI）+ 友好成功/错误中文反馈 setTimeout 4 秒自动消失。`handleSaveOverride` 客户端预校验（空 → 引导用 clear 按钮；< 32 → 提示会被视为清除）；`handleClearOverride` 加 confirm 二次确认。前端读 `body.platformCorePromptDefault` + `body.settings.{corePromptOverride, hasCorePromptOverride, corePromptOverrideLength}`（Round-9H 已暴露）并 prefill textarea。**未触碰**：后端逻辑、smoke 测试、租户边界、API 合约；smoke 仍 **2028 passed / 0 failed**（前端 UI 完成不影响 API 行为）。Round-9H 的 4 个 tenant endpoint × 4 forbidden pattern boundary scan 继续 pass，租户不可见 Core Prompt 任何字段。

> **Post-v1 Round-9H (2026-05)：** 平台 Core AI Prompt foundation。新 lib `apps/api/src/lib/platform-prompt.ts` 暴露 `PLATFORM_CORE_PROMPT` 常量（产品定义的完整中文核心 prompt：你是一位专业、亲切、高转化率的 WhatsApp AI 销售客服 + 5 条目标 + 10 条回复必须 + 6 条优先使用 + 5 条不能 + 严格安全提醒）+ `composePlatformPrompt(ctx)` 把 Core + 租户业务资料 + AI persona + AI 目标 + 回复语言 + 产品概要 + FAQ 样例 + 转人工触发 + 严格安全提醒拼成完整 system prompt。同时 export `findForbiddenLeaks(prompt)` 检测 9 类 secret pattern（passwordHash / accessToken / refreshToken / credentialRef / metaAccessTokenRef / webhookVerifyTokenRef / apiKeyRef / JWT_SECRET / DATABASE_URL / metadataJson）+ 内部 `scrub()` 函数把租户输入文本中匹配的 secret 替换为 `[redacted]` 防注入。`generateDeterministicPreview` 现在用 `composePlatformPrompt` 生成 `globalSystemPrompt`，旧的 `buildSystemPrompt` 删除；single source of truth。PlatformAiSettings 表加新字段 `corePromptOverride String?`（migration `20260519000000_add_platform_core_prompt_override`）允许 SaaS Admin 自定义平台 Core Prompt；override 长度 < 32 字符时自动 fall back 到 PLATFORM_CORE_PROMPT。`/admin/ai-settings` GET 响应新增 `platformCorePromptDefault` (展示给 admin 的默认 prompt 全文) + settings 增 `corePromptOverride` / `hasCorePromptOverride` / `corePromptOverrideLength` 3 字段（admin gated by requireRole OWNER/ADMIN）；POST 接受 `corePromptOverride` 写入；audit log 含 `corePromptChanged` boolean 但**绝不含 override 原文**。Tenant-facing endpoint（/billing/quota-summary / /settings/overview / /onboarding/progress / /account/service-status）扫 4 类 forbidden pattern (PLATFORM_CORE_PROMPT / corePromptOverride / platformCorePromptDefault / "你是一位专业..." 核心 prompt 开头) 全部 clean — 租户永不可见。`/onboarding/generate-preview` handler 读取 `PlatformAiSettings.corePromptOverride` 并透传给 deterministic preview composer。**不接入真实 AI provider** — 所有 prompt 仅用于本地拼接，永不发外部 HTTP；现有 `OMNI_ENABLE_ONBOARDING_AI` flag / `realAiProviderCalled: false` 字段全部不变。Smoke 新增 7 个 block / ~40 check（test 295-301）覆盖 platform Core 6 个段落 + 租户数据 weave (公司名 / 行业 / 营业时间 / AI 目标 / 转人工触发 / 反广播声明) + 9 类 secret leak 防御 + corePromptOverride save & 应用到 preview + < 32 char 自动 fallback + audit 不含 override 原文 + 4 个 tenant endpoint × 4 forbidden pattern = 16。

> **Post-v1 Round-9G (2026-05)：** 一键开通 sticky 操作栏 + 平台托管 AI Prompt + 生成器质量提升。**Sticky 操作栏**：`/onboarding` 页面底部新增 fixed-positioned 白色半透明操作栏（含 backdrop-blur + top border + subtle shadow），按当前 step 渲染对应主操作 — Step 0/1 显示「继续下一步 →」，Step 2 在未生成 / 资料更新时显示「一键生成产品成交配置 →」否则显示「继续下一步：预览 AI 配置 →」，Step 3 显示「← 编辑资料」+「启用配置 →」+ 资料更新告警；左侧统一含「← 返回上一步」+「保存草稿」。主区域加 96px tail spacer 防遮挡。**Stale config flag**：当 companyName / industry / aiGoals / products 任一变化且已经有 `preview` 或某产品的 `salesConfig` 存在时，自动 setConfigStale(true) → Step 2/3 显示琥珀色告警"资料已更新，请重新生成成交配置..." + 「启用配置」按钮禁用并改文"请先重新生成"；生成成功后 setConfigStale(false) 清除告警。**平台托管 AI Prompt 边界**：Step 3 预览中**移除**「系统提示词预览」`<details>` 面板（不再向租户显示 `globalSystemPrompt`），改为 emerald banner 含 3 条要点（Omni 自动生成 / 您不需要写 Prompt / 平台使用安全默认规则避免乱答乱承诺）。后端 `preview.globalSystemPrompt` 字段保留以备未来真实 AI provider wire，但前端不暴露。**Generator 质量提升**：`INDUSTRY_PERSONAS` 从 9 个扩展到 23 个（含 saas/software-dev/ai-chatbot/automation/digital-marketing/travel/insurance/legal/repair/home-services/wholesale/logistics/fitness/events），每个 industry 含独立 persona name+tone+focus；`INDUSTRY_FAQS` 同步扩展到 23 个 industry × 3 条 FAQ 草稿（中文化 + 不幻觉 exact price / 保证 / 法律医疗承诺 + 缺资料时建议转人工）；产品 sales-config generator 即使最小输入仍生成 ≥30 条 FAQ + 销售话术 + 客户资格 + 标签 + 评分 + 跟进 + 转人工规则，缺数据使用 "资料中未明确说明，建议转人工确认" 安全文案。**Smoke +4 个 block / ~30 check**（test 291-294）：8 个新 industry preview 生成验证 + preview shape 7 字段保留 + 最小输入仍输出完整 7 section + 不出现 invented price / guarantee / cure / lifetime warranty / safe fallback 含 "资料中未明确说明" 或 "建议转人工"。**未触碰**：真实 AI / Meta / WhatsApp / 邮件 / 支付，全部 false；平台 AI key 仍永不在响应或审计 metadata 出现。

> **Post-v1 Round-9F (2026-05)：** 平台 AI 设置 UX 简化 + 高性价比默认模型策略。`/admin/ai-settings` UI 全面简化 — 移除大红警告 banner，改为友好状态卡（Provider / 默认模型 / API Key 状态 / AI 服务 / 租户自带 Key 五行 + 中性绿/黄/灰徽章），Provider 改为 `DeepSeek（推荐 · 高性价比）/ OpenAI / Gemini / 其他` 4 选项 dropdown，**默认模型 input 改为 provider-aware dropdown**：DeepSeek → deepseek-chat（推荐）/ deepseek-reasoner，OpenAI → gpt-4o-mini（推荐）/ gpt-4.1-mini / gpt-4.1，Gemini → gemini-2.5-flash-lite（推荐）/ gemini-2.5-flash / gemini-2.5-pro，"其他" 走自定义 input。Provider 切换时若当前 model 不在新 provider 支持列表，自动 snap 到该 provider 的 cost-effective default。安全说明从大红 banner 改为 `<details>` 可折叠的"安全说明 / 高级说明"小字。Backend：首次保存无 provider → 默认 `deepseek`；保存时若 defaultModel 与 provider 不匹配自动 snap 到 cost-effective default（deepseek-chat / gpt-4o-mini / gemini-2.5-flash-lite）；provider=other + enabled=true 必须填 defaultModel 否则 400。**测试连接 Bad Request 修复**：根因为前端 POST 无 body + Content-Type=json → Fastify body-parser 400。修复（a）前端 `handleTest` 显式发 `JSON.stringify({})`；（b）后端 endpoint 加 `schema: { body: { type: 'object', additionalProperties: true, nullable: true } }` 容忍空 body；（c）响应新增 `messageZh` 字段（未保存 Key → "请先保存 API Key 后再测试连接。" / 已保存 → "测试通过：已检测到平台 AI Key 设置..." / 模型不匹配 → "请选择该 Provider 支持的模型。"）。GET 响应新增 `providers / models` 目录字段让前端无需第二次调用。Smoke 新增 8 个 block / ~25 check（test 283-290）：catalogue / 3 个 provider 默认 / 不匹配 snap / 旗舰可手选 / other 必填 model / test-stub 空 body 容忍 + messageZh / tenant 3 endpoint × 6 forbidden pattern 不暴露模型名 / apiKey / PROVIDER_MODELS。**未触碰**：真实 AI / Meta / WhatsApp / 邮件 / 支付调用全部 false；原始 API Key 仍永不在响应 / 审计 metadata 出现；allowTenantProvidedKeys=true 仍 server hard-reject 400。

> **Post-v1 Round-9E (2026-05)：** 一键开通 UX 修复 + 平台 AI Key 设置。UAT 反馈修复：(1) **invalid Bearer token 拦截**：`apiFetch` 检测到 401 时自动 clearToken + 抛出"登录已失效，请重新登录"（中文友好），所有 inline LoginForm 不再显示英文原始错误；(2) **行业列表扩展**：signup / onboarding 的 INDUSTRIES 从 9 项扩展到 23 项（SaaS / 软件开发 / AI Chatbot / 自动化系统 / 数码营销 / 旅游 / 保险 / 法律 / 维修 / 家政 / 批发 / 物流 / 健身 / 活动策划 等）；(3) **产品 setup 改为 selection-first**：产品分类 14 项 dropdown、适合客户 11 个 chip 多选、主要卖点 8 个 chip + AI 自动生成模式、价格 7 选项 dropdown、流程 6 选项 dropdown、客户需提供资料 10 chip、转人工条件 9 chip — 全部支持点选 + 可选 textarea 自定义；(4) **drag-and-drop 上传**：onDragOver / onDrop 处理 + 视觉提示"拖拉 PDF / Word / 图片 / 价目表到这里"+ 接受 .pdf/.doc/.docx/.txt/.md/.png/.jpg/.jpeg/.webp + ≤10MB；(5) **「一键生成产品成交配置」按钮移到上方**：产品名称 + 上传/粘贴/链接后立即出现；结构化字段下放到 `<details>` 可选区；(6) **「预览 AI 配置」Bad Request 修复**：handleGeneratePreview 先客户端校验公司资料是否完整，失败时引导回 Step 0；所有 setError 调用统一走 `toChineseError` 中文映射；(7) **新 SaaS Admin 平台 AI 设置**：新表 `PlatformAiSettings`（singleton 行 + provider / defaultModel / apiKeyEncrypted / apiKeyLast4 / hasApiKey / enabled / allowTenantProvidedKeys=false / updatedAt / updatedByUserId）+ migration `20260518000000_add_platform_ai_settings`。新 endpoints `GET / POST /admin/ai-settings` + `POST /admin/ai-settings/test-connection-stub`，全部 `requireRole('OWNER','ADMIN')` 守门（标 `TODO(platform-rbac)`）。**绝不**返回 raw `apiKey` / `apiKeyEncrypted`，**绝不**写审计明文密钥；`apiKeyLast4` + `hasApiKey` flag 是仅有可见信息。`allowTenantProvidedKeys=true` 在 server-side 强制拒绝（400）。`/admin/ai-settings` UI 改成完整的 provider / model / key 编辑表单（password type + 占位"已保存 API Key：****1234"+ "新 Key 输入覆盖"语义）+ test-connection-stub 按钮（纯本地检查，不发任何 HTTP）。Smoke 新增 7 个 block / ~30 check（test 276-282）覆盖 auth 401 / shape 含 hasApiKey+last4 而**无 raw**+ "apiKeyEncrypted" / 保存后响应 + audit 均无 raw key 出现 / `allowTenantProvidedKeys=true` reject / invalid provider reject / test-stub no-real-call / tenant-facing endpoints 5 类无 apiKey 泄漏。**未触碰**：真实 AI provider 调用 / 真实 Meta / 真实 WhatsApp / 真实邮件 / 真实支付，全部 false。

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
