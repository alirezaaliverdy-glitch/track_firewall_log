const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type ActionPlanSource = "ai" | "user" | "system" | "detection";
export type ActionPlanStatus =
  | "proposed"
  | "validation_failed"
  | "dry_run_ready"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "executing"
  | "succeeded"
  | "failed"
  | "rolled_back";

export type ActionType =
  | "create_egress_policy"
  | "update_policy_schedule"
  | "block_source_ip_temporary"
  | "unblock_source_ip"
  | "open_port"
  | "close_port"
  | "change_ssh_port"
  | "create_address_object"
  | "create_schedule_object"
  | "create_service_object"
  | "add_firewall_rule"
  | "remove_firewall_rule"
  | "enable_rule"
  | "disable_rule"
  | "mikrotik_add_address_list_entry"
  | "mikrotik_remove_address_list_entry"
  | "mikrotik_block_ip_temporary"
  | "mikrotik_create_managed_drop_rule"
  | "mikrotik_enable_managed_rule"
  | "mikrotik_disable_managed_rule"
  | "mikrotik_add_comment_to_rule"
  | "mikrotik_read_firewall_summary"
  | "mikrotik_create_filter_rule"
  | "mikrotik_enable_filter_rule"
  | "mikrotik_disable_filter_rule"
  | "mikrotik_move_filter_rule"
  | "mikrotik_set_filter_rule_comment"
  | "mikrotik_remove_managed_filter_rule"
  | "mikrotik_list_filter_rules"
  | "mikrotik_search_filter_rules"
  | "mikrotik_create_dstnat_rule"
  | "mikrotik_create_srcnat_masquerade_rule"
  | "mikrotik_enable_nat_rule"
  | "mikrotik_disable_nat_rule"
  | "mikrotik_set_nat_rule_comment"
  | "mikrotik_remove_managed_nat_rule"
  | "mikrotik_list_nat_rules"
  | "mikrotik_unblock_ip"
  | "mikrotik_list_address_list"
  | "mikrotik_create_managed_blocklist_rule"
  | "mikrotik_list_ip_services"
  | "mikrotik_disable_unused_service"
  | "mikrotik_restrict_service_by_address"
  | "mikrotik_change_service_port"
  | "mikrotik_enable_service"
  | "mikrotik_disable_service"
  | "mikrotik_list_interfaces"
  | "mikrotik_enable_interface"
  | "mikrotik_disable_interface"
  | "mikrotik_set_interface_comment"
  | "mikrotik_detect_wan_lan_candidates"
  | "mikrotik_list_routes"
  | "mikrotik_add_static_route"
  | "mikrotik_disable_static_route"
  | "mikrotik_remove_managed_static_route"
  | "mikrotik_show_dns_settings"
  | "mikrotik_set_dns_servers"
  | "mikrotik_list_dhcp_servers"
  | "mikrotik_list_dhcp_leases"
  | "mikrotik_add_static_dhcp_lease"
  | "mikrotik_remove_static_dhcp_lease"
  | "mikrotik_create_backup"
  | "mikrotik_create_export_sanitized"
  | "mikrotik_set_identity"
  | "mikrotik_show_clock"
  | "mikrotik_show_logs"
  | "mikrotik_show_resources"
  | "mikrotik_reboot"
  | "mikrotik_schedule_reboot"
  | "mikrotik_disable_rule_by_id"
  | "mikrotik_remove_rule_by_id";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ActionPlan = {
  id: string;
  source: ActionPlanSource;
  requestedBy: string | null;
  deviceId: string | null;
  aiIntentId: string | null;
  actionType: ActionType | string;
  status: ActionPlanStatus | string;
  riskLevel: RiskLevel | string;
  parametersJson: Record<string, unknown>;
  validationJson: Record<string, unknown>;
  dryRunJson: Record<string, unknown>;
  approvalJson: Record<string, unknown>;
  resultJson: Record<string, unknown>;
  rollbackJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  device?: { id: string; name: string; type?: string; host?: string } | null;
  aiIntent?: { id: string; intentType: string; status: string; riskLevel: string } | null;
  approvals?: Array<Record<string, unknown>>;
};

export type ActionAuditEntry = {
  id: string;
  actionPlanId: string;
  deviceId: string | null;
  eventType: string;
  message: string;
  metadataJson: Record<string, unknown>;
  createdAt: string;
};

export type ProposeActionInput = {
  aiIntentId?: string;
  source?: ActionPlanSource;
  requestedBy?: string;
  deviceId?: string;
  actionType?: ActionType | string;
  riskLevel?: RiskLevel | string;
  parametersJson?: Record<string, unknown>;
};

