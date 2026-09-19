import { API_BASE_URL } from "@/config/frontendEnv";

export type ConnectionMethodKey = "ssh" | "rest_api" | "netconf" | "restconf" | "snmpv3" | "syslog" | "gnmi" | "agent" | "xml_api";
export type ConnectionPurpose = "control" | "inventory" | "telemetry" | "events";

export type VendorConnectionMethod = {
  key: ConnectionMethodKey;
  title: string;
  titleFa: string;
  summary: string;
  summaryFa: string;
  purposes: ConnectionPurpose[];
  readiness: "ready" | "setup_required" | "planned";
  recommended: boolean;
  selectable: boolean;
  secure: boolean;
  defaultPort: number | null;
  credential: "username_password" | "private_key" | "api_token" | "certificate" | "snmpv3" | "none";
  prerequisites: string[];
  prerequisitesFa: string[];
};

export type VendorConnectionProfile = {
  vendor: "linux" | "cisco" | "fortigate" | "mikrotik" | "sophos";
  strategy: string;
  strategyFa: string;
  methods: VendorConnectionMethod[];
};

export async function listConnectionProfiles() {
  const response = await fetch(`${API_BASE_URL}/vendors/connection-methods`, { credentials: "include" });
  if (!response.ok) throw new Error(`Connection method catalog failed (${response.status}).`);
  return (await response.json() as { profiles: VendorConnectionProfile[] }).profiles;
}

export function onboardingProtocol(method: VendorConnectionMethod): "ssh" | "api" {
  return method.key === "rest_api" || method.key === "xml_api" ? "api" : "ssh";
}
