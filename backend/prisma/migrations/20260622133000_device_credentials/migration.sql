CREATE TYPE "DeviceCredentialType" AS ENUM ('password', 'private_key');

CREATE TABLE "DeviceCredential" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "DeviceCredentialType" NOT NULL,
  "username" TEXT NOT NULL,
  "secretEncrypted" TEXT NOT NULL,
  "privateKeyEncrypted" TEXT,
  "passphraseEncrypted" TEXT,
  "sudo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeviceCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceCredential_name_key" ON "DeviceCredential"("name");
CREATE INDEX "DeviceCredential_type_idx" ON "DeviceCredential"("type");
CREATE INDEX "DeviceCredential_name_idx" ON "DeviceCredential"("name");

ALTER TABLE "Device" ADD COLUMN "credentialId" TEXT;
CREATE INDEX "Device_credentialId_idx" ON "Device"("credentialId");

ALTER TABLE "Device" ADD CONSTRAINT "Device_credentialId_fkey"
  FOREIGN KEY ("credentialId") REFERENCES "DeviceCredential"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
