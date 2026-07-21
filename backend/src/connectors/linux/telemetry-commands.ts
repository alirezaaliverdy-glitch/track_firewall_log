export type LinuxTelemetryCommandId = keyof typeof LINUX_TELEMETRY_COMMANDS;

export const LINUX_TELEMETRY_COMMANDS = Object.freeze({
  identity: { command: "hostname; hostnamectl 2>/dev/null; uname -a; uptime; timedatectl 2>/dev/null", privileged: false },
  overview: { command: "printf '__FLA_HOST__\\n'; hostname 2>/dev/null || true; (test -r /etc/os-release && . /etc/os-release && printf '%s\\n' \"${PRETTY_NAME:-$ID}\") || uname -o 2>/dev/null || true; uname -r 2>/dev/null || true; uptime -p 2>/dev/null || uptime 2>/dev/null || true; printf '__FLA_CPU__\\n'; nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || true; cat /proc/loadavg 2>/dev/null || true; LANG=C top -bn1 2>/dev/null | grep -E 'Cpu\\(s\\)|%Cpu' | head -n 1 || true; printf '__FLA_MEMORY__\\n'; free -m 2>/dev/null || true; printf '__FLA_DISK__\\n'; df -PTh 2>/dev/null || df -PT 2>/dev/null || true; printf '__FLA_IO__\\n'; iostat -dx 1 1 2>/dev/null || cat /proc/diskstats 2>/dev/null | head -n 20 || true; printf '__FLA_NET__\\n'; ip -o addr show 2>/dev/null || ifconfig -a 2>/dev/null || true; ip -s link 2>/dev/null || true; printf '__FLA_PROCS__\\n'; ps -eo pid,comm,pcpu,pmem --sort=-pcpu 2>/dev/null | head -n 8 || true; printf '__FLA_SERVICES__\\n'; for s in ssh sshd nginx apache2 httpd docker fail2ban firewalld ufw auditd; do printf '%s=' \"$s\"; if systemctl is-active --quiet \"$s\" 2>/dev/null || service \"$s\" status >/dev/null 2>&1; then printf 'active\\n'; elif systemctl is-active \"$s\" >/dev/null 2>&1; then printf 'unknown\\n'; else printf 'inactive\\n'; fi; done; printf '__FLA_PORTS__\\n'; ss -lntup 2>/dev/null || netstat -lntup 2>/dev/null || true; printf '__FLA_SECURITY__\\n'; journalctl -u ssh -u sshd -p warning..alert -n 80 --no-pager 2>/dev/null || tail -n 80 /var/log/auth.log 2>/dev/null || tail -n 80 /var/log/secure 2>/dev/null || true", privileged: false },
  network: { command: "ip addr; ip route; (ss -tulpen 2>/dev/null || ss -tunap 2>/dev/null)", privileged: false },
  sshConfig: { command: "sshd -T 2>/dev/null", privileged: true },
  sshLogs: { command: "journalctl -u ssh -u sshd -n 300 --no-pager 2>/dev/null || tail -n 300 /var/log/auth.log 2>/dev/null || tail -n 300 /var/log/secure 2>/dev/null", privileged: true },
  users: { command: "getent passwd; getent group sudo; getent group wheel; last -n 50 2>/dev/null", privileged: false },
  failedLogins: { command: "lastb -n 50 2>/dev/null", privileged: true },
  firewall: { command: "ufw status verbose 2>/dev/null; iptables -S 2>/dev/null; nft list ruleset 2>/dev/null; firewall-cmd --state 2>/dev/null; firewall-cmd --list-all 2>/dev/null", privileged: true },
  securityTools: { command: "fail2ban-client status 2>/dev/null; for s in fail2ban auditd ssh sshd ufw firewalld; do printf '%s=' \"$s\"; systemctl is-active \"$s\" 2>/dev/null || true; done; command -v unattended-upgrade 2>/dev/null", privileged: true },
  containers: { command: "docker ps --format '{{json .}}' 2>/dev/null || docker ps 2>/dev/null; docker network ls 2>/dev/null; docker compose ls 2>/dev/null", privileged: false },
  web: { command: "systemctl is-active nginx apache2 httpd 2>/dev/null; find /etc/nginx/sites-enabled /etc/apache2/sites-enabled -maxdepth 1 -type l -printf '%f\\n' 2>/dev/null", privileged: false },
  warnings: { command: "journalctl -p warning..alert -n 300 --no-pager 2>/dev/null; dmesg --level=err,warn 2>/dev/null", privileged: true }
} as const);

export const LINUX_STREAM_COMMANDS = Object.freeze({
  auth: "journalctl -f -n 0 -u ssh -u sshd -o short-iso --since now --no-pager 2>/dev/null || tail -n 0 -F /var/log/auth.log /var/log/secure 2>/dev/null",
  system: "journalctl -f -n 0 -o short-iso --since now --no-pager 2>/dev/null || tail -n 0 -F /var/log/syslog /var/log/messages 2>/dev/null",
  kernel: "journalctl -f -n 0 -k -o short-iso --since now --no-pager 2>/dev/null",
  firewall: "tail -n 0 -F /var/log/ufw.log 2>/dev/null || journalctl -f -n 0 -k -o short-iso --since now --no-pager 2>/dev/null",
  nginx: "tail -n 0 -F /var/log/nginx/access.log /var/log/nginx/error.log 2>/dev/null",
  apache: "tail -n 0 -F /var/log/apache2/access.log /var/log/apache2/error.log /var/log/httpd/access_log /var/log/httpd/error_log 2>/dev/null",
  fail2ban: "tail -n 0 -F /var/log/fail2ban.log 2>/dev/null || journalctl -f -n 0 -u fail2ban -o short-iso --since now --no-pager 2>/dev/null",
  docker: "journalctl -f -n 0 -u docker -o short-iso --since now --no-pager 2>/dev/null"
} as const);

export type LinuxStreamSource = keyof typeof LINUX_STREAM_COMMANDS;
