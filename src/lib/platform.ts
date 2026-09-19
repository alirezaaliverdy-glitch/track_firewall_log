import { API_BASE_URL } from "@/config/frontendEnv";

export type PlatformAsset = {
  id: string;
  companyId?: string | null;
  company?: { id: string; name: string; code: string } | null;
  name: string;
  hostname: string | null;
  managementIp: string | null;
  managedState: string;
  healthState: string;
  lastSeenAt: string | null;
  site?: { name: string } | null;
  vendor?: { name: string } | null;
  platform?: { name: string } | null;
  device?: { id: string; name: string; host: string; type: string } | null;
  ipAddresses?: Array<{ address: string; role: string | null }>;
};

export type SecurityFinding = {
  id: string;
  deviceId: string;
  assetId?: string | null;
  vendor: string;
  title: string;
  severity: string;
  category: string;
  status: string;
  confidence: number;
  summary: string;
  source: string;
  rawRefsJson: unknown;
  firstSeen: string;
  count: number;
  lastSeen: string;
  mitreTags: string[];
  affectedObject?: string | null;
  actor?: string | null;
  srcIp?: string | null;
  dstIp?: string | null;
  dstPort?: number | null;
  recommendedActions: unknown;
  evidenceJson: unknown;
  asset?: { id: string; name: string; managementIp: string | null; healthState: string } | null;
  device?: { id: string; name: string; vendor: string; host: string } | null;
};

export type DetectionRule = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: string;
  ruleType: string;
  queryJson?: Record<string, unknown>;
  thresholdJson?: Record<string, unknown>;
  updatedAt?: string;
};

export type SecurityEmailAlertSettings = {
  id: string;
  enabled: boolean;
  recipientEmail: string | null;
  recipientEmails: string[];
  minimumSeverity: "low" | "medium" | "high" | "critical";
  smtpConfigured: boolean;
  sender: {
    provider: string | null;
    email: string | null;
    connected: boolean;
    connectedAt: string | null;
    testedAt: string | null;
    testStatus: string | null;
    source: "personal_gmail" | "server" | "none";
  };
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastErrorCode: string | null;
  deliveries: Array<{
    id: string;
    status: string;
    errorCode: string | null;
    attemptCount: number;
    nextAttemptAt: string | null;
    attemptedAt: string;
    sentAt: string | null;
    findingId: string;
    ruleId: string | null;
    recipientEmail: string;
    metadataJson: unknown;
    reason: { titleFa: string; titleEn: string; findingTitle: string | null; deviceName: string | null; vendor: string | null; severity: string | null };
  }>;
};

export type SecurityMonitoringStatus = {
  enabled: boolean;
  running: boolean;
  cycleRunning: boolean;
  tickSeconds: number;
  defaultCollectorIntervalSeconds: number;
  startedAt: string | null;
  lastCycleAt: string | null;
  lastDetectionAt: string | null;
  lastErrorCode: string | null;
  collectors: {
    supportedDevices: number;
    configured: number;
    enabled: number;
    attempted: number;
    succeeded: number;
    failed: number;
    devices: Array<{ deviceId: string; deviceName: string; vendor: string; sourceType: string; enabled: boolean; intervalSeconds: number; effectiveIntervalSeconds: number; consecutiveIdleRuns: number; consecutiveFailures: number; lastSuccessAt: string | null; lastErrorAt: string | null; lastErrorCode: string | null }>;
  };
  detection: { enabledRules: number; lastRun: { rulesEvaluated: number; eventsEvaluated: number; findingsCreated: number; findingsUpdated: number } | null };
  dispatcher: { strategy: "event_debounce_with_incremental_fallback"; debounceMs: number; maxConcurrency: number; active: number; pending: number; completed: number; failed: number };
  email: { enabledChannels: number; pendingRetries: number; lastRetry: { attempted: number; sent: number; failed: number } | null };
};

export type VendorFindingProfile = {
  vendorId: string;
  vendorName: string;
  liveSources: string[];
  snapshotSources: string[];
  implemented: "implemented" | "scaffolded";
  rules: Array<{ id: string; title: string; category: string; severity: string; kind: "event" | "snapshot"; mitreTags: string[] }>;
};

export type FindingEvidenceEvent = {
  id: string;
  storage: "security_event" | "telemetry_store";
  timestamp: string;
  receivedAt: string;
  vendor?: string | null;
  sourceType?: string | null;
  eventType: string;
  severity?: string | null;
  action?: string | null;
  rawMessage: string;
  srcIp?: string | null;
  srcPort?: number | null;
  dstIp?: string | null;
  dstPort?: number | null;
  protocol?: string | null;
  username?: string | null;
  ruleName?: string | null;
  interfaceIn?: string | null;
  interfaceOut?: string | null;
  normalized: unknown;
};

