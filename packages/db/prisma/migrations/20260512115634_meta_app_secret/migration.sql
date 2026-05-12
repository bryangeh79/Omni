-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "metaAppSecretLast4" TEXT,
ADD COLUMN     "metaAppSecretRef" TEXT,
ADD COLUMN     "metaAppSecretUpdatedAt" TIMESTAMP(3);
