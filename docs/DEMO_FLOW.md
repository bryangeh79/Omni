# Demo Flow — Omni SaaS v1 (Phase 15D)

## Overview

Omni is a **WhatsApp AI 客服 + CRM + Follow-up + Lead Conversion** SaaS for SMBs. It is **not** a broadcast, ads, or bulk-messaging platform.

The demo flow at `/demo-flow` guides a full product walkthrough for sales demos, internal QA, and launch validation.

---

## Safety Contract (All Demo Runs)

- `OMNI_ALLOW_WA_SESSION=false` — no real WhatsApp Web connection started
- `OMNI_ENABLE_REAL_META_SEND=false` — no real Meta API messages sent
- `OMNI_ENABLE_ONBOARDING_AI=false` — deterministic templates only, no real AI provider
- No real email sent — email delivery not configured
- No real payment charged — payment gateway not configured
- No broadcast, marketing blast, or bulk sending on any plan

---

## Demo Script (9 Steps)

### Step 1: Onboarding Wizard `/onboarding`
- Enter company name, industry, business hours
- Choose AI goals (lead capture, follow-up, customer service)
- Paste product/service materials
- Preview AI persona and welcome message (deterministic stub)
- Enable onboarding → activates AI config with stub provider

### Step 2: Knowledge Base `/knowledge`
- Review pre-generated FAQ entries (8 demo items)
- Add product-specific Q&A
- Test multi-language support: ZH / EN / MS
- Mark items active/inactive

### Step 3: Channel Setup `/channels/setup`
- Select channel type: WA Web or Meta WhatsApp Business API
- Enter display name and draft channel info
- Run stub test — confirms no real connection
- Verify: `realWaSessionEnabled: false`, `realMetaSendEnabled: false`

### Step 4: Inbox `/inbox`
- View open conversations from demo customers
- See AI-handled vs human-handled threads
- Human takeover / release back to AI
- Lead stage: NEW → INTERESTED → HIGH_INTENT → QUOTED → BOOKED
- Manual reply preview (WA send disabled)

### Step 5: Boss Dashboard `/boss`
- Today's priorities: open conversations + high-intent leads
- Follow-up tasks due today
- AI reply volume vs human handoffs
- Lead stage pipeline overview

### Step 6: Mobile PWA `/pwa`
- Open on mobile → Add to Home Screen
- Mobile inbox: lead cards, quick actions
- Push notification setup (stub)

### Step 7: Billing & Plan `/billing`
- Starter (RM199/mo), Pro (RM499/mo), Business (RM999/mo)
- Meta API fees: pass-through credits, NOT bundled
- No broadcast/ads on any plan
- Plan selection = draft preference, no real charge

### Step 8: Production QA `/production-qa`
- Review PASS/WARN/FAIL/MANUAL items
- Safety gates: real send disabled
- Audit log readiness: PASS
- Ops runbook: link to /ops/runbook

### Step 9: Audit + Ops `/audit`, `/ops/runbook`
- Admin activity timeline: TEAM_INVITE_DRAFT, BILLING_PLAN_SELECTED, etc.
- Ops runbook: health checks, backup checklist, monitoring, incident response

---

## Demo Navigation

The app shell (`AppNav` sidebar) is visible on all pages (desktop: fixed left sidebar, mobile: hamburger). Key links:
- Conversations: Inbox, Mobile PWA
- CRM & Leads: Boss Dashboard, Launch Checklist
- Setup: Onboarding, Knowledge Base, Channel Setup
- Admin: Settings, Billing, Team
- Ops: Audit Logs, Production QA, Ops Runbook
- Release: Demo Flow, Release Checklist

---

## Known Limitations Before Live Activation

1. **No real WhatsApp connection** — WA Web and Meta API sessions require `OMNI_ALLOW_WA_SESSION=true` / `OMNI_ENABLE_REAL_META_SEND=true` set by operator
2. **No email delivery** — Invite emails not sent; operator must provision user credentials manually
3. **No AI provider** — Onboarding preview uses deterministic templates (`OMNI_ENABLE_ONBOARDING_AI=false`)
4. **No payment gateway** — Billing plan is a draft preference only
5. **Vault optional** — Credentials can be saved as draft without `OMNI_API_KEY_ENCRYPTION_SECRET`, but encryption is recommended before real tokens are stored
6. **No backup configured** — Operator must set up pg_dump schedule
7. **No external monitoring** — Operator must configure UptimeRobot / Grafana / etc.
