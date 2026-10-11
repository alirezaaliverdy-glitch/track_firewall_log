import { ActionType } from "@prisma/client";

export type LinuxCommandTemplate = { template: string; command: string };

export function linuxDailyCheckCommands(sudo = "sudo -n "): LinuxCommandTemplate[] {
  return [
    { template: "daily check: system", command: "printf '===SYSTEM===\\n'; uptime; free -m; swapon --show 2>/dev/null || true; df -h; df -i" },
    { template: "daily check: services", command: "printf '===SERVICES===\\n'; systemctl --failed --no-pager 2>/dev/null || true; systemctl is-active ssh sshd nginx apache2 httpd docker fail2ban 2>/dev/null || true" },
    { template: "daily check: network", command: "printf '===NETWORK===\\n'; ip -brief address; ip route; ss -lntup 2>/dev/null || ss -lntp 2>/dev/null || true" },
    { template: "daily check: firewall", command: `${sudo}sh -c "printf '===FIREWALL===\\n'; ufw status verbose 2>/dev/null || nft list ruleset 2>/dev/null || iptables -S 2>/dev/null || true"` },
    { template: "daily check: logs", command: `${sudo}sh -c "printf '===LOGS===\\n'; journalctl -p err..alert --since '24 hours ago' -n 150 --no-pager 2>/dev/null || true; journalctl -u ssh -u sshd --since '24 hours ago' --no-pager 2>/dev/null | grep -Ei 'failed|invalid user|authentication failure' | tail -n 100 || true"` },
    { template: "daily check: updates", command: "printf '===UPDATES===\\n'; (apt list --upgradable 2>/dev/null || dnf check-update 2>/dev/null || yum check-update 2>/dev/null || true) | head -n 100" },
  ];
}

export function linuxReadCommand(actionType: ActionType, sudo = "") : LinuxCommandTemplate | undefined {
  const commands: Partial<Record<ActionType, LinuxCommandTemplate>> = {
    [ActionType.linux_check_ssh_status]: { template: "SSH service status", command: "systemctl is-active ssh || systemctl is-active sshd || service ssh status || service sshd status" },
    [ActionType.linux_check_failed_logins]: { template: "failed SSH logins in last 24 hours", command: `${sudo}journalctl -u ssh -u sshd --since '24 hours ago' --no-pager 2>/dev/null || ${sudo}tail -n 300 /var/log/auth.log 2>/dev/null || ${sudo}tail -n 300 /var/log/secure 2>/dev/null` },
    [ActionType.linux_check_sudo_users]: { template: "sudo, wheel, and UID 0 users", command: "getent group sudo; getent group wheel; awk -F: '$3==0 {print $1}' /etc/passwd" },
    [ActionType.linux_check_fail2ban_status]: { template: "fail2ban service status", command: `systemctl is-active fail2ban; command -v fail2ban-client >/dev/null 2>&1 && ${sudo}fail2ban-client status || true` },
    [ActionType.linux_read_hostname]: { template: "hostname", command: "hostname" },
    [ActionType.linux_read_interfaces]: { template: "ip -brief address", command: "ip -brief address" },
    [ActionType.linux_read_routes]: { template: "ip route show", command: "ip route show" },
    [ActionType.linux_list_open_ports]: { template: "ss/netstat listening ports", command: "ss -lntup || netstat -lntup" },
    [ActionType.linux_read_listening_ports]: { template: "ss/netstat listening ports", command: "ss -lntup || netstat -lntup" },
    [ActionType.linux_check_firewall_status]: { template: "firewall status", command: `${sudo}ufw status verbose || ${sudo}nft list ruleset || ${sudo}iptables -S` },
    [ActionType.linux_read_firewall_status]: { template: "firewall status", command: `${sudo}ufw status verbose || ${sudo}nft list ruleset || ${sudo}iptables -S` },
    [ActionType.linux_read_auth_logs]: { template: "journalctl SSH authentication events", command: `${sudo}journalctl -u ssh -u sshd --since '24 hours ago' --no-pager -n 200` },
    [ActionType.linux_read_users]: { template: "getent passwd", command: "getent passwd" },
    [ActionType.linux_read_docker]: { template: "docker ps", command: "docker ps --no-trunc" },
    [ActionType.linux_read_nginx]: { template: "nginx -t", command: `${sudo}nginx -t` },
    ["linux_list_running_services" as ActionType]: { template: "running services", command: "systemctl list-units --type=service --state=running --no-pager --plain" },
    ["linux_list_failed_services" as ActionType]: { template: "failed services", command: "systemctl --failed --type=service --no-pager --plain" },
    ["linux_check_important_services" as ActionType]: { template: "important services", command: "for s in ssh sshd nginx apache2 httpd docker fail2ban postgresql mysql mariadb redis; do if systemctl list-unit-files --type=service 2>/dev/null | grep -q \"^${s}\\.service\"; then printf '=== %s ===\\n' \"$s\"; systemctl is-active \"$s\" 2>/dev/null || true; systemctl status \"$s\" --no-pager --lines=5 2>/dev/null || true; fi; done" },
  };
  return commands[actionType];
}

export function controlledLinuxCatalogCommands() {
  const actionTypes = [
    ActionType.linux_check_ssh_status, ActionType.linux_check_failed_logins,
    ActionType.linux_check_sudo_users, ActionType.linux_check_fail2ban_status,
    ActionType.linux_read_hostname, ActionType.linux_read_interfaces, ActionType.linux_read_routes,
    ActionType.linux_list_open_ports, ActionType.linux_read_listening_ports,
    ActionType.linux_check_firewall_status, ActionType.linux_read_firewall_status,
    ActionType.linux_read_auth_logs, ActionType.linux_read_users, ActionType.linux_read_docker,
    ActionType.linux_read_nginx, "linux_list_running_services" as ActionType,
    "linux_list_failed_services" as ActionType, "linux_check_important_services" as ActionType,
  ];
  return new Set([
    ...linuxDailyCheckCommands().map((item) => item.command),
    ...actionTypes.flatMap((actionType) => {
      const command = linuxReadCommand(actionType, "sudo -n ")?.command;
      return command ? [command] : [];
    }),
  ]);
}
