-- Round-9B: Tenant service access / license / contract foundation.

ALTER TABLE "Tenant"
  ADD COLUMN "serviceStatus"    TEXT       NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN "contractStartAt"  TIMESTAMP(3),
  ADD COLUMN "contractEndAt"    TIMESTAMP(3),
  ADD COLUMN "licenseCode"      TEXT,
  ADD COLUMN "suspensionReason" TEXT,
  ADD COLUMN "internalNotes"    TEXT;

CREATE UNIQUE INDEX "Tenant_licenseCode_key" ON "Tenant"("licenseCode");
