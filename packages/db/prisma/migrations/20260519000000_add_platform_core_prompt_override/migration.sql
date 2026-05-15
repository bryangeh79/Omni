-- Round-9H: SaaS Admin optional override of the platform Core AI Prompt.

ALTER TABLE "PlatformAiSettings"
  ADD COLUMN "corePromptOverride" TEXT;
