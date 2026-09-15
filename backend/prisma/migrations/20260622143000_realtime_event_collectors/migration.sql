ALTER TABLE "SecurityEvent" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "SecurityEvent" ADD COLUMN "rawSnippet" TEXT;
ALTER TABLE "SecurityEvent" ADD COLUMN "evidenceJson" JSONB;
ALTER TABLE "SecurityEvent" ADD COLUMN "dedupeKey" TEXT;
ALTER TABLE "SecurityEvent" ADD COLUMN "firstSeen" TIMESTAMP(3);
ALTER TABLE "SecurityEvent" ADD COLUMN "lastSeen" TIMESTAMP(3);
ALTER TABLE "SecurityEvent" ADD COLUMN "count" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "SecurityEvent_dedupeKey_key" ON "SecurityEvent"("dedupeKey");
CREATE INDEX "SecurityEvent_sourceType_idx" ON "SecurityEvent"("sourceType");
CREATE INDEX "SecurityEvent_dedupeKey_idx" ON "SecurityEvent"("dedupeKey");
CREATE INDEX "SecurityEvent_lastSeen_idx" ON "SecurityEvent"("lastSeen");

CREATE TABLE "EventCollectorState" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "lastCollectedAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastErrorAt" TIMESTAMP(3),
  "lastError" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "intervalSeconds" INTEGER NOT NULL DEFAULT 60,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventCollectorState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventCollectorState_deviceId_sourceType_key" ON "EventCollectorState"("deviceId", "sourceType");
CREATE INDEX "EventCollectorState_deviceId_idx" ON "EventCollectorState"("deviceId");
CREATE INDEX "EventCollectorState_sourceType_idx" ON "EventCollectorState"("sourceType");
CREATE INDEX "EventCollectorState_enabled_idx" ON "EventCollectorState"("enabled");

ALTER TABLE "EventCollectorState" ADD CONSTRAINT "EventCollectorState_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "Device"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
