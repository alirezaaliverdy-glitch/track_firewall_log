const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/firewall-api").replace(/\/$/, "");

export type ActionPlanSource = "ai" | "user" | "system" | "detection";
export type ActionPlanStatus =
  | "proposed"
  | "needs_input"
  | "validation_failed"
  | "awaiting_approval"
  | "dry_run_ready"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked"
  | "rollback_needed"
  | "rolled_back"
  // Backend legacy/persisted states kept for compatibility until the status lifecycle is refactored.
  | "approved"
  | "rejected"
  | "executing";

export const ACTION_PLAN_STATUS_LABELS: Record<string, string> = {
  proposed: "proposed",
  needs_input: "needs input",
  validation_failed: "validation failed",
  awaiting_approval: "awaiting approval",
  dry_run_ready: "dry run ready",
  running: "running",
  executing: "running",
  succeeded: "succeeded",
  failed: "failed",
  blocked: "blocked",
  rollback_needed: "rollback needed",
  rolled_back: "rolled back",
  approved: "approved",
  rejected: "rejected"
};

export function actionPlanStatusLabel(status: string) {
  return ACTION_PLAN_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export type ActionType =
  | "custom_vendor_action"
  | "generic_security_action"
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
  | "mikrotik_update_address_list_entry"
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
  | "mikrotik_remove_rule_by_id"
  | "fortigate_create_address_object"
  | "fortigate_update_address_object"
  | "fortigate_delete_managed_address_object"
  | "fortigate_create_address_group"
  | "fortigate_add_member_to_address_group"
  | "fortigate_remove_member_from_address_group"
  | "fortigate_create_service_object"
  | "fortigate_update_service_object"
  | "fortigate_create_service_group"
  | "fortigate_create_recurring_schedule"
  | "fortigate_update_schedule"
  | "fortigate_create_egress_policy"
  | "fortigate_create_deny_policy"
  | "fortigate_enable_policy"
  | "fortigate_disable_policy"
  | "fortigate_move_policy"
  | "fortigate_update_policy_comment"
  | "fortigate_delete_managed_policy"
  | "fortigate_create_vip"
  | "fortigate_create_vip_group"
  | "fortigate_create_dstnat_policy"
  | "fortigate_create_snat_policy"
  | "fortigate_list_admins"
  | "fortigate_restrict_admin_trusthost"
  | "fortigate_change_admin_port"
  | "fortigate_disable_unused_admin_service"
  | "fortigate_backup_config"
  | "fortigate_export_sanitized_config"
  | "fortigate_show_logs"
  | "fortigate_show_sessions"
  | "fortigate_create_zone"
  | "fortigate_add_interface_to_zone"
  | "fortigate_remove_interface_from_zone"
  | "fortigate_delete_managed_zone"
  | "fortigate_list_zones"
  | "fortigate_set_interface_alias"
  | "fortigate_set_interface_role"
  | "fortigate_enable_interface"
  | "fortigate_disable_interface"
  | "fortigate_create_vlan_interface"
  | "fortigate_update_interface_ip"
  | "fortigate_create_tcp_service"
  | "fortigate_create_udp_service"
  | "fortigate_create_tcp_udp_service"
  | "fortigate_update_service_ports"
  | "fortigate_delete_managed_service"
  | "fortigate_add_service_to_group"
  | "fortigate_remove_service_from_group"
  | "fortigate_create_policy"
  | "fortigate_create_zone_policy"
  | "fortigate_update_policy"
  | "linux_check_service_status"
  | "linux_list_running_services"
  | "linux_list_failed_services"
  | "linux_check_important_services"
  | "linux_daily_check"
  | "mikrotik_daily_check"
  | "mikrotik_show_logs"
  | "mikrotik_list_ip_services"
  | "linux_open_port"
  | "close_port";

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
  device?: { id: string; name: string; vendor?: string; type?: string; host?: string; protocol?: string; credentialId?: string | null; credentialRef?: string | null } | null;
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
  approvalConfirmation?: string;
  breakGlass?: boolean;
};

export type StructuredValidationError = {
  field: string;
  message: string;
  expectedFormat: string;
  currentValue: unknown;
};

export { actionExecutionUiState } from "./actionApprovalState";

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
      credentials: "include",
      headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
      ...init,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed.";
    throw new Error(`Action API network error: ${message} [${url}]`);
  }

  const payload = parsePayload(await response.text());
  if (!response.ok && !(options?.allowConflict && response.status === 409)) {
    const error = new Error(apiErrorMessage(url, response.status, payload)) as QuickExecuteError;
    const body = normalizeObject(payload);
    if (body.plan) error.plan = normalizeActionPlan(body.plan);
    throw error;
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

export type QuickExecuteError = Error & { plan?: ActionPlan };

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

export async function correctActionFields(id: string, fields: Record<string, unknown>) {
  return requestJson<unknown>(`/actions/${id}/parameters`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  }).then(normalizeActionPlan);
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

export async function executeAction(id: string, input: Record<string, unknown> = {}) {
  return requestJson<unknown>(`/actions/${id}/execute`, {
    method: "POST",
    body: JSON.stringify(input),
  }).then(normalizeActionPlan);
}

export async function quickExecuteAction(id: string, input: Record<string, unknown> = {}) {
  return requestJson<unknown>(`/actions/${id}/quick-execute`, {
    method: "POST",
    body: JSON.stringify(input),
  }).then(normalizeActionPlan);
}

export async function getActionAudit(id: string) {
  const payload = await requestJson<unknown>(`/actions/${id}/audit`);
  const source = normalizeObject(payload);
  return normalizeArray<unknown>(Array.isArray(payload) ? payload : source.audit).map(normalizeActionAuditEntry);
}
