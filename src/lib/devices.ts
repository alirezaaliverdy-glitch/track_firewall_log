const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type DeviceType =
  | "linux_edge"
  | "mikrotik"
  | "fortigate"
  | "pfsense"
  | "generic_syslog_source"
  | "generic_firewall";

export type DeviceProtocol = "ssh" | "api" | "syslog" | "agent";
export type DeviceEnvironment = "production" | "staging" | "lab";
export type DeviceStatus = "unknown" | "online" | "offline" | "error";

export type Device = {
  id: string;
  name: string;
  vendor: string;
  type: DeviceType;
  host: string;
  managementPort: number;
  protocol: DeviceProtocol;
  environment: DeviceEnvironment;
  tags: string[];
  status: DeviceStatus;
  capabilities: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  statusChecks?: Array<{
    id: string;
    status: DeviceStatus;
    message: string | null;
    latencyMs: number | null;
    checkedAt: string;
  }>;
};

export type DeviceInput = {
  name: string;
  vendor: string;
  type: DeviceType;
  host: string;
  managementPort: number;
  protocol: DeviceProtocol;
  environment: DeviceEnvironment;
  tags: string[];
  capabilities: Record<string, unknown>;
};

export type ConnectionTestResult = {
  deviceId: string;
  status: DeviceStatus;
  message: string;
  latencyMs: number;
  checkedAt: string;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
    ...init,
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "Device registry request failed.";
    throw new Error(message);
  }
  return payload as T;
}

export async function listDevices() {
  const payload = await requestJson<{ devices: Device[] }>("/devices");
  return payload.devices;
}

export function createDevice(input: DeviceInput) {
  return requestJson<Device>("/devices", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateDevice(id: string, input: DeviceInput) {
  return requestJson<Device>(`/devices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteDevice(id: string) {
  return requestJson<void>(`/devices/${id}`, {
    method: "DELETE",
  });
}

export function testDeviceConnection(id: string) {
  return requestJson<ConnectionTestResult>(`/devices/${id}/test-connection`, {
    method: "POST",
  });
}
