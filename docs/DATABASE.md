# Omni — Database Guide

## Stack

- **PostgreSQL 16** (dev: Docker, host port `43113` → container `5432`)
- **Redis 7** (dev: Docker, host port `43114` → container `6379`)
- **Prisma ORM 5.x** — schema, migrations, client generation
- **Package:** `packages/db`

---

## Quick Start (Development)

### 1. Start Docker services

```powershell
# From C:\AI_WORKSPACE\Omni Ai Chatbot
docker compose up -d
```

Verify containers:
```powershell
docker ps --filter name=omni
```

Expected:
```
omni-postgres-dev   Up   0.0.0.0:43113->5432/tcp
omni-redis-dev      Up   0.0.0.0:43114->6379/tcp
```

### 2. Create .env

Copy `.env.example` to `.env` and fill in real values.
Dev defaults match `docker-compose.yml`:
```
DATABASE_URL=postgresql://omni_user:<password>@localhost:43113/omni_dev
REDIS_URL=redis://localhost:43114
```

**Never commit `.env`.**

### 3. Generate Prisma Client

```bash
pnpm db:generate
```

Must be run after:
- First clone
- Schema changes
- Prisma version upgrades

### 4. Run Migrations

```bash
pnpm db:migrate
```

Applies pending migrations to the local dev database.
Creates a new migration file if schema changes are detected.

### 5. Seed Demo Data

```bash
pnpm db:seed
```

- Idempotent (safe to run multiple times)
- Creates demo tenant, user, knowledge base, and automation rules
- **No real customer data**

### 6. Smoke Test

```bash
pnpm db:smoke
```

End-to-end DB test:
- Verifies connection
- Reads demo tenant
- Creates/reads/deletes scoped test records
- Verifies tenant isolation
- Cleans up all test records automatically

---

## Migration Workflow

### Creating a new migration

```bash
# Make changes to packages/db/prisma/schema.prisma, then:
cd packages/db
npx prisma migrate dev --schema=./prisma/schema.prisma --name <migration-name>
```

Or via root script:
```bash
pnpm db:migrate
# Prisma will prompt for a migration name
```

### Migration files

Location: `packages/db/prisma/migrations/`

Each migration contains:
- A timestamped folder (e.g., `20260511135020_init/`)
- `migration.sql` — the SQL applied to the database

**Always commit migration files.** They are the source of truth for the schema history.

### Schema location

```
packages/db/prisma/schema.prisma
```

---

## Prisma Schema Rules

1. **Every multi-tenant model must include `tenantId String`**
   and a relation to `Tenant`.
2. **Use `@default(cuid())` for IDs** — URL-safe, no collisions.
3. **Add `@@unique([tenantId, <natural key>])` where relevant**
   (e.g., `@@unique([tenantId, email])` on User, `@@unique([tenantId, phone])` on Customer).
4. **Never run destructive migrations** without ChatGPT approval and a backup plan.
5. **Do not rename columns** in production — add new column, migrate data, then drop old.

---

## Tenant Isolation

All customer-facing data models include `tenantId`. Use the `scopeToTenant()` helper from `@omni/db` to automatically scope queries:

```typescript
import { prisma, scopeToTenant } from '@omni/db'

const db = scopeToTenant(prisma, req.user.tenantId)

// All queries are automatically tenant-scoped
const customers = await db.customers.list()
const conv = await db.conversations.create({ channelId, customerId, status: 'AI_HANDLING' })
```

**Never query sensitive models without tenantId in the WHERE clause.**

### Models with tenantId

| Model | tenantId field | Scope method |
|---|---|---|
| Customer | direct | `db.customers.*` |
| Conversation | direct | `db.conversations.*` |
| Channel | direct | `db.channels.*` |
| KnowledgeItem | direct | `db.knowledge.*` |
| AiConfig | direct | — |
| FollowUpRule | direct | `db.followUpRules.*` |
| HandoffRule | direct | `db.handoffRules.*` |
| Message | via Conversation | `db.messages.inConversation()` |

---

## Port Safety

| Service | Host Port | Container Port |
|---|---|---|
| PostgreSQL | **43113** | 5432 |
| Redis | **43114** | 6379 |

Do **not** use standard ports (5432, 6379) — other projects on this machine use those.

To check before starting:
```powershell
@(43113,43114) | ForEach-Object {
    $r = netstat -ano | Select-String ":$_\s"
    if ($r) { "PORT $_ OCCUPIED" } else { "PORT $_ free" }
}
```

---

## Stopping Docker Services

```powershell
# From C:\AI_WORKSPACE\Omni Ai Chatbot
docker compose down
```

Data is persisted in named volumes (`omni-postgres-data`, `omni-redis-data`).
To delete all data:
```powershell
docker compose down -v   # ⚠️ destroys all data
```

---

## Safety Rules

- Do **not** run `DROP TABLE`, `TRUNCATE`, or `DELETE FROM` without a task scope and approval.
- Do **not** run `prisma migrate reset` on any shared or staging database.
- Do **not** commit `.env` — it contains database credentials.
- Do **not** log or print `DATABASE_URL` or any connection string.
- Migrations are append-only in production. Never modify existing migration files.
