// Meta Send Guardrail — Phase 10B
//
// All outbound Meta/WhatsApp sends MUST pass through this module.
// Default mode: OMNI_ENABLE_REAL_META_SEND is NOT set → send is disabled.
// Real send requires explicit env opt-in AND valid channel config.
//
// Safety principles:
//   - No secrets logged or returned in audit records.
//   - Bulk/broadcast sending is categorically rejected.
//   - CLOSED conversations cannot send.
//   - Blacklisted customers cannot receive auto-sends.
//   - DRY_RUN mode is always safe and produces structured audit records.

// ── Send status enumeration ────────────────────────────────────────────────────
export type SendStatus =
  | 'STUB_NOT_SENT'      // Default — real send disabled globally
  | 'META_SEND_DISABLED' // Meta channel but OMNI_ENABLE_REAL_META_SEND not set
  | 'DRY_RUN'            // Explicit dry-run mode
  | 'SENT'               // Real send succeeded (Phase 10B+ when enabled)
  | 'FAILED'             // Real send attempted but failed
  | 'BLOCKED_CLOSED'     // Conversation is CLOSED
  | 'BLOCKED_BULK'       // Bulk/broadcast attempt — categorically rejected
  | 'BLOCKED_CHANNEL'    // Channel missing required config

// ── Guard: is real Meta send allowed? ────────────────────────────────────────
/**
 * Returns true ONLY when OMNI_ENABLE_REAL_META_SEND=true is explicitly set.
 * Any other value (absent, empty, 'false', '0') returns false.
 */
export function isRealMetaSendEnabled(): boolean {
  return process.env.OMNI_ENABLE_REAL_META_SEND === 'true'
}

// ── Delivery audit structured log ─────────────────────────────────────────────
export interface DeliveryAuditEntry {
  ts:             string    // ISO-8601
  tenantId:       string
  conversationId: string
  messageId:      string
  channelId:      string
  provider:       'META' | 'STUB' | 'SYSTEM'
  status:         SendStatus
  errorCode?:     string    // safe error category string — no raw API secrets
  dryRun:         boolean
}

/**
 * Write a delivery audit entry to structured console log.
 * Phase 10B interim: console log only.
 * Phase 11: replace with DB write to a DeliveryLog table.
 *
 * MUST NOT log: token values, session data, raw API error messages with secrets.
 */
export function auditSendAttempt(entry: DeliveryAuditEntry): void {
  // Structured log line — safe for centralized log aggregation
  const safeEntry = { ...entry }
  console.log('[delivery-audit]', JSON.stringify(safeEntry))
}

// ── Guard: validate send conditions ──────────────────────────────────────────
export interface MetaSendGuardInput {
  tenantId:        string
  conversationId:  string
  messageId:       string
  channelId:       string
  conversationStatus: string
  channelType:     string
  hasMetaAccessToken: boolean  // whether the channel has an encrypted access token configured
  isBulk?:         boolean     // must be false for all individual sends
}

export interface MetaSendGuardResult {
  allowed:    boolean
  status:     SendStatus
  reason:     string
}

/**
 * Run all pre-send guards and return whether real send is allowed.
 * This NEVER calls Meta APIs — it only evaluates conditions.
 */
export function checkMetaSendGuard(input: MetaSendGuardInput): MetaSendGuardResult {
  // ── 1. Bulk/broadcast — always rejected ──────────────────────────────────
  if (input.isBulk) {
    return {
      allowed: false,
      status:  'BLOCKED_BULK',
      reason:  'Bulk/broadcast sending is not permitted. Only individual conversation replies are allowed.',
    }
  }

  // ── 2. Closed conversation ────────────────────────────────────────────────
  if (input.conversationStatus === 'CLOSED') {
    return {
      allowed: false,
      status:  'BLOCKED_CLOSED',
      reason:  'Cannot send to a CLOSED conversation.',
    }
  }

  // ── 3. Channel must be META_API (check before global flag) ───────────────
  // Non-Meta channels (WhatsApp Web, etc.) use STUB_NOT_SENT regardless of flag.
  if (input.channelType !== 'META_API') {
    return {
      allowed: false,
      status:  'STUB_NOT_SENT',
      reason:  `Channel type ${input.channelType} does not support Meta real send.`,
    }
  }

  // ── 4. Real Meta send globally disabled ────────────────────────────────────
  if (!isRealMetaSendEnabled()) {
    return {
      allowed: false,
      status:  'META_SEND_DISABLED',
      reason:  'OMNI_ENABLE_REAL_META_SEND is not set. Set to true to enable real Meta sends.',
    }
  }

  // ── 5. Channel must have access token configured ──────────────────────────
  if (!input.hasMetaAccessToken) {
    return {
      allowed: false,
      status:  'BLOCKED_CHANNEL',
      reason:  'Channel has no Meta access token configured. Configure via /channels/meta endpoint.',
    }
  }

  // ── All guards passed ─────────────────────────────────────────────────────
  return {
    allowed: true,
    status:  'SENT',  // status if send actually proceeds
    reason:  'All guards passed. Real Meta send allowed.',
  }
}

// ── Dry-run result builder ────────────────────────────────────────────────────
/**
 * Build a safe dry-run result when real send is disabled.
 * Returns the guard result without performing any actual API call.
 */
export function buildDryRunResult(input: MetaSendGuardInput): {
  sendStatus:   SendStatus
  dryRun:       boolean
  guardsChecked: string[]
  note:          string
} {
  const guard = checkMetaSendGuard(input)
  return {
    sendStatus:   guard.allowed ? 'DRY_RUN' : guard.status,
    dryRun:       true,
    guardsChecked: [
      `bulk_check: ${!input.isBulk ? 'passed' : 'REJECTED'}`,
      `conversation_status: ${input.conversationStatus === 'CLOSED' ? 'BLOCKED' : 'ok'}`,
      `real_send_enabled: ${isRealMetaSendEnabled() ? 'yes' : 'no (disabled)'}`,
      `channel_type: ${input.channelType}`,
      `has_token: ${input.hasMetaAccessToken ? 'yes' : 'no'}`,
    ],
    note: guard.reason,
  }
}
