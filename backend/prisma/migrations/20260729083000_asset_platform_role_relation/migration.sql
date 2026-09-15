ALTER TABLE "AssetPlatform" ADD COLUMN IF NOT EXISTS "assetRoleId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AssetPlatform_assetRoleId_fkey'
  ) THEN
    ALTER TABLE "AssetPlatform"
      ADD CONSTRAINT "AssetPlatform_assetRoleId_fkey"
      FOREIGN KEY ("assetRoleId")
      REFERENCES "AssetRole"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
