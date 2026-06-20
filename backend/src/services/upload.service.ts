import type { Upload } from "@prisma/client";
import { JobStatus, JobType, UploadStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { StoredUploadFile } from "../utils/fileValidation.js";

export async function createUploadWithImportJob(input: StoredUploadFile & { mimeType?: string }) {
  return prisma.$transaction(async (tx) => {
    const upload = await tx.upload.create({
      data: {
        fileName: input.fileName,
        originalFileName: input.originalFileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        fileExtension: input.fileExtension,
        status: UploadStatus.queued,
        checksum: input.checksum,
        storagePath: input.storagePath
      }
    });

    const job = await tx.job.create({
      data: {
        uploadId: upload.id,
        type: JobType.import,
        status: JobStatus.queued
      }
    });

    return { upload, job };
  });
}

export async function getUploadById(uploadId: string) {
  return prisma.upload.findUnique({
    where: {
      id: uploadId
    },
    include: {
      jobs: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });
}

export function toUploadMetadata(upload: Upload & { jobs?: { id: string }[] }) {
  return {
    uploadId: upload.id,
    jobId: upload.jobs?.[0]?.id,
    fileName: upload.fileName,
    originalFileName: upload.originalFileName,
    fileExtension: upload.fileExtension,
    mimeType: upload.mimeType,
    fileSize: upload.fileSize,
    detectedFormat: upload.detectedFormat,
    selectedVendor: upload.selectedVendor,
    detectedVendor: upload.detectedVendor,
    status: upload.status,
    rowCount: upload.rowCount,
    parseWarningCount: upload.parseWarningCount,
    checksum: upload.checksum,
    createdAt: upload.createdAt,
    updatedAt: upload.updatedAt
  };
}
