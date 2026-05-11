# Omni — MVP Phases

## Phase 0 — Foundation (current)
- [x] Planning docs (PRODUCT_PLAN.md, AGENTS.md, IDENTITY.md, SOUL.md)
- [x] Command Center rules (OMNI_COMMAND_CENTER_RULES.md)
- [x] CC Runner setup (omni-cc-runner)
- [x] Architecture docs
- [x] Development safety docs
- [x] Port docs
- [x] Monorepo skeleton
- [x] Database schema draft
- [x] .env.example
- [x] API route skeleton

## Phase 1 — Core Infrastructure
- [ ] pnpm monorepo workspace config (`pnpm-workspace.yaml`, root `package.json`)
- [ ] TypeScript base config (`tsconfig.base.json`)
- [ ] Docker Compose for Postgres + Redis dev
- [ ] Prisma migrations (apply schema draft)
- [ ] Base API server (Fastify) with health endpoint
- [ ] JWT auth scaffold (login, refresh)
- [ ] Tenant + User seed data
- [ ] CI lint + typecheck workflow

## Phase 2 — Channel Adapters (WhatsApp Web first)
- [ ] `BaseChannelAdapter` interface
- [ ] `InboundEnvelope` / `OutboundEnvelope` types (shared)
- [ ] WhatsApp Web adapter (Baileys) — QR login, session store, receive/send
- [ ] Message router (api) — receive → normalize → enqueue
- [ ] Worker consumer — dequeue → AI agent stub → send reply

## Phase 3 — AI Agent Core
- [ ] AI Agent Orchestrator (stub → real LLM call)
- [ ] Knowledge Base module (CRUD, search stub)
- [ ] Lead Scoring Engine (rule engine v1)
- [ ] CRM Customer Profile CRUD
- [ ] Handoff rule evaluator

## Phase 4 — Web Admin & PWA
- [ ] Next.js app shell + auth pages
- [ ] Tenant settings page
- [ ] Knowledge Base management UI
- [ ] CRM customer list + customer card
- [ ] Boss Dashboard page
- [ ] Mobile PWA route group: Inbox, High Intent, Follow-up

## Phase 5 — Meta API Channel
- [ ] Meta WhatsApp Business Platform adapter
- [ ] Webhook handler
- [ ] Message template management

## Phase 6 — Automation & Cost
- [ ] Follow-up scheduler (worker)
- [ ] Usage metering
- [ ] Cost calculator UI
- [ ] Onboarding flow

## Future Phases
- Facebook Messenger adapter
- Instagram adapter
- WeChat / Zalo / LINE / TikTok adapters
- Payment integration
- Production deployment pipeline
- AI prompt tuning UI
- File parsing + vector ingestion

---

## Do Not Build Yet (First Version Exclusions)
- Real large broadcast / marketing campaigns
- Complex Flow Builder
- Native mobile app
- Ads system
- Production deployment (no DevOps without explicit task)
