-- Persist resumable device onboarding state without changing existing records.
CREATE TABLE "DeviceOnboardingSession" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT,
  "status" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "draftJson" JSONB NOT NULL,
  "testJson" JSONB,
  "detectionJson" JSONB,
  "discoveryJson" JSONB,
  "previewJson" JSONB,
  "resultJson" JSONB,
  "privateEvidenceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeviceOnboardingSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeviceOnboardingSession_deviceId_idx" ON "DeviceOnboardingSession"("deviceId");
CREATE INDEX "DeviceOnboardingSession_status_idx" ON "DeviceOnboardingSession"("status");
CREATE INDEX "DeviceOnboardingSession_expiresAt_idx" ON "DeviceOnboardingSession"("expiresAt");
