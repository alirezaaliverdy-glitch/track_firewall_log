-- Task 18 minimum platform milestone: unified asset identity and asset-linked security findings.

CREATE TABLE "AssetSite" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetSite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetLocation" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "siteId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetRole" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetVendor" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetVendor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetPlatform" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "vendorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetPlatform_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetSource" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "configJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Asset" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "hostname" TEXT,
  "managementIp" TEXT,
  "serial" TEXT,
  "externalId" TEXT,
  "managedState" TEXT NOT NULL DEFAULT 'managed',
  "healthState" TEXT NOT NULL DEFAULT 'unknown',
  "lastSeenAt" TIMESTAMP(3),
  "deviceId" TEXT,
  "siteId" TEXT,
  "locationId" TEXT,
  "roleId" TEXT,
  "vendorId" TEXT,
  "platformId" TEXT,
  "sourceId" TEXT,
  "tagsJson" JSONB NOT NULL DEFAULT '[]',
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetInterface" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "macAddress" TEXT,
  "type" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetInterface_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetVlan" (
  "id" TEXT NOT NULL,
  "vlanId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "siteId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetVlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetPrefix" (
  "id" TEXT NOT NULL,
  "cidr" TEXT NOT NULL,
  "siteId" TEXT,
  "vlanId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetPrefix_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetIpAddress" (
  "id" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "assetId" TEXT,
  "interfaceId" TEXT,
  "prefixId" TEXT,
  "role" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetIpAddress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetRelationship" (
  "id" TEXT NOT NULL,
  "fromAssetId" TEXT NOT NULL,
  "toAssetId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetRelationship_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetTag" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "color" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetSyncRun" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT,
  "sourceType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "previewJson" JSONB NOT NULL,
  "appliedJson" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AssetSyncRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Finding" ADD COLUMN "assetId" TEXT;
ALTER TABLE "SecurityEvent" ADD COLUMN "assetId" TEXT;
ALTER TABLE "ActionPlan" ADD COLUMN "assetId" TEXT;

CREATE UNIQUE INDEX "AssetSite_name_key" ON "AssetSite"("name");
CREATE UNIQUE INDEX "AssetSite_slug_key" ON "AssetSite"("slug");
CREATE UNIQUE INDEX "AssetLocation_siteId_slug_key" ON "AssetLocation"("siteId", "slug");
CREATE UNIQUE INDEX "AssetRole_name_key" ON "AssetRole"("name");
CREATE UNIQUE INDEX "AssetRole_slug_key" ON "AssetRole"("slug");
CREATE UNIQUE INDEX "AssetVendor_name_key" ON "AssetVendor"("name");
CREATE UNIQUE INDEX "AssetVendor_slug_key" ON "AssetVendor"("slug");
CREATE UNIQUE INDEX "AssetPlatform_name_key" ON "AssetPlatform"("name");
CREATE UNIQUE INDEX "AssetPlatform_slug_key" ON "AssetPlatform"("slug");
CREATE UNIQUE INDEX "AssetSource_name_key" ON "AssetSource"("name");
CREATE UNIQUE INDEX "Asset_deviceId_key" ON "Asset"("deviceId");
CREATE UNIQUE INDEX "Asset_managementIp_key" ON "Asset"("managementIp");
CREATE UNIQUE INDEX "Asset_serial_key" ON "Asset"("serial");
CREATE UNIQUE INDEX "Asset_externalId_key" ON "Asset"("externalId");
CREATE UNIQUE INDEX "AssetInterface_assetId_name_key" ON "AssetInterface"("assetId", "name");
CREATE UNIQUE INDEX "AssetVlan_siteId_vlanId_key" ON "AssetVlan"("siteId", "vlanId");
CREATE UNIQUE INDEX "AssetPrefix_cidr_key" ON "AssetPrefix"("cidr");
CREATE UNIQUE INDEX "AssetIpAddress_address_key" ON "AssetIpAddress"("address");
CREATE UNIQUE INDEX "AssetRelationship_fromAssetId_toAssetId_type_key" ON "AssetRelationship"("fromAssetId", "toAssetId", "type");
CREATE UNIQUE INDEX "AssetTag_name_key" ON "AssetTag"("name");
CREATE UNIQUE INDEX "AssetTag_slug_key" ON "AssetTag"("slug");
CREATE UNIQUE INDEX "AssetSyncRun_sourceType_idempotencyKey_key" ON "AssetSyncRun"("sourceType", "idempotencyKey");

CREATE INDEX "AssetLocation_siteId_idx" ON "AssetLocation"("siteId");
CREATE INDEX "AssetPlatform_vendorId_idx" ON "AssetPlatform"("vendorId");
CREATE INDEX "Asset_hostname_idx" ON "Asset"("hostname");
CREATE INDEX "Asset_managedState_idx" ON "Asset"("managedState");
CREATE INDEX "Asset_healthState_idx" ON "Asset"("healthState");
CREATE INDEX "Asset_siteId_idx" ON "Asset"("siteId");
CREATE INDEX "Asset_vendorId_idx" ON "Asset"("vendorId");
CREATE INDEX "Asset_lastSeenAt_idx" ON "Asset"("lastSeenAt");
CREATE INDEX "AssetInterface_assetId_idx" ON "AssetInterface"("assetId");
CREATE INDEX "AssetIpAddress_assetId_idx" ON "AssetIpAddress"("assetId");
CREATE INDEX "AssetIpAddress_interfaceId_idx" ON "AssetIpAddress"("interfaceId");
CREATE INDEX "AssetIpAddress_prefixId_idx" ON "AssetIpAddress"("prefixId");
CREATE INDEX "AssetPrefix_siteId_idx" ON "AssetPrefix"("siteId");
CREATE INDEX "AssetPrefix_vlanId_idx" ON "AssetPrefix"("vlanId");
CREATE INDEX "AssetVlan_siteId_idx" ON "AssetVlan"("siteId");
CREATE INDEX "AssetRelationship_fromAssetId_idx" ON "AssetRelationship"("fromAssetId");
CREATE INDEX "AssetRelationship_toAssetId_idx" ON "AssetRelationship"("toAssetId");
CREATE INDEX "AssetSyncRun_sourceId_idx" ON "AssetSyncRun"("sourceId");
CREATE INDEX "AssetSyncRun_sourceType_idx" ON "AssetSyncRun"("sourceType");
CREATE INDEX "AssetSyncRun_status_idx" ON "AssetSyncRun"("status");
CREATE INDEX "Finding_assetId_status_idx" ON "Finding"("assetId", "status");
CREATE INDEX "SecurityEvent_assetId_idx" ON "SecurityEvent"("assetId");
CREATE INDEX "ActionPlan_assetId_idx" ON "ActionPlan"("assetId");

ALTER TABLE "AssetLocation" ADD CONSTRAINT "AssetLocation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "AssetSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetPlatform" ADD CONSTRAINT "AssetPlatform_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "AssetVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "AssetSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "AssetLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AssetRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "AssetVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "AssetPlatform"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "AssetSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetInterface" ADD CONSTRAINT "AssetInterface_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetPrefix" ADD CONSTRAINT "AssetPrefix_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "AssetSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetPrefix" ADD CONSTRAINT "AssetPrefix_vlanId_fkey" FOREIGN KEY ("vlanId") REFERENCES "AssetVlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetIpAddress" ADD CONSTRAINT "AssetIpAddress_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetIpAddress" ADD CONSTRAINT "AssetIpAddress_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "AssetInterface"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetIpAddress" ADD CONSTRAINT "AssetIpAddress_prefixId_fkey" FOREIGN KEY ("prefixId") REFERENCES "AssetPrefix"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetRelationship" ADD CONSTRAINT "AssetRelationship_fromAssetId_fkey" FOREIGN KEY ("fromAssetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetRelationship" ADD CONSTRAINT "AssetRelationship_toAssetId_fkey" FOREIGN KEY ("toAssetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetSyncRun" ADD CONSTRAINT "AssetSyncRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "AssetSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActionPlan" ADD CONSTRAINT "ActionPlan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
