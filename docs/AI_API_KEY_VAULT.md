# Omni — AI API Key Vault Guide

## Overview

Omni allows tenants to provide their own AI provider API keys (OpenAI, Gemini, DeepSeek). Keys are stored **encrypted at rest** using AES-256-GCM. Raw keys are **write-only** — they are never returned by any API endpoint.

---

## Security Model

| Principle | Implementation |
|---|---|
| Raw key never stored | Encrypted immediately on receipt; plaintext discarded |
| Raw key never returned | API responses contain `hasApiKey: boolean`, `apiKeyLast4`, not the key |
| Tamper detection | AES-256-GCM auth tag verifies ciphertext integrity on every decrypt |
| Server-side encryption | Uses `OMNI_API_KEY_ENCRYPTION_SECRET` env var, not the JWT secret |
| Key rotation | Store new key via `POST /ai-agent/api-key` — overwrites previous |
| Key deletion | `DELETE /ai-agent/api-key` clears all key fields; other AI settings unchanged |

---

## Encryption Details

- **Algorithm:** AES-256-GCM
- **Key derivation:** `OMNI_API_KEY_ENCRYPTION_SECRET` env var
  - If 64-char hex → parsed as 32-byte key
  - If 44-char base64 → parsed as 32-byte key
  - Otherwise → SHA-256 derived from the string (any length accepted)
- **Blob format:** `base64(IV[12] + GCM_AuthTag[16] + Ciphertext)`
- **Storage field:** `AiConfig.apiKeyRef` (encrypted blob, never plain text)

---

## Environment Configuration

Add to `.env`:

```bash
# Generate with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
OMNI_API_KEY_ENCRYPTION_SECRET=<64-char hex string>
```

> **NEVER** commit a real value. Use different secrets for dev, staging, and production.

If this variable is missing, key-write endpoints return `503 Service Unavailable`.

---

## API Endpoints

### POST /ai-agent/api-key — Store encrypted key

```http
POST /ai-agent/api-key
Authorization: Bearer <token>
Content-Type: application/json

{
  "provider": "OPENAI",
  "apiKey":   "sk-..."
}
```

**Supported providers:** `OPENAI`, `GEMINI`, `DEEPSEEK`

**Key shape validation:**
- OpenAI / DeepSeek: must start with `sk-`
- Gemini: any non-trivial non-empty string

**Response (201):**
```json
{
  "provider": "OPENAI",
  "apiKeyLast4": "1234",
  "apiKeyUpdatedAt": "2026-05-12T...",
  "useTenantApiKey": true,
  "message": "API key stored encrypted. Raw key discarded."
}
```

### DELETE /ai-agent/api-key — Remove stored key

```http
DELETE /ai-agent/api-key
Authorization: Bearer <token>
```

Clears `apiKeyRef`, `apiKeyLast4`, `apiKeyProvider`, `apiKeyUpdatedAt`. Sets `useTenantApiKey=false`. **Does not affect** other AI settings (persona, goals, etc.).

### POST /ai-agent/api-key/test-dry-run — Verify vault integrity

```http
POST /ai-agent/api-key/test-dry-run
Authorization: Bearer <token>
```

**Does NOT call any real provider API.** Only decrypts the stored blob locally and discards the result.

```json
{
  "provider": "OPENAI",
  "keyLast4": "1234",
  "decryptOk": true,
  "note": "No real provider API called. Vault integrity verified locally."
}
```

---

## Settings Response

`GET /ai-agent/settings` includes:

```json
{
  "hasApiKey":       true,
  "apiKeyLast4":     "1234",
  "apiKeyProvider":  "OPENAI",
  "apiKeyUpdatedAt": "2026-05-12T..."
}
```

**Never includes:** `apiKey`, `apiKeyRef`, `apiKeyEncrypted`, or any form of the raw key.

---

## Key Rotation

To rotate a key, simply POST a new key — it overwrites the previous:

```http
POST /ai-agent/api-key
{ "provider": "OPENAI", "apiKey": "sk-new-key-..." }
```

---

## Phase Roadmap

| Phase | Feature |
|---|---|
| 5B (current) | Key vault (encrypt/store/delete/verify) — no real LLM calls |
| 5C | Real OpenAI API calls using decrypted tenant key |
| 5C | Real Gemini + DeepSeek API calls |
| 6 | Platform-owned API keys (Omni pays, bills tenant) |
| 6 | Key expiry alerts + usage-based cost metering |
