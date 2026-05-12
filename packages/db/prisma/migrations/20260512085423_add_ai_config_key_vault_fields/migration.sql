-- AlterTable
ALTER TABLE "AiConfig" ADD COLUMN     "apiKeyLast4" TEXT,
ADD COLUMN     "apiKeyProvider" TEXT,
ADD COLUMN     "apiKeyUpdatedAt" TIMESTAMP(3);
