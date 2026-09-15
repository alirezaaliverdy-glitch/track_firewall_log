-- Milestone 18.2A: vendor capability cache and Linux observability metrics.
CREATE TABLE "DeviceCapabilityCache" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "vendorKey" TEXT NOT NULL,
  "platformKey" TEXT NOT NULL,
  "connectorType" TEXT NOT NULL,
  "detectionJson" JSONB NOT NULL DEFAULT '{}',
  "capabilitiesJson" JSONB NOT NULL DEFAULT '[]',
  "factsJson" JSONB NOT NULL DEFAULT '{}',
  "warningsJson" JSONB NOT NULL DEFAULT '[]',
  "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeviceCapabilityCache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionRun" (
  "id" TEXT NOT NULL,
  "assetId" TEXT,
  "deviceId" TEXT,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "metricsJson" JSONB NOT NULL DEFAULT '[]',
  "warningsJson" JSONB NOT NULL DEFAULT '[]',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  CONSTRAINT "CollectionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MetricSample" (
  "id" TEXT NOT NULL,
  "assetId" TEXT,
  "deviceId" TEXT,
  "metricKey" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "unit" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL,
  "labelsJson" JSONB NOT NULL DEFAULT '{}',
  "collectionRunId" TEXT,
  CONSTRAINT "MetricSample_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MetricAggregate" (
  "id" TEXT NOT NULL,
  "assetId" TEXT,
  "deviceId" TEXT,
  "metricKey" TEXT NOT NULL,
  "bucketStart" TIMESTAMP(3) NOT NULL,
  "bucketSize" TEXT NOT NULL,
  "avg" DOUBLE PRECISION,
  "min" DOUBLE PRECISION,
  "max" DOUBLE PRECISION,
  "count" INTEGER NOT NULL,
  "unit" TEXT,
  "labelsJson" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "MetricAggregate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthSnapshot" (
  "id" TEXT NOT NULL,
  "assetId" TEXT,
  "deviceId" TEXT,
  "score" INTEGER NOT NULL,
  "state" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "metricsJson" JSONB NOT NULL DEFAULT '{}',
  "warningsJson" JSONB NOT NULL DEFAULT '[]',
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "staleAt" TIMESTAMP(3),
  "collectionRunId" TEXT,
  CONSTRAINT "HealthSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthRule" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "severity" TEXT NOT NULL,
  "expressionJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MonitorIncident" (
  "id" TEXT NOT NULL,
  "assetId" TEXT,
  "deviceId" TEXT,
  "state" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "MonitorIncident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeviceCapabilityCache_deviceId_idx" ON "DeviceCapabilityCache"("deviceId");
CREATE INDEX "DeviceCapabilityCache_vendorKey_idx" ON "DeviceCapabilityCache"("vendorKey");
CREATE INDEX "DeviceCapabilityCache_platformKey_idx" ON "DeviceCapabilityCache"("platformKey");
CREATE INDEX "DeviceCapabilityCache_expiresAt_idx" ON "DeviceCapabilityCache"("expiresAt");
CREATE INDEX "CollectionRun_assetId_idx" ON "CollectionRun"("assetId");
CREATE INDEX "CollectionRun_deviceId_idx" ON "CollectionRun"("deviceId");
CREATE INDEX "CollectionRun_provider_idx" ON "CollectionRun"("provider");
CREATE INDEX "CollectionRun_status_idx" ON "CollectionRun"("status");
CREATE INDEX "CollectionRun_startedAt_idx" ON "CollectionRun"("startedAt");
CREATE INDEX "MetricSample_assetId_idx" ON "MetricSample"("assetId");
CREATE INDEX "MetricSample_deviceId_idx" ON "MetricSample"("deviceId");
CREATE INDEX "MetricSample_metricKey_idx" ON "MetricSample"("metricKey");
CREATE INDEX "MetricSample_timestamp_idx" ON "MetricSample"("timestamp");
CREATE INDEX "MetricSample_collectionRunId_idx" ON "MetricSample"("collectionRunId");
CREATE UNIQUE INDEX "MetricAggregate_deviceId_metricKey_bucketStart_bucketSize_key" ON "MetricAggregate"("deviceId", "metricKey", "bucketStart", "bucketSize");
CREATE INDEX "MetricAggregate_assetId_idx" ON "MetricAggregate"("assetId");
CREATE INDEX "MetricAggregate_deviceId_idx" ON "MetricAggregate"("deviceId");
CREATE INDEX "MetricAggregate_metricKey_idx" ON "MetricAggregate"("metricKey");
CREATE INDEX "MetricAggregate_bucketStart_idx" ON "MetricAggregate"("bucketStart");
CREATE INDEX "HealthSnapshot_assetId_idx" ON "HealthSnapshot"("assetId");
CREATE INDEX "HealthSnapshot_deviceId_idx" ON "HealthSnapshot"("deviceId");
CREATE INDEX "HealthSnapshot_state_idx" ON "HealthSnapshot"("state");
CREATE INDEX "HealthSnapshot_collectedAt_idx" ON "HealthSnapshot"("collectedAt");
CREATE INDEX "HealthSnapshot_collectionRunId_idx" ON "HealthSnapshot"("collectionRunId");
CREATE UNIQUE INDEX "HealthRule_key_key" ON "HealthRule"("key");
CREATE INDEX "HealthRule_enabled_idx" ON "HealthRule"("enabled");
CREATE INDEX "HealthRule_scope_idx" ON "HealthRule"("scope");
CREATE INDEX "HealthRule_severity_idx" ON "HealthRule"("severity");
CREATE INDEX "MonitorIncident_assetId_idx" ON "MonitorIncident"("assetId");
CREATE INDEX "MonitorIncident_deviceId_idx" ON "MonitorIncident"("deviceId");
CREATE INDEX "MonitorIncident_state_idx" ON "MonitorIncident"("state");
CREATE INDEX "MonitorIncident_severity_idx" ON "MonitorIncident"("severity");
CREATE INDEX "MonitorIncident_openedAt_idx" ON "MonitorIncident"("openedAt");

ALTER TABLE "DeviceCapabilityCache" ADD CONSTRAINT "DeviceCapabilityCache_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MetricSample" ADD CONSTRAINT "MetricSample_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MetricSample" ADD CONSTRAINT "MetricSample_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MetricSample" ADD CONSTRAINT "MetricSample_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "CollectionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MetricAggregate" ADD CONSTRAINT "MetricAggregate_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MetricAggregate" ADD CONSTRAINT "MetricAggregate_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthSnapshot" ADD CONSTRAINT "HealthSnapshot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthSnapshot" ADD CONSTRAINT "HealthSnapshot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthSnapshot" ADD CONSTRAINT "HealthSnapshot_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "CollectionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonitorIncident" ADD CONSTRAINT "MonitorIncident_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonitorIncident" ADD CONSTRAINT "MonitorIncident_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
