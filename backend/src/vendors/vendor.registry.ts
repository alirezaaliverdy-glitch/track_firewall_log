import type { VendorDefinition } from "./vendor.types.js";

export const VENDOR_REGISTRY: VendorDefinition[] = [
  { key: "linux", titleFa: "Linux", titleEn: "Linux", description: "Linux SSH managed servers.", implementationState: "implemented", connectorTypes: ["linux-ssh"] },
  { key: "mikrotik", titleFa: "MikroTik", titleEn: "MikroTik", description: "RouterOS SSH controlled actions.", implementationState: "implemented", connectorTypes: ["mikrotik-ssh"] },
  { key: "fortigate", titleFa: "FortiGate", titleEn: "FortiGate", description: "FortiOS SSH read and guided action support.", implementationState: "partial", connectorTypes: ["fortigate-ssh"] },
  { key: "cisco", titleFa: "Cisco", titleEn: "Cisco", description: "Cisco platform-family detection and IOS-XE read-only capability foundation.", implementationState: "partial", connectorTypes: ["cisco-iosxe-ssh"] },
  { key: "sophos", titleFa: "سوفوس", titleEn: "Sophos Firewall", description: "Sophos Firewall XML API inventory and controlled configuration operations.", implementationState: "implemented", connectorTypes: ["sophos-api"] },
  { key: "pfsense", titleFa: "pfSense", titleEn: "pfSense", description: "Planned vendor support.", implementationState: "planned", connectorTypes: [] }
];

export function getVendor(key: string) { return VENDOR_REGISTRY.find((vendor) => vendor.key === key); }
