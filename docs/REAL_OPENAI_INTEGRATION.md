# Omni — Real OpenAI Integration Guide

## Overview

Phase 5C implements real OpenAI Chat Completions API calls using the tenant's encrypted API key. The AI reply is written to the database only — no WhatsApp delivery in this phase.

---

## How It Works

```
Inbound message (BullMQ job)
  → Worker loads tenant AI config
  → If aiProvider=OPENAI + useTenantApiKey=true + key stored:
      decrypt key (in-memory only, never logged)
      → AiAgentOrchestrator.process(input, { hasKey: true, apiKey })
          → OpenAiProvider.complete(input)
              → fetch() → OpenAI Chat Completions
              → parse JSON reply
              → map to AiAgentResult
  → Write OUTBOUND/AI message to DB
  → Update UsageRecord (real token count, estimatedCost=0 for now)
  → If shouldHandoff=true → set conversation PENDING_HANDOFF
  → sendMessage() NOT called — no WhatsApp delivery
```

---

## Setup: Store Tenant OpenAI Key

1. Ensure `OMNI_API_KEY_ENCRYPTION_SECRET` is set in `.env`
2. Start the API: `pnpm dev:api`
3. Login: `POST /auth/login` with `tenantSlug + email + password`
4. Store key:

```http
POST /ai-agent/api-key
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "provider": "OPENAI",
  "apiKey":   "sk-..."
}
```

5. Configure provider/model:

```http
PATCH /ai-agent/settings
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "aiProvider":    "OPENAI",
  "model":         "gpt-4o-mini",
  "useTenantApiKey": true,
  "persona":       "You are Aria, a friendly assistant for Acme Corp.",
  "goals":         ["QUALIFY_LEADS", "ANSWER_FAQ"],
  "replyLanguagePolicy": "AUTO"
}
```

---

## Supported Models (OpenAI)

| Model | Context | Notes |
|---|---|---|
| `gpt-4o-mini` | 128k | Recommended for cost-efficiency |
| `gpt-4o` | 128k | Higher quality |
| `gpt-4.1-mini` | 128k | Latest mini |
| `gpt-4.1` | 128k | Latest full |

---

## Dry-run Preview (no DB write, no WhatsApp)

Test AI behavior without processing a real conversation:

```http
POST /ai-agent/dry-run
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "message":        "What are your prices?",
  "useRealProvider": true
}
```

> `useRealProvider: true` only uses real OpenAI when:
> - The server has `OMNI_ENABLE_REAL_OPENAI_SMOKE=true` set
> - The tenant has a valid key configured
>
> Otherwise, always returns dry-run response (safe default).

---

## Error Handling

| Error | Response |
|---|---|
| No key configured | `[KEY_NOT_CONFIGURED]` reply + shouldHandoff=true |
| Invalid API key (401) | `[PROVIDER_ERROR: OPENAI INVALID_KEY]` reply |
| Rate limited (429) | `[PROVIDER_ERROR: OPENAI RATE_LIMITED]` reply |
| Timeout (>30s) | `[PROVIDER_ERROR: OPENAI TIMEOUT]` reply |
| Any error | shouldHandoff=true so human can handle |

---

## AI Reply Format

The OpenAI provider requests JSON replies:

```json
{
  "reply": "Based on our knowledge base, our plans start from RM 299/month...",
  "shouldHandoff": false,
  "confidence": 0.9
}
```

If JSON parsing fails, the raw text is used as the reply and `shouldHandoff` is determined by keyword heuristics (same as dry-run mode).

---

## Context Used

The AI receives:
- **System prompt**: persona + goals + instructions + language policy
- **Knowledge base**: top 3 matching KB items (keyword search)
- **Customer profile**: name, stage, score, tags
- **Conversation history**: last 10 messages
- **Current message**: the inbound customer message

---

## Usage Tracking

After each job, a `UsageRecord` is written:
- `llmTokens`: actual token usage from OpenAI `usage.prompt_tokens + completion_tokens`
- `llmCostUsd`: `0` for now (TODO Phase 6 — real cost calculation)
- `messages`: 1

---

## Optional Real Smoke Test

Set `OMNI_ENABLE_REAL_OPENAI_SMOKE=true` in `.env` to enable real API calls during the smoke test.

**Default behavior:** smoke test never makes real OpenAI calls. All checks pass without an API key.

---

## Gemini / DeepSeek

These providers are configured and validated in Phase 5A/5B but **real API calls are not implemented yet** (Phase 5D). They return:

```json
{ "reply": "[PROVIDER_ERROR: ...]" }
```

---

## Safety Rules

- API keys are **never** logged, returned in API responses, or committed to git
- AI writes to DB only — `sendMessage()` is never called
- `OMNI_ALLOW_WA_SESSION` remains disabled
- Key decryption happens in-memory only for the duration of the API call
