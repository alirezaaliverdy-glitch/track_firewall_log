import type { Severity } from "@/types/finding";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskyPortEntry = {
  port: number;
  service: string;
  severity: Severity;
  reason: string;
  recommendation: string;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const RISKY_PORTS: RiskyPortEntry[] = [
  {
    port: 21,
    service: "FTP",
    severity: "high",
    reason: "FTP transmits credentials and data in plaintext.",
    recommendation: "Disable FTP. Use SFTP or FTPS instead.",
  },
  {
    port: 22,
    service: "SSH",
    severity: "medium",
    reason: "SSH is a common brute-force and credential-stuffing target.",
    recommendation: "Restrict SSH access by source IP. Enforce key-based authentication and disable password login.",
  },
  {
    port: 23,
    service: "Telnet",
    severity: "critical",
    reason: "Telnet is unencrypted and should never be used over untrusted networks.",
    recommendation: "Disable Telnet immediately. Replace with SSH.",
  },
  {
    port: 25,
    service: "SMTP",
    severity: "medium",
    reason: "Open SMTP relay can be exploited for spam and phishing campaigns.",
    recommendation: "Restrict SMTP to authorised mail servers only. Enable authentication.",
  },
  {
    port: 53,
    service: "DNS",
    severity: "medium",
    reason: "Unrestricted DNS can enable data exfiltration over DNS tunnelling.",
    recommendation: "Limit DNS traffic to trusted resolvers. Monitor for unusually large DNS queries.",
  },
  {
    port: 445,
    service: "SMB",
    severity: "critical",
    reason: "SMB is the vector for EternalBlue, WannaCry, and lateral movement attacks.",
    recommendation: "Block SMB at the perimeter. Never expose port 445 to the internet.",
  },
  {
    port: 1433,
    service: "MSSQL",
    severity: "high",
    reason: "Exposed SQL Server is a common ransomware and data-theft target.",
    recommendation: "Block MSSQL at the perimeter. Restrict access to application servers only.",
  },
  {
    port: 3306,
    service: "MySQL",
    severity: "high",
    reason: "Exposed MySQL allows direct database access and credential attacks.",
    recommendation: "Block MySQL at the perimeter. Bind to localhost or a private network interface.",
  },
  {
    port: 3389,
    service: "RDP",
    severity: "high",
    reason: "RDP is heavily targeted for brute force, BlueKeep, and ransomware delivery.",
    recommendation: "Block RDP at the perimeter. Use a VPN or bastion host for remote access.",
  },
  {
    port: 5432,
    service: "PostgreSQL",
    severity: "high",
    reason: "Exposed PostgreSQL allows direct database access from untrusted networks.",
    recommendation: "Block PostgreSQL at the perimeter. Restrict to application server IPs only.",
  },
  {
    port: 5900,
    service: "VNC",
    severity: "high",
    reason: "VNC often lacks strong authentication and is a remote-access abuse target.",
    recommendation: "Block VNC at the perimeter. Use a VPN for remote desktop access.",
  },
  {
    port: 6379,
    service: "Redis",
    severity: "critical",
    reason: "Unauthenticated Redis instances have been used for cryptomining and data theft.",
    recommendation: "Bind Redis to localhost. Require authentication. Never expose to the internet.",
  },
  {
    port: 8080,
    service: "HTTP / Admin Panel",
    severity: "medium",
    reason: "Port 8080 is commonly used for admin panels and dev servers without TLS.",
    recommendation: "Restrict access to authorised IPs. Enforce HTTPS. Remove admin panels from public access.",
  },
  {
    port: 8291,
    service: "MikroTik Winbox",
    severity: "high",
    reason: "Winbox has had critical CVEs allowing unauthenticated remote code execution.",
    recommendation: "Block Winbox at the perimeter. Manage MikroTik devices via VPN only.",
  },
  {
    port: 9200,
    service: "Elasticsearch",
    severity: "critical",
    reason: "Unauthenticated Elasticsearch instances expose all indexed data publicly.",
    recommendation: "Bind Elasticsearch to localhost or a private network. Enable security features.",
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Map from port number to entry for O(1) lookup. */
const PORT_MAP = new Map<number, RiskyPortEntry>(
  RISKY_PORTS.map((e) => [e.port, e])
);

/** Returns the risky port entry for a given port, or undefined if not risky. */
export function getRiskyPort(port: number): RiskyPortEntry | undefined {
  return PORT_MAP.get(port);
}

/** Returns true when a port number is in the risky ports registry. */
export function isRiskyPort(port: number): boolean {
  return PORT_MAP.has(port);
}

export { RISKY_PORTS };
