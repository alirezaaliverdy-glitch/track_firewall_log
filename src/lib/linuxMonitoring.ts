import { API_BASE_URL } from "@/config/frontendEnv";

const EMPTY_SUMMARY: LinuxSummary = { total: 0, healthy: 0, warning: 0, critical: 0, offline: 0, stale: 0, unknown: 0, devices: [] };

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers, ...init });
  const text = await response.text();
  if (!response.ok) {
    let payload: unknown = {};
    try { payload = text ? JSON.parse(text) as unknown : {}; } catch { payload = {}; }
    throw new Error(typeof (payload as { error?: unknown }).error === "string" ? (payload as { error: string }).error : `Request failed: ${response.status}`);
  }
  if (/^\s*</.test(text)) {
    if (path.endsWith("/summary")) return EMPTY_SUMMARY as T;
    if (path.endsWith("/devices")) return { devices: [] } as T;
    throw new Error("Monitoring API is not reachable from the current dev server.");
  }
  return (text ? JSON.parse(text) : {}) as T;
}
export type LinuxHealthSnapshot = { id: string; score: number; state: string; summary: string; collectedAt: string; staleAt?: string | null; metricsJson?: unknown; warningsJson?: unknown };
export type LinuxMonitoringDevice = { id: string; name: string; host: string; status: string; healthState?: string; latestHealth: LinuxHealthSnapshot | null; asset?: { name?: string; site?: { name?: string } } | null };
export type LinuxMonitoringObservability = { state: "available" | "not_configured"; reason?: string; missingTables?: string[]; checkedAt?: string };
export type LinuxMetricSample = { id: string; metricKey: string; value: number; unit?: string | null; timestamp: string; source: string; labelsJson?: unknown };
export type LinuxSummary = { total: number; healthy: number; warning: number; critical: number; offline: number; stale: number; unknown: number; devices: LinuxMonitoringDevice[]; observability?: LinuxMonitoringObservability };

export function getLinuxMonitoringSummary() { return requestJson<LinuxSummary>("/monitoring/linux/summary"); }
export function getLinuxMonitoringDevices() { return requestJson<{ devices: LinuxMonitoringDevice[] }>("/monitoring/linux/devices"); }
export function getLinuxMonitoringDevice(id: string) { return requestJson<{ device: LinuxMonitoringDevice; latestHealth: LinuxHealthSnapshot | null }>(`/monitoring/linux/devices/${id}`); }
export function getLinuxMonitoringMetrics(id: string, hours = 24) { return requestJson<{ metrics: LinuxMetricSample[] }>(`/monitoring/linux/devices/${id}/metrics?hours=${Math.max(1, Math.min(720, hours))}`); }
export function refreshLinuxMonitoringDevice(id: string) { return requestJson<unknown>(`/monitoring/linux/devices/${id}/refresh`, { method: "POST" }); }