export type FindingEvidence = {
  findingId: string;
  vendor: string;
  source: string;
  category: string;
  availability: "raw_events" | "stored_evidence" | "snapshot" | "unavailable";
  redacted: boolean;
  integrity: {
    exactReferencesOnly: boolean;
    referenceCount: number;
    resolvedReferenceCount: number;
    unresolvedReferenceCount: number;
  };
  profile?: Pick<VendorFindingProfile, "vendorId" | "vendorName" | "liveSources" | "snapshotSources"> | null;
  events: FindingEvidenceEvent[];
  storedEvidence: Array<{ id: string; message?: string; srcIp?: string; dstPort?: number; value?: unknown }>;
  snapshotEvidence: unknown;
};

export type AttackerEvidenceEvent = {
  id: string;
  timestamp: string;
  vendor?: string | null;
  sourceType?: string | null;
  eventType: string;
  severity?: string | null;
  action?: string | null;
  srcPort?: number | null;
  dstIp?: string | null;
  dstPort?: number | null;
  protocol?: string | null;
  username?: string | null;
  ruleName?: string | null;
  interfaceIn?: string | null;
  interfaceOut?: string | null;
  count: number;
  message: string;
  device?: { id: string; name: string; vendor: string; host: string; type: string } | null;
  asset?: { id: string; name: string; managementIp: string | null } | null;
};

export type AttackerSummary = {
  ip: string;
  ipVersion: number;
  scope: "public" | "private" | "loopback" | "link_local";
  riskScore: number;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
  status: string;
  firstSeen: string;
  lastSeen: string;
  findingCount: number;
  observationCount: number;
  eventCount: number;
  vendors: string[];
  devices: Array<{ id: string; name: string; vendor: string; host: string; type: string }>;
  assets: Array<{ id: string; name: string; managementIp: string | null; healthState: string }>;
  categories: string[];
  sources: string[];
  actions: string[];
  protocols: string[];
  targetedIps: string[];
  targetedPorts: number[];
  usernames: string[];
  eventTypes: string[];
  mitreTags: string[];
  assessment: {
    verdict: "confirmed_threat" | "likely_attack" | "needs_review" | "activity_anomaly";
    isConfirmedAttacker: boolean;
    containmentStatus: "blocked_by_vendor" | "detected_not_confirmed_blocked" | "not_contained";
    primaryReason: string;
    actionableFindingCount: number;
    informationalFindingCount: number;
    logicalAuthenticationFailures: number;
    authenticationSuccesses: number;
    normalSessionEvents: number;
    notes: string[];
  };
  attackFamilies: Array<{ key: string; title: string; severity: string; count: number; blocked: boolean }>;
  responseReadiness: Array<{
    deviceId: string;
    deviceName: string;
    vendor: string;
    findingId: string | null;
    mode: "ready" | "needs_parameters" | "review_only";
    missingParameters: string[];
    interfaceIn: string | null;
    interfaceOut: string | null;
  }>;
  latestEvidence: AttackerEvidenceEvent[];
  enrichment: { status: "local_telemetry_only"; geo: null; asn: null; networkOwner: null };
};

export type AttackerDetails = AttackerSummary & {
  findings: Array<{
    id: string;
    title: string;
    summary: string;
    severity: string;
    category: string;
    status: string;
    confidence: number;
    source: string;
    vendor: string;
    firstSeen: string;
    lastSeen: string;
    count: number;
    mitreTags: string[];
    evidence: unknown;
    device: { id: string; name: string; vendor: string; host: string; type: string };
    asset?: { id: string; name: string; managementIp: string | null; healthState: string } | null;
  }>;
};

