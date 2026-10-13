BEGIN;
ALTER TABLE "CameraDevice" ADD COLUMN "vpnConnectionId" TEXT;
CREATE INDEX "CameraDevice_vpnConnectionId_idx" ON "CameraDevice"("vpnConnectionId");
ALTER TABLE "CameraDevice" ADD CONSTRAINT "CameraDevice_vpnConnectionId_fkey" FOREIGN KEY ("vpnConnectionId") REFERENCES "VpnConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "VpnDeviceBinding" (
  "deviceId" TEXT NOT NULL PRIMARY KEY,
  "vpnConnectionId" TEXT NOT NULL
);
CREATE INDEX "VpnDeviceBinding_vpnConnectionId_idx" ON "VpnDeviceBinding"("vpnConnectionId");
ALTER TABLE "VpnDeviceBinding" ADD CONSTRAINT "VpnDeviceBinding_vpnConnectionId_fkey" FOREIGN KEY ("vpnConnectionId") REFERENCES "VpnConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
