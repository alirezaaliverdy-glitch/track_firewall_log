const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type PlatformAsset = {
  id: string;
  name: string;
  hostname: string | null;
  managementIp: string | null;
  managedState: string;
  healthState: string;
  lastSeenAt: string | null;
  site?: { name: string } | null;
  vendor?: { name: string } | null;
  platform?: { name: string } | null;
  device?: { id: string; name: string; host: string; type: string } | null;
  ipAddresses?: Array<{ address: string; role: string | null }>;
};

export type SecurityFinding = {
  id: string;
  title: string;
  severity: string;
  status: string;
  summary: string;
  count: number;
  lastSeen: string;
  evidenceJson: unknown;
  asset?: { id: string; name: string; managementIp: string | null; healthState: string } | null;
  device?: { id: string; name: string; vendor: string; host: string } | null;
};

export type DetectionRule = { id: string; name: string; description: string; enabled: boolean; severity: string; ruleType: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
    ...init
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : {};
  if (!response.ok) {
    const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const nested = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
    throw new Error(String(nested.message ?? body.detail ?? body.error ?? `Request failed: ${response.status}`));
  }
  return payload as T;
}

export const listPlatformAssets = (view: "active" | "archived" | "all" = "active") => request<{ assets: PlatformAsset[]; summary: Record<string, unknown> }>(`/assets?view=${encodeURIComponent(view)}`);
export const getPlatformAsset = (id: string) => request<PlatformAsset>(`/assets/${id}`);
export const removePlatformAsset = (id: string) => request<{ ok: boolean; assetId: string; deviceId?: string | null; inventoryStatus: string; visibleInActiveInventory: boolean }>(`/assets/${id}`, { method: "DELETE" });
export const previewAssetImport = (body: Record<string, unknown>) => request<Record<string, unknown>>("/assets/import/preview", { method: "POST", body: JSON.stringify(body) });
export const applyAssetImport = (body: Record<string, unknown>) => request<Record<string, unknown>>("/assets/import/apply", { method: "POST", body: JSON.stringify(body) });
export const netboxPreview = () => request<Record<string, unknown>>("/integrations/netbox/sync-preview");
export const netboxSync = () => request<Record<string, unknown>>("/integrations/netbox/sync", { method: "POST", body: JSON.stringify({ idempotencyKey: "ui-netbox-sync" }) });
export const wazuhPreview = () => request<Record<string, unknown>>("/integrations/wazuh/sync-preview");
export const wazuhSync = () => request<Record<string, unknown>>("/integrations/wazuh/sync", { method: "POST", body: JSON.stringify({ idempotencyKey: "ui-wazuh-sync" }) });
export const listSecurityFindings = () => request<{ findings: SecurityFinding[] }>("/security/findings");
export const listDetectionRules = () => request<{ rules: DetectionRule[] }>("/security/rules");
export const createFindingActionPlan = (id: string) => request<{ actionPlan: { id: string; status: string; parametersJson: Record<string, unknown> } }>(`/security/findings/${id}/action-plan`, { method: "POST" });
export const updateFindingStatus = (id: string, status: string) => request<SecurityFinding>(`/security/findings/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
