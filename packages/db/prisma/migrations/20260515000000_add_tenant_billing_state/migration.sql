-- Round-9A: TenantBillingState — quota counters, add-ons, credits, smart-reply toggle, stub ledger.

CREATE TABLE "TenantBillingState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "aiSmartReplyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "currentMonthKey" TEXT NOT NULL DEFAULT '',
    "monthlyUsage" JSONB NOT NULL DEFAULT '{"faqGenerations":0,"aiReplies":0}',
    "addOnsActive" JSONB NOT NULL DEFAULT '[]',
    "purchasedCredits" JSONB NOT NULL DEFAULT '{"faq":0,"aiReply":0}',
    "ledger" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantBillingState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantBillingState_tenantId_key" ON "TenantBillingState"("tenantId");

ALTER TABLE "TenantBillingState" ADD CONSTRAINT "TenantBillingState_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
