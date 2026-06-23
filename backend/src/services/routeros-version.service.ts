import type { MikroTikDiscovery } from "../connectors/types.js";

export type RouterOsDialect = {
  version?: string;
  major: 6 | 7 | "unknown";
  architecture?: string;
  packages: string[];
  features: {
    wireguard: boolean;
    routeRulesV7: boolean;
    restApiLikelyAvailable: boolean;
  };
};

function majorFromVersion(version: string | undefined): RouterOsDialect["major"] {
  const major = Number.parseInt(String(version ?? "").split(".")[0] ?? "", 10);
  return major === 6 || major === 7 ? major : "unknown";
}

export function routerOsDialectFromDiscovery(discovery?: MikroTikDiscovery): RouterOsDialect {
  const packages = String(discovery?.raw?.package ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const version = discovery?.routerosVersion;
  const major = majorFromVersion(version);

  return {
    version,
    major,
    architecture: discovery?.architecture,
    packages,
    features: {
      wireguard: major === 7 || packages.some((line) => /wireguard/i.test(line)),
      routeRulesV7: major === 7,
      restApiLikelyAvailable: major === 7
    }
  };
}

export function unsupportedFeature(message: string) {
  return {
    code: "ROUTEROS_UNSUPPORTED_FEATURE",
    message
  };
}
