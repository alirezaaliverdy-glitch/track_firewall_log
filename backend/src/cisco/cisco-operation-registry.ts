import type { CiscoReadCommandId } from "../connectors/cisco/ios-xe/cisco-iosxe.templates.js";

export type CiscoOperationMode = "show" | "configure" | "backup" | "restore" | "diagnostic";
export type CiscoOperationState = "implemented" | "manualOnly" | "planned";
export type CiscoOperationRisk = "low" | "medium" | "high" | "critical";

export type CiscoOperationDefinition = {
  id: string;
  slug: string;
  category: string;
  titleEn: string;
  titleFa: string;
  mode: CiscoOperationMode;
  state: CiscoOperationState;
  risk: CiscoOperationRisk;
  readOnly: boolean;
  commandIds: CiscoReadCommandId[];
  executionTemplateRef: string | null;
  requiredParams?: string[];
  optionalParams?: string[];
  keywords: string[];
  prechecks: string[];
  verification: string[];
  rollback: { available: true; steps: string[] } | { available: false; reason: string };
};

export const CISCO_OPERATION_CATEGORIES = Object.freeze([
  { key: "show", title: "Show commands and troubleshooting" },
  { key: "system", title: "System, firmware, inventory, licensing" },
  { key: "interfaces", title: "Interfaces and switch ports" },
  { key: "switching", title: "VLAN, trunking, EtherChannel, STP" },
  { key: "routing", title: "Static routes, OSPF, EIGRP, BGP, VRRP/HSRP" },
  { key: "security", title: "ACL, NAT, AAA, local users, management access" },
  { key: "services", title: "DHCP, DNS, NTP, SNMP, Syslog, IP SLA, tracking" },
  { key: "configuration", title: "Backup, restore, archive, diff, save, reload" },
  { key: "health", title: "CPU, memory, flash, interface statistics" }
] as const);

const readonlyRollback = { available: false as const, reason: "Read-only operation; no rollback is required." };
const plannedRollback = { available: false as const, reason: "Planned operation; rollback contract must be implemented before execution is enabled." };

function implemented(slug: string, title: string, category: string, commandIds: CiscoReadCommandId[], keywords: string[], extra: Partial<CiscoOperationDefinition> = {}): CiscoOperationDefinition {
  return {
    id: `cisco.${slug}`,
    slug,
    category,
    titleEn: title,
    titleFa: title,
    mode: extra.mode ?? "show",
    state: "implemented",
    risk: extra.risk ?? "low",
    readOnly: true,
    commandIds,
    executionTemplateRef: `cisco_${slug.replace(/-/g, "_")}`,
    keywords,
    prechecks: extra.prechecks ?? ["Target must be a verified Cisco IOS-XE SSH device.", "Stored credential must open an interactive privileged EXEC shell."],
    verification: extra.verification ?? ["Action Center stores command output and connector evidence.", "No configuration mode command is sent."],
    rollback: readonlyRollback,
    requiredParams: [],
    optionalParams: [],
    ...extra
  };
}

function planned(slug: string, title: string, category: string, mode: CiscoOperationMode, risk: CiscoOperationRisk, requiredParams: string[] = [], keywords: string[] = []): CiscoOperationDefinition {
  return {
    id: `cisco.${slug}`,
    slug,
    category,
    titleEn: title,
    titleFa: title,
    mode,
    state: "planned",
    risk,
    readOnly: mode === "show" || mode === "diagnostic" || mode === "backup",
    commandIds: [],
    executionTemplateRef: null,
    requiredParams,
    optionalParams: [],
    keywords,
    prechecks: ["Not executable until a template, parser, precheck, verification, and rollback contract are registered."],
    verification: ["Planned roadmap item only."],
    rollback: plannedRollback
  };
}

