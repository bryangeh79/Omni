-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "displayPhoneNumber" TEXT,
ADD COLUMN     "lastWebhookAt" TIMESTAMP(3),
ADD COLUMN     "metaAccessTokenLast4" TEXT,
ADD COLUMN     "metaAccessTokenRef" TEXT,
ADD COLUMN     "metaAccessTokenUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "wabaId" TEXT,
ADD COLUMN     "webhookVerifyTokenRef" TEXT;
