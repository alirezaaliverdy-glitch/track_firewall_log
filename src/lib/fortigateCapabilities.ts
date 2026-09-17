const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type FortiGateCapabilityMode = "read-only" | "dry-run" | "execution" | "not-implemented";
export type FortiGateCapabilityRisk = "low" | "medium" | "high" | "critical";

export type FortiGateCapability = {
  id: string;
  category: string;
  supported: boolean;
  mode: FortiGateCapabilityMode;
  risk: FortiGateCapabilityRisk;
  currentFiles: string[];
  missingPieces: string[];
  notes: string;
};

export type FortiGateCapabilityResponse = {
  vendor: "fortigate";
  registryVersion: number;
  executionRequiresApproval: boolean;
  summary: {
    execution: number;
    dryRunOnly: number;
    readOnly: number;
    notImplemented: number;
    dangerous: number;
  };
  capabilities: FortiGateCapability[];
};

export async function getFortiGateCapabilities(): Promise<FortiGateCapabilityResponse> {
  const url = `${API_BASE_URL}/vendors/fortigate/capabilities`;
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`FortiGate capability API error ${response.status}${detail ? `: ${detail}` : ""} [${url}]`);
  }
  return response.json() as Promise<FortiGateCapabilityResponse>;
}
