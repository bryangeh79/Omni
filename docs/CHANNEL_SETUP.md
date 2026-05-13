# Omni Channel Setup Wizard — Phase 12B → 13A

## Purpose

The Channel Setup Wizard (`/channels/setup`) guides tenants through choosing, drafting, and preparing a WhatsApp channel configuration. **No real channel is activated by default.** Real activation requires separate operator-set environment flags.

---

## Channel Options

### 1. WhatsApp Web / Business App (`WA_WEB`)

Connect using WhatsApp Web session — no Meta approval required.

| Property | Value |
|---------|-------|
| Approval | None needed |
| Phone dependency | Yes, phone must stay connected |
| Template messages | No |
| Stability | Best-effort (WhatsApp ToS) |
| Best for | Small teams, fast trial |
| Activation flag | `OMNI_ALLOW_WA_SESSION=true` |

**Boundary:** Not the official Meta Business Platform API. Not for mass marketing or broadcast. Session stability is best-effort.

### 2. Meta WhatsApp Business Platform (`META_WA_BUSINESS`)

Official Meta Cloud API — enterprise-grade, verified business account.

| Property | Value |
|---------|-------|
| Approval | Meta business verification required |
| Phone dependency | No (cloud-hosted) |
| Template messages | Yes (pre-approved templates) |
| Stability | Official SLA from Meta |
| Best for | Established businesses, enterprise scale |
| Activation flag | `OMNI_ENABLE_REAL_META_SEND=true` |

**Boundary:** Per-conversation fee applies (Meta pricing, pass-through). No broadcast/ads/bulk sending.

---

## Persisted Draft Model (Phase 13A)

`ChannelSetupDraft` — one per tenant, stored in PostgreSQL.

| Field | Type | Description |
|-------|------|-------------|
| `tenantId` | String (unique) | Tenant JWT-scoped |
| `channelType` | String? | `WA_WEB` or `META_WA_BUSINESS` |
| `displayName` | String? | Channel display name |
| `phoneLast4` | String? | Last 4 digits only — full phone never stored |
| `setupStatus` | Enum | See status flow below |
| `credentialStatus` | Enum | `NONE` / `DRAFT` / `ENCRYPTED_STORED` |
| `credentialRef` | String? | AES-256-GCM encrypted JSON blob — **never returned in API** |
| `credentialLast4` | String? | Last 4 chars of access token for display |
| `testStatus` | String | `NOT_TESTED` / `STUB` |
| `lastTestAt` | DateTime? | When last test was performed |
| `realWaSessionEnabled` | Boolean | Always `false` — safety flag snapshot |
| `realMetaSendEnabled` | Boolean | Always `false` — safety flag snapshot |

### Setup Status Flow

```
DRAFT → TESTED_STUB → READY_FOR_CREDENTIALS → CREDENTIALS_SAVED → ACTIVATION_PENDING → ACTIVE
                                                                                       → FAILED
```

---

## API Endpoints (Phase 13A)

### GET /channels/setup/status
Returns persisted draft. Requires auth. `credentialRef` is NEVER returned.

### POST /channels/setup/save-draft
Body: `{ channelType, displayName?, phoneNumber? }` — stores only `phoneLast4`.

### POST /channels/setup/test
Stub test — updates `testStatus=STUB`, `lastTestAt` in DB. Never calls Meta/WA.

### POST /channels/setup/credentials-draft
Body: `{ wabaId?, phoneNumberId?, accessToken?, metaAppSecret?, channelType? }`
- If vault configured: encrypts credential JSON blob with AES-256-GCM, stores `credentialRef`
- If vault not configured: stores `DRAFT` status only
- Response: `{ saved, credentialStatus, credentialLast4, vaultConfigured, note }` — **no raw credentials ever returned**

### GET /channels/setup/credentials-status
Returns credential metadata: `credentialStatus`, `credentialLast4`, `hasStoredRef` (boolean). Never returns raw values or `credentialRef`.

### DELETE /channels/setup/credentials
Clears `credentialRef`, resets `credentialStatus=NONE`, `setupStatus=READY_FOR_CREDENTIALS`.

### POST /channels/setup/request-activation
Checks: channelType set, credentials saved (Meta), env flags set. Returns `blocked=true` + `missingConditions` if any check fails. Sets `setupStatus=ACTIVATION_PENDING` only if all checks pass.

### POST /channels/setup/confirm-activation
Final activation gate. Blocked if `setupStatus != ACTIVATION_PENDING` or env flags not set. Real QR/session is a separate step (Phase 14).

---

## Credential Vault

Credentials are encrypted using AES-256-GCM via `encryptApiKey()` from `@omni/shared`.

Requirements:
- `OMNI_API_KEY_ENCRYPTION_SECRET` must be set in `.env` (32-byte hex/base64 or hashed)
- If not set, `credentialStatus=DRAFT` is stored without encryption — production must have this set

Vault behavior:
- `isVaultConfigured()` → checks env var presence
- Encrypted blob: `base64(IV[12] + GCM_AuthTag[16] + Ciphertext)`
- `credentialRef` is never returned in any API response
- Only `credentialLast4` (last 4 chars of access token) is returned for display

---

## Activation Gates

| Channel Type | Required condition | Env flag |
|-------------|-------------------|----------|
| WA_WEB | Operator sets flag | `OMNI_ALLOW_WA_SESSION=true` |
| META_WA_BUSINESS | Credentials saved + flag | `OMNI_ENABLE_REAL_META_SEND=true` |

Both flags default to `false`. Tests MUST NOT set these flags.

---

## Safety Guarantees

- All endpoints: `requireAuth` + `tenantId` from JWT (no cross-tenant access)
- `credentialRef` never in any response
- No real WhatsApp session started from these routes
- No real Meta API called from these routes
- `realWaSessionEnabled` and `realMetaSendEnabled` always `false` in responses
- Full phone number never stored — only `phoneLast4`

---

## Web Page `/channels/setup`

Phase 13A additions:
- Loads saved draft state from DB on page load
- Shows `setupStatus` and `credentialStatus` badges in header
- Credential form for Meta API (wabaId, phoneNumberId, accessToken)
- Activation readiness checklist (7 steps)
- Request Activation / Confirm Activation buttons with blocked state feedback
- Activation result panel showing safety flags

---

## Limitations (Phase 13A)

- Real WA Web QR scan not implemented (Phase 14)
- Real Meta webhook configuration wizard not implemented (Phase 14)
- `credentialRef` encryption requires `OMNI_API_KEY_ENCRYPTION_SECRET` to be configured
- One draft per tenant (not per channel) — multi-channel support is Phase 14+
- No credential rotation flow yet
