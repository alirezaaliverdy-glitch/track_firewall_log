CREATE TYPE "DeviceType" AS ENUM ('linux_edge', 'mikrotik', 'fortigate', 'pfsense', 'generic_syslog_source', 'generic_firewall');
CREATE TYPE "DeviceProtocol" AS ENUM ('ssh', 'api', 'syslog', 'agent');
CREATE TYPE "DeviceEnvironment" AS ENUM ('production', 'staging', 'lab');
CREATE TYPE "DeviceStatus" AS ENUM ('unknown', 'online', 'offline', 'error');

CREATE TABLE "Device" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "vendor" TEXT NOT NULL,
  "type" "DeviceType" NOT NULL,
  "host" TEXT NOT NULL,
  "managementPort" INTEGER NOT NULL,
  "protocol" "DeviceProtocol" NOT NULL,
  "environment" "DeviceEnvironment" NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "DeviceStatus" NOT NULL DEFAULT 'unknown',
  "capabilities" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceAuthProfile" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "credentialRef" TEXT NOT NULL,
  "authType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeviceAuthProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceCapability" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "dryRunSupported" BOOLEAN NOT NULL DEFAULT true,
  "manualApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeviceCapability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceStatusCheck" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "status" "DeviceStatus" NOT NULL,
  "message" TEXT,
  "latencyMs" INTEGER,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DeviceStatusCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT,
  "actor" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "approvalStatus" TEXT NOT NULL DEFAULT 'not_required',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Device_type_idx" ON "Device"("type");
CREATE INDEX "Device_host_idx" ON "Device"("host");
CREATE INDEX "Device_status_idx" ON "Device"("status");
CREATE INDEX "DeviceAuthProfile_deviceId_idx" ON "DeviceAuthProfile"("deviceId");
CREATE INDEX "DeviceCapability_deviceId_idx" ON "DeviceCapability"("deviceId");
CREATE INDEX "DeviceStatusCheck_deviceId_idx" ON "DeviceStatusCheck"("deviceId");
CREATE INDEX "DeviceStatusCheck_checkedAt_idx" ON "DeviceStatusCheck"("checkedAt");
CREATE INDEX "AuditLog_deviceId_idx" ON "AuditLog"("deviceId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "DeviceAuthProfile" ADD CONSTRAINT "DeviceAuthProfile_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceCapability" ADD CONSTRAINT "DeviceCapability_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceStatusCheck" ADD CONSTRAINT "DeviceStatusCheck_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
