import { API_BASE_URL } from "@/config/frontendEnv";

export type DailyCheckSectionProfile = {
  key: string;
  titleFa: string;
  templates: string[];
  parserRules: string[];
  severityRules: string[];
  suggestedActions: string[];
  standardRefs: string[];
};

export type DailyCheckStandardReference = {
  id: string;
  title: string;
  titleFa: string;
  url: string | null;
};

export type VendorDailyCheckProfile = {
  vendor: string;
  titleFa: string;
  requiredConnector: string | null;
  implementationState: "implemented" | "manualOnly" | "planned";
  sections: DailyCheckSectionProfile[];
};

export type DailyCheckReadiness = {
  deviceName: string;
  connectionStatus: string;
  protocol: string;
  credentialConfigured: boolean;
  connectorConfigured: boolean;
  lastConnectionCheckAt: string | null;
  lastConnectionLatencyMs: number | null;
  lastConnectionStatus: string | null;
};

export type DailyCheckProfilesResponse = {
  profiles: VendorDailyCheckProfile[];
  standards: DailyCheckStandardReference[];
  vendorGuidance: Record<string, { title: string; url: string }>;
};

async function requestJson<T>(path: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.messageFa ?? payload.detail ?? payload.error ?? "خطا در دریافت چک روزانه");
  return payload as T;
}

export async function getDailyCheckProfile(deviceId: string) {
  return requestJson<{ deviceId: string; detectedVendor: string; profile: VendorDailyCheckProfile; readiness: DailyCheckReadiness }>(`/daily-check/devices/${encodeURIComponent(deviceId)}/profile`);
}

export async function getDailyCheckProfiles() {
  return requestJson<DailyCheckProfilesResponse>("/daily-check/profiles");
}
