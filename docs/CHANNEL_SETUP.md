# Omni Channel Setup Wizard — Phase 12B

## Purpose

The Channel Setup Wizard (`/channels/setup`) guides tenants through choosing and configuring a WhatsApp channel for AI customer service delivery.

**No real channel is activated on this page.** It explains options, saves a draft, and provides a safe stub test. Real activation requires separate credential configuration and explicit enable flags.

---

## Channel Options

### 1. WhatsApp Web / Business App (`WA_WEB`)

Connect using WhatsApp Web session scanning — no Meta approval required.

| Property | Value |
|---------|-------|
| Approval | None needed |
| Phone required | Yes, must stay connected |
| Template messages | No |
| Stability | Best-effort (WhatsApp ToS) |
| Best for | Small teams, fast trial, early adopters |

**Boundary:** Not the official Meta Business Platform API. Not suitable for mass marketing or broadcast. Session stability is best-effort; WhatsApp reserves the right to enforce ToS.

### 2. Meta WhatsApp Business Platform (`META_WA_BUSINESS`)

Official Meta Cloud API — enterprise-grade, verified business account required.

| Property | Value |
|---------|-------|
| Approval | Meta business verification required |
| Phone required | No (cloud-hosted) |
| Template messages | Yes (pre-approved templates) |
| Stability | Official SLA from Meta |
| Best for | Established businesses, enterprise scale |

**Boundary:** Per-conversation fee applies (Meta pricing). Fees are pass-through credits — not blindly bundled. No broadcast/ads/bulk sending in current Omni product scope.

---

## API

### GET /channels/setup/status

Returns current channel setup state. Requires auth.

```json
{
  "tenantId": "...",
  "channelType": null,
  "displayName": null,
  "testStatus": "NOT_TESTED",
  "realWaSessionEnabled": false,
  "realMetaSendEnabled": false,
  "note": "..."
}
```

### POST /channels/setup/save-draft

Save chosen channel type and display name. No real channel connected.

Body: `{ "channelType": "WA_WEB" | "META_WA_BUSINESS", "displayName"?: "...", "phoneNumber"?: "..." }`

Returns: `{ saved: true, channelType, realWaSessionEnabled: false, realMetaSendEnabled: false, note }`

### POST /channels/setup/test

Stub connection test. **Never calls real Meta API or starts WA session.**

Returns: `{ testResult: "STUB", connected: false, metaApiCalled: false, whatsappSessionStarted: false, realMetaSendEnabled: false, realWaSessionEnabled: false, note }`

---

## Safety Guarantees

| Flag | Default | When activated |
|------|---------|---------------|
| `OMNI_ALLOW_WA_SESSION` | `false` | Only if explicitly set in `.env` by operator |
| `OMNI_ENABLE_REAL_META_SEND` | `false` | Only if explicitly set in `.env` by operator |
| Real Meta API called | Never | Not from setup routes |
| Real WhatsApp session | Never | Not from setup routes |

---

## Web Page

`/channels/setup` — safe wizard with:

- Two channel option cards (WA_WEB vs META_WA_BUSINESS) with pros/cons/boundary
- Display name input
- "Save Draft" button (stub — saves preference only)
- "Test Connection" button (always returns STUB)
- Next Steps progress tracker
- Current setup status panel
- Safety reminder footer

---

## Product Boundaries

1. **No broadcast / ads / bulk sending** — Omni is a 1:1 AI customer service and CRM tool, not a marketing blast platform
2. **No WA session by default** — `OMNI_ALLOW_WA_SESSION` must be explicitly enabled
3. **No real Meta send by default** — `OMNI_ENABLE_REAL_META_SEND` must be explicitly enabled
4. **Meta fees are pass-through** — not bundled blindly into packages; stated separately as per-conversation credits
5. **Ordinary WhatsApp** — available in packages but stability boundary must be communicated clearly

---

## Limitations (Phase 12B)

- No actual channel connection or credential storage UI (Phase 13)
- No QR code scan for WA Web (Phase 13)
- No Meta webhook configuration wizard (Phase 13)
- Draft stored in memory only; not persisted to DB (Phase 13)
- No real test result — always returns STUB
