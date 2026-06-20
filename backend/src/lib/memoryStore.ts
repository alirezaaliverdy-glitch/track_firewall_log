import crypto from "node:crypto";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface UploadMetadata {
  id: string;
  jobId: string;
  fileName: string;
  extension: string;
  mimeType?: string;
  sizeBytes: number;
  createdAt: string;
}

export interface JobRecord {
  id: string;
  uploadId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

const uploads = new Map<string, UploadMetadata>();
const jobs = new Map<string, JobRecord>();

export function createUpload(metadata: Omit<UploadMetadata, "id" | "jobId" | "createdAt">) {
  const now = new Date().toISOString();
  const uploadId = crypto.randomUUID();
  const jobId = crypto.randomUUID();

  const upload: UploadMetadata = {
    ...metadata,
    id: uploadId,
    jobId,
    createdAt: now
  };

  const job: JobRecord = {
    id: jobId,
    uploadId,
    status: "queued",
    createdAt: now,
    updatedAt: now
  };

  uploads.set(uploadId, upload);
  jobs.set(jobId, job);

  return { upload, job };
}

export function getUpload(uploadId: string) {
  return uploads.get(uploadId);
}

export function getJob(jobId: string) {
  return jobs.get(jobId);
}

export function updateJobStatus(jobId: string, status: JobStatus, error?: string) {
  const job = jobs.get(jobId);

  if (!job) {
    return undefined;
  }

  const updated: JobRecord = {
    ...job,
    status,
    error,
    updatedAt: new Date().toISOString()
  };

  jobs.set(jobId, updated);
  return updated;
}
