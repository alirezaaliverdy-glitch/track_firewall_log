import { API_BASE_URL } from "@/config/frontendEnv";

export type TrafficRank = { value: string; count: number };
export type VolumeRank = { value: string; bytes: number; records: number };
export type DeviceTraffic = {
  id: string; name: string; vendor: string; host: string; status: string;
  interfaces: Array<{ name: string; rxMbps: number | null; txMbps: number | null; totalMbps: number | null; sampledAt: string | null; stale: boolean; method: "counter_delta" | "device_5m_average" }>;
  volume: { source: "netflow-v5" | "netflow-v9" | "allowed-flow-logs" | "none"; sampled: boolean | null; ports: VolumeRank[]; sourceIps: VolumeRank[]; destinationIps: VolumeRank[]; interfaceIn: VolumeRank[]; interfaceOut: VolumeRank[] };
  observed: { ports: TrafficRank[]; sourceIps: TrafficRank[]; destinationIps: TrafficRank[] };
};

export async function getDeviceTrafficOverview(): Promise<{ generatedAt: string; devices: DeviceTraffic[] }> {
  const response = await fetch(`${API_BASE_URL}/dashboard/traffic`, { credentials: "include" });
  if (!response.ok) throw new Error(`Traffic overview unavailable (${response.status})`);
  return response.json() as Promise<{ generatedAt: string; devices: DeviceTraffic[] }>;
}

export type NetflowSettings = { enabled: boolean; exporterIp: string | null; lastSeenAt: string | null; lastFormat: string | null; receiver: { listening: boolean; port: number; hostBind: string; lastError: string | null }; packets: { accepted: number; dropped: number; lastPacketAt: string | null } };

export async function getNetflowSettings(deviceId: string): Promise<NetflowSettings> {
  const response = await fetch(`${API_BASE_URL}/devices/${encodeURIComponent(deviceId)}/netflow`, { credentials: "include" });
  if (!response.ok) throw new Error(`NetFlow settings unavailable (${response.status})`);
  return response.json() as Promise<NetflowSettings>;
}

export async function saveNetflowSettings(deviceId: string, enabled: boolean, exporterIp: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/devices/${encodeURIComponent(deviceId)}/netflow`, {
    method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, exporterIp })
  });
  if (!response.ok) throw new Error(response.status === 403 ? "ADMIN_REQUIRED" : response.status === 409 ? "EXPORTER_IP_ALREADY_ASSIGNED" : "NETFLOW_SETTINGS_FAILED");
}
