# Omni Ai Chatbot Product Plan

## 1. Product Definition

Omni Ai Chatbot is not an advertising system.

Its core focus is:
- WhatsApp AI customer service
- CRM
- automated follow-up conversion system

## 2. Dual WhatsApp Entry

The first version must support both:
- Ordinary WhatsApp / WhatsApp Business App
- Meta WhatsApp Business Platform official API

## 3. One-Click Onboarding Flow

The onboarding flow must include:
1. Company info
2. Industry selection
3. AI goal selection
4. Website / PDF / brochure / price list / product upload
5. AI analysis
6. AI generates configuration
7. Tenant preview
8. One-click enable

## 4. AI Configuration

- The system must support a global AI prompt/persona.
- AI goals must be tenant selectable.
- AI goals must support multi-select.

## 5. FAQ Structure

- Global FAQ
- Product/service FAQ

## 6. CRM Data Model

The CRM must at least support these fields:
- customer name
- phone
- WhatsApp name
- company
- industry
- region
- language
- source
- interested product
- need
- budget
- purchase timing
- urgency
- pain point
- stage
- score
- owner
- next follow-up
- notes

## 7. Customer Tags

The system must support tags such as:
- new customer
- old customer
- high intent
- price inquiry
- quoted
- booked
- waiting reply
- needs follow-up
- needs human
- complaint
- after-sales
- technical issue
- payment issue
- won
- lost
- blacklist

## 8. Lead Scoring

Lead scoring must include basic add/subtract rules.

Suggested score bands:
- 0-29 normal
- 30-59 interested
- 60-79 high intent
- 80-100 urgent sales handling

## 9. Automatic Follow-up

The first version should support follow-up triggers such as:
- price asked but no reply
- considering
- booking not confirmed
- high intent not handled
- long no reply

## 10. Human Handoff

Handoff should trigger when:
- user asks for human
- FAQ has no answer
- AI is uncertain
- quote / payment / complaint / refund scenario
- high intent 80+

## 11. Boss Dashboard

The boss dashboard must show:
- today new customers
- high intent customers
- needs human
- pending follow-up
- overdue replies
- price asked but not closed
- booked customers
- won customers
- AI saved time
- action recommendations

## 12. Web Admin Dashboard and Mobile PWA

The product must include:
- Web Admin Dashboard
- Mobile PWA

## 13. Pricing and Cost Planning

Pricing is undecided for now, but the internal cost/pricing calculator must be planned.

## 14. First Version Exclusions

The first version must not include:
- advertising system
- large Marketing Broadcast
- complex Flow Builder
- native mobile app

## 15. Command Center Constraint

- ChatGPT owns product direction, planning, and acceptance.
- OpenClaw only dispatches work.
- CC only executes engineering work.

## 16. Acceptance Baseline

Every GitHub Issue must include:
- Context
- Scope
- Do Not Touch
- Task
- Recommended CC Sessions
- Acceptance Criteria
- Tests / Verification
- Required Report
