ALTER TABLE "SecurityAlertChannel"
ADD COLUMN "disabledRecipientEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
