import { ActionType, AiRiskLevel } from "@prisma/client";
import { catalogEntry as e } from "./helpers.js";

export const LINUX_COMMAND_CATALOG = Object.freeze([
  e("linux", "read_hostname", "Read hostname", "system", ActionType.linux_read_hostname, ["show hostname", "read hostname", "نمایش hostname"], AiRiskLevel.low, true),
  e("linux", "read_interfaces", "Read interfaces", "network", ActionType.linux_read_interfaces, ["show interfaces", "ip addresses", "نمایش اینترفیس"], AiRiskLevel.low, true),
  e("linux", "read_listening_ports", "Read listening ports", "network", ActionType.linux_read_listening_ports, ["show listening ports", "read open ports", "نمایش پورت های باز"], AiRiskLevel.low, true),
  e("linux", "read_firewall_status", "Read firewall status", "firewall", ActionType.linux_read_firewall_status, ["show firewall status", "ufw status", "وضعیت فایروال"], AiRiskLevel.low, true),
  e("linux", "ufw_allow_port", "Allow port with UFW", "firewall", ActionType.open_port, ["ufw allow port", "open port", "باز کردن پورت"], AiRiskLevel.high, false, ["port"], ["protocol", "sourceCidr"]),
  e("linux", "ufw_deny_port", "Deny port with UFW", "firewall", ActionType.close_port, ["ufw deny port", "close port", "بستن پورت"], AiRiskLevel.medium, false, ["port"], ["protocol"]),
  e("linux", "ufw_delete_rule", "Delete managed UFW rule", "firewall", ActionType.close_port, ["ufw delete managed rule", "delete ufw rule", "حذف قانون ufw"], AiRiskLevel.medium, false, ["port"], ["protocol"]),
  e("linux", "temporary_block_ip", "Temporarily block IP", "firewall", ActionType.block_source_ip_temporary, ["block ip temporary", "temporary block ip", "مسدود کردن موقت ip"], AiRiskLevel.medium, false, ["srcIp"], ["durationMinutes"]),
  e("linux", "read_auth_logs", "Read authentication logs", "observability", ActionType.linux_read_auth_logs, ["show auth logs", "read authentication logs", "نمایش لاگ ورود"], AiRiskLevel.low, true),
  e("linux", "read_system_status", "Read system status", "system", "linux_read_system_status", ["show system status", "system health", "وضعیت سیستم"], AiRiskLevel.low, true, [], [], { supported: false }),
  e("linux", "read_resources", "Read disk and memory", "system", "linux_read_resources", ["show disk memory", "disk and memory", "نمایش دیسک و حافظه"], AiRiskLevel.low, true, [], [], { supported: false }),
  e("linux", "restart_service", "Restart managed service", "services", ActionType.linux_check_service_status, ["restart managed service", "restart service", "راه اندازی مجدد سرویس"], AiRiskLevel.high, false, ["serviceName"], [], { supported: false })
  ,e("linux", "read_routes", "Read routes", "network", ActionType.linux_read_routes, ["show routes", "ip route", "نمایش مسیرهای لینوکس"], AiRiskLevel.low, true)
  ,e("linux", "read_users", "Read local users", "system", ActionType.linux_read_users, ["show users", "read local users", "نمایش کاربران لینوکس"], AiRiskLevel.low, true)
  ,e("linux", "read_docker", "Read Docker containers", "containers", ActionType.linux_read_docker, ["show docker containers", "docker ps", "نمایش کانتینرهای داکر"], AiRiskLevel.low, true)
  ,e("linux", "read_nginx", "Read Nginx status", "services", ActionType.linux_read_nginx, ["show nginx status", "nginx status", "نمایش وضعیت nginx"], AiRiskLevel.low, true)
  ,e("linux", "unblock_ip", "Unblock managed IP", "firewall", ActionType.unblock_source_ip, ["unblock ip", "ufw remove block", "رفع مسدودی آی پی"], AiRiskLevel.medium, false, ["srcIp"])
  ,e("linux", "reload_service", "Reload managed service", "services", "linux_reload_service", ["reload service", "systemctl reload", "بارگذاری مجدد سرویس"], AiRiskLevel.medium, false, ["serviceName"], [], { supportsExecution: false })
  ,e("linux", "test_nginx", "Test Nginx configuration", "services", "linux_test_nginx", ["test nginx config", "nginx -t", "تست تنظیمات nginx"], AiRiskLevel.low, true, [], [], { supportsExecution: false })
  ,e("linux", "reload_nginx", "Test and reload Nginx", "services", "linux_reload_nginx", ["reload nginx", "test and reload nginx", "بارگذاری مجدد nginx"], AiRiskLevel.medium, false, [], [], { supportsExecution: false })
  ,e("linux", "change_ssh_port", "Change SSH port safely", "ssh", ActionType.change_ssh_port, ["change linux ssh port", "change ssh port safely", "تغییر امن پورت ssh لینوکس"], AiRiskLevel.high, false, ["fromPort", "toPort"], ["trustedSourceCidr"], { supportsExecution: false })
  ,e("linux", "disable_root_ssh", "Disable root SSH login", "ssh", "linux_disable_root_ssh", ["disable root ssh login", "permitrootlogin no", "غیرفعال کردن ورود root با ssh"], AiRiskLevel.high, false, [], [], { supportsExecution: false })
  ,e("linux", "fail2ban_status", "Read Fail2ban status", "hardening", "linux_fail2ban_status", ["fail2ban status", "show fail2ban", "نمایش وضعیت fail2ban"], AiRiskLevel.low, true, [], ["jailName"], { supportsExecution: false })
  ,e("linux", "fail2ban_jail", "Enable managed Fail2ban jail", "hardening", "linux_fail2ban_jail", ["enable fail2ban jail", "configure fail2ban jail", "فعال کردن jail در fail2ban"], AiRiskLevel.medium, false, ["jailName"], [], { supportsExecution: false })
  ,e("linux", "docker_restart", "Restart Docker container", "containers", "linux_docker_restart", ["restart docker container", "docker restart", "راه اندازی مجدد کانتینر"], AiRiskLevel.high, false, ["containerName"], [], { supportsExecution: false })
  ,e("linux", "docker_start", "Start Docker container", "containers", "linux_docker_start", ["start docker container", "docker start", "اجرای کانتینر داکر"], AiRiskLevel.medium, false, ["containerName"], [], { supportsExecution: false })
  ,e("linux", "docker_stop", "Stop Docker container", "containers", "linux_docker_stop", ["stop docker container", "docker stop", "توقف کانتینر داکر"], AiRiskLevel.high, false, ["containerName"], [], { supportsExecution: false })
]);
