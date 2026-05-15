-- Round-9D: tenant-driven activation-request lifecycle on ChannelSetupDraft.

ALTER TABLE "ChannelSetupDraft"
  ADD COLUMN "activationStatus"      TEXT,
  ADD COLUMN "activationRequestedAt" TIMESTAMP(3);
