const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type DashboardDeviceRef = { id: string; name: string; vendor: string; host: string } | null;
export type DashboardActionItem = {
  id: string;
  title: string;
  actionType: string;
  status: string;
  outcome: string;
  riskLevel: string;
  source: string;
  device: DashboardDeviceRef;
  catalogCommandId: string | null;
  connectorInvoked: boolean;
  readOnly: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  resultPath: string;
  actionCenterPath: string;
};
export type DashboardDeviceRegistration = {
  id: string;
  name: string;
  vendor: string;
  platform: string;
  host: string;
  status: string;
  verified: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  path: string;
};
export type DashboardConfigurationChange = {
  id: string;
  title: string;
  source: string;
  status: string;
  actionType: string;
  device: DashboardDeviceRef;
  timestamp: string | null;
  path: string;
};
export type DashboardWorkflowSummary = {
  draft: number;
  needsInput: number;
  readyForReview: number;
  approved: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
};
export type DashboardVendorWorkflowHealth = {
  vendor: string;
  label: string;
  path: string;
  registeredDevices: number;
  unverifiedDevices: number;
  pendingApprovals: number;
  runningActions: number;
  failedActions: number;
  successfulActions: number;
  lastActivityAt: string | null;
  attentionScore: number;
};
export type OperationalDashboardActivity = {
  generatedAt: string;
  summary: {
    activeDevices: number;
    recentExecutions: number;
    successfulActions: number;
    failedActions: number;
    pendingApprovals: number;
    recentDeviceRegistrations: number;
    latestConfigurationChanges: number;
    runningWorkflows?: number;
    blockedWorkflows?: number;
    readyWorkflows?: number;
  };
  workflowSummary?: DashboardWorkflowSummary;
  vendorWorkflowHealth?: DashboardVendorWorkflowHealth[];
  recentExecutions: DashboardActionItem[];
  successfulActions: DashboardActionItem[];
  failedActions: DashboardActionItem[];
  pendingApprovals: DashboardActionItem[];
  recentDeviceRegistrations: DashboardDeviceRegistration[];
  latestConfigurationChanges: DashboardConfigurationChange[];
};

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : {};
  if (!response.ok) {
    const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const nested = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
    throw new Error(String(nested.message ?? body.error ?? `Request failed: ${response.status}`));
  }
  return payload as T;
}

export function getOperationalDashboardActivity() {
  return request<OperationalDashboardActivity>("/dashboard/activity");
}
