// API Key Vault — AES-256-GCM encryption/decryption utilities.
// Shared between apps/api (key storage) and apps/worker (key decryption).
//
// SECURITY RULES:
//   - Raw keys NEVER logged, returned, or stored in plain text.
//   - Encrypted blob: base64(IV[12] + GCM_AuthTag[16] + Ciphertext)
//   - Requires OMNI_API_KEY_ENCRYPTION_SECRET env var.

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES  = 12
const TAG_BYTES = 16

function getEncryptionKey(): Buffer {
  const secret = process.env.OMNI_API_KEY_ENCRYPTION_SECRET
  if (!secret) throw new Error('OMNI_API_KEY_ENCRYPTION_SECRET is not configured')
  const hexBuf = Buffer.from(secret, 'hex')
  const b64Buf = Buffer.from(secret, 'base64')
  if (hexBuf.length === 32) return hexBuf
  if (b64Buf.length === 32) return b64Buf
  return crypto.createHash('sha256').update(secret, 'utf8').digest()
}

export function isVaultConfigured(): boolean {
  return !!process.env.OMNI_API_KEY_ENCRYPTION_SECRET
}

export function encryptApiKey(plaintext: string): string {
  const key    = getEncryptionKey()
  const iv     = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

/** Decrypt. Result MUST NOT be returned to callers or logged. Throws on tamper. */
export function decryptApiKey(blob: string): string {
  const key      = getEncryptionKey()
  const buf      = Buffer.from(blob, 'base64')
  const iv       = buf.subarray(0, IV_BYTES)
  const tag      = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const enc      = buf.subarray(IV_BYTES + TAG_BYTES)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

export function extractLast4(rawKey: string): string {
  return rawKey.trim().slice(-4)
}

export function validateKeyShape(provider: string, rawKey: string): string | null {
  const key = rawKey.trim()
  if (!key || key.length < 10) return 'API key is too short (minimum 10 characters)'
  if (provider === 'OPENAI'   && !key.startsWith('sk-')) return 'OpenAI keys must start with "sk-"'
  if (provider === 'DEEPSEEK' && !key.startsWith('sk-')) return 'DeepSeek keys must start with "sk-"'
  return null
}

export const KEY_PROVIDERS = ['OPENAI', 'GEMINI', 'DEEPSEEK'] as const
export type KeyProvider = typeof KEY_PROVIDERS[number]
