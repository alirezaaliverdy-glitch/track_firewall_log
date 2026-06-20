import { JobStatus, UploadStatus } from "@prisma/client";
import { analyzeFirewallFile } from "../analyzer/index.js";
import { prisma } from "../db/prisma.js";
import { markAnalysisFailed, storeAnalysisResult } from "./analysis.service.js";

function safeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim() !== "") return error.message.slice(0, 500);
  return "Analysis failed.";
}

export function enqueueAnalysisJob(input: { uploadId: string; jobId: string }) {
  setImmediate(() => {
    processAnalysisJob(input).catch(() => {
      // The job handler records failures in the database. Nothing raw is logged here.
    });
  });
}

export async function processAnalysisJob(input: { uploadId: string; jobId: string }) {
  const job = await prisma.job.findUnique({
    where: { id: input.jobId },
    include: { upload: true }
  });

  if (!job || !job.upload.storagePath) {
    return;
  }

  await prisma.$transaction([
    prisma.job.update({
      where: { id: input.jobId },
      data: {
        status: JobStatus.processing,
        progress: 10,
        startedAt: new Date()
      }
    }),
    prisma.upload.update({
      where: { id: input.uploadId },
      data: { status: UploadStatus.processing }
    })
  ]);

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
