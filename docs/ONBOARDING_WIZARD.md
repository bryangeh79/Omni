# Omni Onboarding Wizard — Phase 11B

## Purpose

The onboarding wizard (`/onboarding`) guides new tenants through setting up their WhatsApp AI customer service configuration in 5 steps.

## Route

`/onboarding` — protected web wizard page

## Wizard Steps

### Step 1: Company Basics
- Company name (required)
- Industry (required) — determines AI persona
- WhatsApp number (optional — for display/reference)
- Website, service area, business hours

### Step 2: AI Goals
Select what the AI assistant should do:
- Lead conversion
- Book appointments
- Schedule demos/trials
- Collect customer info
- Answer product questions
- Pre-sales qualification
- After-sales support
- Handle pricing/quotations
- Escalate high-intent to human

### Step 3: Materials Input
- Paste product/service description text
- Reference URL (optional)
- PDF/file upload placeholder (Phase 12)

### Step 4: Generated Preview
The system generates a deterministic configuration preview:
- **AI Persona**: name, tone, focus based on industry + goals
- **Welcome Message**: generated from company name + goals
- **FAQ Categories**: based on industry + goals
- **Follow-up Scenarios**: mapped from selected goals
- **Recommended Tags**: derived from goals + materials keywords

**Important:** Preview is generated using deterministic templates. No real AI provider is called. For AI-personalised generation, configure an AI API key in Settings.

### Step 5: Enable
- Saves configuration as ENABLED status
- Does NOT connect WhatsApp channel
- Does NOT enable real message send
- Next step: configure channel under Settings → Channels

## API

### GET /onboarding/status
Returns current onboarding state. Requires auth.

### POST /onboarding/draft
Save/update wizard data. Partial updates supported. Requires auth.

### POST /onboarding/generate-preview
Generate deterministic preview from saved draft. No AI provider calls. Requires auth.

### POST /onboarding/enable
Mark onboarding as ENABLED. Does NOT:
- Connect WhatsApp session
- Enable `OMNI_ENABLE_REAL_META_SEND`
- Send any messages

Returns explicit safety flags: `realWhatsAppConnected: false`, `realMetaSendEnabled: false`.

## Industry → AI Persona Mapping

| Industry | Persona Name | Tone |
|----------|-------------|------|
| Real Estate | Alex | Professional and warm |
| Education | Aisha | Helpful and encouraging |
| Retail | Mei | Friendly and efficient |
| Food & Beverage | Jamie | Friendly and appetizing |
| Beauty & Wellness | Sophie | Warm and reassuring |
| Automotive | Daniel | Knowledgeable and clear |
| Healthcare | Dr. Kim | Professional and caring |
| Finance | Raj | Precise and trustworthy |
| Other | Sam | Professional and helpful |

## Goal → Follow-up Scenario Mapping

| Goal | Scenarios |
|------|-----------|
| Lead conversion | PRICE_ASKED_NO_REPLY, CONSIDERING |
| Appointment | BOOKING_NOT_CONFIRMED |
| Demo/trial | HIGH_INTENT_UNHANDLED, CONSIDERING |
| Pre-sales | PRICE_ASKED_NO_REPLY, HIGH_INTENT_UNHANDLED |
| After-sales | LONG_NO_REPLY |
| Quotation | PRICE_ASKED_NO_REPLY, CONSIDERING |
| Transfer human | HIGH_INTENT_UNHANDLED |

## Limitations (Phase 11B)

- Generated preview uses template engine only — no AI personalisation
- Materials text is stored but not processed into knowledge base automatically (Phase 12)
- PDF/file upload not implemented
- AI knowledge base is NOT automatically populated from wizard (Phase 12)
- WhatsApp channel must be separately configured under Settings
- Real-time WhatsApp testing during wizard not available
