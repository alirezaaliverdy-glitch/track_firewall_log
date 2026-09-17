import { ActionType, DeviceType } from "@prisma/client";
import type { PlannerInput, VendorCommandPlan, VendorPlanner } from "../types.js";
import { customPlanFromParameters } from "../../ai/custom-action-plan.js";

const WARNING_PORTS = new Set([22, 80, 443, 8080, 4000, 4050, 50]);
const READ_ACTIONS = new Map<ActionType, string>([
  [ActionType.linux_read_hostname, "hostname"],
  [ActionType.linux_read_interfaces, "ip -brief address"],
  [ActionType.linux_read_routes, "ip route show"],
  [ActionType.linux_list_open_ports, "ss -lntup"],
  [ActionType.linux_read_listening_ports, "ss -lntup"],
  [ActionType.linux_check_firewall_status, "ufw status verbose"],
  [ActionType.linux_read_firewall_status, "ufw status verbose"],
  [ActionType.linux_read_auth_logs, "journalctl SSH authentication events for the last 24 hours"],
  [ActionType.linux_read_users, "getent passwd"],
  [ActionType.linux_read_docker, "docker ps --no-trunc"],
  [ActionType.linux_read_nginx, "nginx -t"]
]);

const LINUX_LIST_RUNNING_SERVICES = "systemctl list-units --type=service --state=running --no-pager --plain";
const LINUX_LIST_FAILED_SERVICES = "systemctl --failed --type=service --no-pager --plain";
const LINUX_CHECK_IMPORTANT_SERVICES = "for s in ssh sshd nginx apache2 httpd docker fail2ban postgresql mysql mariadb redis; do if systemctl list-unit-files --type=service 2>/dev/null | grep -q \"^${s}\\.service\"; then printf '=== %s ===\\n' \"$s\"; systemctl is-active \"$s\" 2>/dev/null || true; systemctl status \"$s\" --no-pager --lines=5 2>/dev/null || true; fi; done";

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function base(input: PlannerInput): VendorCommandPlan {
  return {
    status: "planned",
    vendor: "linux_edge",
    deviceId: input.device?.id ?? null,
    actionType: input.actionType,
    transport: "ssh",
    commands: [],
    apiCalls: [],
    warnings: ["Execution preview only. No SSH command was executed while planning."],
    rollbackSteps: [],
    riskLevel: input.riskLevel,
    requiresApproval: true
  };
}

function needs(input: PlannerInput, missingFields: string[], questions: string[]): VendorCommandPlan {
  return { ...base(input), status: "needs_clarification", missingFields, questions };
}

function portPlan(input: PlannerInput, verb: "allow" | "deny"): VendorCommandPlan {
  const port = num(input.parameters.port);
  const protocol = str(input.parameters.protocol) ?? "tcp";
  if (!port || port < 1 || port > 65535) return needs(input, ["port"], ["Which valid TCP/UDP port should UFW target?"]);
  const plan = base(input);
  plan.commands = [`ufw ${verb} ${port}/${protocol}`];
  plan.rollbackSteps = [`ufw delete ${verb} ${port}/${protocol}`];
  if (WARNING_PORTS.has(port)) plan.warnings.push(`Port ${port} is operationally sensitive.`);
  return plan;
}

function blockTemporary(input: PlannerInput): VendorCommandPlan {
  const srcIp = str(input.parameters.srcIp) ?? str(input.parameters.ipAddress);
  const duration = num(input.parameters.durationMinutes) ?? 30;
  if (!srcIp) return needs(input, ["srcIp"], ["Which source IP should be blocked temporarily?"]);
  const plan = base(input);
  plan.commands = [
    `ufw insert 1 deny from ${srcIp} comment "temporary block ${duration}m - Firewall Log Analyzer"`,
    `systemd-run --on-active=${duration}m /usr/sbin/ufw delete deny from ${srcIp}`
  ];
  plan.rollbackSteps = [`ufw delete deny from ${srcIp}`];
  plan.warnings.push("Future execution must verify systemd-run availability or use a managed expiry worker.");
  return plan;
}

