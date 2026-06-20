import { prisma } from "../db/prisma.js";

export async function getJobById(jobId: string) {
  return prisma.job.findUnique({
    where: {
      id: jobId
    }
  });
}

export function toJobStatus(job: NonNullable<Awaited<ReturnType<typeof getJobById>>>) {
  return {
    jobId: job.id,
    uploadId: job.uploadId,
    type: job.type,
    status: job.status,
    progress: job.progress,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}
