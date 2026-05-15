// Auth module — public exports
export type { JwtTokenPayload } from './types'
export {
  hashPassword,
  verifyPassword,
  findActiveUserByTenantSlugAndEmail,
  findActiveUserByEmail,
  findUniqueActiveUserByEmail,
  isTenantActive,
  issueAccessToken,
  issueRefreshToken,
} from './service'
export type { AuthUser } from './service'
export { requireAuth, requireRole, requirePlatformAdmin, getAuthUser } from './middleware'
export { requireAnyRole, hasRoleAtLeast, hasAnyRole, RBAC_GROUPS } from './rbac'
export type { RoleTier } from './rbac'
