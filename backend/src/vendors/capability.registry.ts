import type { CapabilityDefinition } from "./vendor.types.js";

const ciscoSources = [
  "cisco-ios-xe-17-index",
  "cisco-c9300-17-12-interface-hardware",
  "cisco-c9300-17-12-layer-2-3",
  "cisco-c9300-17-12-routing",
  "cisco-c9300-17-12-security",
  "cisco-c9300-17-12-system-management",
  "cisco-c9300-17-12-vlan"
];

function ciscoRead(key: string, domain: string, titleEn: string, titleFa: string, actionTemplate: string, fixture: string): CapabilityDefinition {
  return {
    key,
    titleFa,
    titleEn,
    vendorKey: "cisco",
    platformKeys: ["cisco-ios-xe"],
    domain,
    mode: "read",
    risk: "low",
    permission: "cisco.read",
    connectorTypes: ["cisco-iosxe-ssh"],
    supportedVersions: "Cisco IOS XE 17.x Catalyst 9300 command-reference verified for parser family",
    requiredFacts: ["platform=cisco-ios-xe", "sshReachable=true"],
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: { type: "object" },
    preflightTemplate: "detect-cisco-iosxe-platform",
    actionTemplate,
    verificationTemplate: null,
    rollbackSupport: "not_applicable",
    implementationState: "implemented",
    sourceRefs: ciscoSources,
    parserVersion: "18.2A.1",
    fixtureRefs: [fixture]
  };
}

export const CAPABILITY_REGISTRY: CapabilityDefinition[] = [
  ciscoRead("cisco.system.version.read", "system", "Version and platform", "نسخه و پلتفرم", "show version", "show-version-iosxe.txt"),
  ciscoRead("cisco.system.inventory.read", "system", "Inventory", "موجودی سخت افزار", "show inventory", "show-inventory-iosxe.txt"),
  ciscoRead("cisco.system.health.read", "system", "CPU and memory", "سلامت CPU و حافظه", "show processes cpu platform; show processes memory", "show-platform-health-iosxe.txt"),
  ciscoRead("cisco.interfaces.status.read", "interfaces", "Interface status and counters", "وضعیت اینترفیس ها", "show interfaces status; show interfaces counters errors", "show-interfaces-status-iosxe.txt"),
  ciscoRead("cisco.interfaces.ip.brief.read", "interfaces", "IP interface brief", "خلاصه IP اینترفیس ها", "show ip interface brief", "show-ip-interface-brief-iosxe.txt"),
  ciscoRead("cisco.vlan.read", "switching", "VLAN list", "فهرست VLAN", "show vlan brief", "show-vlan-brief-iosxe.txt"),
  ciscoRead("cisco.trunk.read", "switching", "Trunk interfaces", "ترانک ها", "show interfaces trunk", "show-interfaces-trunk-iosxe.txt"),
  ciscoRead("cisco.etherchannel.read", "switching", "EtherChannel summary", "خلاصه EtherChannel", "show etherchannel summary", "show-etherchannel-summary-iosxe.txt"),
  ciscoRead("cisco.stp.read", "switching", "Spanning-tree summary", "خلاصه STP", "show spanning-tree summary", "show-spanning-tree-summary-iosxe.txt"),
  ciscoRead("cisco.routing.table.read", "routing", "Routing table", "جدول مسیریابی", "show ip route", "show-ip-route-iosxe.txt"),
  ciscoRead("cisco.security.acl.read", "security", "Access lists", "ACL ها", "show access-lists", "show-access-lists-iosxe.txt"),
  { key: "cisco.vlan.create", titleFa: "ساخت VLAN", titleEn: "Create VLAN", vendorKey: "cisco", platformKeys: ["cisco-ios-xe"], domain: "switching", mode: "mutate", risk: "medium", permission: "cisco.vlan.change", connectorTypes: ["cisco-iosxe-ssh"], supportedVersions: "planned", requiredFacts: ["platform=cisco-ios-xe"], inputSchema: { type: "object" }, outputSchema: { type: "object" }, preflightTemplate: null, actionTemplate: null, verificationTemplate: null, rollbackSupport: "planned", implementationState: "planned", sourceRefs: ciscoSources, parserVersion: "none", fixtureRefs: [] },
  { key: "cisco.etherchannel.create", titleFa: "ساخت EtherChannel", titleEn: "Create EtherChannel", vendorKey: "cisco", platformKeys: ["cisco-ios-xe"], domain: "switching", mode: "mutate", risk: "high", permission: "cisco.etherchannel.change", connectorTypes: ["cisco-iosxe-ssh"], supportedVersions: "planned", requiredFacts: ["platform=cisco-ios-xe"], inputSchema: { type: "object" }, outputSchema: { type: "object" }, preflightTemplate: null, actionTemplate: null, verificationTemplate: null, rollbackSupport: "planned", implementationState: "planned", sourceRefs: ciscoSources, parserVersion: "none", fixtureRefs: [] }
];

export function getCapabilitiesForVendor(vendorKey: string) { return CAPABILITY_REGISTRY.filter((capability) => capability.vendorKey === vendorKey); }
