CREATE TABLE "Finding" (
  "id" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "vendor" TEXT NOT NULL, "title" TEXT NOT NULL,
  "severity" TEXT NOT NULL, "category" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'active', "confidence" DOUBLE PRECISION NOT NULL,
  "summary" TEXT NOT NULL, "evidenceJson" JSONB NOT NULL, "source" TEXT NOT NULL, "rawRefsJson" JSONB NOT NULL,
  "firstSeen" TIMESTAMP(3) NOT NULL, "lastSeen" TIMESTAMP(3) NOT NULL, "count" INTEGER NOT NULL DEFAULT 1,
  "mitreTags" TEXT[] DEFAULT ARRAY[]::TEXT[], "affectedObject" TEXT, "actor" TEXT, "srcIp" TEXT, "dstIp" TEXT, "dstPort" INTEGER,
  "recommendedActions" JSONB NOT NULL, "suppressionReason" TEXT, "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Finding_pkey" PRIMARY KEY ("id"), CONSTRAINT "Finding_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Finding_deviceId_fingerprint_key" ON "Finding"("deviceId", "fingerprint");
CREATE INDEX "Finding_deviceId_status_idx" ON "Finding"("deviceId", "status");
CREATE INDEX "Finding_vendor_severity_idx" ON "Finding"("vendor", "severity");
CREATE INDEX "Finding_lastSeen_idx" ON "Finding"("lastSeen");