export type ApprovalInput = {
  approvedBy?: string;
  reason?: string;
};

export const normalizeArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)) {
    return (value as { items: T[] }).items;
  }
  if (value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: T[] }).data;
  }
  return [];
};

export const normalizeObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function parsePayload(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function apiErrorMessage(url: string, status: number, payload: unknown) {
  const body = normalizeObject(payload);
  const detail = typeof body.error === "string"
    ? `${body.error}${typeof body.detail === "string" ? `: ${body.detail}` : ""}`
    : typeof body.message === "string"
      ? body.message
      : "No response details were provided.";
  return `Action API error ${status}: ${detail} [${url}]`;
}

async function requestJson<T>(path: string, init?: RequestInit, options?: { allowConflict?: boolean }): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
      ...init,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed.";
    throw new Error(`Action API network error: ${message} [${url}]`);
  }

  const payload = parsePayload(await response.text());
  if (!response.ok && !(options?.allowConflict && response.status === 409)) {
    throw new Error(apiErrorMessage(url, response.status, payload));
  }
  return payload as T;
}

export function normalizeActionPlan(value: unknown): ActionPlan {
  const source = normalizeObject(value);
  return {
    id: String(source.id ?? ""),
    source: String(source.source ?? "user") as ActionPlanSource,
    requestedBy: typeof source.requestedBy === "string" ? source.requestedBy : null,
    deviceId: typeof source.deviceId === "string" ? source.deviceId : null,
    aiIntentId: typeof source.aiIntentId === "string" ? source.aiIntentId : null,
    actionType: String(source.actionType ?? "unknown"),
    status: String(source.status ?? "proposed"),
    riskLevel: String(source.riskLevel ?? "medium"),
    parametersJson: normalizeObject(source.parametersJson),
    validationJson: normalizeObject(source.validationJson),
    dryRunJson: normalizeObject(source.dryRunJson),
    approvalJson: normalizeObject(source.approvalJson),
    resultJson: normalizeObject(source.resultJson),
    rollbackJson: normalizeObject(source.rollbackJson),
    createdAt: String(source.createdAt ?? ""),
    updatedAt: String(source.updatedAt ?? ""),
    device: source.device ? normalizeObject(source.device) as ActionPlan["device"] : null,
    aiIntent: source.aiIntent ? normalizeObject(source.aiIntent) as ActionPlan["aiIntent"] : null,
    approvals: normalizeArray<Record<string, unknown>>(source.approvals),
  };
}

export function normalizeActionAuditEntry(value: unknown): ActionAuditEntry {
  const source = normalizeObject(value);
  return {
    id: String(source.id ?? ""),
    actionPlanId: String(source.actionPlanId ?? ""),
    deviceId: typeof source.deviceId === "string" ? source.deviceId : null,
    eventType: String(source.eventType ?? "action.event"),
    message: String(source.message ?? ""),
    metadataJson: normalizeObject(source.metadataJson),
    createdAt: String(source.createdAt ?? ""),
  };
}

export async function proposeAction(input: ProposeActionInput) {
  return requestJson<unknown>("/actions/propose", {
    method: "POST",
    body: JSON.stringify(input),
  }).then(normalizeActionPlan);
}

export async function getActions() {
  const payload = await requestJson<unknown>("/actions");
  const source = normalizeObject(payload);
  return normalizeArray<unknown>(Array.isArray(payload) ? payload : source.actions).map(normalizeActionPlan);
}

export async function getAction(id: string) {
  return requestJson<unknown>(`/actions/${id}`).then(normalizeActionPlan);
}

export async function validateAction(id: string) {
  return requestJson<unknown>(`/actions/${id}/validate`, { method: "POST" }).then(normalizeActionPlan);
}

export async function dryRunAction(id: string) {
  return requestJson<unknown>(`/actions/${id}/dry-run`, { method: "POST" }).then(normalizeActionPlan);
}

export async function approveAction(id: string, input: ApprovalInput = {}) {
  return requestJson<unknown>(`/actions/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(input),
  }).then(normalizeActionPlan);
}

export async function rejectAction(id: string, input: ApprovalInput = {}) {
  return requestJson<unknown>(`/actions/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(input),
  }).then(normalizeActionPlan);
}

export async function executeAction(id: string) {
  return requestJson<unknown>(`/actions/${id}/execute`, { method: "POST" }).then(normalizeActionPlan);
}

export async function getActionAudit(id: string) {
  const payload = await requestJson<unknown>(`/actions/${id}/audit`);
  const source = normalizeObject(payload);
  return normalizeArray<unknown>(Array.isArray(payload) ? payload : source.audit).map(normalizeActionAuditEntry);
}
