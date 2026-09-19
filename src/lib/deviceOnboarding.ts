import { API_BASE_URL } from "@/config/frontendEnv";

export type OnboardingDraft = {
  companyId: string;
  vendor: "linux" | "cisco" | "fortigate" | "mikrotik" | "sophos";
  platform: string;
  connectionMethod: "ssh" | "api";
  name: string;
  host: string;
  managementPort: number;
  credentialId: string;
  enableCredentialId?: string;
  ciscoLegacyCompatibilityApproved?: boolean;
  site: string;
  location: string;
  environment: "lab" | "staging" | "production";
};

export type OnboardingSession = {
  id: string;
  deviceId?: string;
  status:
    | "draft"
    | "answers_saved"
    | "connection_testing"
    | "connection_verified"
    | "connection_failed"
    | "credential_missing"
    | "credential_invalid"
    | "platform_detecting"
    | "platform_detected"
    | "platform_unsupported"
    | "discovery_running"
    | "discovery_completed"
    | "discovery_failed"
    | "preview_ready"
    | "preview_failed"
    | "saving"
    | "completed"
    | "save_failed"
    | "validation_failed"
    | "cancelled";
  step: string;
  draft: OnboardingDraft;
  test: Record<string, unknown> | null;
  detection: Record<string, unknown> | null;
  discovery: Record<string, unknown> | null;
  preview: Record<string, unknown> | null;
  result: { deviceId?: string; assetId?: string; route?: string; verificationStatus?: "verified" | "unverified"; connectorInvoked?: boolean; connectionVerified?: boolean; platform?: string; initialHealth?: Record<string, unknown> } | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export class OnboardingApiError extends Error {
  code?: string;
  status: number;
  detail?: unknown;
  connectorInvoked?: boolean;
  existingDeviceId?: string;
  route?: string;

  constructor(message: string, options: { code?: string; status: number; detail?: unknown; connectorInvoked?: boolean; existingDeviceId?: string; route?: string }) {
    super(message);
    this.name = "OnboardingApiError";
    this.code = options.code;
    this.status = options.status;
    this.detail = options.detail;
    this.connectorInvoked = options.connectorInvoked;
    this.existingDeviceId = options.existingDeviceId;
    this.route = options.route;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
    ...init
  });
  const text = await response.text();
  let payload: unknown = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text.slice(0, 300) }; }
  if (!response.ok) {
    const body = asObject(payload);
    const error = asObject(body.error);
    throw new OnboardingApiError(String(error.message ?? body.detail ?? body.error ?? `Request failed (${response.status})`), {
      code: typeof error.code === "string" ? error.code : undefined,
      status: response.status,
      detail: error.detail ?? body.detail,
      connectorInvoked: typeof error.connectorInvoked === "boolean" ? error.connectorInvoked : undefined,
      existingDeviceId: typeof error.existingDeviceId === "string" ? error.existingDeviceId : typeof asObject(error.detail).existingDeviceId === "string" ? String(asObject(error.detail).existingDeviceId) : undefined,
      route: typeof error.route === "string" ? error.route : typeof asObject(error.detail).route === "string" ? String(asObject(error.detail).route) : undefined
    });
  }
  return payload as T;
}

export const startOnboarding = (input: Record<string, unknown>) => request<OnboardingSession>("/device-onboarding/sessions", { method: "POST", body: JSON.stringify(input) });
export const getOnboarding = (id: string) => request<OnboardingSession>(`/device-onboarding/sessions/${id}`);
export const answerOnboarding = (id: string, input: OnboardingDraft) => request<OnboardingSession>(`/device-onboarding/sessions/${id}/answers`, { method: "POST", body: JSON.stringify(input) });
export const testOnboarding = (id: string) => request<OnboardingSession>(`/device-onboarding/sessions/${id}/test`, { method: "POST", body: "{}" });
export const detectOnboarding = (id: string) => request<OnboardingSession>(`/device-onboarding/sessions/${id}/detect`, { method: "POST", body: "{}" });
export const discoverOnboarding = (id: string) => request<OnboardingSession>(`/device-onboarding/sessions/${id}/discover`, { method: "POST", body: "{}" });
export const previewOnboarding = (id: string) => request<OnboardingSession>(`/device-onboarding/sessions/${id}/preview`, { method: "POST", body: "{}" });
export const commitOnboarding = (id: string) => request<OnboardingSession>(`/device-onboarding/sessions/${id}/commit`, { method: "POST", body: "{}" });
export const registerUnverifiedOnboarding = (id: string, input: OnboardingDraft) => request<OnboardingSession>(`/device-onboarding/sessions/${id}/register-unverified`, { method: "POST", body: JSON.stringify(input) });
export const cancelOnboarding = (id: string) => request<OnboardingSession>(`/device-onboarding/sessions/${id}/cancel`, { method: "POST", body: "{}" });
export const retryOnboarding = (id: string) => request<OnboardingSession>(`/device-onboarding/sessions/${id}/retry`, { method: "POST", body: "{}" });

