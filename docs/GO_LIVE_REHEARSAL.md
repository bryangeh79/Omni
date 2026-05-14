# Omni — Go-Live Rehearsal Pack

This document is the operator-side rehearsal script that must be completed (in a staging environment) **before** flipping any real-send flag in production. No real WhatsApp messages, no real Meta API calls, no real emails, no real payments.

**Time budget:** ~60 minutes for a single operator on a clean staging environment.

---

## 0. Prerequisites

- [ ] Staging environment running (API on 43111, web on 43110, DB on 43113, Redis on 43114)
- [ ] `OMNI_ALLOW_WA_SESSION` and `OMNI_ENABLE_REAL_META_SEND` are **unset / false**
- [ ] Vault secret `OMNI_API_KEY_ENCRYPTION_SECRET` is set
- [ ] Browser ready, terminal ready

---

## 1. Pre-go-live Dry-run Steps

### 1.1 Health check
- [ ] `curl -sf http://localhost:43111/health` → `{"status":"ok","service":"omni-api"}`
- [ ] `curl -sf http://localhost:43111/ops/health` → 200 with all checks green
- [ ] Web home page loads at `http://localhost:43110/`

### 1.2 Service inventory
- [ ] Confirm exactly one process listens on each Omni port:
  - 43110 web · 43111 API · 43112 worker (if deployed) · 43113 Postgres · 43114 Redis
- [ ] No other project (TelehubX / WAhubX / FAhubX / etc.) is touching these ports

---

## 2. Test Tenant Creation

- [ ] Visit `/signup`
- [ ] Fill in: business name `Rehearsal Co`, slug `rehearsal-co`, owner email, password ≥ 8 chars, industry, channel preference `META_WA_BUSINESS`, primary goal `sales`
- [ ] Submit → expect HTTP 201, redirect to `/onboarding`
- [ ] Verify response body contains:
  - `safety.realSendEnabled: false`
  - `safety.broadcastEnabled: false`
  - `emailSent: false`
  - `emailVerificationMode: "STUB"`
  - **NO** `passwordHash` anywhere
- [ ] In a new browser tab: `/account` loads the tenant overview

---

## 3. Onboarding Verification

- [ ] At `/onboarding`, complete steps:
  - Company profile filled
  - AI goals selected
  - Materials text pasted
  - Preview generated (deterministic — no real AI provider call)
  - Onboarding enabled
- [ ] Confirm `GET /account/overview` → `onboarding.status: "ENABLED"`

---

## 4. Knowledge Base Setup Verification

- [ ] At `/knowledge`, add at least one new FAQ item
- [ ] Verify it appears in the list
- [ ] `GET /account/overview` → `knowledgeBase.activeItems ≥ 1`

---

## 5. Channel Setup Verification (no real credentials)

- [ ] At `/channels/setup`, select Meta WhatsApp Business
- [ ] Save draft (display name, phone last 4 only)
- [ ] Run stub test — verify:
  - `testResult: "STUB"`
  - `realWaSessionEnabled: false`
  - `realMetaSendEnabled: false`
- [ ] Save fake credentials via `/channels/setup/credentials-draft`:
  - Response shows `credentialStatus: "ENCRYPTED_STORED"` or `"DRAFT"`
  - Response does NOT contain raw token, `credentialRef`, `metaAccessTokenRef`

---

## 6. Activation Monitoring Verification

- [ ] Visit `/activation-guide` — page loads
- [ ] Visit `/activation/monitoring` — dashboard loads with all four panels
- [ ] Click "Run Pre-flight" — verify response:
  - `currentFlags.realSendCurrentlyOff: true`
  - `safetyFlags.realSendActive: false`
- [ ] At `/activation-guide`, click activation dry-run for the chosen channel
- [ ] Verify response: `dryRun: true`, `realSendEnabled: false`
- [ ] On `/activation/monitoring`, refresh — confirm the audit-derived activation event appears in the timeline

---

## 7. Audit / Security Events Verification

- [ ] At `/audit`, verify recent events appear with proper labels and timestamps
- [ ] No event entry contains `metadataJson`, `passwordHash`, or any token-like string
- [ ] At `/account` → Security tab (OWNER/ADMIN only):
  - 7-day severity counts visible
  - Last-24-hour breakdown visible
  - Recommended actions section visible
  - No `actorUserId`, `ip`, `userAgent` in the visible event details

---

## 8. Account Export Verification

- [ ] At `/account` → Export tab → click **Generate Safe Export**
- [ ] Click **Download JSON**
- [ ] Open the downloaded file in a text editor and search for forbidden strings:
  - `passwordHash` — must not be present (outside `redaction` block)
  - `credentialRef` — must not be present (outside `redaction` block)
  - `metaAccessTokenRef` — must not be present
  - `webhookVerifyTokenRef` — must not be present
  - `apiKeyRef` — must not be present
  - `JWT_SECRET` — must not be present
- [ ] Confirm `redaction` block shows all `*Excluded: true`

---

## 9. Smoke Test Command

Run the canonical full suite:

```bash
pnpm --filter @omni/api smoke
```

- [ ] Result: `0 failed`
- [ ] Run a second time within the same API process — still `0 failed` (Phase 7B HMAC stability)

---

## 10. Rollback Rehearsal

Even though no real flag is flipped during rehearsal, walk through the rollback motion:

- [ ] Open production `.env` (or staging `.env`) in your editor
- [ ] Verify `OMNI_ALLOW_WA_SESSION=false` and `OMNI_ENABLE_REAL_META_SEND=false`
- [ ] Practice the operator command sequence:
  1. Edit `.env` → set both flags to `false`
  2. Restart API (graceful stop + start, not `taskkill /F /IM node.exe`)
  3. `curl http://localhost:43111/activation/health` → confirm `realSendCurrentlyOff: true`
  4. Inspect `/audit/logs` → confirm no new `SENT` send events since rollback
- [ ] Document the elapsed time — should be ≤ 5 minutes

---

## 11. Human Operator Checklist

- [ ] Operator reviewed `docs/ACTIVATION_GUIDE.md`
- [ ] Operator reviewed `docs/FINAL_PRODUCTION_READINESS.md`
- [ ] Operator can name the rollback command without looking at notes
- [ ] Operator has access to monitoring dashboards
- [ ] Operator has backup/restore credentials offline
- [ ] On-call escalation path is in place
- [ ] Tenant communication channel (email / status page) is in place

---

## 12. Go / No-Go Decision Table

| Item | Required | Actual |
|---|---|---|
| Smoke `0 failed` | YES | ☐ |
| Web build passes | YES | ☐ |
| API typecheck passes | YES | ☐ |
| `/activation/preflight` readiness ≥ READY_FOR_STAGING | YES | ☐ |
| `/release-checklist/status` → `saasV1Ready: true` | YES | ☐ |
| Backup procedure tested in last 7 days | YES | ☐ |
| Monitoring probes active | YES | ☐ |
| Rollback rehearsed | YES | ☐ |
| Operator on-call confirmed | YES | ☐ |
| Tenant comms channel ready | YES | ☐ |

**Decision rule:** all required = YES → **GO**. Any single NO → **NO-GO** until resolved.

---

## Safety Reminders

- This is a **rehearsal**. No real WhatsApp messages, no real Meta API calls, no real emails, no real payments are sent at any step.
- Omni is a **WhatsApp AI 客服 + CRM + Follow-up** system — not a broadcast, ads, or bulk-sending platform.
- Even after go-live, broadcast / bulk / marketing-blast endpoints **do not exist** and will not be added.
