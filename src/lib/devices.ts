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
  credentialRef: string | null;
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
  credentialRef?: string | null;
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
  linuxStatus?: LinuxStatus;
};

export type LinuxStatus = {
  connected: boolean;
  username?: string;
  hostname?: string;
  os?: string;
  ufwAvailable?: boolean;
  ufwStatus?: string;
  listeningPorts?: string;
  sshServiceStatus?: string;
  currentSshPort?: number | null;
  warnings: string[];
  errorCode?: string;
  message?: string;
};

export type DeviceCapabilities = {
  canTestConnection: boolean;
  canCollectStatus: boolean;
  canUseUfw: boolean;
  canOpenPort: boolean;
  canClosePort: boolean;
  canBlockSourceIp: boolean;
  canUnblockSourceIp: boolean;
  canChangeSshPortDryRunOnly: boolean;
  canExecuteChangeSshPort: boolean;
  supportedActions: string[];
};

export const normalizeArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)) {
    return (value as { items: T[] }).items;
  }
  if (value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: T[] }).data;
  }
  return [];
};

const normalizeObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function normalizeDevice(value: unknown): Device {
  const source = normalizeObject(value);
  return {
    id: String(source.id ?? ""),
    name: String(source.name ?? "Unnamed device"),
    vendor: String(source.vendor ?? source.type ?? "generic_firewall"),
    type: String(source.type ?? "generic_firewall") as DeviceType,
    host: String(source.host ?? ""),
    managementPort: Number(source.managementPort ?? 0),
    protocol: String(source.protocol ?? "ssh") as DeviceProtocol,
    credentialRef: typeof source.credentialRef === "string" ? source.credentialRef : null,
    environment: String(source.environment ?? "lab") as DeviceEnvironment,
    tags: normalizeArray<string>(source.tags),
    status: String(source.status ?? "unknown") as DeviceStatus,
    capabilities: normalizeObject(source.capabilities),
    createdAt: String(source.createdAt ?? ""),
    updatedAt: String(source.updatedAt ?? ""),
    statusChecks: normalizeArray<Device["statusChecks"] extends Array<infer T> ? T : never>(source.statusChecks),
  };
}

type ApiErrorPayload = {
  error?: unknown;
  message?: unknown;
  detail?: unknown;
  code?: unknown;
};

function parsePayload(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function apiErrorMessage(url: string, status: number, payload: unknown) {
  const body = payload && typeof payload === "object" ? payload as ApiErrorPayload : {};
  const detail = typeof body.error === "string"
    ? `${body.error}${typeof body.detail === "string" ? `: ${body.detail}` : ""}`
    : typeof body.message === "string"
      ? body.message
      : typeof body.detail === "string"
        ? body.detail
      : "No response details were provided.";
  const code = typeof body.code === "string" ? ` (${body.code})` : "";
  return `Device registry API error ${status}${code}: ${detail} [${url}]`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
      ...init,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed.";
    throw new Error(`Device registry API network error: ${message} [${url}]`);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = parsePayload(text);

  if (!response.ok) {
    throw new Error(apiErrorMessage(url, response.status, payload));
  }

  return payload as T;
}

export async function listDevices() {
  const payload = await requestJson<unknown>("/devices");
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : payload;
  return normalizeArray<unknown>(
    Array.isArray(source) ? source : (source as Record<string, unknown>).devices
  ).map(normalizeDevice);
}

export function createDevice(input: DeviceInput) {
  return requestJson<unknown>("/devices", {
    method: "POST",
    body: JSON.stringify(input),
  }).then(normalizeDevice);
}

export function updateDevice(id: string, input: DeviceInput) {
  return requestJson<unknown>(`/devices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then(normalizeDevice);
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

export function getDeviceCapabilities(id: string) {
  return requestJson<DeviceCapabilities>(`/devices/${id}/capabilities`);
}
