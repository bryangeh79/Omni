[OPENCLAW:PENDING] Dry Run - Do Not Code

## Context

This is a dry-run test for OpenClaw routing only.

## Scope

Verify that OpenClaw can detect this issue, read project rules, validate required sections, and produce a dry-run routing report.

## Do Not Touch

- Do not write Omni Ai Chatbot product code.
- Do not create backend/frontend/AI feature files.
- Do not dispatch real CC sessions unless dry-run mode is explicitly disabled.
- Do not expose secrets.
- Do not modify unrelated files.

## Task

OpenClaw should:
1. Detect this issue.
2. Read OMNI_COMMAND_CENTER_RULES.md.
3. Read PRODUCT_PLAN.md.
4. Read AGENTS.md.
5. Read .openclaw/openclaw-routing.md.
6. Validate that required sections exist.
7. Produce a dry-run routing plan.
8. Comment the routing plan back to this issue.
9. Mark the issue as needs-review or comment DRY RUN COMPLETE.

## Recommended CC Sessions

This is dry-run only. Do not dispatch real CC sessions.

Expected simulated split:

### Session A
Backend architecture, database, API, services.

### Session B
Frontend Web Dashboard, Mobile PWA, UI/UX.

### Session C
AI Agent flow, one-click onboarding, FAQ generation, scoring, follow-up logic.

## Acceptance Criteria

1. OpenClaw detects the issue.
2. OpenClaw reads all required rule files.
3. OpenClaw validates required sections.
4. OpenClaw does not write product code.
5. OpenClaw does not call real CC sessions.
6. OpenClaw comments a dry-run routing report to the issue.
7. OpenClaw reports which sessions would be created.
8. OpenClaw marks the issue needs-review or DRY RUN COMPLETE.

## Tests / Verification

Confirm:
- Issue was detected.
- Rules were read.
- Dry-run report was posted.
- No product files were created or modified.
- No secrets were printed.
- No real CC sessions were started.

## Required Report

Final OpenClaw dry-run report must be inside a Markdown code block and include:

1. Issue number
2. Files read
3. Validation result
4. Simulated CC sessions
5. Product code touched: yes/no
6. Real CC sessions started: yes/no
7. Secrets exposed: yes/no
8. Final status
