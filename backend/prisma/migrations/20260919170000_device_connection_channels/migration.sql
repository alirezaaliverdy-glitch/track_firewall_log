-- Two explicit connection channels per managed device: management/control and observability/data.
CREATE TABLE "DeviceConnectionChannel" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "purposes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "host" TEXT,
    "port" INTEGER,
    "credentialId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'configured',
    "settingsJson" JSONB NOT NULL DEFAULT '{}',
    "lastTestAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceConnectionChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceConnectionChannel_deviceId_role_key" ON "DeviceConnectionChannel"("deviceId", "role");
CREATE INDEX "DeviceConnectionChannel_deviceId_enabled_idx" ON "DeviceConnectionChannel"("deviceId", "enabled");
CREATE INDEX "DeviceConnectionChannel_credentialId_idx" ON "DeviceConnectionChannel"("credentialId");
CREATE INDEX "DeviceConnectionChannel_method_status_idx" ON "DeviceConnectionChannel"("method", "status");

ALTER TABLE "DeviceConnectionChannel" ADD CONSTRAINT "DeviceConnectionChannel_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceConnectionChannel" ADD CONSTRAINT "DeviceConnectionChannel_credentialId_fkey"
  FOREIGN KEY ("credentialId") REFERENCES "DeviceCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the current connector as the management channel for all existing devices.
INSERT INTO "DeviceConnectionChannel" (
  "id", "deviceId", "role", "method", "purposes", "host", "port", "credentialId",
  "enabled", "priority", "status", "settingsJson", "createdAt", "updatedAt"
)
SELECT
  'dcc_' || md5(d."id" || ':management'), d."id", 'management',
  CASE WHEN d."protocol"::text = 'api' THEN 'api' ELSE 'ssh' END,
  ARRAY['control','inventory']::TEXT[], d."host", d."managementPort", d."credentialId",
  true, 1, CASE WHEN d."status"::text = 'online' THEN 'verified' ELSE 'configured' END,
  '{"migratedFromLegacyDevice":true}'::jsonb, d."createdAt", CURRENT_TIMESTAMP
FROM "Device" d
ON CONFLICT ("deviceId", "role") DO NOTHING;
