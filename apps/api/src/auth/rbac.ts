// RBAC Helper — Phase 15B
//
// Defines role tiers and access checks for sensitive routes.
//
// Role hierarchy (highest to lowest privilege):
//   OWNER   — full control: billing, team, settings, channel activation
//   ADMIN   — full settings/team/channel control; cannot change billing plan
//   MANAGER — view boss + team summary; manage agents; cannot change billing/critical settings
//   AGENT   — inbox + PWA; cannot change settings/billing/team
//   VIEWER  — read-only access (inbox, boss, knowledge view)
//
// Access checks are tenant-scoped (caller must already have tenantId from JWT).

import type { FastifyRequest, FastifyReply } from 'fastify'
import { requireAuth } from './middleware'
import type { JwtTokenPayload } from './types'

export type RoleTier = 'OWNER' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER'

const ROLE_RANK: Record<string, number> = {
  OWNER:   100,
  ADMIN:   80,
  MANAGER: 60,
  AGENT:   40,
  VIEWER:  20,
}

/** Role groups for common access patterns. */
export const RBAC_GROUPS = {
  // Full admin operations (team management, channel activation, sensitive settings)
  ADMIN_OR_OWNER:        ['OWNER', 'ADMIN'] as const,
  // Billing plan changes (owner-only by default)
  BILLING_CHANGE:        ['OWNER'] as const,
  // Settings + team write operations
  SETTINGS_WRITE:        ['OWNER', 'ADMIN'] as const,
  // Team write (invite, role change, status change)
  TEAM_WRITE:            ['OWNER', 'ADMIN'] as const,
  // Manager view (boss, team summary, customer/inbox access)
  MANAGER_VIEW:          ['OWNER', 'ADMIN', 'MANAGER'] as const,
  // Agent operations (inbox, send messages, follow-up actions)
  AGENT_OPERATIONS:      ['OWNER', 'ADMIN', 'MANAGER', 'AGENT'] as const,
  // Anyone authenticated (read-only)
  AUTHENTICATED:         ['OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER'] as const,
} as const

/** Compare two roles. Returns true if `userRole` rank >= `requiredRole` rank. */
export function hasRoleAtLeast(userRole: string, requiredRole: RoleTier): boolean {
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[requiredRole] ?? Infinity)
}

/** Check if a user role is in an allowed list. */
export function hasAnyRole(userRole: string, allowed: readonly string[]): boolean {
  return allowed.includes(userRole)
}

/**
 * preHandler factory: require one of the specified roles.
 * Returns 403 if role check fails.
 *
 * Usage: app.get('/route', { preHandler: requireAnyRole(...RBAC_GROUPS.TEAM_WRITE) }, ...)
 */
export function requireAnyRole(...allowedRoles: readonly string[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(req, reply)
    if (reply.sent) return
    const user = req.user as JwtTokenPayload
    if (!allowedRoles.includes(user.role)) {
      return reply.status(403).send({
        error:        'Forbidden — insufficient role',
        requiredOne:  allowedRoles,
        currentRole:  user.role,
      })
    }
  }
}
