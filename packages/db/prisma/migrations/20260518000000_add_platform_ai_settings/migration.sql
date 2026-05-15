-- Round-9E: PlatformAiSettings singleton table (SaaS Admin-only).
-- Tenants never read this row. Only hasApiKey + apiKeyLast4 are exposed in API
-- responses; apiKeyEncrypted is opaque and never returned.

CREATE TABLE "PlatformAiSettings" (
    "id"                      TEXT NOT NULL DEFAULT 'singleton',
    "provider"                TEXT,
    "defaultModel"            TEXT,
    "apiKeyEncrypted"         TEXT,
    "apiKeyLast4"             TEXT,
    "hasApiKey"               BOOLEAN NOT NULL DEFAULT false,
    "enabled"                 BOOLEAN NOT NULL DEFAULT false,
    "allowTenantProvidedKeys" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"               TIMESTAMP(3) NOT NULL,
    "updatedByUserId"         TEXT,

    CONSTRAINT "PlatformAiSettings_pkey" PRIMARY KEY ("id")
);
