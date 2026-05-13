-- CreateEnum
CREATE TYPE "ChannelSetupStatus" AS ENUM ('DRAFT', 'TESTED_STUB', 'READY_FOR_CREDENTIALS', 'CREDENTIALS_SAVED', 'ACTIVATION_PENDING', 'ACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('NONE', 'DRAFT', 'ENCRYPTED_STORED');

-- CreateTable
CREATE TABLE "ChannelSetupDraft" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelType" TEXT,
    "displayName" TEXT,
    "phoneLast4" TEXT,
    "setupStatus" "ChannelSetupStatus" NOT NULL DEFAULT 'DRAFT',
    "credentialStatus" "CredentialStatus" NOT NULL DEFAULT 'NONE',
    "credentialRef" TEXT,
    "credentialLast4" TEXT,
    "testStatus" TEXT NOT NULL DEFAULT 'NOT_TESTED',
    "lastTestAt" TIMESTAMP(3),
    "realWaSessionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "realMetaSendEnabled" BOOLEAN NOT NULL DEFAULT false,
    "activationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelSetupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelSetupDraft_tenantId_key" ON "ChannelSetupDraft"("tenantId");

-- AddForeignKey
ALTER TABLE "ChannelSetupDraft" ADD CONSTRAINT "ChannelSetupDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
