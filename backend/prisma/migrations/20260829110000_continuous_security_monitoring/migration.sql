ALTER TABLE "EventCollectorState"
  ALTER COLUMN "enabled" SET DEFAULT true;

UPDATE "EventCollectorState"
SET "enabled" = true
WHERE "enabled" = false;

ALTER TABLE "SecurityAlertDelivery"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE INDEX "SecurityAlertDelivery_status_nextAttemptAt_idx"
  ON "SecurityAlertDelivery"("status", "nextAttemptAt");
