ALTER TABLE "Device" ADD COLUMN "credentialRef" TEXT;

CREATE INDEX "Device_credentialRef_idx" ON "Device"("credentialRef");
