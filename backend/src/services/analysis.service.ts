import { AnalysisStatus, JobStatus, UploadStatus, type Prisma } from "@prisma/client";
import type { AnalysisResult } from "../analyzer/index.js";
import { prisma } from "../db/prisma.js";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function storeAnalysisResult(uploadId: string, result: AnalysisResult) {
  return prisma.$transaction(async (tx) => {
    const analysisRun = await tx.analysisRun.create({
      data: {
        uploadId,
        status: AnalysisStatus.completed,
        summaryJson: toJson(result.summary),
        logProfileJson: toJson(result.logProfile),
        trafficIntelligenceJson: toJson(result.trafficIntelligence),
        sensitivePortsJson: toJson(result.sensitivePorts),
        policyReviewJson: toJson(result.policyReview),
        findingsJson: toJson(result.findings),
        normalizedLogsJson: toJson(result.normalizedLogs),
        parseWarningsJson: toJson(result.parseWarnings),
        rowCount: result.rowCount
      }
    });

    await tx.upload.update({
      where: { id: uploadId },
      data: {
        status: UploadStatus.analyzed,
        rowCount: result.rowCount,
        parseWarningCount: result.parseWarnings.length,
        detectedFormat: result.logProfile.detectedFormat,
        detectedVendor: result.logProfile.detectedVendor
      }
    });

    return analysisRun;
  });
}

export async function getLatestAnalysisForUpload(uploadId: string) {
  return prisma.analysisRun.findFirst({
    where: { uploadId },
    orderBy: { createdAt: "desc" }
  });
}

export async function getAnalysisRunById(analysisRunId: string) {
  return prisma.analysisRun.findUnique({
    where: { id: analysisRunId }
  });
}

export async function markAnalysisFailed(uploadId: string, jobId: string, message: string) {
  await prisma.$transaction([
    prisma.analysisRun.create({
      data: {
        uploadId,
        status: AnalysisStatus.failed
      }
    }),
    prisma.upload.update({
      where: { id: uploadId },
      data: { status: UploadStatus.failed }
    }),
    prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.failed,
        progress: 100,
        errorMessage: message,
        completedAt: new Date()
      }
    })
  ]);
}

export function toAnalysisResponse(run: NonNullable<Awaited<ReturnType<typeof getLatestAnalysisForUpload>>>) {
  return {
    analysisRunId: run.id,
    uploadId: run.uploadId,
    status: run.status,
    summary: run.summaryJson,
    logProfile: run.logProfileJson,
    trafficIntelligence: run.trafficIntelligenceJson,
    sensitivePorts: run.sensitivePortsJson,
    policyReview: run.policyReviewJson,
    findings: run.findingsJson,
    normalizedLogs: run.normalizedLogsJson,
    parseWarnings: run.parseWarningsJson,
    rowCount: run.rowCount,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt
  };
}
