export type AnalysisVendor = "mikrotik" | "linux" | "fortigate" | "pfsense" | "cisco" | "generic";

export type VendorAnalysisProfile = {
  vendor: AnalysisVendor;
  label: string;
  collectionAreas: string[];
  analysisSections: string[];
  riskChecks: string[];
  hardeningCategories: string[];
  actionHints: string[];
};

const profile = (value: VendorAnalysisProfile) => value;

export const VENDOR_ANALYSIS_PROFILES: Record<AnalysisVendor, VendorAnalysisProfile> = {
  mikrotik: profile({
    vendor: "mikrotik", label: "MikroTik",
    collectionAreas: ["RouterOS/package version", "management services", "firewall filter/nat/raw/mangle", "address lists", "interfaces/bridge/VLAN", "VPN/IPsec/WireGuard/L2TP", "DNS/DHCP", "routes", "logs/auth failures", "exposed management surface"],
    analysisSections: ["RouterOS/package version", "Management services (SSH/Winbox/WWW/API/Telnet/FTP)", "Firewall filter/NAT/raw/mangle", "Address lists", "Interfaces, bridge and VLAN", "VPN, IPsec, WireGuard and L2TP", "DNS and DHCP", "Routes", "Logs and authentication failures", "Exposed management surface"],
    riskChecks: ["winbox/www/api exposed to untrusted sources", "telnet or ftp enabled", "missing input-chain protection", "DNS recursion exposed to WAN", "stale RouterOS packages"],
    hardeningCategories: ["management access", "firewall", "services", "updates", "logging", "backup"],
    actionHints: ["mikrotik.allow_management_source", "mikrotik.disable_service", "mikrotik.basic_input_hardening", "mikrotik.export_config"]
  }),
  linux: profile({
    vendor: "linux", label: "Linux",
    collectionAreas: ["SSH posture", "listening ports", "users/sudo", "firewall/ufw/nft/iptables", "fail2ban/auditd", "docker/nginx/apache", "auth/system/kernel logs", "package/update posture"],
    analysisSections: ["SSH posture", "Listening ports", "Users and sudo", "Firewall (UFW/nftables/iptables)", "Fail2ban and auditd", "Docker/Nginx/Apache", "Authentication, system and kernel logs", "Package and update posture"],
    riskChecks: ["SSH password authentication enabled", "SSH root login enabled", "unexpected listening services", "host firewall inactive", "fail2ban inactive", "missing auditd", "pending security updates"],
    hardeningCategories: ["SSH", "network exposure", "privilege", "host firewall", "intrusion prevention", "audit", "updates"],
    actionHints: ["linux.disable_ssh_password_auth", "linux.fail2ban_jail", "linux.read_listening_ports", "generic_security_action"]
  }),
  fortigate: profile({
    vendor: "fortigate", label: "FortiGate",
    collectionAreas: ["admin access", "interfaces/zones", "firewall policies", "NAT/VIP exposure", "local-in policy", "VPN", "security profiles", "logs/threat/auth events", "firmware/version posture"],
    analysisSections: ["Admin access", "Interfaces and zones", "Firewall policies", "NAT and VIP exposure", "Local-in policy", "VPN", "Security profiles", "Threat and authentication logs", "Firmware/version posture"],
    riskChecks: ["admin access exposed", "broad firewall policy", "VIP exposes management or sensitive service", "missing local-in restriction", "security profiles absent", "outdated firmware"],
    hardeningCategories: ["administration", "policy", "VIP/NAT", "local-in", "VPN", "security profiles", "firmware"],
    actionHints: ["fortigate.enable_policy_logging", "fortigate.backup_config", "generic_security_action"]
  }),
  pfsense: profile({
    vendor: "pfsense", label: "pfSense",
    collectionAreas: ["WAN/LAN/interfaces", "firewall rules", "NAT/port forwards", "VPN", "aliases", "services", "package/update status", "logs/blocked traffic/auth events"],
    analysisSections: ["WAN, LAN and interfaces", "Firewall rules", "NAT and port forwards", "VPN", "Aliases", "Services", "Package/update status", "Blocked traffic and authentication logs"],
    riskChecks: ["WAN rule permits management", "broad pass rule", "sensitive port forward", "admin service exposed", "stale packages"],
    hardeningCategories: ["WAN access", "firewall", "NAT", "VPN", "services", "updates", "logging"],
    actionHints: ["pfsense.restrict_wan_management", "generic_security_action"]
  }),
  cisco: profile({
    vendor: "cisco", label: "Cisco",
    collectionAreas: ["AAA/users", "SSH/Telnet/HTTP management", "ACLs", "interfaces", "routing", "SNMP/NTP/syslog", "login failures", "running-config risk indicators"],
    analysisSections: ["AAA and users", "SSH, Telnet and HTTP management", "ACLs", "Interfaces", "Routing", "SNMP, NTP and syslog", "Login failures", "Running-config risk indicators"],
    riskChecks: ["telnet enabled", "plain HTTP management enabled", "AAA absent", "SNMP community defaults", "broad ACL", "logging missing"],
    hardeningCategories: ["AAA", "management plane", "ACL", "SNMP", "time", "logging", "configuration"],
    actionHints: ["cisco.disable_telnet", "generic_security_action"]
  }),
  generic: profile({
    vendor: "generic", label: "Generic / unknown",
    collectionAreas: ["connectivity", "exposed services", "auth/log signals", "available capabilities", "missing telemetry"],
    analysisSections: ["Connectivity", "Exposed services", "Authentication and log signals", "Available capabilities", "Missing telemetry"],
    riskChecks: ["connectivity unverified", "unexpected exposed service", "authentication failures", "logging unavailable", "vendor capabilities unknown"],
    hardeningCategories: ["connectivity", "service exposure", "authentication", "logging", "telemetry"],
    actionHints: ["generic_security_action"]
  })
};

