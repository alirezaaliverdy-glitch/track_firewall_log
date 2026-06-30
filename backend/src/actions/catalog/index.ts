import { CISCO_COMMAND_CATALOG } from "./cisco.catalog.js";
import { FORTIGATE_COMMAND_CATALOG } from "./fortigate.catalog.js";
import { LINUX_COMMAND_CATALOG } from "./linux.catalog.js";
import { MIKROTIK_COMMAND_CATALOG } from "./mikrotik.catalog.js";
import { PFSENSE_COMMAND_CATALOG } from "./pfsense.catalog.js";

export const VENDOR_COMMAND_CATALOG = Object.freeze([
  ...MIKROTIK_COMMAND_CATALOG,
  ...FORTIGATE_COMMAND_CATALOG,
  ...LINUX_COMMAND_CATALOG,
  ...PFSENSE_COMMAND_CATALOG,
  ...CISCO_COMMAND_CATALOG
]);

export function commandCatalogForVendor(vendor: string) {
  const normalized = vendor.trim().toLowerCase().replace(/[_-]/g, "");
  const canonical = normalized === "linuxedge" ? "linux" : normalized;
  return VENDOR_COMMAND_CATALOG.filter((entry) => entry.vendor === canonical);
}

export function getCommandCatalogEntry(id: string) {
  return VENDOR_COMMAND_CATALOG.find((entry) => entry.id === id) ?? null;
}

export * from "./types.js";
export * from "./catalog.types.js";
export * from "./mikrotik.catalog.js";
export * from "./fortigate.catalog.js";
export * from "./linux.catalog.js";
export * from "./pfsense.catalog.js";
export * from "./cisco.catalog.js";
