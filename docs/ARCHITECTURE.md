# Omni Ai Chatbot — Architecture

## Product Overview

WhatsApp AI customer service + CRM + automatic follow-up + conversion system.

**Not** an ads platform. MVP is WhatsApp-first; architecture supports future omnichannel via Channel Adapter Pattern.

---

## Monorepo Structure

```text
/apps
  /web          Next.js — Web Admin Dashboard (settings, KB, AI config, dashboard, cost)
  /api          Fastify — REST + WebSocket API server
  /worker       Background job processor (follow-up, scoring, notifications)

/packages
  /shared       Shared TypeScript types, DTOs, constants, utils
  /ai-core      AI Agent Orchestrator, knowledge base query, prompt builder
  /channel-adapters
    /base       BaseChannelAdapter interface + message envelope types
    /whatsapp-web   WhatsApp Web (Baileys/WWebJS) adapter — quick-start channel
    /meta-api   Meta WhatsApp Business Platform API adapter — enterprise channel
    /[future]   Facebook Messenger, Instagram, WeChat, Zalo, LINE, TikTok
  /db           Prisma schema, migrations, seed scripts

/docs           Architecture, safety, ports, phases docs
```

---

## Channel Adapter Pattern

Every channel implements `BaseChannelAdapter`:

```typescript
interface BaseChannelAdapter {
  channelType: ChannelType          // WHATSAPP_WEB | META_API | ...
  connect(config: ChannelConfig): Promise<void>
  disconnect(): Promise<void>
  sendMessage(envelope: OutboundEnvelope): Promise<void>
  onMessage(handler: MessageHandler): void
  getStatus(): ChannelStatus
}
```

Core modules are channel-agnostic. Messages are normalized into `InboundEnvelope` before reaching the AI agent.

---

## Core Modules

| Module | Responsibility |
|---|---|
| AI Agent Orchestrator | Route message → KB lookup → AI reply → handoff decision |
| Knowledge Base | FAQ + product FAQ chunks, per-tenant, multilingual |
| CRM Customer Profile | Full customer data model (see PRODUCT_PLAN.md §6) |
| Lead Scoring Engine | Rule-based score add/subtract, band classification |
| Follow-up Automation | Trigger rules: price asked, no reply, high intent unhandled |
| Handoff Rules | Conditions for AI→human transfer |
| Boss Dashboard | Aggregated daily/realtime stats API |
| Usage / Cost Calculator | Token usage, channel API cost, per-tenant metering |

---

## App Boundary

### Web Admin (`/apps/web`)
Settings, configuration, knowledge base management, AI persona setup, team management, usage/cost dashboard, analytics.

### Mobile PWA (`/apps/web` — separate route group `/pwa/`)
Action-focused. No heavy config.

| Feature | Description |
|---|---|
| Boss Today | Today's key stats |
| Inbox | All active conversations |
| High Intent | Leads scored 60+ |
| Need Human | Pending handoff queue |
| Follow-up Tasks | Scheduled follow-ups |
| Customer Card | Full CRM view |
| Quick Reply | Saved reply templates |
| AI Control | Take over / release AI per conversation |
| Lead Stage | Change CRM stage |

---

## Data Flow

```
Channel (WhatsApp Web / Meta API / …)
  └─ normalize → InboundEnvelope
        └─ MessageRouter (api)
              ├─ AI Agent Orchestrator (ai-core)
              │     ├─ KB lookup
              │     ├─ LLM call (OpenAI / Claude)
              │     └─ Lead scoring update
              ├─ CRM Profile update
              └─ OutboundEnvelope → Channel.sendMessage()

Worker (background)
  ├─ follow-up scheduler
  ├─ scoring recalculation
  └─ handoff timeout alerts
```

---

## Multilingual Support

All tenant-facing and customer-facing text stores a language code.

| Field | Location |
|---|---|
| `tenant.defaultLanguage` | Tenant table |
| `customer.languagePreference` | Customer table |
| `message.detectedLanguage` | Message table |
| `faqItem.language` | FAQ / Knowledge chunk table |
| `knowledgeChunk.language` | Knowledge chunk table |

Supported: `zh`, `en`, `ms`. More can be added without schema change.

---

## Security Principles

- All secrets in environment variables only — never in code or logs.
- Tenant isolation at database row level (all major tables include `tenantId`).
- API auth via JWT (access token) + refresh token.
- WhatsApp Web sessions stored encrypted, never in plain log.
- Rate limiting on all API routes.
- Secrets scan in CI (future).
