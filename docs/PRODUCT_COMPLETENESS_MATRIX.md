# Omni — Product Completeness Matrix (v1)

This document maps each Omni positioning capability to its current implementation status. Status legend:

- ✅ **Complete** — implemented, tested, in production-ready state
- 🟡 **Partial** — usable but with scope limits documented
- 🔵 **Stub / dry-run** — endpoint or UI exists but does not call real providers; safe by default
- ⏳ **Deferred** — out of v1 scope; logged for post-v1 roadmap
- ❌ **Not implemented** — explicitly excluded by positioning

Positioning: **Omni Ai Chatbot｜WhatsApp AI 客服 CRM 成交系统** — 1:1 AI customer service, not a broadcast / ads / bulk-sending platform.

---

## Core Capabilities

| # | Capability | Status | Route / API | Doc | Test (smoke #) |
|---|---|---|---|---|---|
| 1 | **WhatsApp AI customer service** (inbound → AI reply pipeline) | 🔵 Stub | `/webhooks/meta/whatsapp/:id`, `/messages/send` | `META_WHATSAPP_API.md`, `REAL_DELIVERY_READINESS.md` | 62–67 |
| 2 | **CRM — Customer/Lead model** | ✅ Complete | `/customers/*`, `/conversations/*` | `CRM_API.md`, `CONVERSATION_API.md` | 70–80 |
| 3 | **Lead Scoring + Stage pipeline** | ✅ Complete | `/customers/:id/stage`, `/conversations` (with stage) | `LEAD_PIPELINE.md` | 79–81 |
| 4 | **Automatic Follow-up Automation** | ✅ Complete | `/follow-ups/*`, 5 default rules per tenant | `FOLLOW_UP_AUTOMATION.md` | 82–87 |
| 5 | **Handoff to human** | ✅ Complete | `/conversations/:id/takeover`, `/release-ai`, `/close` | `CONVERSATION_API.md` | 81 |
| 6 | **Boss Dashboard** | ✅ Complete | `/boss` web page, `/boss/*` API, `/boss/channel-health` | `BOSS_DASHBOARD.md` | 88–96 |
| 7 | **Mobile PWA** | ✅ Complete | `/pwa` web page, `/manifest.webmanifest`, push notification stubs | `MOBILE_PWA.md`, `PUSH_NOTIFICATIONS.md` | 88–95 |
| 8 | **One-click startup configuration generation** | 🟡 Partial | `/onboarding` wizard (deterministic templates) | `ONBOARDING_WIZARD.md` | (UI flow, no API smoke) |
| 9 | **Knowledge Base** | ✅ Complete | `/knowledge`, `/knowledge/items` | `KNOWLEDGE_BASE.md`, `KNOWLEDGE_API.md` | 110 |
| 10 | **Channel Setup Wizard** | ✅ Complete (no real send) | `/channels/setup/*`, credential vault | `CHANNEL_SETUP.md`, `CHANNELS.md` | 111–122 |
| 11 | **WA Web QR session** | 🔵 Stub-guarded | `/channels/setup/wa-web/*` (returns BLOCKED unless flag on) | `WHATSAPP_WEB.md` | 129+ |
| 12 | **Meta WhatsApp Business webhook + send** | 🔵 Stub-guarded | `/channels/setup/meta-webhook/*` (live test BLOCKED unless flag on) | `META_WHATSAPP_API.md` | 123–128 |

---

## SaaS Lifecycle

| # | Capability | Status | Route / API | Doc | Test (smoke #) |
|---|---|---|---|---|---|
| 13 | **Tenant self-service signup** | ✅ Complete | `POST /tenants/signup` + `/signup` | `TENANT_ONBOARDING_SELF_SERVICE.md` | 178–185 |
| 14 | **Email verification** | 🔵 Stub | `POST /tenants/signup/verify-email-dry-run` | `TENANT_ONBOARDING_SELF_SERVICE.md` | 183 |
| 15 | **Account self-management hub** | ✅ Complete | `/account` + `GET /account/overview` + `PATCH /account/profile` | `TENANT_ACCOUNT_MANAGEMENT.md` | 186–193 |
| 16 | **Activity history + filtering** | ✅ Complete | `GET /account/activity` (Phase 17D filters) | `TENANT_ACCOUNT_MANAGEMENT.md` | 203–205 |
| 17 | **Security events view** | ✅ Complete | `GET /account/security-events` (OWNER/ADMIN) | `TENANT_ACCOUNT_MANAGEMENT.md` | 206–210 |
| 18 | **Safe tenant export** | ✅ Complete | `GET /account/export` (OWNER/ADMIN, redaction block) | `TENANT_ACCOUNT_MANAGEMENT.md` | 197–202 |
| 19 | **Team management + RBAC** | ✅ Complete | `/team`, 5-tier RBAC (OWNER/ADMIN/MANAGER/AGENT/VIEWER) | `RBAC_TEAM_MANAGEMENT.md` | 148–150 |
| 20 | **Billing / plan readiness** | 🔵 Stub | `/billing/*` (no real payment gateway) | `BILLING_PLAN_READINESS.md` | 142–145 |
| 21 | **Cost calculator** | ✅ Complete | `/admin/cost-calculator` | `COST_CALCULATOR.md`, `BILLING_COST_CALCULATOR.md` | 58–61 |

---

## Production Operations

