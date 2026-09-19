import { API_BASE_URL } from "@/config/frontendEnv";

export type DeviceType =
  | "linux"
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
  companyId: string | null;
  company?: { id: string; name: string; code: string } | null;
  name: string;
  vendor: string;
  type: DeviceType;
  host: string;
  managementPort: number;
  protocol: DeviceProtocol;
  credentialId: string | null;
  credentialRef: string | null;
  credential: {
    id: string;
    name: string;
    type: string;
    username: string;
    sudo: boolean;
  } | null;
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
  companyId?: string;
  name: string;
  vendor: string;
  type: DeviceType;
  host: string;
  managementPort: number;
  protocol: DeviceProtocol;
  credentialId?: string | null;
  credentialRef?: string | null;
  environment: DeviceEnvironment;
  tags: string[];
  capabilities: Record<string, unknown>;
};

export type ConnectionTestResult = {
  deviceId: string;
  vendor?: string;
  host?: string;
  port?: number;
  status: DeviceStatus;
  message: string;
  latencyMs: number;
  checkedAt: string;
  connected?: boolean;
  stages?: DeviceConnectionStatus["stages"];
  warnings?: DeviceConnectionStatus["warnings"];
  capabilities?: DeviceConnectionStatus["capabilities"];
  linuxStatus?: LinuxStatus;
  mikrotikStatus?: MikroTikStatus;
  fortigateStatus?: FortiGateStatus;
};

export type DeviceConnectionStatus = {
  connected: boolean;
  vendor?: string;
  host?: string;
  port?: number;
  username?: string;
  credentialResolved?: boolean;
  credentialName?: string;
  stages: Array<{
    name: string;
    status: "ok" | "warning" | "failed";
    code?: string;
    message?: string;
  }>;
  warnings: Array<{ code: string; message: string }>;
  capabilities?: {
    canConnect: boolean;
    canRunBasicReadOnly?: boolean;
    canUseUfw?: boolean;
    canOpenPort?: boolean;
    canClosePort?: boolean;
    canReadSystem?: boolean;
    canReadInterfaces?: boolean;
    canReadFirewall?: boolean;
    canReadLogs?: boolean;
    canExecuteWriteActions?: boolean;
  };
  errorCode?: string;
  message?: string;
};

export type LinuxStatus = DeviceConnectionStatus & {
  hostname?: string;
  os?: string;
  ufwAvailable?: boolean;
  ufwStatus?: string;
  listeningPorts?: string;
  sshServiceStatus?: string;
  currentSshPort?: number | null;
};

export type MikroTikDiscovery = {
  identity?: string;
  routerosVersion?: string;
  architecture?: string;
  uptime?: string;
  cpuLoad?: string;
  memoryFree?: string;
  interfaces?: string[];
  ipAddresses?: string[];
  routes?: string[];
  firewallFilterRules?: string[];
  natRules?: string[];
  mangleRules?: string[];
  addressLists?: string[];
  services?: string[];
  recentLogs?: string[];
};

export type MikroTikStatus = DeviceConnectionStatus & {
  vendor: "mikrotik";
  mikrotik?: MikroTikDiscovery;
};

export type FortiGateDiscovery = {
  version?: string;
  model?: string;
  serial?: string;
  hostname?: string;
  vdomMode?: string;
  currentVdom?: string;
  zones?: string[];
  interfaces?: string[];
  policies?: string[];
  addressObjects?: string[];
  addressGroups?: string[];
  services?: string[];
  serviceGroups?: string[];
  schedules?: string[];
  routes?: string[];
  haStatus?: string[];
};

export type FortiGateStatus = DeviceConnectionStatus & {
  vendor: "fortigate";
  fortigate?: FortiGateDiscovery;
};

export type DeviceCapabilities = {
  canTestConnection: boolean;
  canCollectStatus: boolean;
  canUseUfw?: boolean;
  canOpenPort?: boolean;
  canClosePort?: boolean;
  canBlockSourceIp?: boolean;
  canUnblockSourceIp?: boolean;
  canChangeSshPortDryRunOnly?: boolean;
  canReadSystem?: boolean;
  canReadInterfaces?: boolean;
  canReadFirewall?: boolean;
  canReadLogs?: boolean;
  canExecuteWriteActions?: boolean;
  identity?: string;
  routerosVersion?: string;
  architecture?: string;
  uptime?: string;
  cpuLoad?: string;
  memoryFree?: string;
  interfaceCount?: number;
  firewallFilterRuleCount?: number;
  natRuleCount?: number;
  addressListCount?: number;
  serviceSummary?: string[];
  warnings?: Array<{ code: string; message: string }>;
  mikrotik?: MikroTikDiscovery;
  fortigate?: FortiGateDiscovery;
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
    companyId: typeof source.companyId === "string" ? source.companyId : null,
    company: source.company ? normalizeObject(source.company) as Device["company"] : null,
    name: String(source.name ?? "Unnamed device"),
    vendor: String(source.vendor ?? source.type ?? "generic_firewall"),
    type: String(source.type ?? "generic_firewall") as DeviceType,
    host: String(source.host ?? ""),
    managementPort: Number(source.managementPort ?? source.port ?? 22),
    protocol: String(source.protocol ?? "ssh") as DeviceProtocol,
    credentialId: typeof source.credentialId === "string" ? source.credentialId : null,
    credentialRef: typeof source.credentialRef === "string" ? source.credentialRef : null,
    credential: source.credential ? normalizeObject(source.credential) as Device["credential"] : null,
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
      credentials: "include",
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

export function updateDevice(id: string, input: Partial<DeviceInput>) {
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
