# Omni RBAC & Team Management — Phase 15B

## Role Hierarchy

| Role    | Description                                      | Tier    |
|---------|--------------------------------------------------|---------|
| OWNER   | Full control — tenant owner                      | Admin   |
| ADMIN   | Full admin access — can manage team, billing     | Admin   |
| MANAGER | View team and reports; cannot change settings    | Manager |
| AGENT   | Inbox access and conversation handling only      | Agent   |
| VIEWER  | Read-only — no write access                      | Viewer  |

MANAGER was added in Phase 15B (`migration: 20260513152535_add_manager_role`).

---

## RBAC Enforcement

The `requireRole(...roles)` factory in `apps/api/src/auth/middleware.ts` is used as a Fastify `preHandler` to enforce role access. It calls `requireAuth` first (401 if no valid JWT), then checks `req.user.role` against the allowed roles (403 if insufficient).

### Role Constants (per route file)

```typescript
const ADMIN_ROLES   = ['OWNER', 'ADMIN']            // write: team, billing, settings
const MANAGER_ROLES = ['OWNER', 'ADMIN', 'MANAGER'] // read: team member list
```

### Applied Guards

| Endpoint                              | Required Role     |
|---------------------------------------|-------------------|
| `GET /team/members`                   | MANAGER+          |
| `POST /team/invite-draft`             | ADMIN+            |
| `PATCH /team/members/:id/role`        | ADMIN+            |
| `PATCH /team/members/:id/status`      | ADMIN+            |
| `PATCH /settings/company-profile`     | ADMIN+            |
| `POST /billing/select-plan-draft`     | ADMIN+            |
| All other settings/billing GET routes | Any auth (JWT)    |

---

## API Endpoints

### GET /team/members

Returns all team members (including inactive). Requires MANAGER+ role.

```json
{
  "tenantId": "...",
  "total": 3,
  "active": 2,
  "members": [
    { "id": "...", "name": "Alice", "email": "alice@...", "role": "OWNER", "isActive": true, "createdAt": "..." }
  ]
}
```

**Safety:** `passwordHash` is never returned. All projections use an explicit select list.

### POST /team/invite-draft

Records an invite intent. **No real email is sent.** Returns `emailSent: false` always.

Body: `{ email: string; name?: string; role?: string }`

```json
{
  "tenantId": "...",
  "invited": { "email": "...", "name": "...", "role": "AGENT" },
  "emailSent": false,
  "stub": true,
  "note": "Invite recorded as draft. No real email sent...",
  "action": "Operator must manually provision user credentials via /auth/register or seed script."
}
```

Returns 409 if the user already exists in the tenant.

### PATCH /team/members/:id/role

Updates the role of a team member. Requires ADMIN+.

Body: `{ role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER' }`

Returns 400 if caller tries to demote themselves.

### PATCH /team/members/:id/status

Activates or deactivates a team member. Requires ADMIN+.

Body: `{ isActive: boolean }`

Returns 400 if caller tries to deactivate themselves.

---

## Web Page /team

- Login-gated
- Lists all team members with role badges
- OWNER/ADMIN can edit roles inline and activate/deactivate members
- OWNER/ADMIN can record invite drafts (stub — no real email)
- MANAGER/AGENT/VIEWER see read-only member list
- Current user's role displayed in header

---

## Limitations (Phase 15B)

- No real email invitation — operator must manually provision credentials
- No SSO, OAuth, or social login
- No permission inheritance or custom role builder
- No audit log for role changes
- No JWT invalidation on role change (takes effect on next login)
