ALTER TABLE "SecurityAssessment"
ADD COLUMN "dataSourcesJson" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "language" TEXT NOT NULL DEFAULT 'fa';
