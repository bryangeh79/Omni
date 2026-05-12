# Omni — AI Provider Settings Guide

## Overview

Each tenant can configure which AI provider and model to use for customer service responses. Provider/model selection is managed via the **AI Agent Settings API**.

> **Phase 5A:** All providers operate in **DRY_RUN** mode — no real API calls are made. Real provider integration requires API key configuration (Phase 5B+).

---

## Supported Providers

| Provider | Code | Models |
|---|---|---|
| OpenAI | `OPENAI` | gpt-4o-mini, gpt-4o, gpt-4.1-mini, gpt-4.1 |
| Google Gemini | `GEMINI` | gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash, gemini-2.5-flash, gemini-2.5-pro |
| DeepSeek | `DEEPSEEK` | deepseek-chat, deepseek-reasoner |
| Platform Default | `PLATFORM_DEFAULT` | platform-default |
| Dry Run | `DRY_RUN` | dry-run |

---

## API Reference

### GET /ai-agent/providers

Returns the full provider/model allowlist. Useful for building the settings UI.

```http
GET /ai-agent/providers
Authorization: Bearer <token>
```

### GET /ai-agent/settings

Returns the tenant's current AI configuration. **Never exposes the API key** — only returns `hasApiKey: boolean`.

### PATCH /ai-agent/settings

```http
PATCH /ai-agent/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "aiProvider": "OPENAI",
  "model": "gpt-4o-mini",
  "persona": "You are Aria, a friendly assistant for Acme Corp.",
  "goals": ["QUALIFY_LEADS", "ANSWER_FAQ", "SCHEDULE_DEMO"],
  "replyLanguagePolicy": "AUTO",
  "temperature": 0.7,
  "maxTokens": 1024
}
```

**Validation:**
- `aiProvider` must be one of the valid provider codes
- `model` must be valid for the selected provider
- `temperature` must be 0–2
- `maxTokens` must be 100–8192
- `apiKeyRef` is write-only — never returned in API responses

---

## Settings Fields

| Field | Type | Description |
|---|---|---|
| `aiProvider` | string | Provider code (default: `DRY_RUN`) |
| `model` | string | Model identifier |
| `useTenantApiKey` | boolean | Use tenant-provided key (default: false) |
| `hasApiKey` | boolean (read-only) | Whether an API key is configured |
| `persona` | string? | AI character description |
| `goals` | string[] | Selected AI goals |
| `systemPrompt` | string? | Additional system instructions |
| `replyLanguagePolicy` | string | `AUTO`, `zh`, `en`, or `ms` |
| `temperature` | float? | LLM temperature (0–2) |
| `maxTokens` | int? | Max response tokens (100–8192) |
| `isActive` | boolean | Enable/disable AI for this tenant |

---

## AI Goals (examples)

```
QUALIFY_LEADS
ANSWER_FAQ
SCHEDULE_DEMO
CLOSE_SALES
AFTER_SALES_SUPPORT
```

---

## Phase Roadmap

| Phase | Feature |
|---|---|
| 5A (current) | Provider config, validation, dry-run mode |
| 5B | Real OpenAI/Gemini/DeepSeek API calls (requires API key) |
| 5B | Tenant-provided API key (encrypted storage) |
| 6 | Platform-provided API key (Omni pays, billed to tenant) |
| 6 | Usage/cost metering by provider |

---

## Security Notes

- `apiKeyRef` is **write-only** — set on PATCH, never returned
- `hasApiKey: boolean` is the only read signal for key presence
- Keys are never logged, printed, or stored in plain text
- Tenant isolation: `tenantId` always comes from JWT, never from request body
