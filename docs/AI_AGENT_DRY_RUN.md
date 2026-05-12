# Omni — AI Agent Dry-run Guide

## What is Dry-run Mode?

Dry-run mode allows the AI Agent to process messages and return responses **without calling any external LLM API**. All responses are generated deterministically by the `DryRunProvider`.

Dry-run is the default in Phase 5A and is safe for all environments.

---

## How It Works

```
Inbound message
  → Build context (tenant config, customer profile, conversation history, KB search)
  → AiAgentOrchestrator.process(input)
      → AiProviderFactory.create() → DryRunProvider
          → analyze keywords
          → determine shouldHandoff
          → calculate scoreAdjustment
          → build [AI_DRY_RUN] reply text
  → Write OUTBOUND/AI message to DB
  → Update conversation.lastMessageAt
  → Auto-escalate to PENDING_HANDOFF if shouldHandoff=true
  → Update UsageRecord (estimatedCost: 0)
```

---

## Response Format

```json
{
  "reply":               "[AI_DRY_RUN] Based on our knowledge base: ... (DRY_RUN/dry-run)",
  "shouldHandoff":       false,
  "scoreAdjustment":     20,
  "suggestedTags":       ["price_inquiry"],
  "nextAction":          "CONTINUE",
  "detectedLanguage":    "en",
  "provider":            "DRY_RUN",
  "model":               "dry-run",
  "inputTokensEstimate": 120,
  "outputTokensEstimate": 80
}
```

---

## Dry-run Decision Rules

### shouldHandoff = true when:

| Condition | Examples |
|---|---|
| Customer explicitly requests human | "human", "person", "agent", "call me", "人工", "客服" |
| Complaint/refund keywords | "refund", "complaint", "fraud", "退款", "投诉" |
| Customer score ≥ 80 | Urgent lead score |
| No KB match AND price question | "how much" with no knowledge base hit |

### Score adjustment:

| Keyword Category | Adjustment |
|---|---|
| Price/package inquiry | +20 |
| Demo/appointment booking | +25 |
| Buy/purchase/payment intent | +30 |
| Complaint/refund | +0 (handoff instead) |

---

## Dry-run Preview Endpoint

Use `POST /ai-agent/dry-run` to test AI behavior without writing to DB:

```http
POST /ai-agent/dry-run
Authorization: Bearer <token>
Content-Type: application/json

{
  "message":        "What is the price of your premium plan?",
  "customerId":     "cust-id-optional",
  "conversationId": "conv-id-optional"
}
```

Response includes `note: "Dry-run only — no message written to DB, no WhatsApp sent"`.

---

## Context Used by AI

The AI agent uses the following context when generating a response:

1. **Tenant AI config** — persona, goals, system prompt, reply language policy
2. **Customer profile** — name, stage, score, tags, language preference
3. **Conversation history** — last 10 messages (role + content)
4. **Knowledge base** — top 3 matching KB items (keyword search on question + answer)

---

## Knowledge Base Integration

Before generating a reply, the orchestrator searches the tenant's knowledge base using the same keyword-search algorithm as `POST /knowledge/search`:

- Questions matching the inbound message are ranked first
- Answer-only matches are ranked second
- Top 3 results are included in the AI context
- If no results found + price question → handoff suggested

---

## Worker Integration

When the worker processes a `PROCESS_INBOUND_MESSAGE` job (Phase 5A):

1. Loads message content from DB
2. Builds full agent context (config + customer + history + KB)
3. Calls `AiAgentOrchestrator.process(input)`
4. Writes `[AI_DRY_RUN]` reply to DB (Direction: OUTBOUND, SenderType: AI)
5. If `shouldHandoff=true`: updates conversation to `PENDING_HANDOFF`
6. If `scoreAdjustment ≠ 0`: updates customer score
7. Writes `UsageRecord` with `estimatedCost=0` (dry-run is free)
8. **Does NOT call `sendMessage()`** — no WhatsApp delivery

---

## Phase Roadmap

| Phase | Feature |
|---|---|
| 5A (current) | DryRunProvider, context builder, orchestrator, dry-run API |
| 5B | Real OpenAI/Gemini/DeepSeek calls (API key required) |
| 5B | Multilingual KB search (zh/en/ms) |
| 6 | Vector/semantic KB search (embeddings) |
| 6 | Streaming AI replies |
| 7 | AI-generated follow-up messages |
