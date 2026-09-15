export type DashboardWorkflowPlanInput = {
  status: string;
  resultJson?: unknown;
  riskLevel?: string | null;
  actionType?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  device?: { vendor?: string | null; type?: string | null } | null;
};

export type DashboardWorkflowDeviceInput = {
  vendor?: string | null;
  type?: string | null;
  capabilities?: unknown;
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

const VENDOR_LABELS: Record<string, string> = {
  cisco: "Cisco",
  mikrotik: "MikroTik",
  fortigate: "FortiGate",
  linux: "Linux",
  generic: "Generic"
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function timestamp(value: Date | string | null | undefined) {
  const text = iso(value);
  return text ? new Date(text).getTime() : 0;
}

export function dashboardConnectorInvoked(plan: Pick<DashboardWorkflowPlanInput, "resultJson">) {
  return object(plan.resultJson).connectorInvoked === true;
}

export function workflowBucket(plan: DashboardWorkflowPlanInput): keyof DashboardWorkflowSummary {
  if (plan.status === "proposed") return "draft";
  if (plan.status === "validation_failed") return "needsInput";
  if (plan.status === "dry_run_ready" || plan.status === "awaiting_approval") return "readyForReview";
  if (plan.status === "approved") return "approved";
  if (plan.status === "executing") return "running";
  if (plan.status === "succeeded") return dashboardConnectorInvoked(plan) ? "succeeded" : "failed";
  if (plan.status === "failed") return "failed";
  return "cancelled";
}

export function summarizeWorkflowPlans(plans: DashboardWorkflowPlanInput[]): DashboardWorkflowSummary {
  const summary: DashboardWorkflowSummary = { draft: 0, needsInput: 0, readyForReview: 0, approved: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 };
  for (const plan of plans) summary[workflowBucket(plan)] += 1;
  return summary;
}

export function normalizeDashboardVendor(value: unknown) {
  const token = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (token.includes("cisco") || token.includes("iosxe") || token.includes("iosclassic")) return "cisco";
  if (token.includes("mikrotik") || token.includes("routeros")) return "mikrotik";
  if (token.includes("fortigate") || token.includes("fortinet") || token.includes("fortios")) return "fortigate";
  if (token.includes("linux") || token.includes("ubuntu")) return "linux";
  return "generic";
}

export function dashboardVendorPath(vendor: string) {
  if (vendor === "linux") return "/monitoring/linux";
  if (vendor === "generic") return "/assets/vendors";
  return `/assets/vendors/${vendor}`;
}

export function dashboardDeviceVerified(device: DashboardWorkflowDeviceInput) {
  const capabilities = object(device.capabilities);
  const onboarding = object(capabilities.onboarding);
  return capabilities.verified === true || onboarding.verifiedAt !== undefined;
}

export function buildVendorWorkflowHealth(input: { devices: DashboardWorkflowDeviceInput[]; plans: DashboardWorkflowPlanInput[] }) {
  const rows = new Map<string, DashboardVendorWorkflowHealth>();
  const ensure = (vendor: string) => {
    const key = normalizeDashboardVendor(vendor);
    const existing = rows.get(key);
    if (existing) return existing;
    const next: DashboardVendorWorkflowHealth = {
      vendor: key,
      label: VENDOR_LABELS[key] ?? key,
      path: dashboardVendorPath(key),
      registeredDevices: 0,
      unverifiedDevices: 0,
      pendingApprovals: 0,
      runningActions: 0,
      failedActions: 0,
      successfulActions: 0,
      lastActivityAt: null,
      attentionScore: 0
    };
    rows.set(key, next);
    return next;
  };

  ["cisco", "mikrotik", "fortigate", "linux"].forEach(ensure);

  for (const device of input.devices) {
    const row = ensure(device.vendor || device.type || "generic");
    row.registeredDevices += 1;
    if (!dashboardDeviceVerified(device)) row.unverifiedDevices += 1;
  }

  for (const plan of input.plans) {
    const row = ensure(plan.device?.vendor || plan.device?.type || "generic");
    const bucket = workflowBucket(plan);
    if (bucket === "readyForReview" || bucket === "approved") row.pendingApprovals += 1;
    if (bucket === "running") row.runningActions += 1;
    if (bucket === "failed") row.failedActions += 1;
    if (bucket === "succeeded") row.successfulActions += 1;
    const latest = Math.max(timestamp(row.lastActivityAt), timestamp(plan.updatedAt ?? plan.createdAt));
    row.lastActivityAt = latest ? new Date(latest).toISOString() : row.lastActivityAt;
  }

  for (const row of rows.values()) {
    row.attentionScore = row.failedActions * 4 + row.runningActions * 2 + row.pendingApprovals * 2 + row.unverifiedDevices;
  }

  return [...rows.values()].sort((a, b) => b.attentionScore - a.attentionScore || a.label.localeCompare(b.label));
}
