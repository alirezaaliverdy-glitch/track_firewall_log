import { FORTIGATE_FULL_CONTROL_ACTION_TYPES } from "../../fortigate/full-control-registry.js";
import { executableCiscoOperations } from "../../cisco/cisco-operation-registry.js";

export type ExecutionTemplate = { id: string; actionType: string; connectorType: "linux-ssh" | "mikrotik-ssh" | "fortigate-ssh" | "cisco-ios-xe-ssh" | "sophos-api"; handler: string };

const templates: ExecutionTemplate[] = [
  { id: "linux_open_port", actionType: "linux_open_port", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_close_port", actionType: "close_port", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_list_open_ports", actionType: "linux_list_open_ports", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_check_ssh_status", actionType: "linux_check_ssh_status", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_check_failed_logins", actionType: "linux_check_failed_logins", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_check_sudo_users", actionType: "linux_check_sudo_users", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_check_firewall_status", actionType: "linux_check_firewall_status", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_check_fail2ban_status", actionType: "linux_check_fail2ban_status", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_block_ip", actionType: "linux_block_ip", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_check_service_status", actionType: "linux_check_service_status", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_list_running_services", actionType: "linux_list_running_services", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_list_failed_services", actionType: "linux_list_failed_services", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_check_important_services", actionType: "linux_check_important_services", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_remove_user_from_sudo", actionType: "linux_remove_user_from_sudo", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_add_user_to_sudo", actionType: "linux_add_user_to_sudo", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_check_user_groups", actionType: "linux_check_user_groups", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_lock_user", actionType: "linux_lock_user", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_unlock_user", actionType: "linux_unlock_user", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_daily_check", actionType: "linux_daily_check", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_reboot", actionType: "linux_reboot", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_shutdown", actionType: "linux_shutdown", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "linux_custom_connector_command", actionType: "custom_vendor_action", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
  { id: "mikrotik_list_management_services", actionType: "mikrotik_list_management_services", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" },
  { id: "mikrotik_check_firewall_filter", actionType: "mikrotik_list_filter_rules", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" },
  { id: "mikrotik_check_nat_exposure", actionType: "mikrotik_list_nat_rules", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" },
  { id: "mikrotik_check_failed_logins", actionType: "mikrotik_check_login_logs", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" },
  { id: "mikrotik_block_ip", actionType: "mikrotik_block_ip", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" },
  { id: "mikrotik_backup_config", actionType: "mikrotik_create_backup", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" }
  ,{ id: "mikrotik_daily_check", actionType: "mikrotik_daily_check", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" }
  ,{ id: "mikrotik_enable_interface", actionType: "mikrotik_enable_interface", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" }
  ,{ id: "mikrotik_disable_interface", actionType: "mikrotik_disable_interface", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" }
  ,{ id: "mikrotik_set_interface_comment", actionType: "mikrotik_set_interface_comment", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" }
  ,{ id: "mikrotik_enable_service", actionType: "mikrotik_enable_service", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" }
  ,{ id: "mikrotik_disable_service", actionType: "mikrotik_disable_service", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" }
  ,{ id: "mikrotik_reboot", actionType: "mikrotik_reboot", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" }
  ,{ id: "mikrotik_shutdown", actionType: "mikrotik_shutdown", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" }
  ,{ id: "mikrotik_custom_connector_command", actionType: "custom_vendor_action", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" }
  ,{ id: "fortigate_daily_check", actionType: "fortigate_daily_check", connectorType: "fortigate-ssh", handler: "fortigatePlanner" }
  ,{ id: "fortigate_show_interfaces", actionType: "fortigate_show_interfaces", connectorType: "fortigate-ssh", handler: "fortigatePlanner" }
  ,{ id: "fortigate_route_dns_check", actionType: "fortigate_route_dns_check", connectorType: "fortigate-ssh", handler: "fortigatePlanner" }
  ,{ id: "fortigate_license_status", actionType: "fortigate_license_status", connectorType: "fortigate-ssh", handler: "fortigatePlanner" }
  ,{ id: "fortigate_admin_users", actionType: "fortigate_admin_users", connectorType: "fortigate-ssh", handler: "fortigatePlanner" }
  ,{ id: "fortigate_show_system_status", actionType: "fortigate_show_system_status", connectorType: "fortigate-ssh", handler: "fortigatePlanner" }
  ,{ id: "fortigate_show_routing_dns", actionType: "fortigate_show_routing_dns", connectorType: "fortigate-ssh", handler: "fortigatePlanner" }
  ,{ id: "fortigate_show_admin_access", actionType: "fortigate_show_admin_access", connectorType: "fortigate-ssh", handler: "fortigatePlanner" }
  ,{ id: "fortigate_show_firewall_policies", actionType: "fortigate_show_firewall_policies", connectorType: "fortigate-ssh", handler: "fortigatePlanner" }
  ,{ id: "fortigate_show_vpn_status", actionType: "fortigate_show_vpn_status", connectorType: "fortigate-ssh", handler: "fortigatePlanner" }
  ,{ id: "fortigate_show_ha_vdom_zone", actionType: "fortigate_show_ha_vdom_zone", connectorType: "fortigate-ssh", handler: "fortigatePlanner" }
  ,{ id: "fortigate_guided_vpn_setup", actionType: "fortigate_guided_vpn_setup", connectorType: "fortigate-ssh", handler: "fortigatePlanner" }
  ,{ id: "fortigate_custom_connector_command", actionType: "custom_vendor_action", connectorType: "fortigate-ssh", handler: "fortigatePlanner" }
  ,{ id: "cisco_custom_connector_command", actionType: "custom_vendor_action", connectorType: "cisco-ios-xe-ssh", handler: "ciscoIosXePlanner" }
  ,...[
    "sophos_inventory", "sophos_enable_interface", "sophos_disable_interface", "sophos_set_interface_ipv4",
    "sophos_enable_firewall_rule", "sophos_disable_firewall_rule"
  ].map((id) => ({ id, actionType: "generic_security_action", connectorType: "sophos-api" as const, handler: "sophosPlanner" }))
  ,...executableCiscoOperations().map((operation) => ({ id: operation.executionTemplateRef!, actionType: "generic_security_action", connectorType: "cisco-ios-xe-ssh" as const, handler: "ciscoIosXePlanner" }))
  ,...FORTIGATE_FULL_CONTROL_ACTION_TYPES.map((actionType) => ({ id: actionType, actionType, connectorType: "fortigate-ssh" as const, handler: "fortigatePlanner" }))
];

export const EXECUTION_TEMPLATE_REGISTRY = Object.freeze(Object.fromEntries(templates.map((template) => [template.id, template])) as Record<string, ExecutionTemplate>);
export function getExecutionTemplate(id: string | null) { return id ? EXECUTION_TEMPLATE_REGISTRY[id] : undefined; }
