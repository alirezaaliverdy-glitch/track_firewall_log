import type { FortiGateDiscovery } from "../connectors/types.js";

export type FortiOsDialect = {
  version?: string;
  major: 6 | 7 | "unknown";
  model?: string;
  features: {
    centralSnatLikelyAvailable: boolean;
    vdomAware: boolean;
    wildcardFqdn: boolean;
    geoAddress: boolean;
  };
};

export function fortiOsDialectFromDiscovery(discovery?: FortiGateDiscovery): FortiOsDialect {
  const major = Number.parseInt(String(discovery?.version ?? "").split(".")[0] ?? "", 10);
  return {
    version: discovery?.version,
    major: major === 6 || major === 7 ? major : "unknown",
    model: discovery?.model,
    features: {
      centralSnatLikelyAvailable: major >= 6 || major === 7,
      vdomAware: discovery?.vdomMode === "enabled",
      wildcardFqdn: major === 6 || major === 7,
      geoAddress: major === 6 || major === 7
    }
  };
}
