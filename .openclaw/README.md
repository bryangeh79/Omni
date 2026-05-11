# OpenClaw README

## Required Environment Variables

- `GITHUB_TOKEN`
- `GITHUB_REPO`
- `OPENCLAW_ALLOWED_ISSUE_PREFIX=[OPENCLAW:PENDING]`
- `OPENCLAW_POLL_INTERVAL`
- `CC_EXECUTOR_COMMAND` or `CC_API_ENDPOINT`
- `OPENCLAW_MODEL`

## Security Rules

- Never commit secrets.
- Never print token values.
- Use local `.env` files or a secret manager only.
