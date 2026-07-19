import type { CiscoCliCommandSpec } from "../connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";
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
  buildCommandSpecs?: (params: Record<string, unknown>) => CiscoCliCommandSpec[];
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
const configRollback = (steps: string[]) => ({ available: true as const, steps });

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
    readOnly: extra.readOnly ?? true,
    commandIds,
    executionTemplateRef: `cisco_${slug.replace(/-/g, "_")}`,
    keywords,
    prechecks: extra.prechecks ?? ["Target must be a verified Cisco IOS-XE or IOS Classic SSH device.", "Stored credential must open an interactive privileged EXEC shell."],
    verification: extra.verification ?? ["Action Center stores command output and connector evidence.", "No configuration mode command is sent."],
    rollback: extra.rollback ?? readonlyRollback,
    requiredParams: extra.requiredParams ?? [],
    optionalParams: extra.optionalParams ?? [],
    buildCommandSpecs: extra.buildCommandSpecs,
    ...extra
  };
}

function implementedCli(slug: string, title: string, category: string, mode: CiscoOperationMode, risk: CiscoOperationRisk, readOnly: boolean, requiredParams: string[], keywords: string[], buildCommandSpecs: (params: Record<string, unknown>) => CiscoCliCommandSpec[], extra: Partial<CiscoOperationDefinition> = {}): CiscoOperationDefinition {
  return implemented(slug, title, category, [], keywords, {
    mode,
    risk,
    readOnly,
    requiredParams,
    buildCommandSpecs,
    verification: extra.verification ?? ["Action Center stores command output and connector evidence.", readOnly ? "Command is read-only." : "Post-change verification command is collected."],
    rollback: extra.rollback ?? (readOnly ? readonlyRollback : plannedRollback),
    ...extra
  });
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

function text(params: Record<string, unknown>, key: string) {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value.trim();
}
function optionalText(params: Record<string, unknown>, key: string) {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function iface(params: Record<string, unknown>) {
  const value = text(params, "interfaceName");
  if (!/^[A-Za-z][A-Za-z0-9/_.:-]{0,63}$/.test(value)) throw new Error("interfaceName is invalid.");
  return value;
}
function description(params: Record<string, unknown>) { return text(params, "description").replace(/[\r\n]/g, " ").slice(0, 180); }
function vlan(params: Record<string, unknown>, key = "vlanId") {
  const value = Number(params[key]);
  if (!Number.isInteger(value) || value < 1 || value > 4094) throw new Error(`${key} must be between 1 and 4094.`);
  return value;
}
function ip(params: Record<string, unknown>, key: string) {
  const value = text(params, key);
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) throw new Error(`${key} must be an IPv4 address.`);
  return value;
}
function cidr(params: Record<string, unknown>, key: string) {
  const value = text(params, key);
  if (!/^(?:\d{1,3}\.){3}\d{1,3}\/(?:[0-9]|[1-2][0-9]|3[0-2])$/.test(value)) throw new Error(`${key} must be an IPv4 CIDR.`);
  return value;
}
function mask(params: Record<string, unknown>, key = "subnetMask") { return ip(params, key); }
function cidrRoute(params: Record<string, unknown>, key = "destinationCidr") {
  const [network, prefixText] = cidr(params, key).split("/");
  const prefix = Number(prefixText);
  const maskNumber = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const maskText = [24, 16, 8, 0].map((shift) => String((maskNumber >>> shift) & 255)).join(".");
  return `${network} ${maskText}`;
}
function cli(commandId: string, command: string, options: Partial<CiscoCliCommandSpec> = {}): CiscoCliCommandSpec { return { commandId, command, ...options }; }
function configWorkflow(slug: string, commands: string[], verify: string[]): CiscoCliCommandSpec[] {
  return [cli(`${slug}.configure`, "configure terminal", { write: true }), ...commands.map((command, index) => cli(`${slug}.${index + 1}`, command, { write: true })), cli(`${slug}.end`, "end", { write: true }), ...verify.map((command, index) => cli(`${slug}.verify.${index + 1}`, command, { redactOutput: /running-config|startup-config/i.test(command) }))];
}

export const CISCO_OPERATION_REGISTRY: readonly CiscoOperationDefinition[] = Object.freeze([
  implemented("show-version", "Show version and platform", "system", ["platform"], ["show version", "ios", "model", "uptime"]),
  implemented("show-inventory", "Show inventory and serial numbers", "system", ["inventory"], ["show inventory", "serial", "module"]),
  implemented("show-interfaces-summary", "Show interfaces summary", "interfaces", ["interfacesStatus", "interfacesErrors"], ["show interfaces summary", "ports", "interface counters", "errors"]),
  implemented("show-interface-details", "Show interface details", "interfaces", ["interfacesDetailed"], ["show interfaces", "interface details"]),
  implemented("show-ip-interface-brief", "Show IP interface brief", "interfaces", ["ipInterfaceBrief"], ["show ip interface brief", "ip addresses"]),
  implemented("show-running-config", "Show running configuration", "configuration", ["runningConfig"], ["show running-config", "running config"], { risk: "medium" }),
  implemented("show-startup-config", "Show startup configuration", "configuration", ["startupConfig"], ["show startup-config", "startup config"], { risk: "medium" }),
  implemented("show-route", "Show routing table", "routing", ["route"], ["show ip route", "routes", "static routes", "ospf", "eigrp", "bgp"]),
  implemented("show-arp", "Show ARP table", "routing", ["arp"], ["show arp", "show ip arp"]),
  implemented("show-mac-table", "Show MAC address table", "switching", ["macAddressTable"], ["show mac address-table", "mac table"]),
  implemented("show-vlan-brief", "Show VLAN brief", "switching", ["vlanBrief"], ["show vlan brief", "vlans"]),
  implemented("show-trunks", "Show trunk ports", "switching", ["trunk"], ["show interfaces trunk", "trunk ports"]),
  implemented("show-etherchannel", "Show EtherChannel summary", "switching", ["etherchannel"], ["show etherchannel", "port-channel"]),
  implemented("show-stp", "Show spanning tree summary", "switching", ["spanningTree"], ["show spanning-tree", "stp", "rstp", "mst"]),
  implemented("show-acls", "Show access lists", "security", ["acl"], ["show access-lists", "acl"]),
  implemented("show-cpu", "Show CPU utilization", "health", ["cpu"], ["cpu", "show processes cpu"]),
  implemented("show-memory", "Show memory utilization", "health", ["memory"], ["memory", "show processes memory"]),
  implemented("show-flash", "Show flash storage", "health", ["flash"], ["dir flash", "flash", "storage"]),
  implemented("show-logs", "Show logs", "services", ["logging"], ["show logging", "syslog", "logs"]),
  implemented("show-clock", "Show clock", "services", ["clock"], ["show clock", "time"]),
  implemented("show-ntp", "Show NTP status", "services", ["ntpStatus"], ["show ntp", "clock"]),
  implemented("show-cdp-neighbors", "Show CDP neighbors", "services", ["cdpNeighbors"], ["show cdp neighbors", "neighbors"]),
  implemented("show-lldp-neighbors", "Show LLDP neighbors", "services", ["lldpNeighbors"], ["show lldp neighbors", "neighbors"]),
  implemented("show-health", "Show CPU, memory and flash", "health", ["cpu", "memory", "flash"], ["cpu", "memory", "health"]),
  implemented("diagnostics-basic", "Basic Cisco diagnostic bundle", "show", ["platform", "inventory", "interfacesStatus", "ipInterfaceBrief", "route"], ["diagnostics", "troubleshooting", "health check"], { mode: "diagnostic" }),
  implementedCli("ping", "Ping", "show", "diagnostic", "low", true, ["target"], ["ping"], (params) => [cli("ping", `ping ${ip(params, "target")}`)]),
  implementedCli("traceroute", "Traceroute", "show", "diagnostic", "low", true, ["target"], ["traceroute"], (params) => [cli("traceroute", `traceroute ${ip(params, "target")}`)]),
  implementedCli("run-backup", "Run configuration backup", "configuration", "backup", "medium", true, [], ["backup", "show running-config"], () => [cli("backup.running", "show running-config", { redactOutput: true })]),

  implementedCli("save-configuration", "Save running configuration", "configuration", "configure", "high", false, [], ["write memory", "copy running startup"], () => [cli("save.write-memory", "write memory", { write: true }), cli("save.verify", "show startup-config | include ^version|^hostname", { redactOutput: true })], { rollback: configRollback(["No automatic rollback; saved startup configuration must be restored from backup if needed."]) }),
  implementedCli("update-interface-description", "Update interface description", "interfaces", "configure", "medium", false, ["interfaceName", "description"], ["interface description"], (params) => configWorkflow("interface-description", [`interface ${iface(params)}`, `description ${description(params)}`], [`show running-config interface ${iface(params)}`]), { rollback: configRollback(["Reapply the previous interface description from backup evidence."]) }),
  implementedCli("enable-interface", "Administratively enable interface", "interfaces", "configure", "high", false, ["interfaceName"], ["no shutdown"], (params) => configWorkflow("interface-enable", [`interface ${iface(params)}`, "no shutdown"], [`show interfaces ${iface(params)}`]), { rollback: configRollback(["Run shutdown on the same interface if the enable must be reverted."]) }),
  implementedCli("disable-interface", "Administratively disable interface", "interfaces", "configure", "high", false, ["interfaceName"], ["shutdown"], (params) => configWorkflow("interface-disable", [`interface ${iface(params)}`, "shutdown"], [`show interfaces ${iface(params)}`]), { rollback: configRollback(["Run no shutdown on the same interface if the disable must be reverted."]) }),
  implementedCli("configure-interface-ipv4", "Configure interface IPv4 address", "interfaces", "configure", "high", false, ["interfaceName", "ipAddress", "subnetMask"], ["ip address"], (params) => configWorkflow("interface-ipv4", [`interface ${iface(params)}`, `ip address ${ip(params, "ipAddress")} ${mask(params)}`], [`show ip interface brief | include ${iface(params)}`]), { rollback: configRollback(["Remove or restore the previous interface IPv4 address from backup evidence."]) }),
  implementedCli("remove-interface-ipv4", "Remove interface IPv4 address", "interfaces", "configure", "high", false, ["interfaceName"], ["no ip address"], (params) => configWorkflow("interface-no-ipv4", [`interface ${iface(params)}`, "no ip address"], [`show ip interface brief | include ${iface(params)}`]), { rollback: configRollback(["Restore the previous interface IPv4 address from backup evidence."]) }),
  implementedCli("create-vlan", "Create VLAN", "switching", "configure", "medium", false, ["vlanId"], ["vlan", "create vlan"], (params) => configWorkflow("create-vlan", [`vlan ${vlan(params)}`, ...(optionalText(params, "name") ? [`name ${optionalText(params, "name")!.replace(/[\r\n]/g, " ").slice(0, 64)}`] : [])], ["show vlan brief"]), { rollback: configRollback(["Remove the created VLAN only after confirming it is unused."]) }),
  implementedCli("rename-vlan", "Rename VLAN", "switching", "configure", "medium", false, ["vlanId", "name"], ["name vlan"], (params) => configWorkflow("rename-vlan", [`vlan ${vlan(params)}`, `name ${text(params, "name").replace(/[\r\n]/g, " ").slice(0, 64)}`], ["show vlan brief"]), { rollback: configRollback(["Restore the previous VLAN name from backup evidence."]) }),
  implementedCli("assign-access-vlan", "Assign access VLAN", "switching", "configure", "high", false, ["interfaceName", "vlanId"], ["switchport access vlan"], (params) => configWorkflow("access-vlan", [`interface ${iface(params)}`, "switchport mode access", `switchport access vlan ${vlan(params)}`], [`show running-config interface ${iface(params)}`]), { rollback: configRollback(["Restore the previous switchport VLAN from backup evidence."]) }),
  implementedCli("configure-trunk-allowed-vlans", "Configure trunk allowed VLANs", "switching", "configure", "high", false, ["interfaceName", "allowedVlans"], ["switchport trunk allowed vlan"], (params) => configWorkflow("trunk-vlans", [`interface ${iface(params)}`, `switchport trunk allowed vlan ${text(params, "allowedVlans").replace(/[^0-9,\-]/g, "")}`], [`show interfaces trunk | include ${iface(params)}`]), { rollback: configRollback(["Restore the previous trunk allowed VLAN list from backup evidence."]) }),
  implementedCli("add-static-route", "Add static route", "routing", "configure", "high", false, ["destinationCidr", "nextHop"], ["ip route", "static route"], (params) => configWorkflow("add-static-route", [`ip route ${cidrRoute(params)} ${ip(params, "nextHop")}`], ["show ip route static"]), { rollback: configRollback(["Remove the static route with no ip route after validation."]) }),
  implementedCli("remove-static-route", "Remove static route", "routing", "configure", "high", false, ["destinationCidr", "nextHop"], ["no ip route", "remove static route"], (params) => configWorkflow("remove-static-route", [`no ip route ${cidrRoute(params)} ${ip(params, "nextHop")}`], ["show ip route static"]), { rollback: configRollback(["Re-add the removed static route if required."]) }),
  implementedCli("configure-ntp-server", "Configure NTP server", "services", "configure", "medium", false, ["server"], ["ntp server"], (params) => configWorkflow("ntp-server", [`ntp server ${ip(params, "server")}`], ["show ntp status"]), { rollback: configRollback(["Remove the NTP server with no ntp server if required."]) }),
  implementedCli("configure-syslog-server", "Configure Syslog server", "services", "configure", "medium", false, ["server"], ["logging host"], (params) => configWorkflow("syslog-server", [`logging host ${ip(params, "server")}`], ["show logging | include host|Trap"]), { rollback: configRollback(["Remove the syslog server with no logging host if required."]) }),

  planned("configure-snmp", "Configure SNMP destination", "services", "configure", "high", ["server", "secretRef"], ["snmp-server", "secure secret handling"]),
  planned("configure-local-user", "Create local user", "security", "configure", "high", ["username", "secretRef"], ["username secret", "encrypted secret storage"]),
  planned("create-standard-acl", "Create standard ACL", "security", "configure", "high", ["aclName", "entries"], ["standard ACL"]),
  planned("create-extended-acl", "Create extended ACL", "security", "configure", "high", ["aclName", "entries"], ["extended ACL"]),
  planned("apply-acl-interface", "Apply ACL to interface", "security", "configure", "high", ["interfaceName", "aclName", "direction"], ["ip access-group"]),
  planned("remove-acl-interface", "Remove ACL from interface", "security", "configure", "high", ["interfaceName", "aclName", "direction"], ["no ip access-group"]),
  planned("reload-device", "Reload device", "configuration", "configure", "critical", ["maintenanceWindow"], ["reload"]),
  planned("erase-configuration", "Erase configuration", "configuration", "configure", "critical", ["maintenanceWindow"], ["write erase"]),
  planned("delete-vlan", "Delete VLAN", "switching", "configure", "critical", ["vlanId"], ["no vlan"]),
  planned("remove-routing-process", "Remove routing process", "routing", "configure", "critical", ["processType", "processId"], ["no router"]),
  planned("bulk-interface-shutdown", "Bulk interface shutdown", "interfaces", "configure", "critical", ["interfaces"], ["shutdown"]),
  planned("restore-configuration", "Restore configuration", "configuration", "restore", "critical", ["backupRef"], ["configure replace", "restore"])
]);

export function findCiscoOperation(id: string | null | undefined) {
  if (!id) return undefined;
  return CISCO_OPERATION_REGISTRY.find((operation) => operation.id === id || operation.executionTemplateRef === id || operation.slug === id);
}

export function executableCiscoOperations() {
  return CISCO_OPERATION_REGISTRY.filter((operation) => operation.state === "implemented" && operation.executionTemplateRef && (operation.commandIds.length > 0 || operation.buildCommandSpecs));
}