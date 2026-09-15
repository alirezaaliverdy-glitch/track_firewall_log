import { API_BASE_URL } from "@/config/frontendEnv";

const CISCO_VENDOR_FALLBACK: VendorDetail = {
  key: "cisco",
  titleFa: "Cisco",
  titleEn: "Cisco",
  description: "Cisco platform-family detection and IOS-XE read-only capability foundation.",
  implementationState: "partial",
  platforms: [],
  capabilities: []
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers, ...init });
  const text = await response.text();
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = text ? JSON.parse(text) as { error?: string | { message?: string } } : {};
      message = typeof body.error === "string" ? body.error : body.error?.message || message;
    } catch { /* Keep the status-only fallback for non-JSON proxy errors. */ }
    throw new Error(message);
  }
  if (/^\s*</.test(text) && path === "/vendors/cisco") return CISCO_VENDOR_FALLBACK as T;
  if (/^\s*</.test(text) && path === "/vendors/cisco/devices") return { data: [], warnings: ["Cisco API is not reachable from the current dev server."], meta: {} } as T;
  return (text ? JSON.parse(text) : {}) as T;
}
export type VendorCapability = { key: string; titleFa: string; titleEn: string; domain: string; mode: "read" | "mutate"; implementationState: "implemented" | "partial" | "planned" | "unsupported"; actionTemplate: string | null; sourceRefs: string[] };
export type VendorPlatform = { key: string; titleFa: string; titleEn: string; implementationState: string; executable: boolean; notes: string[] };
export type VendorDetail = { key: string; titleFa: string; titleEn: string; description: string; implementationState: string; platforms: VendorPlatform[]; capabilities: VendorCapability[] };
export type VendorSummary = { key: string; titleFa: string; titleEn: string; description: string; implementationState: string; connectorTypes: string[] };

export function listVendors() { return requestJson<{ vendors: VendorSummary[] }>("/vendors"); }
export function getVendorDetail(vendorKey: string) { return requestJson<VendorDetail>(`/vendors/${vendorKey}`); }
export function getCiscoDevices() { return requestJson<{ data: unknown[]; warnings: string[]; meta: Record<string, unknown> }>("/vendors/cisco/devices"); }
export function refreshDeviceVendorCapabilities(deviceId: string) {
  return requestJson<{ deviceId: string; refreshedAt: string; warnings: unknown[] }>(`/devices/${encodeURIComponent(deviceId)}/capabilities/refresh`, { method: "POST", body: "{}" });
}