| # | Capability | Status | Route / API | Doc | Test (smoke #) |
|---|---|---|---|---|---|
| 22 | **Audit log foundation** | ✅ Complete | `GET /audit/logs` (sanitized via `audit-safe.ts`) | `AUDIT_LOGS.md` | 151–155 |
| 23 | **Production QA checklist** | ✅ Complete | `/production-qa` + `GET /production-qa/checklist` | `PRODUCTION_LAUNCH_QA.md` | 157 |
| 24 | **Release checklist** | ✅ Complete | `/release-checklist` + `GET /release-checklist/status` | `RELEASE_CHECKLIST.md` | 158–162 |
| 25 | **Activation operator guide** | ✅ Complete | `/activation-guide` + `/activation/preflight`/`dry-run`/`health` | `ACTIVATION_GUIDE.md` | 163–169 |
| 26 | **Activation monitoring dashboard** | ✅ Complete | `/activation/monitoring` + `/activation/timeline` + `/activation/go-live-checklist` + `/activation/test-message/dry-run` | `ACTIVATION_MONITORING.md` | 170–177 |
| 27 | **Ops runbook** | ✅ Complete | `/ops/runbook` web + `/ops/health` API | `OPS_RUNBOOK.md` | (health 1, 2) |
| 28 | **Demo flow walkthrough** | ✅ Complete | `/demo-flow` | `DEMO_FLOW.md` | (build smoke) |
| 29 | **Shared audit-safe sanitizer** | ✅ Complete | `apps/api/src/lib/audit-safe.ts` | `TENANT_ACCOUNT_MANAGEMENT.md` (Phase 18A/B) | 211–219 |
| 30 | **App shell navigation** | ✅ Complete | `AppNav` component, all 18+ routes reachable | (in `PRODUCTION_HARDENING.md` Phase 15D) | (build smoke) |

---

## Explicitly Excluded by Positioning (will NOT be built)

| # | Capability | Status |
|---|---|---|
| 31 | Marketing broadcast / mass send | ❌ Not implemented — categorically excluded; `BLOCKED_BULK` guard enforced |
| 32 | Ads / lead-generation campaigns | ❌ Not implemented — out of positioning |
| 33 | Bulk import / blast-to-list | ❌ Not implemented — out of positioning |
| 34 | Real payment gateway | ❌ Not v1 — billing is draft / preference only; `paymentGateway: NOT_CONFIGURED` |
| 35 | Real email delivery | ❌ Not v1 — all email is stub; `emailSent: false` everywhere |

---

## Deferred — Post-v1 Roadmap

| Item | Reason deferred | Priority |
|---|---|---|
| Real AI provider integrations (OpenAI / Gemini / DeepSeek) | Safety gate; provider keys must be vault-encrypted first | High |
| Multi-instance Redis-backed HMAC replay cache | Single-instance deployment is the current target | Medium |
| Audit-safe whitelist write-side enforcement | Defensive-in-depth; current write-side already filters via `lib/audit.ts` | Medium |
| Audit UI advanced filters (action group, date range) — already done in `/account/activity`; mirror to `/audit` | Tier-2 polish | Low |
| i18n (zh / en / ms) full multilingual | UAT Round-1 ~ 5 已完成 **中文优先（Chinese-first）** 全量覆盖（onboarding / channels / knowledge / launch / release / qa / ops / activation / account / audit / billing / team / settings / inbox / pwa / signup / boss）；Round-3 新增 `lib/errorText.ts`、Round-4 新增 `lib/enumLabels.ts`；Round-5 扩展 plan / launch / release / qa 状态映射 + 套餐套餐 ID 中文显示 + 计费错误中文化；Round-6 消除菜单切换时登录页闪烁（三态 authed）；Round-7 重组侧边栏 IA — 租户日常 4 组在顶部、SaaS Admin · 平台运维 1 组在底部分隔；i18n 多语言切换框架延后到 post-v1 | Medium |
| Platform RBAC to hide SaaS Admin / 平台运维 sidebar group from non-platform tenants | Round-7 already separated the group visually with divider + muted styling and left a `Future:` code comment in `AppNav.tsx` near the admin group; needs a platform-role flag on tenant/user before hiding can ship safely | Medium |
| Real email verification (link, SMTP) | Out of v1; current stub is intentional | Medium |
| Real payment integration (Stripe / Razorpay / etc.) | Out of v1 | Medium |
| Webhook delivery retry queue (BullMQ-backed) | Current path is synchronous in handler; works for v1 single-instance | Medium |
| Boss dashboard analytics (conversion funnel, ROI) | Tier-2 BI feature | Low |
| Tenant offboarding / data deletion flow | GDPR-style flow; v1 ships with export instead | Medium |
| Push notification VAPID production keys + delivery | Web push subscription exists as stub | Low |
| Real conversation export (with messages) | Phase 17C export deliberately excludes raw messages | Medium |

---

## Critical Gap Audit

| Question | Answer |
|---|---|
| Are any **blocking** v1 features missing? | **No.** All positioning capabilities have at least a safe stub or complete implementation. |
| Are any safety boundaries weakened? | **No.** `OMNI_ALLOW_WA_SESSION=false`, `OMNI_ENABLE_REAL_META_SEND=false`, `BLOCKED_BULK` always enforced. |
| Is the smoke baseline clean? | **Yes** — 1494 passed / 0 failed (as of Phase 18B). |
| Does the product still match positioning? | **Yes** — 1:1 AI customer service + CRM + follow-up, no broadcast/ads/bulk. |
| Are operator-facing docs complete? | **Yes** — see `FINAL_PRODUCTION_READINESS.md`, `GO_LIVE_REHEARSAL.md`, `ACTIVATION_GUIDE.md`. |

---

## Cross-references

- `docs/FINAL_PRODUCTION_READINESS.md` — production checklist
- `docs/GO_LIVE_REHEARSAL.md` — go-live rehearsal
- `docs/RELEASE_CANDIDATE_V1.md` — release candidate notes
- `docs/V1_HANDOFF_PACKAGE.md` — complete handoff bundle
