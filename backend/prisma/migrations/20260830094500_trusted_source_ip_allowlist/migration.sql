CREATE TABLE "TrustedSourceIp" (
  "id" TEXT NOT NULL,
  "ip" TEXT NOT NULL,
  "vendor" TEXT NOT NULL DEFAULT 'all',
  "label" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrustedSourceIp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrustedSourceIp_ip_vendor_key" ON "TrustedSourceIp"("ip", "vendor");
CREATE INDEX "TrustedSourceIp_vendor_enabled_idx" ON "TrustedSourceIp"("vendor", "enabled");
CREATE INDEX "TrustedSourceIp_createdAt_idx" ON "TrustedSourceIp"("createdAt");
