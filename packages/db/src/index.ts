// Omni DB package — public exports
// Run `pnpm db:generate` after cloning to generate schema-specific Prisma types.

export { PrismaClient } from '@prisma/client'
export type { Prisma } from '@prisma/client'

export { prisma, connectDb, disconnectDb } from './client'
export { scopeToTenant } from './tenant-scope'
export type { TenantScopedDb } from './tenant-scope'
