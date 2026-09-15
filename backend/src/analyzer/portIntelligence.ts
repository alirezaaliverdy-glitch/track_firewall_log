import type { Severity } from "./types.js";

export type RiskyPortEntry = {
  port: number;
  service: string;
  severity: Severity;
  reason: string;
  recommendation: string;
};

export const RISKY_PORTS: RiskyPortEntry[] = [
  { port: 21, service: "FTP", severity: "high", reason: "FTP transmits credentials and data in plaintext.", recommendation: "Disable FTP. Use SFTP or FTPS instead." },
  { port: 22, service: "SSH", severity: "medium", reason: "SSH is a common brute-force and credential-stuffing target.", recommendation: "Restrict SSH access by source IP. Enforce key-based authentication and disable password login." },
  { port: 23, service: "Telnet", severity: "critical", reason: "Telnet is unencrypted and should never be used over untrusted networks.", recommendation: "Disable Telnet immediately. Replace with SSH." },
  { port: 25, service: "SMTP", severity: "medium", reason: "Open SMTP relay can be exploited for spam and phishing campaigns.", recommendation: "Restrict SMTP to authorised mail servers only. Enable authentication." },
  { port: 53, service: "DNS", severity: "medium", reason: "Unrestricted DNS can enable data exfiltration over DNS tunnelling.", recommendation: "Limit DNS traffic to trusted resolvers. Monitor for unusually large DNS queries." },
  { port: 445, service: "SMB", severity: "critical", reason: "SMB is a lateral movement and ransomware target.", recommendation: "Block SMB at the perimeter. Never expose port 445 to the internet." },
  { port: 1433, service: "MSSQL", severity: "high", reason: "Exposed SQL Server is a common data-theft target.", recommendation: "Block MSSQL at the perimeter. Restrict access to application servers only." },
  { port: 3306, service: "MySQL", severity: "high", reason: "Exposed MySQL allows direct database access and credential attacks.", recommendation: "Block MySQL at the perimeter. Bind to localhost or private interfaces." },
  { port: 3389, service: "RDP", severity: "high", reason: "RDP is heavily targeted for brute force and ransomware delivery.", recommendation: "Block RDP at the perimeter. Use VPN or bastion access." },
  { port: 5432, service: "PostgreSQL", severity: "high", reason: "Exposed PostgreSQL allows direct database access from untrusted networks.", recommendation: "Block PostgreSQL at the perimeter. Restrict to application server IPs." },
  { port: 5900, service: "VNC", severity: "high", reason: "VNC often lacks strong authentication and is a remote-access abuse target.", recommendation: "Block VNC at the perimeter. Use VPN for remote desktop access." },
  { port: 6379, service: "Redis", severity: "critical", reason: "Unauthenticated Redis instances have been abused for data theft and cryptomining.", recommendation: "Bind Redis to localhost. Require authentication. Never expose it to the internet." },
  { port: 8080, service: "HTTP / Admin Panel", severity: "medium", reason: "Port 8080 is commonly used for admin panels and dev servers.", recommendation: "Restrict access to authorised IPs. Enforce HTTPS." },
  { port: 8291, service: "MikroTik Winbox", severity: "high", reason: "Winbox has had critical remote access vulnerabilities.", recommendation: "Block Winbox at the perimeter. Manage devices via VPN only." },
  { port: 9200, service: "Elasticsearch", severity: "critical", reason: "Unauthenticated Elasticsearch can expose indexed data.", recommendation: "Bind Elasticsearch to private networks and enable security features." }
];

const PORT_MAP = new Map<number, RiskyPortEntry>(RISKY_PORTS.map((entry) => [entry.port, entry]));

export function getRiskyPort(port: number): RiskyPortEntry | undefined {
  return PORT_MAP.get(port);
}

export function isRiskyPort(port: number): boolean {
  return PORT_MAP.has(port);
}
