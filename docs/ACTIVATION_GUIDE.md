# Production Activation Operator Guide — Phase 16A

## Overview

This guide explains how to move Omni from demo/staging mode to controlled live activation. **Real sends are disabled by default** (`OMNI_ALLOW_WA_SESSION=false`, `OMNI_ENABLE_REAL_META_SEND=false`) and must be manually enabled by an operator after completing all pre-flight checks.

**Omni is a WhatsApp AI 客服 + CRM + follow-up + conversion SaaS. It is not a broadcast, ads, or bulk-messaging platform. Real sends only activate 1:1 customer service conversations.**

---

## API Reference

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/activation/preflight` | GET | Required | Tenant-scoped pre-activation readiness checks |
| `/activation/dry-run` | POST | Required | Simulate activation — never enables real send |
| `/activation/health` | GET | Required | Post-activation safety flags + channel health |

### Readiness Levels

| Level | Meaning |
|---|---|
| `BLOCKED` | Critical items unresolved — activation not possible |
| `READY_FOR_OPERATOR_REVIEW` | Non-critical items outstanding — review recommended |
| `READY_FOR_STAGING` | All checks clear, real send still off — proceed to staging |
| `READY_FOR_LIVE_REVIEW` | All checks clear and real send flag is active |

---

## Before Activation (Both Paths)

1. **Pre-flight checks**: Run `GET /activation/preflight` or review `/release-checklist`
2. **Backup configured**: pg_dump scheduled, off-server storage, restore tested
3. **Monitoring configured**: uptime probe on `/ops/health`, error rate alert
4. **Dry-run completed**: `POST /activation/dry-run` with no BLOCKED results

---

## Path A: Ordinary WhatsApp / WA Web

### Requirements
- Active WhatsApp account on a real phone number
- Phone must remain online (session stability is best-effort)

### Stability Warning
Ordinary WhatsApp (WA Web) session stability is **best-effort per WhatsApp ToS**. Sessions can disconnect without notice. For production with uptime requirements, use Meta WhatsApp Business Platform.

### Steps
1. Set `OMNI_ALLOW_WA_SESSION=true` in production `.env`
2. Restart API server
3. Navigate to `/channels/setup/wa-web/qr` → scan QR code with phone
4. Verify `GET /channels/setup/wa-web/status` → `sessionStatus: CONNECTED`
5. Send a test message to a known internal number
6. Monitor `GET /activation/health` for session health

### Post-activation Monitoring
- Check `/channels/setup/wa-web/status` daily
- Alert if `sessionStatus ≠ CONNECTED`
- Keep linked phone powered on and online
- Plan reconnect workflow for session expiry

---

## Path B: Meta WhatsApp Business Platform

### Requirements
- Meta Business Manager account (`business.facebook.com`)
- WhatsApp Business Account (WABA) — approved by Meta
- Phone Number ID registered on Meta
- System User token or App access token with `whatsapp_business_messaging` permission
- Meta App with webhook subscription capability
- `OMNI_API_KEY_ENCRYPTION_SECRET` set (credential vault required)

### Steps
1. Store credentials via `/channels/setup/credentials-draft`
   - Verify `credentialStatus: ENCRYPTED_STORED`
   - Confirm no raw token in response
2. Configure webhook:
   - URL: `https://your-domain.com/webhooks/meta/whatsapp/{channelId}`
   - Subscribe Meta App in Meta Business Settings
   - Verify: `GET /channels/setup/meta-webhook/status` → `webhookSubscribed: true`
3. Set `OMNI_ENABLE_REAL_META_SEND=true` in production `.env`
4. Restart API server
5. Send a test message → verify `sendStatus: SENT`
6. Monitor `/audit/logs` for send events

### Post-activation Monitoring
- Monitor API error rate on `/ops/health`
- Alert on FAILED send events in `/audit/logs`
- Review Meta message delivery reports in Meta Business Manager
- Track usage in `/billing/usage-summary` (Meta charges per-conversation fees — pass-through, not bundled in plan)

---

## Rollback Plan

1. Set `OMNI_ALLOW_WA_SESSION=false` OR `OMNI_ENABLE_REAL_META_SEND=false`
2. Restart API server
3. Verify `GET /activation/health` → `realSendCurrentlyOff: true`
4. Confirm no further real messages sent (check `/audit/logs`)
5. If WA Web: disconnect via `/channels/setup/wa-web/disconnect`
6. Investigate root cause before re-activating
7. File incident report with timeline and action items

---

## Environment Flags

| Flag | Default | Effect when `true` |
|---|---|---|
| `OMNI_ALLOW_WA_SESSION` | `false` | Enables WA Web QR session capability |
| `OMNI_ENABLE_REAL_META_SEND` | `false` | Enables real Meta WhatsApp API sends |
| `OMNI_API_KEY_ENCRYPTION_SECRET` | unset | Required for encrypted credential storage |
| `OMNI_ENABLE_ONBOARDING_AI` | `false` | Enables real AI provider calls in onboarding |

**Never set both `OMNI_ALLOW_WA_SESSION=true` and `OMNI_ENABLE_REAL_META_SEND=true` unless you have two separate active channels.**

---

## What Never Changes

Regardless of env flags:
- Bulk/broadcast/ads/mass sending is **always blocked** (`BLOCKED_BULK`)
- Sending to CLOSED conversations is always blocked
- Password hashes are never in API responses
- Raw tokens/credentials are never returned from any API
- Cross-tenant data access is structurally impossible via JWT scoping

---

## Related Pages

- `/activation-guide` — this guide (web UI)
- `/activation/preflight` — live readiness check
- `/activation/dry-run` — simulate activation
- `/activation/health` — post-activation health
- `/release-checklist` — SaaS v1 release status
- `/ops/runbook` — backup, monitoring, incident response
- `/audit` — admin activity timeline


## Phase 16B: Activation Monitoring Dashboard + Go-live Readiness Pack

New Phase 16B additions:
- `GET /activation/timeline` — recent activation-related audit events (local, no secrets)
- `GET /activation/go-live-checklist` — deterministic checklist (automated + manual confirmation items)
- `POST /activation/test-message/dry-run` — safe placeholder, never sends, never calls providers
- `/activation/monitoring` — unified monitoring dashboard page
- AppNav: Activation Monitor added to Release group

See `docs/ACTIVATION_MONITORING.md` for full documentation.


## v1 Handoff References

- `docs/V1_HANDOFF_PACKAGE.md` — complete v1 delivery
- `docs/FINAL_PRODUCTION_READINESS.md` — production checklist
- `docs/GO_LIVE_REHEARSAL.md` — go-live rehearsal
- `docs/RELEASE_CANDIDATE_V1.md` — release candidate notes
