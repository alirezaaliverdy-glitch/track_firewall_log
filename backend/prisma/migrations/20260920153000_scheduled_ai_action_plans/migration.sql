ALTER TABLE "ScheduledTask"
  ALTER COLUMN "catalogCommandId" DROP NOT NULL,
  ADD COLUMN "sourceActionPlanId" TEXT;

CREATE INDEX "ScheduledTask_sourceActionPlanId_idx"
  ON "ScheduledTask"("sourceActionPlanId");

ALTER TABLE "ScheduledTask"
  ADD CONSTRAINT "ScheduledTask_sourceActionPlanId_fkey"
  FOREIGN KEY ("sourceActionPlanId") REFERENCES "ActionPlan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
