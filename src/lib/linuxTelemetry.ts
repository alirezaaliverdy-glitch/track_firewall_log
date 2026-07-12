const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");
export type TelemetrySeverity = "info" | "low" | "medium" | "high" | "critical";
export type LinuxFinding = { id: string; title: string; severity: TelemetrySeverity; category: string; evidence: string[]; impact: string; recommendation: string; relatedActionHints: string[]; canCreateActionPlan: boolean };
export type LinuxSnapshot = {
  deviceId: string; collectedAt: string; privilegeLevel: "root" | "sudo" | "limited"; sudoAvailable: boolean;
  connection: { host: string; connectionPort: number };
  host: { hostname: string; os: string; kernel: string; uptime: string; timezone: string };
  network: { exposedPorts: number[]; publicExposureSummary: string; listeningPorts: string[] };
  ssh: { port: number; detectedSshServicePort: number | null; permitRootLogin: string; passwordAuthentication: string; pubkeyAuthentication: string; recentFailures: number; recentSuccesses: number };
  firewall: { effectiveStatus: string }; securityTools: { fail2ban: string; auditd: string };
  containers?: { dockerDetected: boolean; exposedPorts: number[] };
  services?: { importantServices: Record<string, string> };
  recentLogs: { authSignals: string[] }; riskSummary: { score: number; severity: TelemetrySeverity; topFindings: LinuxFinding[] }; findings: LinuxFinding[];
};
export type LinuxLiveEvent = { streamId: string; deviceId: string; source: string; timestamp: string; raw: string; parsed: Record<string, unknown>; severity: TelemetrySeverity; tags: string[]; suspicious: boolean; summary: string };
export type VendorFinding = { id: string; deviceId: string; vendor: string; title: string; severity: TelemetrySeverity; category: string; status: string; confidence: number; summary: string; evidence: string[]; source: string; firstSeen: string; lastSeen: string; count: number; mitreTags: string[]; recommendedActions: Array<{ intent: string; label: string }>; fingerprint: string };
export type LinuxTelemetryOptions = { deviceId: string; connectionStatus: string; connection: { host: string; connectionPort: number }; connectionPort: number; detectedSshServicePort: number | null; privilegeLevel: string; sudoAvailable: boolean | "unknown"; lastSnapshotAt: string | null; availableLogSources: string[]; logSourcesAvailable: string[]; warnings: string[]; readOnly: boolean; suggestions: Array<{ title: string; severity: string }> };
export type LinuxTelemetryStorageStatus = { deviceId: string; bytesUsed: number; maxBytesPerDevice: number; eventCount: number; maxEventCountPerDevice: number; maxAgeDays: number; oldestEventTime: string | null; newestEventTime: string | null };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", headers: init?.body ? { "Content-Type": "application/json" } : undefined, ...init });
  const text = await response.text(); const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(String(payload.detail ?? payload.error ?? "Linux telemetry request failed"));
  return payload as T;
}
export const collectLinuxSnapshot = (deviceId: string) => request<{ snapshot: LinuxSnapshot }>(`/devices/${deviceId}/telemetry/linux/snapshot`, { method: "POST" });
export const latestLinuxSnapshot = (deviceId: string) => request<{ snapshot: LinuxSnapshot }>(`/devices/${deviceId}/telemetry/linux/snapshot/latest`);
export const analyzeLinuxSnapshot = (deviceId: string) => request<{ snapshot: LinuxSnapshot }>(`/devices/${deviceId}/telemetry/linux/analyze`, { method: "POST" });
export const linuxTelemetryOptions = (deviceId: string) => request<LinuxTelemetryOptions>(`/devices/${deviceId}/telemetry/linux/options`);
export const linuxTelemetryStorageStatus = (deviceId: string) => request<LinuxTelemetryStorageStatus>(`/devices/${deviceId}/telemetry/linux/storage/status`);
export const startLinuxStream = (deviceId: string, sources: string[]) => request<{ streamId: string; status: string; warnings: string[] }>(`/devices/${deviceId}/telemetry/linux/stream/start`, { method: "POST", body: JSON.stringify({ sources }) });
export const stopLinuxStream = (deviceId: string, streamId: string) => request(`/devices/${deviceId}/telemetry/linux/stream/stop`, { method: "POST", body: JSON.stringify({ streamId }) });
export const linuxStreamStatus = (deviceId: string) => request<{ streamId: string | null; status: string; sources: string[]; warnings: string[] }>(`/devices/${deviceId}/telemetry/linux/stream/status`);
export const listDeviceFindings = (deviceId: string) => request<VendorFinding[]>(`/devices/${deviceId}/findings`);
export const createFindingActionPlan = (findingId: string, recommendedIntent?: string) => request<{ findingId: string; actionPlan: { id: string } }>(`/findings/${findingId}/action-plan`, { method: "POST", body: JSON.stringify({ recommendedIntent }) });
export function subscribeLinuxStream(deviceId: string, streamId: string, onEvent: (event: LinuxLiveEvent) => void, onError: () => void, onWarning?: (warning: string) => void, onFinding?: (finding: VendorFinding) => void) {
  const source = new EventSource(`${API_BASE_URL}/devices/${deviceId}/telemetry/linux/stream/events?streamId=${encodeURIComponent(streamId)}`, { withCredentials: true });
  source.addEventListener("telemetry", (event) => onEvent(JSON.parse((event as MessageEvent).data) as LinuxLiveEvent)); source.onerror = onError;
  source.addEventListener("warning", (event) => { const value = JSON.parse((event as MessageEvent).data) as { warning?: string }; if (value.warning) onWarning?.(value.warning); });
  source.addEventListener("finding", (event) => onFinding?.(JSON.parse((event as MessageEvent).data) as VendorFinding));
  return () => source.close();
}
