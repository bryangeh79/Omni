// Audit Safe Metadata Utility — Phase 18A
//
// Centralized whitelist-based sanitizer for audit event metadata exposed to
// tenant-facing APIs/UIs. Single source of truth — all audit/event exposing
// endpoints should use this utility instead of duplicating sanitization logic.
//
// SAFETY CONTRACT:
//   - Whitelist-only: only known-safe keys pass through
//   - Tolerates invalid JSON (returns {} instead of throwing)
//   - Never returns raw passwordHash, tokens, credentialRef, encrypted blobs
//   - actorUserId, ip, userAgent are NOT included in SafeAuditEvent shape
//     (caller may opt-in if exposing to a broader admin view)
//   - This is a refactor of Phase 17C/17D logic with no behavior change for
//     existing /account/activity + /account/security-events consumers.

/**
 * Whitelist of audit metadata keys that are safe to echo back in API responses.
 *
 * Any key NOT in this set is dropped during sanitization. This prevents future
 * audit-log writers from accidentally leaking values via metadataJson even if
 * the per-write filter (in lib/audit.ts) is bypassed or extended.
 */
export const SAFE_AUDIT_METADATA_KEYS: ReadonlySet<string> = new Set([
  // Account / settings updates
  'updatedFields',
  // Team role/status changes
  'newRole', 'isActive',
  // Billing plan changes
  'planId', 'priceRm',
  // Channel / activation context
  'channelType', 'intendedMode', 'dryRunStatus', 'blockedCount',
  // Tenant signup context
  'industry', 'goal', 'channelPreference',
  // Test message dry-run
  'recipientLabel',
])

/**
 * Parse the raw metadataJson string from AuditLog and return only whitelisted
 * fields. Tolerates null, undefined, empty string, and malformed JSON.
 *
 * Never throws. Never returns disallowed keys.
 */
export function parseAuditMetadataSafe(
  metadataJson: string | null | undefined,
): Record<string, unknown> {
  if (!metadataJson) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(metadataJson)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (SAFE_AUDIT_METADATA_KEYS.has(k)) {
      out[k] = v
    }
  }
  return out
}

/**
 * Deterministic, human-readable one-line summary per known audit action.
 * Unknown actions fall back to the action code itself.
 */
export function summarizeAuditAction(action: string): string {
  switch (action) {
    case 'ACCOUNT_PROFILE_UPDATE':          return 'Account profile updated'
    case 'TENANT_SIGNUP':                    return 'Tenant signed up'
    case 'TEAM_INVITE_DRAFT':                return 'Team invite drafted (no email sent)'
    case 'TEAM_ROLE_UPDATE':                 return 'Team member role updated'
    case 'TEAM_STATUS_UPDATE':               return 'Team member status changed'
    case 'BILLING_PLAN_SELECTED':            return 'Billing plan selected (no charge)'
    case 'SETTINGS_PROFILE_UPDATE':          return 'Settings profile updated'
    case 'ACTIVATION_DRY_RUN':               return 'Activation dry-run executed (no real send)'
    case 'ACTIVATION_TEST_MESSAGE_DRY_RUN':  return 'Test message dry-run (no real send)'
    case 'SMOKE_TEST_EVENT':                 return 'Smoke test event'
    default:                                  return action
  }
}

export type Severity = 'info' | 'warning' | 'critical'

export interface SeverityClassification {
  severity: Severity
  reason:   string
}

/**
 * Deterministic severity classification for security-focused event views.
 *
 * Rules:
 *   - warning: privilege escalation (promote to OWNER/ADMIN), member deactivation,
 *              activation dry-run with blockers
 *   - info:    routine profile/billing/plan changes, normal dry-runs
 *   - critical: reserved (no rule currently assigns critical)
 */
export function classifySecuritySeverity(
  action: string,
  safeMetadata: Record<string, unknown>,
): SeverityClassification {
  if (action === 'TEAM_ROLE_UPDATE') {
    const newRole = String(safeMetadata.newRole ?? '')
    if (newRole === 'OWNER' || newRole === 'ADMIN') {
      return { severity: 'warning', reason: 'Member promoted to elevated role' }
    }
    return { severity: 'info', reason: 'Member role updated' }
  }
  if (action === 'TEAM_STATUS_UPDATE') {
    if (safeMetadata.isActive === false) {
      return { severity: 'warning', reason: 'Member deactivated' }
    }
    return { severity: 'info', reason: 'Member status changed' }
  }
  if (action === 'ACCOUNT_PROFILE_UPDATE' || action === 'SETTINGS_PROFILE_UPDATE') {
    return { severity: 'info', reason: 'Profile updated' }
  }
  if (action === 'BILLING_PLAN_SELECTED') {
    return { severity: 'info', reason: 'Billing plan selected (no charge)' }
  }
  if (action === 'ACTIVATION_DRY_RUN') {
    const blockedCount = Number(safeMetadata.blockedCount ?? 0)
    const dryRunStatus = String(safeMetadata.dryRunStatus ?? '')
    if (dryRunStatus === 'BLOCKED' || blockedCount > 0) {
      return {
        severity: 'warning',
        reason: `Activation dry-run blocked (${blockedCount} issue${blockedCount === 1 ? '' : 's'})`,
      }
    }
    return { severity: 'info', reason: 'Activation dry-run executed' }
  }
  if (action === 'ACTIVATION_TEST_MESSAGE_DRY_RUN') {
    return { severity: 'info', reason: 'Test message dry-run (no real send)' }
  }
  return { severity: 'info', reason: action }
}

/**
 * Raw shape coming out of `prisma.auditLog.findMany({ select: ... })`.
 * Only fields that may be exposed to tenant-facing UIs/APIs.
 */
export interface RawAuditEvent {
  id:            string
  action:        string
  entityType:    string
  entityId?:     string | null
  actorRole:     string | null
  createdAt:     Date | string
  metadataJson:  string
}

/**
 * Safe shape for tenant-facing UIs/APIs. Never includes raw metadataJson,
 * actorUserId, ip, or userAgent.
 */
export interface SafeAuditEvent {
  id:           string
  action:       string
  entityType:   string
  entityId?:    string | null
  actorRole:    string | null
  createdAt:    Date | string
  summary:      string
  safeMetadata: Record<string, unknown>
}

/**
 * Shape a raw audit event for tenant-facing output. Replaces raw metadataJson
 * with a whitelisted safeMetadata object and a deterministic summary string.
 */
export function sanitizeAuditEvent(raw: RawAuditEvent): SafeAuditEvent {
  const safeMetadata = parseAuditMetadataSafe(raw.metadataJson)
  return {
    id:           raw.id,
    action:       raw.action,
    entityType:   raw.entityType,
    entityId:     raw.entityId ?? null,
    actorRole:    raw.actorRole,
    createdAt:    raw.createdAt,
    summary:      summarizeAuditAction(raw.action),
    safeMetadata,
  }
}
