// API Key Vault — AES-256-GCM encryption for tenant provider API keys.
//
// SECURITY RULES:
//   - Raw keys are NEVER logged, returned in API responses, or stored in plain text.
//   - The encryption secret MUST be in OMNI_API_KEY_ENCRYPTION_SECRET env var.
//   - Encrypted blob format: base64(IV[12] + AuthTag[16] + Ciphertext)
//   - If OMNI_API_KEY_ENCRYPTION_SECRET is not set, key-write endpoints fail with 503.

import crypto from 'crypto'

const ALGORITHM  = 'aes-256-gcm'
const IV_BYTES   = 12
const TAG_BYTES  = 16

// ── Encryption key derivation ─────────────────────────────────────────────────

/** Returns a 32-byte Buffer key from the env secret (hex, base64, or raw string). */
function getEncryptionKey(): Buffer {
  const secret = process.env.OMNI_API_KEY_ENCRYPTION_SECRET
  if (!secret) throw new Error('OMNI_API_KEY_ENCRYPTION_SECRET is not configured')

  // Accept 64-char hex (32 bytes) or 44-char base64 (32 bytes), else SHA-256 derive
  const hexBuf  = Buffer.from(secret, 'hex')
  const b64Buf  = Buffer.from(secret, 'base64')

  if (hexBuf.length === 32) return hexBuf
  if (b64Buf.length === 32) return b64Buf
  // Derive 32-byte key via SHA-256 (accepts any string secret)
  return crypto.createHash('sha256').update(secret, 'utf8').digest()
}

// ── Public helpers ─────────────────────────────────────────────────────────────

/** True if OMNI_API_KEY_ENCRYPTION_SECRET is set. */
export function isVaultConfigured(): boolean {
  return !!process.env.OMNI_API_KEY_ENCRYPTION_SECRET
}

/**
 * Encrypt a raw API key string.
 * Returns base64-encoded blob: IV + GCM auth tag + ciphertext.
 * The plaintext is NEVER logged or returned.
 */
export function encryptApiKey(plaintext: string): string {
  const key    = getEncryptionKey()
  const iv     = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

/**
 * Decrypt an encrypted blob back to the raw key.
 * The result MUST NOT be returned to API callers or logged.
 * Throws on tampered/corrupted ciphertext.
 */
export function decryptApiKey(blob: string): string {
  const key     = getEncryptionKey()
  const buf     = Buffer.from(blob, 'base64')
  const iv      = buf.subarray(0, IV_BYTES)
  const tag     = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const enc     = buf.subarray(IV_BYTES + TAG_BYTES)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

/**
 * Extract the last 4 characters of a raw API key for display.
 * Call this BEFORE encrypting and store the result separately.
 */
export function extractLast4(rawKey: string): string {
  return rawKey.trim().slice(-4)
}

/**
 * Light shape validation for provider API keys.
 * Returns an error message string if invalid, null if valid.
 */
export function validateKeyShape(provider: string, rawKey: string): string | null {
  const key = rawKey.trim()
  if (!key || key.length < 10) {
    return 'API key is too short (minimum 10 characters)'
  }
  if (provider === 'OPENAI') {
    if (!key.startsWith('sk-')) return 'OpenAI keys must start with "sk-"'
  }
  if (provider === 'DEEPSEEK') {
    if (!key.startsWith('sk-')) return 'DeepSeek keys must start with "sk-"'
  }
  // Gemini: any non-trivial non-empty string is accepted (AIza... or similar)
  return null
}

/** Providers that support tenant-owned keys. */
export const KEY_PROVIDERS = ['OPENAI', 'GEMINI', 'DEEPSEEK'] as const
export type KeyProvider = typeof KEY_PROVIDERS[number]
