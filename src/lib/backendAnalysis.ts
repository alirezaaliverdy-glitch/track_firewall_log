import type { LogProfile } from "@/types/logProfile";
import type { Finding } from "@/types/finding";
import type { NormalizedLog } from "@/types/log";
import type { LogSummary } from "@/lib/analytics";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type BackendAnalysisJobStatus = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  fileName: string;
  vendor: string | null;
  confidence: number | null;
  error: string | null;
};

export type BackendAnalysisResult = {
  summary: LogSummary;
  logProfile: LogProfile;
  trafficIntelligence: unknown;
  sensitivePorts: unknown[];
  policyReview: unknown[];
  findings: Finding[];
  normalizedLogs: NormalizedLog[];
  parseWarnings: Array<{ line?: number; message: string }>;
  rowCount: number;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "Backend analysis request failed.";
    throw new Error(message);
  }

  return payload as T;
}

export async function uploadForBackendAnalysis(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return requestJson<{ jobId: string; status: BackendAnalysisJobStatus["status"] }>("/analysis/upload", {
    method: "POST",
    body: formData,
  });
}

export function getBackendAnalysisJob(jobId: string) {
  return requestJson<BackendAnalysisJobStatus>(`/analysis/jobs/${jobId}`);
}

export function getBackendAnalysisResult(jobId: string) {
  return requestJson<BackendAnalysisResult>(`/analysis/jobs/${jobId}/result`);
}

export async function getRecentBackendAnalysisJobs() {
  const payload = await requestJson<{ jobs: BackendAnalysisJobStatus[] }>("/analysis/jobs");
  return payload.jobs;
}
