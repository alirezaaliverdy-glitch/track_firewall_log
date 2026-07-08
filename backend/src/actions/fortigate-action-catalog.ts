import { ActionType, AiRiskLevel, type ActionPlan } from "@prisma/client";
import { compileFortiGateAction, type FortiGateCommandSpec } from "../services/fortigate-command-compiler.js";

export type FortiGateValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedParameters: Record<string, unknown>;
  riskLevel: AiRiskLevel;
  commandSpecs: FortiGateCommandSpec[];
  rollbackJson: Record<string, unknown>;
};

const FORTIGATE_ACTIONS = new Set<ActionType>([
  ActionType.fortigate_create_address_object,
  ActionType.fortigate_update_address_object,
  ActionType.fortigate_delete_managed_address_object,
  ActionType.fortigate_create_address_group,
  ActionType.fortigate_add_member_to_address_group,
  ActionType.fortigate_remove_member_from_address_group,
  ActionType.fortigate_create_service_object,
  ActionType.fortigate_update_service_object,
  ActionType.fortigate_create_service_group,
  ActionType.fortigate_create_recurring_schedule,
  ActionType.fortigate_update_schedule,
  ActionType.fortigate_create_egress_policy,
  ActionType.fortigate_create_deny_policy,
  ActionType.fortigate_enable_policy,
  ActionType.fortigate_disable_policy,
  ActionType.fortigate_move_policy,
  ActionType.fortigate_update_policy_comment,
  ActionType.fortigate_delete_managed_policy,
  ActionType.fortigate_create_vip,
  ActionType.fortigate_create_vip_group,
  ActionType.fortigate_create_dstnat_policy,
  ActionType.fortigate_create_snat_policy,
  ActionType.fortigate_list_admins,
  ActionType.fortigate_restrict_admin_trusthost,
  ActionType.fortigate_change_admin_port,
  ActionType.fortigate_disable_unused_admin_service,
  ActionType.fortigate_backup_config,
  ActionType.fortigate_export_sanitized_config,
  ActionType.fortigate_show_logs,
  ActionType.fortigate_show_sessions,
  ActionType.fortigate_create_zone,
  ActionType.fortigate_add_interface_to_zone,
  ActionType.fortigate_remove_interface_from_zone,
  ActionType.fortigate_delete_managed_zone,
  ActionType.fortigate_list_zones,
  ActionType.fortigate_set_interface_alias,
  ActionType.fortigate_set_interface_role,
  ActionType.fortigate_enable_interface,
  ActionType.fortigate_disable_interface,
  ActionType.fortigate_create_vlan_interface,
  ActionType.fortigate_update_interface_ip,
  ActionType.fortigate_create_tcp_service,
  ActionType.fortigate_create_udp_service,
  ActionType.fortigate_create_tcp_udp_service,
  ActionType.fortigate_update_service_ports,
  ActionType.fortigate_delete_managed_service,
  ActionType.fortigate_add_service_to_group,
  ActionType.fortigate_remove_service_from_group,
  ActionType.fortigate_create_policy,
  ActionType.fortigate_create_zone_policy,
  ActionType.fortigate_update_policy,
  ActionType.fortigate_create_static_route,
  ActionType.fortigate_list_interfaces,
  ActionType.fortigate_list_policies,
  ActionType.fortigate_list_address_objects,
  ActionType.fortigate_list_routes,
  ActionType.fortigate_daily_check
  ,ActionType.fortigate_show_interfaces
  ,ActionType.fortigate_route_dns_check
  ,ActionType.fortigate_license_status
  ,ActionType.fortigate_admin_users
  ,ActionType.fortigate_show_system_status
  ,ActionType.fortigate_show_routing_dns
  ,ActionType.fortigate_show_admin_access
  ,ActionType.fortigate_show_firewall_policies
  ,ActionType.fortigate_show_vpn_status
  ,ActionType.fortigate_show_ha_vdom_zone
]);

export function isFortiGateAction(actionType: ActionType) {
  return FORTIGATE_ACTIONS.has(actionType);
}

export function fortiGateSupportedActions() {
  return Array.from(FORTIGATE_ACTIONS);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function validateFortiGateAction(plan: Pick<ActionPlan, "actionType" | "riskLevel"> & { parametersJson: unknown }): FortiGateValidation {
  const parameters = asObject(plan.parametersJson);
  if (!FORTIGATE_ACTIONS.has(plan.actionType)) {
    return { valid: false, errors: ["Action type is not in the FortiGate catalog."], warnings: [], normalizedParameters: {}, riskLevel: plan.riskLevel, commandSpecs: [], rollbackJson: { type: "none" } };
  }
  try {
    const compiled = compileFortiGateAction({ actionType: plan.actionType, parameters, riskLevel: plan.riskLevel });
    return {
      valid: true,
      errors: [],
      warnings: compiled.warnings,
      normalizedParameters: compiled.normalizedParameters,
      riskLevel: compiled.riskLevel,
      commandSpecs: compiled.commandSpecs,
      rollbackJson: compiled.rollbackJson
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : "FortiGate action is invalid."],
      warnings: [],
      normalizedParameters: {},
      riskLevel: plan.riskLevel,
      commandSpecs: [],
      rollbackJson: { type: "manual_review" }
    };
  }
}
