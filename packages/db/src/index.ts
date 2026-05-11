// Omni DB package — public exports
// Run `pnpm db:generate` after cloning to generate schema-specific Prisma types.

export { PrismaClient } from '@prisma/client'
export type { Prisma } from '@prisma/client'

// Prisma enums — exported so consumers don't need to depend on @prisma/client directly
export {
  Direction,
  SenderType,
  UserRole,
  ConversationStatus,
  LeadStage,
  KnowledgeItemType,
  ChannelType as PrismaChannelType,
} from '@prisma/client'

export { prisma, connectDb, disconnectDb } from './client'
export { scopeToTenant } from './tenant-scope'
export type { TenantScopedDb } from './tenant-scope'
