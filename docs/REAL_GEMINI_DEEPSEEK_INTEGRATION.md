# Omni — Real Gemini + DeepSeek Integration Guide

## Overview

Phase 5D implements real Google Gemini and DeepSeek Chat Completions API calls using the tenant's encrypted API key. Follows the same safety pattern as Phase 5C (OpenAI): AI reply is written to the database only — no WhatsApp delivery.

---

## How It Works

```
Inbound message (BullMQ job)
  → Worker loads tenant AI config
  → If aiProvider=GEMINI|DEEPSEEK + useTenantApiKey=true + key stored:
      decrypt key (in-memory only, never logged)
      → AiAgentOrchestrator.process(input, { hasKey: true, apiKey })
          → GeminiProvider.complete(input)   |  DeepSeekProvider.complete(input)
              → fetch() → Gemini generateContent  |  DeepSeek chat completions
              → parse JSON reply
              → map to AiAgentResult
  → Write OUTBOUND/AI message to DB
  → Update UsageRecord (real token count)
  → If shouldHandoff=true → set conversation PENDING_HANDOFF
  → sendMessage() NOT called — no WhatsApp delivery
```

---

## Setup: Store Tenant API Key

### Gemini

```http
POST /ai-agent/api-key
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "provider": "GEMINI",
  "apiKey":   "AIzaSy..."
}
```

### DeepSeek

```http
POST /ai-agent/api-key
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "provider": "DEEPSEEK",
  "apiKey":   "sk-..."
}
```

### Configure Provider + Model

```http
PATCH /ai-agent/settings
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "aiProvider":    "GEMINI",
  "model":         "gemini-2.0-flash",
  "useTenantApiKey": true,
  "persona":       "You are Aria, a friendly assistant for Acme Corp.",
  "goals":         ["QUALIFY_LEADS", "ANSWER_FAQ"],
  "replyLanguagePolicy": "AUTO"
}
```

---

## Supported Models

### Gemini (Google Generative AI)

| Model | Notes |
|---|---|
| `gemini-2.0-flash` | Recommended — fast, cost-effective |
| `gemini-2.5-flash` | Latest flash |
| `gemini-2.5-pro`   | Highest quality |
| `gemini-1.5-flash` | Stable |
| `gemini-1.5-pro`   | Stable |

### DeepSeek

| Model | JSON Mode | Notes |
|---|---|---|
| `deepseek-chat`     | Yes | Recommended |
| `deepseek-reasoner` | No  | Reasoning model; keyword fallback for handoff |

---

## API Details

### Gemini Endpoint

```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
x-goog-api-key: {apiKey}
```

Request format uses `system_instruction` + `contents` (role: `user`/`model`) + `generationConfig` with `responseMimeType: application/json`.

### DeepSeek Endpoint

```
POST https://api.deepseek.com/v1/chat/completions
Authorization: Bearer {apiKey}
```

OpenAI-compatible format. `deepseek-chat` uses `response_format: {type: json_object}`; `deepseek-reasoner` uses keyword fallback.

---

## Dry-run Preview (no DB write, no WhatsApp)

```http
POST /ai-agent/dry-run
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "message":        "What are your prices?",
  "useRealProvider": true
}
```

> `useRealProvider: true` only uses real provider when:
> - For Gemini: server has `OMNI_ENABLE_REAL_GEMINI_SMOKE=true`
> - For DeepSeek: server has `OMNI_ENABLE_REAL_DEEPSEEK_SMOKE=true`
> - The tenant has a valid key configured
>
> Otherwise returns dry-run / KEY_NOT_CONFIGURED response (safe default).

---

## Error Handling

| Error | Response |
|---|---|
| No key configured | `[KEY_NOT_CONFIGURED]` reply + shouldHandoff=true |
| Invalid API key (401/403) | `[PROVIDER_ERROR: GEMINI INVALID_KEY]` or `[PROVIDER_ERROR: DEEPSEEK INVALID_KEY]` |
| Rate limited (429) | `[PROVIDER_ERROR: ... RATE_LIMITED]` |
| Timeout (>30s) | `[PROVIDER_ERROR: ... TIMEOUT]` |
| Any error | shouldHandoff=true so human can handle |

---

## AI Reply Format

Both providers request JSON replies:

```json
{
  "reply": "Based on our knowledge base, our plans start from RM 299/month...",
  "shouldHandoff": false,
  "confidence": 0.9
}
```

If JSON parsing fails, the raw text is used as the reply and `shouldHandoff` is determined by keyword heuristics.

---

## Context Used

Same as OpenAI (Phase 5C):
- **System prompt**: persona + goals + instructions + language policy
- **Knowledge base**: top 3 matching KB items (keyword search)
- **Customer profile**: name, stage, score, tags
- **Conversation history**: last 10 messages
- **Current message**: the inbound customer message

---

## Optional Real Smoke Tests

Set provider-specific flags in `.env` to enable real API calls during smoke tests:

```env
OMNI_ENABLE_REAL_GEMINI_SMOKE=true
OMNI_ENABLE_REAL_DEEPSEEK_SMOKE=true
```

**Default behavior:** smoke tests never make real provider calls. All checks pass without API keys.

---

## Safety Rules

- API keys are **never** logged, returned in API responses, or committed to git
- AI writes to DB only — `sendMessage()` is never called
- `OMNI_ALLOW_WA_SESSION` remains disabled
- Key decryption happens in-memory only for the duration of the API call
- Gemini key uses `x-goog-api-key` header (not query param, avoids accidental URL logging)
