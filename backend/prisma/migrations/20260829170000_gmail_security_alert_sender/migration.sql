ALTER TABLE "SecurityAlertChannel"
  ADD COLUMN "senderProvider" TEXT,
  ADD COLUMN "senderEmail" TEXT,
  ADD COLUMN "senderSecretEncrypted" TEXT,
  ADD COLUMN "senderConnectedAt" TIMESTAMP(3),
  ADD COLUMN "senderTestedAt" TIMESTAMP(3),
  ADD COLUMN "senderTestStatus" TEXT;
