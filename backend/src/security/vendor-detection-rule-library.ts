import type { SecurityEvent } from "@prisma/client";

type Severity = "low" | "medium" | "high" | "critical";
type RuleType = "port_scan" | "ssh_bruteforce" | "sensitive_port_exposure" | "deny_drop_spike" | "suspicious_outbound";

export type VendorDetectionRuleDefinition = {
  key: string;
  vendor: "linux" | "mikrotik" | "fortigate" | "cisco" | "pfsense";
  name: string;
  description: string;
  severity: Severity;
  ruleType: RuleType;
  threshold: number;
  windowMinutes: number;
  category: string;
  mitreTags: string[];
  standards: Array<{ framework: string; control: string }>;
  sourceUrl: string;
  pattern: RegExp;
  groupBy?: "source" | "user" | "port" | "device";
  logicalEventFamily?: "authentication_failure";
};

// Only high-confidence, operator-actionable rules may generate email.
// Every other rule still creates a traceable Finding in the application.
export const PRIORITY_EMAIL_RULE_KEYS = new Set([
  "linux.auth-failure-burst",
  "linux.root-remote-login",
  "linux.firewall-disabled",
  "linux.audit-tamper",
  "mikrotik.login-failure-burst",
  "mikrotik.admin-change",
  "mikrotik.management-exposure",
  "fortigate.admin-login-failure",
  "fortigate.admin-change",
  "fortigate.security-threat",
  "cisco.login-failure-burst",
  "cisco.configuration-change",
  "cisco.insecure-management",
  "pfsense.login-failure-burst",
  "pfsense.nat-change"
]);

export const PRIORITY_EMAIL_RULE_LABELS_FA: Record<string, string> = {
  "linux.auth-failure-burst": "افزایش تلاش‌های ناموفق ورود به لینوکس",
  "linux.root-remote-login": "ورود راه‌دور با حساب root",
  "linux.sudo-failure": "افزایش تلاش‌های ناموفق sudo",
  "linux.firewall-disabled": "غیرفعال‌شدن فایروال لینوکس",
  "linux.audit-tamper": "دستکاری یا توقف ثبت رویدادهای امنیتی لینوکس",
  "mikrotik.login-failure-burst": "افزایش تلاش‌های ناموفق ورود به MikroTik",
  "mikrotik.admin-change": "تغییر حساب مدیریتی MikroTik",
  "mikrotik.management-exposure": "فعال‌شدن سرویس مدیریت ناامن MikroTik",
  "mikrotik.firewall-change": "تغییر سیاست فایروال MikroTik",
  "mikrotik.vpn-failure-burst": "افزایش خطاهای VPN در MikroTik",
  "fortigate.admin-login-failure": "افزایش تلاش‌های ناموفق ورود مدیر FortiGate",
  "fortigate.admin-change": "تغییر حساب مدیر FortiGate",
  "fortigate.security-threat": "شناسایی تهدید امنیتی شدید در FortiGate",
  "fortigate.sslvpn-failure": "افزایش خطاهای SSL-VPN در FortiGate",
  "fortigate.policy-change": "تغییر سیاست امنیتی FortiGate",
  "cisco.login-failure-burst": "افزایش تلاش‌های ناموفق ورود به Cisco",
  "cisco.configuration-change": "تغییر پیکربندی Cisco",
  "cisco.insecure-management": "فعال‌شدن دسترسی مدیریتی ناامن Cisco",
  "cisco.acl-deny-spike": "افزایش ردشدن ترافیک در ACL سیسکو",
  "cisco.vpn-failure": "افزایش خطاهای VPN در Cisco",
  "pfsense.login-failure-burst": "افزایش تلاش‌های ناموفق ورود به pfSense",
  "pfsense.nat-change": "تغییر NAT یا انتقال پورت در pfSense",
  "pfsense.sshguard-spike": "افزایش مسدودسازی sshguard در pfSense",
  "pfsense.firewall-block-spike": "افزایش مسدودسازی فایروال pfSense",
  "pfsense.vpn-failure": "افزایش خطاهای VPN در pfSense",
  "pfsense.ids-alert": "هشدار نفوذ Snort یا Suricata در pfSense"
};

