import { JobStatus, UploadStatus } from "@prisma/client";
import { analyzeFirewallFile } from "../analyzer/index.js";
import { prisma } from "../db/prisma.js";
import { markAnalysisFailed, storeAnalysisResult } from "./analysis.service.js";

function safeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim() !== "") return error.message.slice(0, 500);
  return "Analysis failed.";
}

export function enqueueAnalysisJob(input: { uploadId: string; jobId: string }) {
  void runAnalysisWorkerOnce(input).catch(() => {
    // The job handler records failures in the database. Nothing raw is logged here.
  });
}

export async function claimQueuedAnalysisJobs(input?: { uploadId?: string; jobId?: string }, limit = 1) {
  const candidates = await prisma.job.findMany({
    where: {
      status: JobStatus.queued,
      ...(input?.jobId ? { id: input.jobId } : {}),
      ...(input?.uploadId ? { uploadId: input.uploadId } : {})
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 25)),
    select: { id: true, uploadId: true }
  });
  const claimed: Array<{ uploadId: string; jobId: string }> = [];
  for (const candidate of candidates) {
    const updated = await prisma.job.updateMany({
      where: { id: candidate.id, status: JobStatus.queued },
      data: {
        status: JobStatus.processing,
        progress: 10,
        startedAt: new Date(),
        errorMessage: null
      }
    });
    if (updated.count !== 1) continue;
    await prisma.upload.update({
      where: { id: candidate.uploadId },
      data: { status: UploadStatus.processing }
    });
    claimed.push({ uploadId: candidate.uploadId, jobId: candidate.id });
  }
  return claimed;
}

export async function runAnalysisWorkerOnce(input?: { uploadId?: string; jobId?: string }) {
  const claimed = await claimQueuedAnalysisJobs(input, 1);
  for (const job of claimed) {
    await processClaimedAnalysisJob(job);
  }
  return { processed: claimed.length };
}

export async function processAnalysisJob(input: { uploadId: string; jobId: string }) {
  const claimed = await claimQueuedAnalysisJobs(input, 1);
  if (claimed.length === 0) return;
  await processClaimedAnalysisJob(claimed[0]);
}

async function processClaimedAnalysisJob(input: { uploadId: string; jobId: string }) {
  const job = await prisma.job.findUnique({
    where: { id: input.jobId },
    include: { upload: true }
  });

  if (!job || !job.upload.storagePath) {
    return;
  }

  try {
    const result = await analyzeFirewallFile({
      filePath: job.upload.storagePath,
      fileName: job.upload.originalFileName,
      selectedVendor: job.upload.selectedVendor ?? undefined
    });

    await prisma.job.update({
      where: { id: input.jobId },
      data: { progress: 80 }
    });

    await storeAnalysisResult(input.uploadId, result);

    await prisma.job.update({
      where: { id: input.jobId },
      data: {
        status: JobStatus.completed,
        progress: 100,
        completedAt: new Date()
      }
    });
  } catch (error) {
    await markAnalysisFailed(input.uploadId, input.jobId, safeErrorMessage(error));
  }
}
