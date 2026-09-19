ALTER TABLE "AppUser"
ADD COLUMN "allowedSections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "AppUser"
SET "allowedSections" = ARRAY['dashboard', 'assets', 'security', 'monitoring', 'actions', 'assistant', 'attackers']::TEXT[]
WHERE cardinality("allowedSections") = 0;
