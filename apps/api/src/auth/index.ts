// Auth module — public exports
export type { JwtTokenPayload } from './types'
export {
  hashPassword,
  verifyPassword,
  findActiveUserByTenantSlugAndEmail,
  findActiveUserByEmail,
  isTenantActive,
  issueAccessToken,
  issueRefreshToken,
} from './service'
export type { AuthUser } from './service'
export { requireAuth, requireRole, getAuthUser } from './middleware'
