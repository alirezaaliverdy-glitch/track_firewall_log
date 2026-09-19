import { ActionType } from "@prisma/client";
import { getDeviceConnectors, getVendorPlanners } from "../../connectors/connector-registry.service.js";
import type { CommandCatalogItem, SupportState } from "./types.js";
import { getExecutionTemplate } from "../execution/execution-template-registry.js";
import { executableCiscoOperations } from "../../cisco/cisco-operation-registry.js";

export type SupportCheck = "input_schema" | "template" | "connector" | "semantic_result_parser" | "precheck" | "post_verification";

export type SupportStateEvaluation = {
  supportState: SupportState;
  reason: string;
  reasonKey: string;
  missing: SupportCheck[];
};

const VERIFIED_RESULT_PARSERS = new Set<string>([
  "linux_daily_check",
  "linux_open_port",
  "close_port",
  "linux_list_open_ports",
  "linux_check_ssh_status",
  "linux_check_failed_logins",
  "linux_check_sudo_users",
  "linux_check_firewall_status",
  "linux_check_fail2ban_status",
  "linux_block_ip",
  "linux_check_service_status",
  "linux_list_running_services",
  "linux_list_failed_services",
  "linux_check_important_services",
  "linux_remove_user_from_sudo",
  "linux_add_user_to_sudo",
  "linux_check_user_groups",
  "linux_lock_user",
  "linux_unlock_user",
  "linux_reboot",
  "linux_shutdown",
  "mikrotik_daily_check",
  "mikrotik_list_management_services",
  "mikrotik_list_filter_rules",
  "mikrotik_list_nat_rules",
  "mikrotik_check_login_logs",
  "mikrotik_block_ip",
  "mikrotik_create_backup",
  "mikrotik_enable_interface",
  "mikrotik_disable_interface",
  "mikrotik_set_interface_comment",
  "mikrotik_enable_service",
  "mikrotik_disable_service",
  "mikrotik_reboot",
  "mikrotik_shutdown",
  "fortigate_set_interface_alias",
  "fortigate_enable_interface",
  "fortigate_disable_interface",
  "fortigate_update_interface_ip",
  "fortigate_daily_check",
  "fortigate_show_interfaces",
  "fortigate_route_dns_check",
  "fortigate_license_status",
  "fortigate_admin_users",
  "fortigate_show_system_status",
  "fortigate_show_routing_dns",
  "fortigate_show_admin_access",
  "fortigate_show_firewall_policies",
  "fortigate_show_vpn_status",
  "fortigate_show_ha_vdom_zone",
  "fortigate_guided_vpn_setup",
  "fortigate_reboot",
  "fortigate_shutdown",
  "sophos_inventory",
  "sophos_enable_interface",
  "sophos_disable_interface",
  "sophos_set_interface_ipv4",
  "sophos_enable_firewall_rule",
  "sophos_disable_firewall_rule",
  ...executableCiscoOperations().map((operation) => operation.executionTemplateRef!)
]);

function connectorVendor(connectorType: string | null) {
  if (connectorType === "linux-ssh") return "linux_edge";
  if (connectorType === "fortigate-ssh") return "fortigate";
  if (connectorType === "mikrotik-ssh") return "mikrotik";
  if (connectorType === "cisco-ios-xe-ssh") return "cisco";
  if (connectorType === "sophos-api") return "sophos";
  return null;
}

function missingChecks(item: Pick<CommandCatalogItem, "actionType" | "connectorType" | "executionTemplateRef" | "requiredParams" | "validationRules" | "prechecks" | "verification">): SupportCheck[] {
  const missing: SupportCheck[] = [];
  const hasInputSchema = item.requiredParams.every((field) => Array.isArray(item.validationRules[field.key]) && item.validationRules[field.key].includes("required"));
  if (!hasInputSchema) missing.push("input_schema");

  const template = getExecutionTemplate(item.executionTemplateRef);
  if (!template || template.actionType !== item.actionType || template.connectorType !== item.connectorType) missing.push("template");

  const vendor = connectorVendor(item.connectorType);
  const connector = vendor ? getDeviceConnectors().find((candidate) => candidate.name === vendor) : null;
  const planner = vendor ? getVendorPlanners().find((candidate) => candidate.vendor === vendor) : null;
  const actionType = item.actionType as ActionType;
  if (!connector?.supportedActions.includes(actionType) || !planner?.supportedActions.includes(actionType)) missing.push("connector");

  if (!VERIFIED_RESULT_PARSERS.has(item.actionType) && !VERIFIED_RESULT_PARSERS.has(item.executionTemplateRef ?? "")) missing.push("semantic_result_parser");
  if (!item.prechecks.length) missing.push("precheck");
  if (!item.verification.length) missing.push("post_verification");
  return missing;
}

export function evaluateCatalogSupportState(item: CommandCatalogItem): SupportStateEvaluation {
  if (item.implementationState === "manualOnly") {
    return { supportState: "manual_only", reason: "Manual review only; this action is never sent to SSH.", reasonKey: "support.reason.manualOnly", missing: [] };
  }
  if (item.implementationState === "planned" || item.implementationState === "unsupported") {
    return { supportState: "unsupported", reason: item.disabledReasonFa ?? "No verified implementation is available.", reasonKey: "support.reason.unsupported", missing: [] };
  }
  const missing = missingChecks(item);
  if (missing.length > 0) {
    return { supportState: "preview_only", reason: `Missing verified execution requirements: ${missing.join(", ")}.`, reasonKey: "support.reason.missingRequirements", missing };
  }
  return { supportState: "verified", reason: "Verified for controlled execution.", reasonKey: "support.reason.verified", missing: [] };
}

export function isVerifiedCatalogItem(item: CommandCatalogItem) {
  return item.supportState === "verified";
}
