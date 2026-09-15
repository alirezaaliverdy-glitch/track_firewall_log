CREATE TYPE "EventSourceType" AS ENUM ('upload', 'syslog', 'agent', 'api', 'manual');
CREATE TYPE "EventSourceStatus" AS ENUM ('active', 'inactive', 'error');
CREATE TYPE "EventBatchStatus" AS ENUM ('processing', 'completed', 'failed', 'partial');

CREATE TABLE "EventSource" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "EventSourceType" NOT NULL,
  "deviceId" TEXT,
  "status" "EventSourceStatus" NOT NULL DEFAULT 'active',
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventBatch" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT,
  "deviceId" TEXT,
  "status" "EventBatchStatus" NOT NULL,
  "totalEvents" INTEGER NOT NULL DEFAULT 0,
  "parsedEvents" INTEGER NOT NULL DEFAULT 0,
  "failedEvents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "EventBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityEvent" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT,
  "sourceId" TEXT,
  "batchId" TEXT,
  "timestamp" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "vendor" TEXT,
  "eventType" TEXT NOT NULL,
  "action" TEXT,
  "severity" TEXT,
  "srcIp" TEXT,
  "srcPort" INTEGER,
  "dstIp" TEXT,
  "dstPort" INTEGER,
  "protocol" TEXT,
  "username" TEXT,
  "ruleName" TEXT,
  "interfaceIn" TEXT,
  "interfaceOut" TEXT,
  "rawMessage" TEXT,
  "normalizedJson" JSONB NOT NULL,
  "tags" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventSource_type_idx" ON "EventSource"("type");
CREATE INDEX "EventSource_deviceId_idx" ON "EventSource"("deviceId");
CREATE INDEX "EventSource_status_idx" ON "EventSource"("status");
CREATE INDEX "EventSource_lastSeenAt_idx" ON "EventSource"("lastSeenAt");

CREATE INDEX "EventBatch_sourceId_idx" ON "EventBatch"("sourceId");
CREATE INDEX "EventBatch_deviceId_idx" ON "EventBatch"("deviceId");
CREATE INDEX "EventBatch_status_idx" ON "EventBatch"("status");
CREATE INDEX "EventBatch_createdAt_idx" ON "EventBatch"("createdAt");

CREATE INDEX "SecurityEvent_deviceId_idx" ON "SecurityEvent"("deviceId");
CREATE INDEX "SecurityEvent_sourceId_idx" ON "SecurityEvent"("sourceId");
CREATE INDEX "SecurityEvent_batchId_idx" ON "SecurityEvent"("batchId");
CREATE INDEX "SecurityEvent_timestamp_idx" ON "SecurityEvent"("timestamp");
CREATE INDEX "SecurityEvent_receivedAt_idx" ON "SecurityEvent"("receivedAt");
CREATE INDEX "SecurityEvent_vendor_idx" ON "SecurityEvent"("vendor");
CREATE INDEX "SecurityEvent_action_idx" ON "SecurityEvent"("action");
CREATE INDEX "SecurityEvent_severity_idx" ON "SecurityEvent"("severity");
CREATE INDEX "SecurityEvent_srcIp_idx" ON "SecurityEvent"("srcIp");
CREATE INDEX "SecurityEvent_dstIp_idx" ON "SecurityEvent"("dstIp");
CREATE INDEX "SecurityEvent_dstPort_idx" ON "SecurityEvent"("dstPort");
CREATE INDEX "SecurityEvent_protocol_idx" ON "SecurityEvent"("protocol");

ALTER TABLE "EventSource" ADD CONSTRAINT "EventSource_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventBatch" ADD CONSTRAINT "EventBatch_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EventSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventBatch" ADD CONSTRAINT "EventBatch_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EventSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "EventBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
