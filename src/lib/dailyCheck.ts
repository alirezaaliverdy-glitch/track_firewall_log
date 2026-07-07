const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type DailyCheckSectionProfile = {
  key: string;
  titleFa: string;
  templates: string[];
  parserRules: string[];
  severityRules: string[];
  suggestedActions: string[];
};

export type VendorDailyCheckProfile = {
  vendor: string;
  titleFa: string;
  requiredConnector: string | null;
  implementationState: "implemented" | "manualOnly" | "planned";
  sections: DailyCheckSectionProfile[];
};

async function requestJson<T>(path: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.messageFa ?? payload.detail ?? payload.error ?? "خطا در دریافت چک روزانه");
  return payload as T;
}

export async function getDailyCheckProfile(deviceId: string) {
  return requestJson<{ deviceId: string; detectedVendor: string; profile: VendorDailyCheckProfile }>(`/daily-check/devices/${encodeURIComponent(deviceId)}/profile`);
}