const NIST = { framework: "NIST CSF 2.0", control: "DE.CM / DE.AE" };
const CIS = { framework: "CIS Controls v8", control: "8.11 / 13" };
const MITRE_BRUTE = { framework: "MITRE ATT&CK", control: "T1110" };

export const VENDOR_DETECTION_RULES: VendorDetectionRuleDefinition[] = [
  { key: "linux.auth-failure-burst", vendor: "linux", name: "Linux: repeated authentication failures", description: "Detects a burst of failed SSH, PAM, or system authentication attempts from one source.", severity: "high", ruleType: "ssh_bruteforce", threshold: 5, windowMinutes: 15, category: "authentication", mitreTags: ["T1110"], standards: [NIST, CIS, MITRE_BRUTE], sourceUrl: "https://attack.mitre.org/techniques/T1110/", pattern: /failed password|authentication failure|pam_unix.*failure|invalid user|auth_failure/i, groupBy: "source", logicalEventFamily: "authentication_failure" },
  { key: "linux.root-remote-login", vendor: "linux", name: "Linux: remote root login", description: "Detects a successful remote login using the root account.", severity: "critical", ruleType: "suspicious_outbound", threshold: 1, windowMinutes: 15, category: "privileged-access", mitreTags: ["T1078"], standards: [NIST, CIS], sourceUrl: "https://attack.mitre.org/techniques/T1078/", pattern: /accepted (password|publickey).*\broot\b|root.*login.*success/i, groupBy: "source" },
  { key: "linux.sudo-failure", vendor: "linux", name: "Linux: repeated sudo failures", description: "Detects repeated failed privilege elevation or sudo authentication.", severity: "high", ruleType: "ssh_bruteforce", threshold: 3, windowMinutes: 10, category: "privilege-escalation", mitreTags: ["T1548.003"], standards: [NIST, CIS], sourceUrl: "https://attack.mitre.org/techniques/T1548/003/", pattern: /sudo.*(authentication failure|incorrect password|not in the sudoers)|privilege.*denied/i, groupBy: "user" },
  { key: "linux.firewall-disabled", vendor: "linux", name: "Linux: host firewall disabled", description: "Detects disabling or stopping UFW, firewalld, nftables, or iptables protection.", severity: "critical", ruleType: "suspicious_outbound", threshold: 1, windowMinutes: 15, category: "defense-evasion", mitreTags: ["T1562.004"], standards: [NIST, CIS], sourceUrl: "https://attack.mitre.org/techniques/T1562/004/", pattern: /firewall_disabled|ufw.*(disabled|inactive)|firewalld.*(stopped|inactive|disabled)|nftables.*(stopped|disabled)|iptables.*flush/i, groupBy: "device" },
  { key: "linux.audit-tamper", vendor: "linux", name: "Linux: audit trail tampering", description: "Detects stopping audit services or clearing security logs.", severity: "critical", ruleType: "suspicious_outbound", threshold: 1, windowMinutes: 15, category: "log-integrity", mitreTags: ["T1070.001", "T1562.002"], standards: [NIST, CIS], sourceUrl: "https://www.cisecurity.org/controls/audit-log-management", pattern: /auditd.*(stopped|disabled|failed)|journalctl.*vacuum|log(s)?.*(cleared|deleted)|audit.*tamper/i, groupBy: "device" },

  { key: "mikrotik.login-failure-burst", vendor: "mikrotik", name: "MikroTik: repeated login failures", description: "Detects repeated RouterOS account, SSH, WinBox, or API authentication failures.", severity: "high", ruleType: "ssh_bruteforce", threshold: 5, windowMinutes: 15, category: "authentication", mitreTags: ["T1110"], standards: [NIST, CIS, MITRE_BRUTE], sourceUrl: "https://help.mikrotik.com/docs/spaces/ROS/pages/328094/Log", pattern: /login failure|authentication failed|invalid user|account.*fail|ssh.*fail|winbox.*fail/i, groupBy: "source", logicalEventFamily: "authentication_failure" },
  { key: "mikrotik.admin-change", vendor: "mikrotik", name: "MikroTik: administrator account changed", description: "Detects creation, removal, or privilege changes for RouterOS users.", severity: "high", ruleType: "suspicious_outbound", threshold: 1, windowMinutes: 15, category: "account-management", mitreTags: ["T1098"], standards: [NIST, CIS], sourceUrl: "https://help.mikrotik.com/docs/spaces/ROS/pages/8978504/User", pattern: /user.*(added|removed|changed|group changed)|account.*(created|deleted)|admin_created/i, groupBy: "user" },
  { key: "mikrotik.management-exposure", vendor: "mikrotik", name: "MikroTik: insecure management service enabled", description: "Detects enabling Telnet, FTP, HTTP WebFig, API, or another management listener.", severity: "high", ruleType: "sensitive_port_exposure", threshold: 1, windowMinutes: 15, category: "management-plane", mitreTags: ["T1133"], standards: [NIST, CIS], sourceUrl: "https://help.mikrotik.com/docs/spaces/ROS/pages/103841820/Services", pattern: /(telnet|ftp|www|api).*\b(enabled|running|added)\b|management_service_enabled/i, groupBy: "port" },
  { key: "mikrotik.firewall-change", vendor: "mikrotik", name: "MikroTik: firewall policy changed", description: "Detects RouterOS filter, raw, mangle, or NAT rule changes.", severity: "high", ruleType: "suspicious_outbound", threshold: 1, windowMinutes: 15, category: "configuration-change", mitreTags: ["T1562.004"], standards: [NIST, CIS], sourceUrl: "https://help.mikrotik.com/docs/spaces/ROS/pages/250708066/Firewall", pattern: /(firewall|filter|raw|mangle|nat).*(rule )?(added|removed|changed|moved|disabled)|policy_change|nat_change/i, groupBy: "device" },
  { key: "mikrotik.vpn-failure-burst", vendor: "mikrotik", name: "MikroTik: repeated VPN failures", description: "Detects repeated IPsec, L2TP, OpenVPN, or WireGuard negotiation/authentication failures.", severity: "high", ruleType: "ssh_bruteforce", threshold: 3, windowMinutes: 15, category: "vpn", mitreTags: ["T1110"], standards: [NIST, CIS], sourceUrl: "https://help.mikrotik.com/docs/spaces/ROS/pages/328094/Log", pattern: /(ipsec|l2tp|ovpn|openvpn|wireguard|ppp).*(auth|handshake|negotiat).*(fail|error)|vpn_auth_failure/i, groupBy: "source" },

  { key: "fortigate.admin-login-failure", vendor: "fortigate", name: "FortiGate: repeated administrator login failures", description: "Detects bursts of failed administrative GUI, SSH, or API logins.", severity: "high", ruleType: "ssh_bruteforce", threshold: 5, windowMinutes: 15, category: "authentication", mitreTags: ["T1110"], standards: [NIST, CIS, MITRE_BRUTE], sourceUrl: "https://docs.fortinet.com/document/fortigate/latest/fortios-log-message-reference/", pattern: /fortigate_admin_auth_failure|admin.*login.*fail|login failed|authentication failure|action=.login.*status=.fail/i, groupBy: "source", logicalEventFamily: "authentication_failure" },
  { key: "fortigate.admin-change", vendor: "fortigate", name: "FortiGate: administrator account changed", description: "Detects creation, deletion, or privilege/profile changes for administrator accounts.", severity: "critical", ruleType: "suspicious_outbound", threshold: 1, windowMinutes: 15, category: "account-management", mitreTags: ["T1098"], standards: [NIST, CIS], sourceUrl: "https://docs.fortinet.com/document/fortigate/latest/administration-guide/", pattern: /system\.admin|administrator.*(added|created|deleted|changed)|admin_created/i, groupBy: "user" },
  { key: "fortigate.sslvpn-failure", vendor: "fortigate", name: "FortiGate: repeated SSL-VPN failures", description: "Detects repeated failed SSL-VPN or IPsec remote-access authentication.", severity: "high", ruleType: "ssh_bruteforce", threshold: 5, windowMinutes: 15, category: "vpn", mitreTags: ["T1110"], standards: [NIST, CIS], sourceUrl: "https://docs.fortinet.com/document/fortigate/latest/fortios-log-message-reference/", pattern: /fortigate_vpn_auth_failure|(ssl.?vpn|ipsec|vpn).*(login|auth|handshake).*(fail|error|denied)|vpn_auth_failure/i, groupBy: "source", logicalEventFamily: "authentication_failure" },
  { key: "fortigate.security-threat", vendor: "fortigate", name: "FortiGate: high-severity security threat", description: "Detects FortiOS IPS signatures, DoS anomalies, malware, botnet/C2 and web-application attacks while preserving the firewall action.", severity: "critical", ruleType: "suspicious_outbound", threshold: 1, windowMinutes: 10, category: "threat-prevention", mitreTags: ["T1190"], standards: [NIST, CIS], sourceUrl: "https://docs.fortinet.com/document/fortigate/latest/fortios-log-message-reference/", pattern: /fortigate_(?:ips_attack|dos_attack|malware_detected|botnet_detected|web_attack)|(?:ips|utm|antivirus|virus|botnet|malware).*(?:critical|high|blocked|detected)|type=.utm/i, groupBy: "source" },
  { key: "fortigate.denied-source-burst", vendor: "fortigate", name: "FortiGate: repeated denied traffic from one source", description: "Detects a sustained burst of denied traffic from one source without treating an isolated firewall deny as an attack.", severity: "medium", ruleType: "deny_drop_spike", threshold: 20, windowMinutes: 5, category: "network-defense", mitreTags: ["T1046"], standards: [NIST, CIS], sourceUrl: "https://docs.fortinet.com/document/fortigate/latest/fortios-log-message-reference/", pattern: /fortigate_(?:traffic|local_in)_denied/i, groupBy: "source" },
  { key: "fortigate.policy-change", vendor: "fortigate", name: "FortiGate: security policy changed", description: "Detects firewall policy, local-in policy, VIP, or NAT configuration changes.", severity: "high", ruleType: "suspicious_outbound", threshold: 1, windowMinutes: 15, category: "configuration-change", mitreTags: ["T1562.004"], standards: [NIST, CIS], sourceUrl: "https://docs.fortinet.com/document/fortigate/latest/administration-guide/", pattern: /(firewall policy|local-in-policy|firewall vip|central-snat-map|nat).*(add|edit|delete|change)|policy_change|nat_change/i, groupBy: "device" },

  { key: "cisco.login-failure-burst", vendor: "cisco", name: "Cisco: repeated AAA/login failures", description: "Detects repeated IOS/IOS-XE local or AAA authentication failures.", severity: "high", ruleType: "ssh_bruteforce", threshold: 5, windowMinutes: 15, category: "authentication", mitreTags: ["T1110"], standards: [NIST, CIS, MITRE_BRUTE], sourceUrl: "https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/security-vpn/security-vpn/m_sec-login-enhance-0.html", pattern: /login_failed|login failure|authentication failed|aaa.*fail|%sec_login.*fail/i, groupBy: "source", logicalEventFamily: "authentication_failure" },
  { key: "cisco.configuration-change", vendor: "cisco", name: "Cisco: configuration changed", description: "Detects IOS/IOS-XE configuration commits or changes by an operator.", severity: "high", ruleType: "suspicious_outbound", threshold: 1, windowMinutes: 15, category: "configuration-change", mitreTags: ["T1562.004"], standards: [NIST, CIS], sourceUrl: "https://www.cisco.com/c/en/us/support/docs/ios-nx-os-software/ios-software-releases-123-mainline/17821-ios-logging.html", pattern: /%sys-5-config_i|configured from|configuration.*changed|policy_change/i, groupBy: "user" },
  { key: "cisco.insecure-management", vendor: "cisco", name: "Cisco: insecure management access enabled", description: "Detects Telnet transport, HTTP management, or other insecure remote administration exposure.", severity: "critical", ruleType: "sensitive_port_exposure", threshold: 1, windowMinutes: 15, category: "management-plane", mitreTags: ["T1133"], standards: [NIST, CIS], sourceUrl: "https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/security/secure-management/", pattern: /transport input.*telnet|ip http server|telnet.*enabled|management_service_enabled/i, groupBy: "device" },
  { key: "cisco.acl-deny-spike", vendor: "cisco", name: "Cisco: ACL deny spike", description: "Detects a burst of denied packets from one source in IOS/IOS-XE ACL logs.", severity: "medium", ruleType: "deny_drop_spike", threshold: 20, windowMinutes: 5, category: "network-defense", mitreTags: [], standards: [NIST, CIS], sourceUrl: "https://www.cisco.com/c/en/us/support/docs/security/ios-firewall/23602-confaccesslists.html", pattern: /%sec-6-ipaccesslog|access.?list.*(denied|deny)|acl.*drop/i, groupBy: "source" },
  { key: "cisco.vpn-failure", vendor: "cisco", name: "Cisco: repeated VPN negotiation failures", description: "Detects repeated IKE, IPsec, or AnyConnect tunnel authentication/negotiation failures.", severity: "high", ruleType: "ssh_bruteforce", threshold: 3, windowMinutes: 15, category: "vpn", mitreTags: ["T1110"], standards: [NIST, CIS], sourceUrl: "https://www.cisco.com/c/en/us/support/security/", pattern: /(ike|ipsec|webvpn|anyconnect).*(authentication|negotiation|handshake).*(fail|error)|vpn_auth_failure/i, groupBy: "source" },

  { key: "pfsense.login-failure-burst", vendor: "pfsense", name: "pfSense: repeated management login failures", description: "Detects repeated WebGUI, SSH, or local authentication failures.", severity: "high", ruleType: "ssh_bruteforce", threshold: 5, windowMinutes: 15, category: "authentication", mitreTags: ["T1110"], standards: [NIST, CIS, MITRE_BRUTE], sourceUrl: "https://docs.netgate.com/pfsense/en/latest/monitoring/logs/remote.html", pattern: /webgui.*(login|auth).*(fail|invalid)|sshd.*failed password|authentication error|login failure/i, groupBy: "source", logicalEventFamily: "authentication_failure" },
  { key: "pfsense.sshguard-spike", vendor: "pfsense", name: "pfSense: sshguard block spike", description: "Detects repeated addresses blocked by sshguard after authentication abuse.", severity: "high", ruleType: "deny_drop_spike", threshold: 5, windowMinutes: 10, category: "authentication", mitreTags: ["T1110"], standards: [NIST, CIS], sourceUrl: "https://docs.netgate.com/pfsense/en/latest/monitoring/logs/", pattern: /sshguard.*(block|attack|blacklist)/i, groupBy: "source" },
  { key: "pfsense.firewall-block-spike", vendor: "pfsense", name: "pfSense: firewall block spike", description: "Detects a burst of pf filter blocks from the same source.", severity: "medium", ruleType: "deny_drop_spike", threshold: 20, windowMinutes: 5, category: "network-defense", mitreTags: [], standards: [NIST, CIS], sourceUrl: "https://docs.netgate.com/pfsense/en/latest/monitoring/logs/firewall.html", pattern: /filterlog.*\bblock\b|pf.*(blocked|deny)|firewall.*drop/i, groupBy: "source" },
  { key: "pfsense.nat-change", vendor: "pfsense", name: "pfSense: NAT or port-forward changed", description: "Detects changes to NAT, port forwards, or firewall rules.", severity: "high", ruleType: "suspicious_outbound", threshold: 1, windowMinutes: 15, category: "configuration-change", mitreTags: ["T1562.004"], standards: [NIST, CIS], sourceUrl: "https://docs.netgate.com/pfsense/en/latest/nat/", pattern: /(nat|port forward|firewall rule).*(added|changed|deleted|saved)|nat_change|policy_change/i, groupBy: "user" },
  { key: "pfsense.vpn-failure", vendor: "pfsense", name: "pfSense: repeated VPN failures", description: "Detects repeated OpenVPN or IPsec authentication and tunnel setup failures.", severity: "high", ruleType: "ssh_bruteforce", threshold: 3, windowMinutes: 15, category: "vpn", mitreTags: ["T1110"], standards: [NIST, CIS], sourceUrl: "https://docs.netgate.com/pfsense/en/latest/monitoring/logs/openvpn.html", pattern: /(openvpn|charon|ipsec).*(auth|handshake|tls|negotiat).*(fail|error|denied)|vpn_auth_failure/i, groupBy: "source" }
  ,
  { key: "linux.web-probe-burst", vendor: "linux", name: "Linux: web exploit probe burst", description: "Detects repeated high-signal web probes for secrets, traversal, shells, or common administration paths.", severity: "medium", ruleType: "port_scan", threshold: 4, windowMinutes: 5, category: "reconnaissance", mitreTags: ["T1595.002"], standards: [NIST, CIS], sourceUrl: "https://attack.mitre.org/techniques/T1595/002/", pattern: /(?:\.env|\.git\/config|wp-login\.php|\/etc\/passwd|\.\.\/|cmd\.php|shell\.php|phpmyadmin)/i, groupBy: "source" },
  { key: "linux.firewall-deny-burst", vendor: "linux", name: "Linux: inbound firewall denial burst", description: "Detects repeated UFW or kernel firewall denies from one source while ignoring isolated background traffic.", severity: "medium", ruleType: "deny_drop_spike", threshold: 20, windowMinutes: 5, category: "network-defense", mitreTags: ["T1046"], standards: [NIST, CIS], sourceUrl: "https://attack.mitre.org/techniques/T1046/", pattern: /linux_firewall_denied|\bUFW (?:BLOCK|DENY)\b/i, groupBy: "source" },
  { key: "mikrotik.port-scan", vendor: "mikrotik", name: "MikroTik: port scan detected", description: "Detects RouterOS port-scan detector or repeated scan warnings from one source.", severity: "medium", ruleType: "port_scan", threshold: 1, windowMinutes: 5, category: "reconnaissance", mitreTags: ["T1046"], standards: [NIST, CIS], sourceUrl: "https://help.mikrotik.com/docs/spaces/ROS/pages/250708064/Common+Firewall+Matchers+and+Actions", pattern: /port.?scan|scan detected|psd.*(?:drop|detect)|scanner/i, groupBy: "source" },
  { key: "fortigate.local-in-probe", vendor: "fortigate", name: "FortiGate: management-plane probe", description: "Detects denied probes against FortiGate local-in and administrative services.", severity: "medium", ruleType: "port_scan", threshold: 4, windowMinutes: 5, category: "reconnaissance", mitreTags: ["T1046"], standards: [NIST, CIS], sourceUrl: "https://docs.fortinet.com/document/fortigate/latest/administration-guide/363127/local-in-policy", pattern: /(?:local.?in|eventtype=.local).*(?:deny|blocked|probe|scan)|management.*(?:probe|scan)/i, groupBy: "source" },
  { key: "cisco.snmp-auth-failure", vendor: "cisco", name: "Cisco: repeated SNMP authentication failures", description: "Detects repeated invalid SNMP community or authentication attempts.", severity: "medium", ruleType: "ssh_bruteforce", threshold: 3, windowMinutes: 10, category: "authentication", mitreTags: ["T1110"], standards: [NIST, CIS], sourceUrl: "https://www.cisco.com/c/en/us/support/docs/ip/simple-network-management-protocol-snmp/7282-12.html", pattern: /%snmp-3-authfail|snmp.*(?:authentication|community).*(?:fail|invalid|denied)/i, groupBy: "source", logicalEventFamily: "authentication_failure" },
  { key: "pfsense.ids-alert", vendor: "pfsense", name: "pfSense: IDS/IPS high-confidence alert", description: "Detects high-priority Snort or Suricata intrusion signatures reported by pfSense.", severity: "critical", ruleType: "suspicious_outbound", threshold: 1, windowMinutes: 10, category: "intrusion-detection", mitreTags: [], standards: [NIST, CIS], sourceUrl: "https://docs.netgate.com/pfsense/en/latest/packages/snort/index.html", pattern: /(?:suricata|snort).*(?:priority[:=]\s*[12]|attack|exploit|malware|trojan)|\[classification:.*(?:attack|trojan|malware)/i, groupBy: "source" }
];

export function normalizeDetectionVendor(value: unknown) {
  const vendor = String(value ?? "").trim().toLowerCase();
  if (/routeros|mikrotik/.test(vendor)) return "mikrotik";
  if (/fortinet|fortigate/.test(vendor)) return "fortigate";
  if (/ios|cisco/.test(vendor)) return "cisco";
  if (/pfsense|netgate/.test(vendor)) return "pfsense";
  if (/linux|ubuntu|debian|rhel|centos|rocky|alma/.test(vendor)) return "linux";
  return vendor;
}

export function eventMatchesVendorRule(ruleKey: string, event: SecurityEvent) {
  const definition = VENDOR_DETECTION_RULES.find((item) => item.key === ruleKey);
  if (!definition || normalizeDetectionVendor(event.vendor) !== definition.vendor) return false;
  const payload = [event.eventType, event.action, event.severity, event.ruleName, event.rawMessage, event.rawSnippet].filter(Boolean).join(" ");
  return definition.pattern.test(payload);
}

export function groupSubject(definition: VendorDetectionRuleDefinition, event: SecurityEvent) {
  if (definition.groupBy === "source") return event.srcIp ?? event.username ?? "unknown-source";
  if (definition.groupBy === "user") return event.username ?? event.srcIp ?? "unknown-user";
  if (definition.groupBy === "port") return String(event.dstPort ?? "unknown-port");
  return "device";
}

function detectionEventTime(event: SecurityEvent) {
  return (event.timestamp ?? event.receivedAt ?? event.createdAt).getTime();
}

function normalizedEvidenceText(event: SecurityEvent) {
  return String(event.rawMessage ?? event.rawSnippet ?? "")
    .toLowerCase()
    .replace(/^\s*\d{4}-\d{2}-\d{2}t\S+\s+/, "")
    .replace(/^\s*[a-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Vendor collectors may receive one journal entry in both ISO and syslog form.
 * Authentication stacks also emit PAM and sshd lines for the same attempt.
 * Detection thresholds must count logical attempts, not transport duplicates.
 */
export function deduplicateDetectionEvents(definition: VendorDetectionRuleDefinition, events: SecurityEvent[]) {
  const exact = new Map<string, SecurityEvent>();
  for (const event of events) {
    const key = [event.deviceId, event.srcIp, event.username, event.eventType, normalizedEvidenceText(event)].join("|");
    const previous = exact.get(key);
    if (!previous || detectionEventTime(event) > detectionEventTime(previous)) exact.set(key, event);
  }
  const uniqueEvents = [...exact.values()].sort((left, right) => detectionEventTime(left) - detectionEventTime(right));
  if (definition.logicalEventFamily !== "authentication_failure") return uniqueEvents;

  const logical: SecurityEvent[] = [];
  const latestAttempt = new Map<string, number>();
  for (const event of uniqueEvents) {
    const text = normalizedEvidenceText(event);
    const processId = text.match(/(?:sshd|pam_unix\(sshd:auth\))\[(\d+)\]/)?.[1] ?? "no-pid";
    const username = event.username ?? text.match(/(?:for|user=)\s*(?:invalid user\s+)?([\w.@-]+)/)?.[1] ?? "unknown-user";
    const key = [event.deviceId, event.srcIp, username.toLowerCase(), processId].join("|");
    const timestamp = detectionEventTime(event);
    const previous = latestAttempt.get(key);
    if (previous !== undefined && timestamp - previous <= 8_000) {
      latestAttempt.set(key, timestamp);
      continue;
    }
    latestAttempt.set(key, timestamp);
    logical.push(event);
  }
  return logical;
}
