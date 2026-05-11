# OpenClaw Routing

## Detection Rule

OpenClaw watches GitHub issues with title prefix:

`[OPENCLAW:PENDING]`

## Required Read Order

When an issue is found, OpenClaw must read:
1. `OMNI_COMMAND_CENTER_RULES.md`
2. `PRODUCT_PLAN.md`
3. `AGENTS.md`

## Validation

OpenClaw must validate the issue contains:
- Context
- Scope
- Do Not Touch
- Task
- Recommended CC Sessions
- Acceptance Criteria
- Tests / Verification
- Required Report

## Blocked Handling

If critical fields are missing, OpenClaw must comment `BLOCKED` and stop dispatch.

## Running Handling

If the issue is valid:
1. Mark it running
2. Split work into CC sessions if requested
3. Dispatch the sessions
4. Collect CC reports
5. Comment consolidated results back to the issue
6. Mark issue as `needs-review` until ChatGPT / Bryan accepts

## Default CC Split

- Session A: Backend architecture, database, API, services
- Session B: Frontend Web Dashboard, Mobile PWA, UI/UX
- Session C: AI Agent flow, one-click onboarding, FAQ generation, scoring, follow-up logic

## Scope Guardrails

- OpenClaw must not write major product code itself.
- OpenClaw must not change product direction by itself.
- OpenClaw must dispatch CC and collect reports only.
