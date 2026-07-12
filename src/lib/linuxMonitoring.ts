const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

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
export type LinuxHealthSnapshot = { id: string; score: number; state: string; summary: string; collectedAt: string; metricsJson?: unknown };
export type LinuxMonitoringDevice = { id: string; name: string; host: string; status: string; latestHealth: LinuxHealthSnapshot | null; asset?: { name?: string; site?: { name?: string } } | null };
export type LinuxSummary = { total: number; healthy: number; warning: number; critical: number; offline: number; stale: number; unknown: number; devices: LinuxMonitoringDevice[] };

export function getLinuxMonitoringSummary() { return requestJson<LinuxSummary>("/monitoring/linux/summary"); }
export function getLinuxMonitoringDevices() { return requestJson<{ devices: LinuxMonitoringDevice[] }>("/monitoring/linux/devices"); }
export function getLinuxMonitoringDevice(id: string) { return requestJson<{ device: LinuxMonitoringDevice; latestHealth: LinuxHealthSnapshot | null }>(`/monitoring/linux/devices/${id}`); }
export function refreshLinuxMonitoringDevice(id: string) { return requestJson<unknown>(`/monitoring/linux/devices/${id}/refresh`, { method: "POST" }); }
