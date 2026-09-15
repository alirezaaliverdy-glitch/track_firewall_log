CREATE TABLE "SecurityAlertChannel" (
    "id" TEXT NOT NULL DEFAULT 'primary-email',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "recipientEmail" TEXT,
    "minimumSeverity" TEXT NOT NULL DEFAULT 'high',
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SecurityAlertChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityAlertDelivery" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "ruleId" TEXT,
    "eventFingerprint" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    CONSTRAINT "SecurityAlertDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SecurityAlertDelivery_eventFingerprint_key" ON "SecurityAlertDelivery"("eventFingerprint");
CREATE INDEX "SecurityAlertDelivery_channelId_attemptedAt_idx" ON "SecurityAlertDelivery"("channelId", "attemptedAt");
CREATE INDEX "SecurityAlertDelivery_findingId_idx" ON "SecurityAlertDelivery"("findingId");
CREATE INDEX "SecurityAlertDelivery_status_idx" ON "SecurityAlertDelivery"("status");
