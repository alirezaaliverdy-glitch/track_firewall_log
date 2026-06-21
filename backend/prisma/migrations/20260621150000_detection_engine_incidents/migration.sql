CREATE TYPE "IncidentSeverity" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "IncidentStatus" AS ENUM ('open', 'investigating', 'resolved', 'false_positive');
CREATE TYPE "DetectionRuleType" AS ENUM ('port_scan', 'ssh_bruteforce', 'sensitive_port_exposure', 'deny_drop_spike', 'suspicious_outbound');

CREATE TABLE "DetectionRule" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "severity" "IncidentSeverity" NOT NULL,
  "ruleType" "DetectionRuleType" NOT NULL,
  "queryJson" JSONB,
  "thresholdJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DetectionRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Incident" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "severity" "IncidentSeverity" NOT NULL,
  "status" "IncidentStatus" NOT NULL DEFAULT 'open',
  "deviceId" TEXT,
  "sourceId" TEXT,
  "ruleId" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "eventCount" INTEGER NOT NULL DEFAULT 0,
  "summaryJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncidentEvent" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "securityEventId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IncidentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DetectionRule_enabled_idx" ON "DetectionRule"("enabled");
CREATE INDEX "DetectionRule_ruleType_idx" ON "DetectionRule"("ruleType");
CREATE UNIQUE INDEX "DetectionRule_ruleType_name_key" ON "DetectionRule"("ruleType", "name");

CREATE INDEX "Incident_status_idx" ON "Incident"("status");
CREATE INDEX "Incident_severity_idx" ON "Incident"("severity");
CREATE INDEX "Incident_deviceId_idx" ON "Incident"("deviceId");
CREATE INDEX "Incident_sourceId_idx" ON "Incident"("sourceId");
CREATE INDEX "Incident_ruleId_idx" ON "Incident"("ruleId");
CREATE INDEX "Incident_firstSeenAt_idx" ON "Incident"("firstSeenAt");
CREATE INDEX "Incident_lastSeenAt_idx" ON "Incident"("lastSeenAt");

CREATE INDEX "IncidentEvent_incidentId_idx" ON "IncidentEvent"("incidentId");
CREATE INDEX "IncidentEvent_securityEventId_idx" ON "IncidentEvent"("securityEventId");
CREATE UNIQUE INDEX "IncidentEvent_incidentId_securityEventId_key" ON "IncidentEvent"("incidentId", "securityEventId");

ALTER TABLE "Incident" ADD CONSTRAINT "Incident_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EventSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "DetectionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentEvent" ADD CONSTRAINT "IncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentEvent" ADD CONSTRAINT "IncidentEvent_securityEventId_fkey" FOREIGN KEY ("securityEventId") REFERENCES "SecurityEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
