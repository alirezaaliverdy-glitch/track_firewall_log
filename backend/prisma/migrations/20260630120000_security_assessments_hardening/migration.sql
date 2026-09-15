ALTER TYPE "AiIntentType" ADD VALUE 'linux_read_hostname';
ALTER TYPE "AiIntentType" ADD VALUE 'linux_read_interfaces';
ALTER TYPE "AiIntentType" ADD VALUE 'linux_read_routes';
ALTER TYPE "AiIntentType" ADD VALUE 'linux_read_listening_ports';
ALTER TYPE "AiIntentType" ADD VALUE 'linux_read_firewall_status';
ALTER TYPE "AiIntentType" ADD VALUE 'linux_read_auth_logs';
ALTER TYPE "AiIntentType" ADD VALUE 'linux_read_users';
ALTER TYPE "AiIntentType" ADD VALUE 'linux_read_docker';
ALTER TYPE "AiIntentType" ADD VALUE 'linux_read_nginx';
ALTER TYPE "ActionType" ADD VALUE 'linux_read_hostname';
ALTER TYPE "ActionType" ADD VALUE 'linux_read_interfaces';
ALTER TYPE "ActionType" ADD VALUE 'linux_read_routes';
ALTER TYPE "ActionType" ADD VALUE 'linux_read_listening_ports';
ALTER TYPE "ActionType" ADD VALUE 'linux_read_firewall_status';
ALTER TYPE "ActionType" ADD VALUE 'linux_read_auth_logs';
ALTER TYPE "ActionType" ADD VALUE 'linux_read_users';
ALTER TYPE "ActionType" ADD VALUE 'linux_read_docker';
ALTER TYPE "ActionType" ADD VALUE 'linux_read_nginx';

CREATE TABLE "SecurityAssessment" (
    "id" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "riskScore" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "findingsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SecurityAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HardeningRecommendation" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "deviceId" TEXT,
    "vendor" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "recommendation" TEXT NOT NULL,
    "catalogActionId" TEXT,
    "actionType" TEXT,
    "parametersJson" JSONB NOT NULL,
    "executable" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "actionPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HardeningRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceSnapshot" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceSnapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "HardeningRecommendation" ADD CONSTRAINT "HardeningRecommendation_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "SecurityAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HardeningRecommendation" ADD CONSTRAINT "HardeningRecommendation_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeviceSnapshot" ADD CONSTRAINT "DeviceSnapshot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "SecurityAssessment_scopeType_idx" ON "SecurityAssessment"("scopeType");
CREATE INDEX "SecurityAssessment_scopeId_idx" ON "SecurityAssessment"("scopeId");
CREATE INDEX "SecurityAssessment_status_idx" ON "SecurityAssessment"("status");
CREATE INDEX "SecurityAssessment_riskScore_idx" ON "SecurityAssessment"("riskScore");
CREATE INDEX "SecurityAssessment_createdAt_idx" ON "SecurityAssessment"("createdAt");
CREATE INDEX "HardeningRecommendation_assessmentId_idx" ON "HardeningRecommendation"("assessmentId");
CREATE INDEX "HardeningRecommendation_deviceId_idx" ON "HardeningRecommendation"("deviceId");
CREATE INDEX "HardeningRecommendation_vendor_idx" ON "HardeningRecommendation"("vendor");
CREATE INDEX "HardeningRecommendation_severity_idx" ON "HardeningRecommendation"("severity");
CREATE INDEX "HardeningRecommendation_category_idx" ON "HardeningRecommendation"("category");
CREATE INDEX "HardeningRecommendation_catalogActionId_idx" ON "HardeningRecommendation"("catalogActionId");
CREATE INDEX "HardeningRecommendation_executable_idx" ON "HardeningRecommendation"("executable");
CREATE INDEX "HardeningRecommendation_status_idx" ON "HardeningRecommendation"("status");
CREATE INDEX "HardeningRecommendation_createdAt_idx" ON "HardeningRecommendation"("createdAt");
CREATE INDEX "DeviceSnapshot_deviceId_idx" ON "DeviceSnapshot"("deviceId");
CREATE INDEX "DeviceSnapshot_vendor_idx" ON "DeviceSnapshot"("vendor");
CREATE INDEX "DeviceSnapshot_snapshotType_idx" ON "DeviceSnapshot"("snapshotType");
CREATE INDEX "DeviceSnapshot_collectedAt_idx" ON "DeviceSnapshot"("collectedAt");
