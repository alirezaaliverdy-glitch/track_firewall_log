export type ExecutionTemplate = { id: string; actionType: string; connectorType: "linux-ssh" | "mikrotik-ssh"; handler: string };

const templates: ExecutionTemplate[] = [
  { id: "linux_open_port", actionType: "linux_open_port", connectorType: "linux-ssh", handler: "linuxEdgePlanner" },
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
  { id: "mikrotik_list_management_services", actionType: "mikrotik_list_management_services", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" },
  { id: "mikrotik_check_firewall_filter", actionType: "mikrotik_list_filter_rules", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" },
  { id: "mikrotik_check_nat_exposure", actionType: "mikrotik_list_nat_rules", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" },
  { id: "mikrotik_check_failed_logins", actionType: "mikrotik_check_login_logs", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" },
  { id: "mikrotik_block_ip", actionType: "mikrotik_block_ip", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" },
  { id: "mikrotik_backup_config", actionType: "mikrotik_create_backup", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" }
  ,{ id: "mikrotik_daily_check", actionType: "mikrotik_daily_check", connectorType: "mikrotik-ssh", handler: "routerosCommandCompiler" }
];

export const EXECUTION_TEMPLATE_REGISTRY = Object.freeze(Object.fromEntries(templates.map((template) => [template.id, template])) as Record<string, ExecutionTemplate>);
export function getExecutionTemplate(id: string | null) { return id ? EXECUTION_TEMPLATE_REGISTRY[id] : undefined; }