function changeSshPort(input: PlannerInput): VendorCommandPlan {
  const fromPort = num(input.parameters.fromPort);
  const toPort = num(input.parameters.toPort);
  if (!fromPort || !toPort || fromPort === toPort) {
    return needs(input, ["fromPort", "toPort"], ["What current SSH port and new SSH port should be used?"]);
  }
  const plan = base(input);
  plan.commands = [
    `ufw allow ${toPort}/tcp`,
    "sshd -t",
    `sed -i.bak 's/^#\\?Port .*/Port ${toPort}/' /etc/ssh/sshd_config`,
    "systemctl reload ssh || systemctl reload sshd",
    `ss -ltnp | grep ':${toPort}'`
  ];
  plan.rollbackSteps = [
    `sed -i.bak 's/^#\\?Port .*/Port ${fromPort}/' /etc/ssh/sshd_config`,
    "systemctl reload ssh || systemctl reload sshd",
    `ufw delete allow ${toPort}/tcp`
  ];
  plan.warnings.push("Changing SSH can break management access; keep an existing session open and validate rollback first.");
  return plan;
}

export const linuxEdgePlanner: VendorPlanner = {
  vendor: "linux_edge",
  supportedActions: [
    ActionType.open_port,
    ActionType.linux_open_port,
    ActionType.close_port,
    ActionType.linux_block_ip,
    ActionType.block_source_ip_temporary,
    ActionType.unblock_source_ip,
    ActionType.change_ssh_port,
    ActionType.linux_check_service_status,
    "linux_list_running_services" as ActionType,
    "linux_list_failed_services" as ActionType,
    "linux_check_important_services" as ActionType,
    ActionType.linux_check_ssh_status,
    ActionType.linux_check_failed_logins,
    ActionType.linux_check_sudo_users,
    ActionType.linux_check_fail2ban_status,
    ActionType.linux_remove_user_from_sudo,
    ActionType.linux_add_user_to_sudo,
    ActionType.linux_check_user_groups,
    ActionType.linux_lock_user,
    ActionType.linux_unlock_user,
    ActionType.linux_daily_check,
    ActionType.custom_vendor_action,
    ...READ_ACTIONS.keys()
  ],
  supports(device) {
    return device?.type === DeviceType.linux_edge || String(device?.vendor ?? "").toLowerCase().includes("linux");
  },
  plan(input) {
    if (input.actionType === ActionType.custom_vendor_action) {
      const customPlan = customPlanFromParameters(input.parameters);
      if (!customPlan || customPlan.vendor !== "linux") return { ...base(input), status: "unsupported", unsupportedReason: "Linux custom command plan is missing or targets another vendor." };
      return {
        ...base(input),
        commands: [...customPlan.orderedCommands, ...customPlan.verificationCommands],
        rollbackSteps: customPlan.rollbackGuidance,
        riskLevel: customPlan.riskLevel,
        warnings: ["Custom Linux plan generated by AI and normalized by backend; connector dry-run performs the executable preview."]
      };
    }
    if (input.actionType === ActionType.linux_daily_check) {
      const plan = base(input);
      plan.commands = ["controlled Linux daily-check bundle (read-only)"];
      plan.requiresApproval = false;
      return plan;
    }
    if (input.actionType === ActionType.open_port || input.actionType === ActionType.linux_open_port) return portPlan(input, "allow");
    if (input.actionType === ActionType.close_port) return portPlan(input, "deny");
    if (input.actionType === ActionType.block_source_ip_temporary || input.actionType === ActionType.linux_block_ip) return blockTemporary(input);
    if (input.actionType === ActionType.change_ssh_port) return changeSshPort(input);
    if (input.actionType === ActionType.unblock_source_ip) {
      const srcIp = str(input.parameters.srcIp);
      if (!srcIp) return needs(input, ["srcIp"], ["Which source IP should be unblocked?"]);
      const plan = base(input);
      plan.commands = [`ufw delete deny from ${srcIp}`];
      plan.rollbackSteps = [`ufw deny from ${srcIp}`];
      return plan;
    }
    if (input.actionType === ActionType.linux_check_service_status) {
      const service = str(input.parameters.serviceName) ?? str(input.parameters.service);
      if (!service) return needs(input, ["serviceName"], ["نام سرویس موردنظر چیست؟"]);
      if (!/^[a-zA-Z0-9_.@:-]+$/.test(service)) return needs(input, ["serviceName"], ["Service name may contain only letters, numbers, dot, underscore, @, colon, or dash."]);
      const plan = base(input);
      plan.commands = [
        `systemctl show ${service} --no-pager --property=Id,LoadState,ActiveState,SubState,UnitFileState,Description,MainPID,ExecMainStatus`,
        `systemctl is-active ${service}`,
        `systemctl is-enabled ${service}`,
        `service ${service} status`,
        `pgrep -a ${service}`
      ];
      plan.warnings.push("Read-only service status check. No service restart or config change is planned.");
      return plan;
    }
    if (input.actionType === ("linux_list_running_services" as ActionType)) {
      const plan = base(input);
      plan.commands = [LINUX_LIST_RUNNING_SERVICES];
      plan.requiresApproval = false;
      plan.warnings.push("Read-only running-services inventory.");
      return plan;
    }
    if (input.actionType === ("linux_list_failed_services" as ActionType)) {
      const plan = base(input);
      plan.commands = [LINUX_LIST_FAILED_SERVICES];
      plan.requiresApproval = false;
      plan.warnings.push("Read-only failed-services inventory.");
      return plan;
    }
    if (input.actionType === ("linux_check_important_services" as ActionType)) {
      const plan = base(input);
      plan.commands = [LINUX_CHECK_IMPORTANT_SERVICES];
      plan.requiresApproval = false;
      plan.warnings.push("Read-only important-services health check.");
      return plan;
    }
    if (input.actionType === ActionType.linux_check_ssh_status) {
      const plan = base(input);
      plan.commands = ["systemctl is-active ssh || systemctl is-active sshd", "ss -lntp | grep -E 'sshd|:22'"];
      plan.requiresApproval = false;
      plan.warnings.push("بررسی فقط‌خواندنی سرویس SSH؛ هیچ تغییری اعمال نمی‌شود.");
      return plan;
    }
    if (input.actionType === ActionType.linux_check_failed_logins) {
      const plan = base(input);
      plan.commands = ["journalctl -u ssh -u sshd --since '24 hours ago' --no-pager | grep -Ei 'failed|invalid user|authentication failure' | tail -n 200"];
      plan.requiresApproval = false;
      return plan;
    }
    if (input.actionType === ActionType.linux_check_sudo_users) {
      const plan = base(input);
      plan.commands = ["getent group sudo; getent group wheel"];
      plan.requiresApproval = false;
      return plan;
    }
    if (input.actionType === ActionType.linux_check_fail2ban_status) {
      const plan = base(input);
      plan.commands = ["systemctl is-active fail2ban", "fail2ban-client status"];
      plan.requiresApproval = false;
      return plan;
    }
    if (new Set<ActionType>([ActionType.linux_remove_user_from_sudo, ActionType.linux_add_user_to_sudo, ActionType.linux_check_user_groups, ActionType.linux_lock_user, ActionType.linux_unlock_user]).has(input.actionType)) {
      const username = str(input.parameters.username);
      if (!username || !/^[a-z_][a-z0-9_.-]{0,31}$/i.test(username)) return needs(input, ["username"], ["نام کاربر لینوکس چیست؟"]);
      const plan = base(input);
      if (input.actionType === ActionType.linux_remove_user_from_sudo) { plan.commands = [`sudo -n gpasswd -d ${username} sudo || sudo -n deluser ${username} sudo`, `groups ${username} || id ${username}`]; plan.rollbackSteps = [`sudo -n usermod -aG sudo ${username}`]; }
      if (input.actionType === ActionType.linux_add_user_to_sudo) { plan.commands = [`sudo -n usermod -aG sudo ${username}`, `groups ${username} || id ${username}`]; plan.rollbackSteps = [`sudo -n gpasswd -d ${username} sudo`]; }
      if (input.actionType === ActionType.linux_check_user_groups) { plan.commands = [`id ${username}; groups ${username}`]; plan.requiresApproval = false; }
      if (input.actionType === ActionType.linux_lock_user) { plan.commands = [`sudo -n usermod -L ${username}`, `id ${username}`]; plan.rollbackSteps = [`sudo -n usermod -U ${username}`]; }
      if (input.actionType === ActionType.linux_unlock_user) { plan.commands = [`sudo -n usermod -U ${username}`, `id ${username}`]; plan.rollbackSteps = [`sudo -n usermod -L ${username}`]; }
      return plan;
    }
    const readCommand = READ_ACTIONS.get(input.actionType);
    if (readCommand) {
      const plan = base(input);
      plan.commands = [readCommand];
      plan.requiresApproval = false;
      plan.warnings.push("Read-only catalog action. No device state change is planned.");
      return plan;
    }
    return { ...base(input), status: "unsupported", transport: "manual", unsupportedReason: "Linux Edge UFW template for this action is not implemented yet." };
  }
};
