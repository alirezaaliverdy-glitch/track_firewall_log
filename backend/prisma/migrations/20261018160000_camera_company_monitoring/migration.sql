BEGIN;
-- Existing devices remain unassigned; never guess a customer from an IP/name.
ALTER TABLE "CameraDevice" ADD COLUMN "companyId" TEXT REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN "monitoringEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "monitorIntervalSeconds" INTEGER NOT NULL DEFAULT 300 CHECK ("monitorIntervalSeconds" BETWEEN 60 AND 3600),
  ADD COLUMN "monitorCheckedAt" TIMESTAMP(3), ADD COLUMN "monitorNextRunAt" TIMESTAMP(3), ADD COLUMN "monitorLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "monitorReportJson" JSONB, ADD COLUMN "monitorHistoryJson" JSONB;
CREATE UNIQUE INDEX "CameraDevice_ownerId_companyId_host_onvifPort_key" ON "CameraDevice"("ownerId", "companyId", "host", "onvifPort");
CREATE UNIQUE INDEX "CameraDevice_unassigned_owner_host_port_key" ON "CameraDevice"("ownerId", "host", "onvifPort") WHERE "companyId" IS NULL;
DROP INDEX "CameraDevice_ownerId_host_onvifPort_key";
CREATE INDEX "CameraDevice_companyId_idx" ON "CameraDevice"("companyId");
CREATE INDEX "CameraDevice_monitoringEnabled_monitorNextRunAt_idx" ON "CameraDevice"("monitoringEnabled", "monitorNextRunAt");
COMMIT;
