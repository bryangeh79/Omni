// Audit Log Helper — Phase 15C
//
// Creates a non-blocking audit record for admin/system actions.
// Safety contract:
//   - NEVER log secrets, tokens, passwords, or .env values
//   - metadataJson is stripped of known secret field names before write
//   - Fire-and-forget: errors are caught and logged to console only (never thrown)
//   - Tenant-scoped: every record requires tenantId

import { prisma } from '@omni/db'

const SECRET_KEYS = new Set([
  'password', 'passwordHash', 'token', 'accessToken', 'refreshToken',
  'apiKey', 'apiKeyRef', 'credentialRef', 'metaAccessTokenRef',
  'webhookVerifyTokenRef', 'metaAppSecretRef', 'JWT_SECRET', 'secret',
  'credential',
])

function stripSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.has(k)) continue
    out[k] = v
  }
  return out
}

export interface AuditLogInput {
  tenantId:    string
  actorUserId?: string
  actorRole?:   string
  action:      string
  entityType:  string
  entityId?:   string
  metadata?:   Record<string, unknown>
  ip?:         string
  userAgent?:  string
}

export async function createAuditLog(input: AuditLogInput): Promise<void> {
  try {
    const safe = input.metadata ? stripSecrets(input.metadata) : {}
    await prisma.auditLog.create({
      data: {
        tenantId:    input.tenantId,
        actorUserId: input.actorUserId ?? null,
        actorRole:   input.actorRole   ?? null,
        action:      input.action,
        entityType:  input.entityType,
        entityId:    input.entityId    ?? null,
        metadataJson: JSON.stringify(safe),
        ip:          input.ip          ?? null,
        userAgent:   input.userAgent   ?? null,
      },
    })
  } catch (err) {
    console.error('[audit] createAuditLog failed (non-fatal):', err)
  }
}
