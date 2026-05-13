# Omni Production Hardening — Phase 10A/10B → 15B

## Health Endpoints

### GET /health (liveness)

Simple liveness check. Always fast, always returns 200 if the process is alive.

```json
{ "status": "ok", "service": "omni-api" }
```

### GET /ops/health (readiness)

Detailed readiness check for deployment probes, load balancers, and monitoring.

Returns HTTP 200 if all critical components are healthy, HTTP 503 otherwise.

```json
{
  "status": "healthy" | "degraded",
  "timestamp": "...",
  "service": "omni-api",
  "checks": {
    "database":    { "ok": true, "latencyMs": 3 },
    "redis":       { "ok": true, "latencyMs": 1 },
    "realtimeBus": { "ok": true, "mode": "redis-pubsub" }
  },
  "safetyFlags": {
    "realMetaSendEnabled":  false,
    "waSessionEnabled":     false,
    "jwtConfigured":        true,
    "dbConfigured":         true,
    "redisConfigured":      true
  }
}
```

**Security:** No raw env values, no secrets, no connection strings in the response. Only boolean flags and latency numbers.

### GET /ops/version

Build/version metadata.

```json
{
  "service": "omni-api",
  "phase": "10B",
  "nodeVersion": "v20.x.x",
  "uptime": 3600
}
```

---

## Auth Modes

See `docs/AUTH_HARDENING.md` for full documentation on Bearer vs cookie auth modes.

---

## Redis Pub/Sub Reconnect (Phase 10B)

The `realtime-bus` now handles runtime Redis reconnects:

1. On `error` event: `_live` → `false`, localBus fallback activates
2. On `ready` event (reconnect): re-psubscribes to `omni:realtime:tenant:*` and restores `_live = true`
3. Retry strategy: up to 30 retries with exponential backoff (up to 5s per attempt, ~2.5 min total)
4. After 30 retries: connection gives up; API restart required to restore Redis pub/sub

**SSE clients:** On Redis disconnect, clients still receive in-process events (inbound webhook, human send, takeover/release). Worker AI reply events are missed until reconnect.

**Status check:** `GET /realtime/status` returns `redisLive: true/false` and current mode.

---

## Environment Variables (Production Checklist)

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | `redis://localhost:43114` | BullMQ + pub/sub |
| `JWT_SECRET` or `APP_SECRET` | Yes | — | Min 32-char random string |
| `PORT_API` | No | `43111` | API server port |
| `NODE_ENV` | No | `development` | Set to `production` in prod |
| `OMNI_ENABLE_REAL_META_SEND` | No | (unset = disabled) | Set `true` to enable real WhatsApp |
| `OMNI_ALLOW_WA_SESSION` | No | (unset = disabled) | WhatsApp Web — not implemented |
| `VAPID_PUBLIC_KEY` | No | (unset = push disabled) | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Phase 11 | — | Web Push VAPID private key |

---

## Pre-Production Checklist

- [ ] `DATABASE_URL` points to production PostgreSQL
- [ ] `REDIS_URL` points to production Redis
- [ ] `JWT_SECRET` is a long random string (not shared with dev)
- [ ] `NODE_ENV=production` (enables httpOnly cookie Secure flag)
- [ ] `OMNI_API_KEY_ENCRYPTION_SECRET` set (32-byte hex/base64) — required for credential vault
- [ ] `OMNI_ENABLE_REAL_META_SEND` reviewed and set intentionally
- [ ] Channel credentials saved via `/channels/setup/credentials-draft` (encrypted)
- [ ] Channel activation flow completed (`request-activation` → `confirm-activation`)
- [ ] HTTPS / TLS configured (nginx/reverse proxy)
- [ ] Rate limiting enabled on auth and send endpoints
- [ ] Log aggregation configured for `[delivery-audit]` entries
- [ ] `/ops/health` responds 200 before traffic is sent

---

## Phase 13A: Credential Vault Hardening

### OMNI_API_KEY_ENCRYPTION_SECRET

- **Required** for storing channel credentials and AI API keys
- Must be 32-byte hex (64 hex chars), base64 (44 chars), or any string (SHA-256 hashed)
- Never commit to version control
- Rotate by re-encrypting stored `credentialRef` blobs (tooling in Phase 14)

### Channel Credential Storage Rules

| Data | Storage | Never stored |
|------|---------|-------------|
| WABA ID | Plaintext (non-secret) | — |
| Phone Number ID | Plaintext (non-secret) | — |
| Access Token | AES-256-GCM encrypted `credentialRef` | Raw value |
| App Secret | AES-256-GCM encrypted `credentialRef` | Raw value |
| Phone Number | `phoneLast4` (last 4 digits only) | Full number |

### Safety Flag Defaults

| Flag | Default | Purpose |
|------|---------|---------|
| `OMNI_ALLOW_WA_SESSION` | `false` | Required for WA Web session activation |
| `OMNI_ENABLE_REAL_META_SEND` | `false` | Required for Meta API message send |
| `OMNI_ENABLE_ONBOARDING_AI` | `false` | Required for AI-generated onboarding preview |

---

## Phase 15B: Ops Hardening Checklist Items

Four new MANUAL items added to `GET /production-qa/checklist` under the Ops category:

### monitoring_configured
Configure uptime monitoring (UptimeRobot, Grafana, Better Uptime) pointed at `/health` or `/ops/health`. Set up alert channels (email, Slack, PagerDuty) for API/worker failures.

### log_retention
Define log retention policy (e.g. 30-day rolling). Configure log aggregation (AWS CloudWatch, Datadog, Logtail) to ship and retain Fastify API logs and worker stderr output.

### incident_response
Document on-call escalation path, SLA targets (e.g. P1 response in 30 min), and a runbook URL covering: how to restart API/worker, how to check DB/Redis health, and what to do if a WhatsApp session drops.

### support_contact
Set up a customer-facing support channel (support email, WhatsApp, Intercom, or help desk) before live activation.

## Phase 15B: RBAC Hardening

Write endpoints now require OWNER/ADMIN role:
- `POST /billing/select-plan-draft`
- `PATCH /settings/company-profile`
- `POST /team/invite-draft`
- `PATCH /team/members/:id/role`
- `PATCH /team/members/:id/status`

Read endpoints (GET /settings/overview, GET /billing/plans, GET /team/members) require any valid auth token. MANAGER+ required for team member list.

## Phase 15C: Audit Log Foundation

Admin actions are now recorded in the `AuditLog` DB table (tenant-scoped, immutable append-only log). See `docs/AUDIT_LOGS.md` for full details.

New pages:
- `/audit` — admin activity timeline (all roles)
- `/ops/runbook` — production monitoring/backup runbook (all roles)

Production QA checklist now includes audit readiness, backup runbook review, and monitoring runbook review items. See `docs/OPS_RUNBOOK.md` for the full runbook.