export type AttackerListResponse = {
  generatedAt: string;
  qualification: string;
  summary: { total: number; critical: number; high: number; public: number; private: number; affectedDevices: number; affectedAssets: number; vendors: string[]; confirmed: number; contained: number; fortigate: number; linux: number };
  coverage: { findingsScanned: number; eventsScanned: number; findingLimitReached: boolean; eventSampleLimitReached: boolean; enrichment: string };
  attackers: AttackerSummary[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
    ...init
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : {};
  if (!response.ok) {
    const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const nested = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
    throw new Error(String(nested.message ?? body.messageFa ?? body.detail ?? body.reasonCode ?? body.error ?? `Request failed: ${response.status}`));
  }
  return payload as T;
}

export const listPlatformAssets = (view: "active" | "archived" | "all" = "active", companyId?: string) => request<{ assets: PlatformAsset[]; summary: Record<string, unknown> }>(`/assets?view=${encodeURIComponent(view)}${companyId ? `&companyId=${encodeURIComponent(companyId)}` : ""}`);
export const getPlatformAsset = (id: string) => request<PlatformAsset>(`/assets/${id}`);
export const removePlatformAsset = (id: string) => request<{ ok: boolean; assetId: string; deviceId?: string | null; inventoryStatus: string; visibleInActiveInventory: boolean }>(`/assets/${id}`, { method: "DELETE" });
export const previewAssetImport = (body: Record<string, unknown>) => request<Record<string, unknown>>("/assets/import/preview", { method: "POST", body: JSON.stringify(body) });
export const applyAssetImport = (body: Record<string, unknown>) => request<Record<string, unknown>>("/assets/import/apply", { method: "POST", body: JSON.stringify(body) });
export const netboxPreview = () => request<Record<string, unknown>>("/integrations/netbox/sync-preview");
export const netboxSync = () => request<Record<string, unknown>>("/integrations/netbox/sync", { method: "POST", body: JSON.stringify({ idempotencyKey: "ui-netbox-sync" }) });
export const wazuhPreview = () => request<Record<string, unknown>>("/integrations/wazuh/sync-preview");
export const wazuhSync = () => request<Record<string, unknown>>("/integrations/wazuh/sync", { method: "POST", body: JSON.stringify({ idempotencyKey: "ui-wazuh-sync" }) });
export const listSecurityFindings = (filters: { vendor?: string; deviceId?: string; status?: string } = {}) => {
  const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return request<{ findings: SecurityFinding[] }>(`/security/findings${query.size ? `?${query}` : ""}`);
};
export const listVendorFindingProfiles = () => request<{ profiles: VendorFindingProfile[] }>("/security/vendor-profiles");
export const getFindingEvidence = (id: string) => request<FindingEvidence>(`/security/findings/${id}/evidence`);
export const listDetectionRules = () => request<{ rules: DetectionRule[] }>("/security/rules");
export const setDetectionRuleEnabled = (id: string, enabled: boolean) => request<DetectionRule>(`/security/rules/${id}/${enabled ? "enable" : "disable"}`, { method: "POST" });
export const runSecurityDetections = () => request<{ rulesEvaluated: number; eventsEvaluated: number; findingsCreated: number; findingsUpdated: number }>("/security/detections/run", { method: "POST", body: JSON.stringify({}) });
export const getSecurityMonitoringStatus = () => request<SecurityMonitoringStatus>("/security/monitoring/status");
export const getSecurityEmailAlertSettings = () => request<SecurityEmailAlertSettings>("/security/alerts/email");
export const updateSecurityEmailAlertSettings = (body: { recipientEmails: string[]; enabled: boolean; minimumSeverity: string }) => request<SecurityEmailAlertSettings>("/security/alerts/email", { method: "PUT", body: JSON.stringify(body) });
export const connectGmailSecuritySender = (body: { senderEmail: string; appPassword: string }) => request<SecurityEmailAlertSettings>("/security/alerts/email/gmail", { method: "PUT", body: JSON.stringify(body) });
export const disconnectGmailSecuritySender = () => request<SecurityEmailAlertSettings>("/security/alerts/email/gmail", { method: "DELETE" });
export const testSecurityEmailAlert = () => request<{ ok: boolean }>("/security/alerts/email/test", { method: "POST", body: JSON.stringify({}) });
export const testSecurityVendorEmails = () => request<{ ok: boolean; sent: number; failed: number; results: Array<{ vendor: string; status: "sent" | "failed"; ruleName?: string; errorCode?: string }> }>("/security/alerts/email/test-vendors", { method: "POST", body: JSON.stringify({}) });
export const createFindingActionPlan = (id: string) => request<{ actionPlan: { id: string; status: string; parametersJson: Record<string, unknown> } }>(`/security/findings/${id}/action-plan`, { method: "POST" });
export const updateFindingStatus = (id: string, status: string) => request<SecurityFinding>(`/security/findings/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
export const listAttackers = (filters: { query?: string; vendor?: string; deviceId?: string; severity?: string; scope?: string; includeResolved?: boolean } = {}) => {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== false) query.set(key, String(value));
  });
  return request<AttackerListResponse>(`/security/attackers${query.size ? `?${query}` : ""}`);
};
export const getAttackerDetails = (ip: string, includeResolved = false) => request<{ generatedAt: string; qualification: string; attacker: AttackerDetails }>(`/security/attackers/${encodeURIComponent(ip)}${includeResolved ? "?includeResolved=true" : ""}`);
