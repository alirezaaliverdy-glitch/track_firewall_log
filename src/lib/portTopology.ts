import { apiRequest } from "./apiTransport";

export type PortMapPort = {
  id: string; name: string; type: string; macAddress: string | null; enabled: boolean;
  operationalStatus: "up" | "down" | "unknown"; speed?: string; vlan?: string; description?: string;
  administrativeStatus?: "up" | "down" | "unknown";
  ipAddresses?: string[];
  source?: "discovered" | "inferred" | "manual"; confidence?: number; sourceProtocol?: string;
  peerName?: string; peerPort?: string; peerIp?: string; cableType?: string; note?: string;
  manualOverride?: boolean; lastDiscoveredAt?: string; updatedAt: string;
};

export type PortMapDevice = {
  id: string; name: string; vendor: string; type: string; host: string; status: string; model: string | null; ports: PortMapPort[];
  serviceEndpoints: ServiceEndpoint[]; serviceSnapshotAt?: string | null;
  serviceDataSource?: "live" | "snapshot" | "inventory" | "unavailable";
};

export type ServiceEndpoint = {
  key: string; protocol: "tcp" | "udp" | "sctp" | "other"; address: string; port: number;
  state: "listening" | "allowed" | "disabled" | "unknown";
  exposure: "all_interfaces" | "loopback" | "interface" | "policy" | "unknown";
  process?: string; serviceName?: string; source: string; confidence: number; note?: string;
  manualOverride?: boolean; discoveredAt?: string; bindings?: ServiceBinding[]; replacesKey?: string;
};

export type ServiceBinding = {
  address: string; exposure: ServiceEndpoint["exposure"]; state: ServiceEndpoint["state"];
  process?: string; serviceName?: string; source: string; confidence: number; discoveredAt?: string;
};

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "PORT_TOPOLOGY_REQUEST_FAILED");
  return body;
}

export async function listPortTopology(deviceId?: string) {
  const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
  return json<{ generatedAt: string; devices: PortMapDevice[] }>(await apiRequest(`/assets/port-topology${query}`));
}

export async function discoverPortTopology(deviceId: string) {
  return json<{ discoveredCount: number; serviceEndpointCount: number; liveConnected: boolean; connectionErrorCode?: string | null; topology: { devices: PortMapDevice[] } }>(await apiRequest("/assets/port-topology/discover", { method: "POST", body: JSON.stringify({ deviceId }) }));
}

export async function refreshLinuxServicePorts(deviceId: string) {
  return json<{ connected: boolean; serviceEndpointCount: number; checkedAt: string; topology: { devices: PortMapDevice[] } }>(await apiRequest("/assets/port-topology/listeners/refresh", { method: "POST", body: JSON.stringify({ deviceId }) }));
}

export async function savePortConnection(deviceId: string, portName: string, input: Partial<PortMapPort>) {
  return json<PortMapPort>(await apiRequest(`/assets/port-topology/${encodeURIComponent(deviceId)}/ports/${encodeURIComponent(portName)}`, { method: "PATCH", body: JSON.stringify(input) }));
}

export async function clearPortConnection(deviceId: string, portName: string) {
  return json<PortMapPort>(await apiRequest(`/assets/port-topology/${encodeURIComponent(deviceId)}/ports/${encodeURIComponent(portName)}`, { method: "DELETE" }));
}

export async function saveServiceEndpoint(deviceId: string, endpointKey: string, input: Partial<ServiceEndpoint>) {
  return json<ServiceEndpoint>(await apiRequest(`/assets/port-topology/${encodeURIComponent(deviceId)}/services/${encodeURIComponent(endpointKey)}`, { method: "PATCH", body: JSON.stringify(input) }));
}

export async function clearServiceEndpoint(deviceId: string, endpointKey: string) {
  return json<{ cleared: true; key: string }>(await apiRequest(`/assets/port-topology/${encodeURIComponent(deviceId)}/services/${encodeURIComponent(endpointKey)}`, { method: "DELETE" }));
}
