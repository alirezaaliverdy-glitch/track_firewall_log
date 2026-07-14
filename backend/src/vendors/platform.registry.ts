import type { PlatformDefinition } from "./vendor.types.js";

export const PLATFORM_REGISTRY: PlatformDefinition[] = [
  { key: "cisco-ios-xe", vendorKey: "cisco", titleFa: "Cisco IOS-XE", titleEn: "Cisco IOS-XE", family: "ios-xe", implementationState: "partial", executable: true, notes: ["Milestone 18.2A supports safe read-only SSH capabilities only."] },
  { key: "cisco-ios-classic", vendorKey: "cisco", titleFa: "Cisco IOS Classic", titleEn: "Cisco IOS Classic", family: "ios-classic", implementationState: "partial", executable: false, notes: ["Detection only; IOS-XE templates are not sent to classic IOS unless explicitly verified."] },
  { key: "cisco-nx-os", vendorKey: "cisco", titleFa: "Cisco NX-OS", titleEn: "Cisco NX-OS", family: "nx-os", implementationState: "planned", executable: false, notes: ["Detected as unsupported for IOS-XE connector."] },
  { key: "cisco-ios-xr", vendorKey: "cisco", titleFa: "Cisco IOS-XR", titleEn: "Cisco IOS-XR", family: "ios-xr", implementationState: "planned", executable: false, notes: ["Detected as unsupported for IOS-XE connector."] },
  { key: "cisco-asa", vendorKey: "cisco", titleFa: "Cisco ASA", titleEn: "Cisco ASA", family: "asa", implementationState: "planned", executable: false, notes: ["Detected as unsupported for IOS-XE connector."] },
  { key: "cisco-ftd", vendorKey: "cisco", titleFa: "Cisco FTD", titleEn: "Cisco FTD", family: "ftd", implementationState: "planned", executable: false, notes: ["Detected as unsupported for IOS-XE connector."] },
  { key: "cisco-unknown", vendorKey: "cisco", titleFa: "Cisco unknown", titleEn: "Cisco unknown", family: "unknown", implementationState: "unsupported", executable: false, notes: ["Platform confidence is insufficient; mutation is blocked."] }
];

export function getPlatformsForVendor(vendorKey: string) { return PLATFORM_REGISTRY.filter((platform) => platform.vendorKey === vendorKey); }
