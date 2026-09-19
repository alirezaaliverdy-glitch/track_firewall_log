-- Company ownership and recoverable deletion for tenant-scoped devices/assets.
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Device" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Device" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "DeviceOnboardingSession" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "AssetIpAddress" ADD COLUMN "companyId" TEXT;

UPDATE "AssetIpAddress" AS ip
SET "companyId" = asset."companyId"
FROM "Asset" AS asset
WHERE ip."assetId" = asset."id";

DROP INDEX IF EXISTS "Asset_managementIp_key";
DROP INDEX IF EXISTS "Asset_serial_key";
DROP INDEX IF EXISTS "Asset_externalId_key";
DROP INDEX IF EXISTS "AssetIpAddress_address_key";

CREATE UNIQUE INDEX "Company_ownerId_code_key" ON "Company"("ownerId", "code");
CREATE INDEX "Company_ownerId_deletedAt_idx" ON "Company"("ownerId", "deletedAt");
CREATE INDEX "Company_deletedAt_idx" ON "Company"("deletedAt");
CREATE INDEX "Device_companyId_deletedAt_idx" ON "Device"("companyId", "deletedAt");
CREATE UNIQUE INDEX "Asset_companyId_managementIp_key" ON "Asset"("companyId", "managementIp");
CREATE UNIQUE INDEX "Asset_companyId_serial_key" ON "Asset"("companyId", "serial");
CREATE UNIQUE INDEX "Asset_companyId_externalId_key" ON "Asset"("companyId", "externalId");
CREATE INDEX "Asset_companyId_deletedAt_idx" ON "Asset"("companyId", "deletedAt");
CREATE INDEX "DeviceOnboardingSession_ownerId_idx" ON "DeviceOnboardingSession"("ownerId");
CREATE UNIQUE INDEX "AssetIpAddress_companyId_address_key" ON "AssetIpAddress"("companyId", "address");
CREATE INDEX "AssetIpAddress_companyId_idx" ON "AssetIpAddress"("companyId");

ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceOnboardingSession" ADD CONSTRAINT "DeviceOnboardingSession_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetIpAddress" ADD CONSTRAINT "AssetIpAddress_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
