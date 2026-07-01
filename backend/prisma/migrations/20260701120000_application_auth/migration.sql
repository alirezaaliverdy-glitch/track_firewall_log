CREATE TYPE "AppUserRole" AS ENUM ('admin', 'operator', 'viewer');

CREATE TABLE "AppUser" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "role" "AppUserRole" NOT NULL DEFAULT 'viewer',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