export const CISCO_OPERATION_REGISTRY: readonly CiscoOperationDefinition[] = Object.freeze([
  implemented("show-version", "Show version and platform", "system", ["platform"], ["show version", "ios xe", "model", "uptime"]),
  implemented("show-inventory", "Show inventory and serial numbers", "system", ["inventory"], ["show inventory", "serial", "module"]),
  implemented("show-interfaces", "Show interface status and errors", "interfaces", ["interfacesStatus", "interfacesErrors"], ["show interfaces", "ports", "interface counters", "errors"]),
  implemented("show-ip-interfaces", "Show IP interface brief", "interfaces", ["ipInterfaceBrief"], ["show ip interface brief", "ip addresses"]),
  implemented("show-vlans", "Show VLANs", "switching", ["vlanBrief"], ["show vlan brief", "vlans"]),
  implemented("show-trunks", "Show trunk ports", "switching", ["trunk"], ["show interfaces trunk", "trunk ports"]),
  implemented("show-etherchannel", "Show EtherChannel summary", "switching", ["etherchannel"], ["show etherchannel", "port-channel"]),
  implemented("show-stp", "Show spanning tree summary", "switching", ["spanningTree"], ["show spanning-tree", "stp", "rstp", "mst"]),
  implemented("show-routes", "Show routing table", "routing", ["route"], ["show ip route", "routes", "static routes", "ospf", "eigrp", "bgp"]),
  implemented("show-acls", "Show access lists", "security", ["acl"], ["show access-lists", "acl"]),
  implemented("show-health", "Show CPU and memory", "health", ["cpu", "memory"], ["cpu", "memory", "health"]),
  implemented("show-logging", "Show logging and syslog state", "services", ["logging"], ["show logging", "syslog"]),
  implemented("show-ntp", "Show NTP status", "services", ["ntpStatus"], ["show ntp", "clock"]),
  implemented("show-license", "Show license information", "system", ["licenseSummary"], ["license", "smart license"]),
  implemented("show-flash", "Show flash storage", "health", ["flash"], ["dir flash", "flash", "storage"]),
  implemented("diagnostics-basic", "Basic Cisco diagnostic bundle", "show", ["platform", "inventory", "interfacesStatus", "ipInterfaceBrief", "route"], ["diagnostics", "troubleshooting", "health check"], { mode: "diagnostic" }),

  planned("configure-interface-description", "Set interface description", "interfaces", "configure", "medium", ["interfaceName", "description"], ["interface description"]),
  planned("configure-interface-state", "Enable or disable interface", "interfaces", "configure", "high", ["interfaceName", "desiredState"], ["shutdown", "no shutdown"]),
  planned("configure-access-port", "Configure access switch port", "switching", "configure", "high", ["interfaceName", "vlanId"], ["switchport access vlan"]),
  planned("configure-trunk-port", "Configure trunk switch port", "switching", "configure", "high", ["interfaceName", "allowedVlans"], ["switchport trunk"]),
  planned("create-vlan", "Create VLAN", "switching", "configure", "medium", ["vlanId", "name"], ["vlan", "create vlan"]),
  planned("configure-etherchannel", "Configure EtherChannel", "switching", "configure", "high", ["channelGroup", "interfaces"], ["port-channel", "etherchannel"]),
  planned("configure-stp", "Configure STP/RSTP/MST", "switching", "configure", "high", ["mode"], ["spanning-tree", "rstp", "mst"]),
  planned("add-static-route", "Add static route", "routing", "configure", "high", ["destinationCidr", "nextHop"], ["ip route", "static route"]),
  planned("configure-ospf", "Configure OSPF", "routing", "configure", "high", ["processId", "networks"], ["router ospf"]),
  planned("configure-eigrp", "Configure EIGRP", "routing", "configure", "high", ["asn", "networks"], ["router eigrp"]),
  planned("configure-bgp", "Configure BGP", "routing", "configure", "critical", ["asn", "neighbors"], ["router bgp"]),
  planned("configure-hsrp", "Configure HSRP", "routing", "configure", "high", ["interfaceName", "group", "virtualIp"], ["standby", "hsrp"]),
  planned("configure-vrrp", "Configure VRRP", "routing", "configure", "high", ["interfaceName", "group", "virtualIp"], ["vrrp"]),
  planned("configure-acl", "Configure ACL", "security", "configure", "high", ["aclName", "entries"], ["ip access-list"]),
  planned("configure-nat", "Configure NAT", "security", "configure", "high", ["insideInterface", "outsideInterface"], ["ip nat"]),
  planned("configure-dhcp", "Configure DHCP", "services", "configure", "medium", ["poolName", "network"], ["ip dhcp pool"]),
  planned("configure-dns", "Configure DNS", "services", "configure", "medium", ["servers"], ["ip name-server"]),
  planned("configure-ntp", "Configure NTP", "services", "configure", "medium", ["servers"], ["ntp server"]),
  planned("configure-aaa", "Configure AAA", "security", "configure", "critical", ["aaaModel"], ["aaa new-model"]),
  planned("configure-local-user", "Configure local user", "security", "configure", "high", ["username", "privilege"], ["username privilege"]),
  planned("configure-ssh", "Configure SSH management", "security", "configure", "critical", ["trustedSource"], ["transport input ssh"]),
  planned("configure-telnet-legacy", "Configure Telnet legacy access", "security", "configure", "critical", ["explicitLegacyApproval"], ["telnet", "legacy only"]),
  planned("configure-snmp", "Configure SNMP", "services", "configure", "high", ["version", "server"], ["snmp-server"]),
  planned("configure-syslog", "Configure Syslog", "services", "configure", "medium", ["server"], ["logging host"]),
  planned("configure-port-security", "Configure port security", "security", "configure", "high", ["interfaceName"], ["switchport port-security"]),
  planned("configure-qos", "Configure QoS", "services", "configure", "high", ["policyName"], ["policy-map", "class-map"]),
  planned("configure-ip-sla", "Configure IP SLA", "services", "configure", "medium", ["operationId"], ["ip sla"]),
  planned("configure-object-tracking", "Configure object tracking", "services", "configure", "medium", ["trackId"], ["track"]),
  planned("backup-running-config", "Backup running configuration", "configuration", "backup", "low", [], ["show running-config", "backup"]),
  planned("restore-configuration", "Restore configuration", "configuration", "restore", "critical", ["backupRef"], ["configure replace", "restore"]),
  planned("archive-configuration", "Archive configuration", "configuration", "configure", "medium", ["archiveDestination"], ["archive"]),
  planned("configuration-diff", "Configuration diff", "configuration", "diagnostic", "medium", ["baselineRef"], ["diff", "archive config differences"]),
  planned("save-configuration", "Save running configuration", "configuration", "configure", "high", [], ["write memory", "copy running startup"]),
  planned("reload-device", "Reload device", "configuration", "configure", "critical", ["maintenanceWindow"], ["reload"])
]);

export function findCiscoOperation(id: string | null | undefined) {
  if (!id) return undefined;
  return CISCO_OPERATION_REGISTRY.find((operation) => operation.id === id || operation.executionTemplateRef === id || operation.slug === id);
}

export function executableCiscoOperations() {
  return CISCO_OPERATION_REGISTRY.filter((operation) => operation.state === "implemented" && operation.executionTemplateRef && operation.commandIds.length > 0);
}