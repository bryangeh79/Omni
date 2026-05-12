-- AlterTable
ALTER TABLE "AiConfig" ADD COLUMN     "aiProvider" TEXT NOT NULL DEFAULT 'DRY_RUN',
ADD COLUMN     "apiKeyRef" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxTokens" INTEGER,
ADD COLUMN     "replyLanguagePolicy" TEXT NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "temperature" DOUBLE PRECISION,
ADD COLUMN     "useTenantApiKey" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "model" SET DEFAULT 'dry-run';
