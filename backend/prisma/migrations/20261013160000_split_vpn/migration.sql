BEGIN;
CREATE TABLE "VpnConnection" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "protocol" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "endpointPort" INTEGER NOT NULL,
  "routesJson" JSONB NOT NULL,
  "configEncrypted" TEXT NOT NULL,
  "lastErrorCode" TEXT,
  "lastOperationAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VpnConnection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VpnConnection_ownerId_createdAt_idx" ON "VpnConnection"("ownerId", "createdAt");
ALTER TABLE "VpnConnection" ADD CONSTRAINT "VpnConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
