// WhatsApp Web session path utilities.
// Sessions are stored under data/wa-sessions/{channelId}/
// and must NEVER leave this boundary.

import fs from 'fs'
import path from 'path'

const SESSION_BASE_RELATIVE = 'data/wa-sessions'

/**
 * Resolve and validate the session directory for a channel.
 * Throws if the resolved path is outside SESSION_BASE.
 * Creates the directory if it does not exist.
 */
export function resolveSessionDir(channelId: string, projectRoot: string): string {
  // Sanitize channelId — only alphanumeric, hyphens, underscores allowed
  if (!/^[a-zA-Z0-9_-]+$/.test(channelId)) {
    throw new Error(`Invalid channelId for session path: "${channelId}"`)
  }

  const base    = path.resolve(projectRoot, SESSION_BASE_RELATIVE)
  const session = path.join(base, channelId)

  // Safety: resolved path must stay under session base
  if (!session.startsWith(base + path.sep) && session !== base) {
    throw new Error(`Session path "${session}" is outside allowed base "${base}"`)
  }

  if (!fs.existsSync(session)) {
    fs.mkdirSync(session, { recursive: true })
  }

  return session
}

/**
 * Remove a channel's session directory (logout / reset).
 * Only removes if it is confirmed to be inside SESSION_BASE.
 */
export function removeSessionDir(channelId: string, projectRoot: string): void {
  const base    = path.resolve(projectRoot, SESSION_BASE_RELATIVE)
  const session = path.join(base, channelId)

  if (!session.startsWith(base + path.sep)) return // safety check
  if (fs.existsSync(session)) {
    fs.rmSync(session, { recursive: true, force: true })
  }
}
