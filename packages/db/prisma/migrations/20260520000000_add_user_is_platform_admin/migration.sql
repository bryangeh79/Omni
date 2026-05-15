-- Round-9H-3: distinct platform-admin flag. Tenant OWNER/ADMIN inside their
-- own workspace no longer grants access to /admin/ai-settings or other
-- platform-operator endpoints. Defaults to false for all existing users.

ALTER TABLE "User"
  ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Bootstrap the demo seed user so existing dev / smoke flows continue to
-- work. Real production rollouts must elevate the platform operator account
-- manually via direct DB write or a future /admin/users/:id/promote endpoint.
UPDATE "User"
SET    "isPlatformAdmin" = true
WHERE  email = 'admin@omni-demo.test';
