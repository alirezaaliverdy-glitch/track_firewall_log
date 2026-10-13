BEGIN;

CREATE TABLE "CameraDevice" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT NOT NULL DEFAULT '',
  "host" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'camera',
  "connectionMode" TEXT NOT NULL DEFAULT 'onvif',
  "onvifPort" INTEGER NOT NULL DEFAULT 80,
  "onvifHttps" BOOLEAN NOT NULL DEFAULT false,
  "onvifPath" TEXT NOT NULL DEFAULT '/onvif/device_service',
  "connectionEncrypted" TEXT,
  "infoJson" JSONB,
  "profilesJson" JSONB,
  "status" TEXT NOT NULL DEFAULT 'unverified',
  "lastSeenAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CameraDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CameraDevice_ownerId_host_onvifPort_key" ON "CameraDevice"("ownerId", "host", "onvifPort");
CREATE INDEX "CameraDevice_ownerId_createdAt_idx" ON "CameraDevice"("ownerId", "createdAt");
ALTER TABLE "CameraDevice" ADD CONSTRAINT "CameraDevice_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CameraActionPlan" (
  "id" TEXT NOT NULL,
  "cameraId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "parametersJson" JSONB NOT NULL,
  "previewJson" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'preview_ready',
  "resultJson" JSONB,
  "cameraRevision" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CameraActionPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CameraActionPlan_ownerId_cameraId_createdAt_idx" ON "CameraActionPlan"("ownerId", "cameraId", "createdAt");
ALTER TABLE "CameraActionPlan" ADD CONSTRAINT "CameraActionPlan_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "CameraDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
