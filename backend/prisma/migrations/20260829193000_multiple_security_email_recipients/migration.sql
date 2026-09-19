ALTER TABLE "SecurityAlertChannel"
ADD COLUMN "recipientEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "SecurityAlertChannel"
SET "recipientEmails" = ARRAY[LOWER(TRIM("recipientEmail"))]
WHERE "recipientEmail" IS NOT NULL
  AND TRIM("recipientEmail") <> ''
  AND cardinality("recipientEmails") = 0;
