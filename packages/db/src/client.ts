import { PrismaClient } from '@prisma/client'

// Global singleton to prevent multiple connections in development (hot-reload safe)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export async function connectDb(): Promise<void> {
  await prisma.$connect()
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect()
}
