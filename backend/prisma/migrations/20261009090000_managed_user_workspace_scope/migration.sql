-- Associate existing non-admin users only when the installation has one admin.
ALTER TABLE "AppUser" ADD COLUMN "workspaceOwnerId" TEXT;

UPDATE "AppUser"
SET "workspaceOwnerId" = (SELECT "id" FROM "AppUser" WHERE "role" = 'admin' LIMIT 1)
WHERE "role" <> 'admin'
  AND (SELECT COUNT(*) FROM "AppUser" WHERE "role" = 'admin') = 1;

CREATE INDEX "AppUser_workspaceOwnerId_idx" ON "AppUser"("workspaceOwnerId");
