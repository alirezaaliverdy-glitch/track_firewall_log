-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('uploaded', 'queued', 'processing', 'analyzed', 'failed', 'deleted');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('import', 'analyze', 'ai_report');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT,
    "fileExtension" TEXT NOT NULL,
    "detectedFormat" TEXT,
    "selectedVendor" TEXT,
    "detectedVendor" TEXT,
    "status" "UploadStatus" NOT NULL,
    "rowCount" INTEGER,
    "parseWarningCount" INTEGER,
    "checksum" TEXT,
    "storagePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL,
    "summaryJson" JSONB,
    "logProfileJson" JSONB,
    "trafficIntelligenceJson" JSONB,
    "sensitivePortsJson" JSONB,
    "policyReviewJson" JSONB,
    "findingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_uploadId_idx" ON "Job"("uploadId");

-- CreateIndex
CREATE INDEX "AnalysisRun_uploadId_idx" ON "AnalysisRun"("uploadId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