export function normalizeAnalysisVendor(value: unknown): AnalysisVendor {
  const text = String(value ?? "").trim().toLowerCase();
  if (text.includes("mikrotik") || text.includes("routeros")) return "mikrotik";
  if (text.includes("forti")) return "fortigate";
  if (text.includes("linux") || text.includes("ubuntu") || text.includes("debian") || text.includes("centos") || text.includes("rhel")) return "linux";
  if (text.includes("pfsense")) return "pfsense";
  if (text.includes("cisco") || text.includes("ios-xe") || text === "ios") return "cisco";
  return "generic";
}

function searchable(value: unknown) {
  try { return JSON.stringify(value ?? {}).toLowerCase(); } catch { return ""; }
}

export type VendorDeviceAnalysis = {
  deviceId: string;
  device: string;
  vendor: AnalysisVendor;
  vendorLabel: string;
  collectedData: string[];
  missingData: string[];
  sections: Array<{ name: string; status: "collected" | "data_not_collected"; evidence: string }>;
  findings: Array<{ id: string; severity: "medium" | "high"; title: string; evidence: string; impact: string; recommendedFix: string; createActionSupported: boolean; actionHint: string }>;
  recommendedActions: string[];
};

export function analyzeVendorDevice(device: { id: string; name: string; vendor?: unknown; type?: unknown; status?: unknown; managementPort?: unknown; protocol?: unknown; capabilities?: unknown }, snapshots: Array<{ dataJson?: unknown; snapshotType?: string }> = []): VendorDeviceAnalysis {
  const vendor = normalizeAnalysisVendor(device.vendor || device.type);
  const p = VENDOR_ANALYSIS_PROFILES[vendor];
  const snapshotText = searchable(snapshots.map((item) => item.dataJson));
  const collectedData = p.collectionAreas.filter((area) => area.toLowerCase().split(/[\/ (),-]+/).some((word) => word.length > 3 && snapshotText.includes(word)));
  const missingData = p.collectionAreas.filter((area) => !collectedData.includes(area));
  const findings: VendorDeviceAnalysis["findings"] = [];
  const add = (id: string, severity: "medium" | "high", title: string, evidence: string, impact: string, recommendedFix: string, actionHint = "generic_security_action") => findings.push({ id: `${device.id}:${id}`, severity, title, evidence, impact, recommendedFix, createActionSupported: true, actionHint });

  if (!snapshots.length) add("missing-telemetry", "medium", `${p.label} telemetry has not been collected`, "data not collected", "Important configuration risks cannot be verified.", `Collect: ${p.collectionAreas.join(", ")}.`);
  if (vendor === "linux" && /passwordauthentication[^a-z]*(yes|true|enabled)/.test(snapshotText)) add("ssh-password", "high", "SSH password authentication is enabled", "PasswordAuthentication yes", "Password guessing can lead to host compromise.", "Disable SSH password authentication after validating key-based access.", "linux.disable_ssh_password_auth");
  if (vendor === "linux" && /fail2ban[^a-z]*(inactive|disabled|not[_ -]?running)/.test(snapshotText)) add("fail2ban", "medium", "Fail2ban is inactive", "fail2ban inactive", "Repeated authentication attacks are not automatically throttled.", "Enable and configure an appropriate Fail2ban jail.", "linux.fail2ban_jail");
  if (vendor === "mikrotik" && /(winbox|www)[^}]{0,100}(0\.0\.0\.0\/0|any|wan|unrestricted)/.test(snapshotText)) add("management-exposure", "high", "Winbox or WWW management is broadly exposed", "Management service permits an untrusted source", "The router management plane is reachable by attackers.", "Restrict management services to trusted source networks.", "mikrotik.allow_management_source");
  if (vendor === "fortigate" && /vip[^}]{0,160}(admin|ssh|https|management|0\.0\.0\.0)/.test(snapshotText)) add("vip-exposure", "high", "VIP exposes a management or sensitive service", "FortiGate VIP exposure detected", "The published service increases external attack surface.", "Review and restrict the VIP and its firewall policy.");
  if (vendor === "pfsense" && /wan[^}]{0,160}(webgui|management|ssh|443|22)[^}]{0,100}(allow|pass)/.test(snapshotText)) add("wan-management", "high", "WAN rule allows management access", "WAN pass rule includes a management service", "The pfSense management plane may be internet reachable.", "Restrict the WAN rule to explicit trusted sources.");
  if (vendor === "cisco" && /telnet[^}]{0,100}(enabled|transport input[^\n]*telnet)/.test(snapshotText)) add("telnet", "high", "Telnet management is enabled", "VTY transport accepts Telnet", "Credentials and sessions may traverse the network without encryption.", "Disable Telnet and permit SSH only.");

  return {
    deviceId: device.id, device: device.name, vendor, vendorLabel: p.label,
    collectedData, missingData,
    sections: p.analysisSections.map((name) => ({ name, status: collectedData.some((area) => name.toLowerCase().includes(area.split(/[\/ (]/)[0].toLowerCase())) ? "collected" : "data_not_collected", evidence: collectedData.length ? "Available snapshot inspected" : "data not collected" })),
    findings,
    recommendedActions: findings.map((item) => item.recommendedFix)
  };
}

export function buildCompactVendorAiContext(analyses: VendorDeviceAnalysis[]) {
  return analyses.map((item) => ({ device: item.device, vendor: item.vendor, collectedSections: item.collectedData, topFindings: item.findings.slice(0, 5).map(({ title, severity, evidence }) => ({ title, severity, evidence })), missingTelemetry: item.missingData, recommendedActions: item.recommendedActions.slice(0, 5) }));
}