export type DeviceWorkspace = {
  reference: string;
  device: { id: string; name: string; vendor: string; type: string; host: string; managementPort: number; protocol: string; environment: string; status: string; credentialConfigured: boolean; tags: string[]; createdAt: string; updatedAt: string } | null;
  asset: { id: string; name: string; hostname: string | null; managementIp: string | null; managedState: string; healthState: string; lastSeenAt: string | null; site: string | null; location: string | null; vendor: string | null; platform: string | null } | null;
  overview: { name: string; vendor: string; platform: string; version: unknown; site: string | null; location: string | null; managementIp: string | null; availability: string; healthScore: number | null; healthState: string; connectorState: string; connectorType: unknown; lastContact: string | null; lastSuccessfulCollection: string | null; findingsBySeverity: Record<string, number>; pendingActions: number; recentChanges: Array<Record<string, unknown>>; configBackup: Record<string, unknown>; verificationStatus: string };
  statusChecks: Array<Record<string, unknown>>;
  health: Record<string, unknown> | null;
  findings: Array<Record<string, unknown>>;
  actions: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
  capabilities: { platformKey?: string; connectorType?: string; capabilities?: unknown; facts?: unknown; detection?: unknown; warnings?: unknown; refreshedAt?: string; expiresAt?: string } | null;
  collections: Array<Record<string, unknown>>;
  charts: {
    healthScore: WorkspaceChartPoint[];
    connectorResults: WorkspaceChartPoint[];
    availability: WorkspaceChartPoint[];
    resources: WorkspaceChartPoint[];
    findings: WorkspaceChartPoint[];
    actions: WorkspaceChartPoint[];
    recentChanges: Array<{ timestamp: string; label: string }>;
  };
  vendor: { key: string; sections: Array<{ key: string; titleFa: string; titleEn: string; state: "available" | "no_data"; capabilityState?: string; reason: string | null; requirement: string; nextAction: string }> };
  vendorDetails: Record<string, unknown> | null;
};

export type WorkspaceChartPoint = { timestamp: string; value: number; label?: string; unit?: string | null };

export const getDeviceWorkspace = (reference: string) => request<DeviceWorkspace>(`/device-workspaces/${encodeURIComponent(reference)}`);

export type DeviceVerificationAttempt = {
  sessionId: string;
  status: string;
  step: string;
  connectorInvoked: boolean;
  connected: boolean;
  connectorType: string | null;
  platform: string | null;
  error: string | null;
  attemptedAt: string;
  expiresAt: string;
};

export type DeviceVerification = {
  deviceId: string;
  verificationStatus: "verified" | "failed" | "unverified";
  vendor: string;
  platform: string;
  host: string;
  port: number;
  method: string;
  credential: { id: string; name: string; type: string } | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  connectorInvoked: boolean;
  connectorType: string | null;
  connectorState: "connected" | "failed" | "unknown";
  sshReachability: "reachable" | "unreachable" | "unknown";
  authenticationStatus: "authenticated" | "failed" | "unknown";
  connected: boolean;
  error: string | null;
  activeSessionId: string | null;
  busy: boolean;
  history: DeviceVerificationAttempt[];
};

export const getDeviceVerification = (deviceId: string) => request<DeviceVerification>(`/devices/${encodeURIComponent(deviceId)}/verification`);
export const testDeviceVerification = (deviceId: string, credentialId?: string) => request<DeviceVerification>(`/devices/${encodeURIComponent(deviceId)}/connection-test`, { method: "POST", body: JSON.stringify({ credentialId }) });
export const retryDeviceVerification = (deviceId: string, credentialId?: string) => request<DeviceVerification>(`/devices/${encodeURIComponent(deviceId)}/verification/retry`, { method: "POST", body: JSON.stringify({ credentialId }) });
export const commitDeviceVerification = (deviceId: string, sessionId?: string | null) => request<DeviceVerification>(`/devices/${encodeURIComponent(deviceId)}/verification/commit`, { method: "POST", body: JSON.stringify({ sessionId }) });
