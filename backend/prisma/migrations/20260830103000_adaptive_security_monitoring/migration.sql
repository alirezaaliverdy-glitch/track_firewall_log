ALTER TABLE "EventCollectorState"
  ADD COLUMN "consecutiveIdleRuns" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;
