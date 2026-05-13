# Audit Logs — Phase 15C

## What Is Audited

Admin actions that mutate tenant data or configuration are automatically recorded in the `AuditLog` table.

| Action | Trigger | Entity Type |
|---|---|---|
| `TEAM_INVITE_DRAFT` | POST /team/invite-draft | TeamInvite |
| `TEAM_ROLE_UPDATE` | PATCH /team/members/:id/role | User |
| `TEAM_STATUS_UPDATE` | PATCH /team/members/:id/status | User |
| `BILLING_PLAN_SELECTED` | POST /billing/select-plan-draft | Tenant |
| `SETTINGS_PROFILE_UPDATE` | PATCH /settings/company-profile | Tenant |
| `SMOKE_TEST_EVENT` | POST /audit/demo-event (smoke tests only) | SmokeTest |

## What Is Never Logged

The `createAuditLog` helper strips the following keys from `metadata` before writing:

- `password`, `passwordHash`
- `token`, `accessToken`, `refreshToken`
- `apiKey`, `apiKeyRef`
- `credentialRef`, `metaAccessTokenRef`, `webhookVerifyTokenRef`, `metaAppSecretRef`
- `JWT_SECRET`, `secret`, `credential`

Errors in audit log creation are caught and written to `console.error` only — they **never** propagate to the caller or affect the main operation.

## Schema

```
AuditLog {
  id           String   @id @default(cuid())
  tenantId     String
  actorUserId  String?
  actorRole    String?
  action       String
  entityType   String
  entityId     String?
  metadataJson String   @default("{}")
  ip           String?
  userAgent    String?
  createdAt    DateTime @default(now())
}
```

Indexed on `(tenantId, createdAt)` and `(tenantId, action)` for efficient tenant-scoped queries.

## API

### GET /audit/logs

Requires auth (any role). Returns tenant-scoped paginated audit events.

Query params: `page`, `pageSize` (max 100, default 50), `action`, `entityType`.

Response shape:
```json
{
  "tenantId": "...",
  "pagination": { "total": 25, "page": 1, "pageSize": 50, "pages": 1 },
  "logs": [ { "id": "...", "action": "TEAM_ROLE_UPDATE", ... } ]
}
```

### POST /audit/demo-event

Requires auth. Creates a safe `SMOKE_TEST_EVENT` record — used for smoke test validation only.

## UI

Available at `/audit` in the web dashboard. Shows a timeline of recent admin actions with:
- Actor role badge (color-coded)
- Relative timestamps
- Safe metadata preview (secrets stripped)
- Pagination and filters by action / entity type

## Retention

Retention policy is not yet configured. For production, implement a periodic cleanup job or DB-level TTL policy. Recommended minimum: 90 days for compliance.
