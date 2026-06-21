import { AnalysisStatus, JobStatus, UploadStatus, type Prisma } from "@prisma/client";
import type { AnalysisResult } from "../analyzer/index.js";
import { prisma } from "../db/prisma.js";
import { storeUploadSecurityEvents } from "./event.service.js";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function storeAnalysisResult(uploadId: string, result: AnalysisResult) {
  return prisma.$transaction(async (tx) => {
    const analysisRun = await tx.analysisRun.create({
      data: {
        uploadId,
        status: AnalysisStatus.completed,
        resultJson: toJson(result),
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

    await storeUploadSecurityEvents(tx, uploadId, result);

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

export async function getAnalysisJobById(jobId: string) {
  return prisma.job.findUnique({
    where: { id: jobId },
    include: {
      upload: {
        include: {
          analysisRuns: {
            orderBy: { createdAt: "desc" },
            take: 1
          }
        }
      }
    }
  });
}

export async function getRecentAnalysisJobs(limit = 10) {
  return prisma.job.findMany({
    where: {
      type: "import"
    },
    orderBy: {
      createdAt: "desc"
    },
    take: limit,
    include: {
      upload: {
        include: {
          analysisRuns: {
            orderBy: { createdAt: "desc" },
            take: 1
          }
        }
      }
    }
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
  if (run.resultJson) {
    return run.resultJson;
  }

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

type AnalysisJobRecord = NonNullable<Awaited<ReturnType<typeof getAnalysisJobById>>>;

export function toAnalysisJobStatus(job: AnalysisJobRecord) {
  const analysisRun = job.upload.analysisRuns[0];
  const logProfile = analysisRun?.logProfileJson as { detectedVendor?: string; confidence?: number } | null | undefined;

  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    fileName: job.upload.originalFileName,
    vendor: job.upload.detectedVendor ?? logProfile?.detectedVendor ?? null,
    confidence: logProfile?.confidence ?? null,
    error: job.errorMessage ?? null
  };
}
