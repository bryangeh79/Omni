-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('DRAFT', 'PREVIEWED', 'ENABLED');

-- CreateTable
CREATE TABLE "OnboardingDraft" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'DRAFT',
    "companyName" TEXT,
    "industry" TEXT,
    "whatsappNumber" TEXT,
    "website" TEXT,
    "serviceArea" TEXT,
    "businessHours" TEXT,
    "aiGoals" TEXT[],
    "materialsText" TEXT,
    "materialsUrl" TEXT,
    "generatedPreview" JSONB,
    "enabledAt" TIMESTAMP(3),
    "completedSteps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingDraft_tenantId_key" ON "OnboardingDraft"("tenantId");

-- AddForeignKey
ALTER TABLE "OnboardingDraft" ADD CONSTRAINT "OnboardingDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
