import type { NormalizedLog, ServiceCategory } from "./types.js";
import { isRiskyPort } from "./portIntelligence.js";

const MANAGEMENT_PORTS = new Set([22, 23, 3389, 5900, 8291, 8080, 8443]);
const DATABASE_PORTS = new Set([1433, 3306, 5432, 6379, 9200]);
const DNS_PORTS = new Set([53]);
const MAIL_PORTS = new Set([25, 110, 143, 465, 587, 993, 995]);
const FILE_SHARING_PORTS = new Set([445, 139]);
const WEB_PORTS = new Set([80, 443]);

function validPort(port: unknown): number | undefined {
  if (typeof port !== "number" || !Number.isInteger(port) || port < 0 || port > 65535) return undefined;
  return port;
}

export function isManagementPort(port: unknown): boolean {
  const value = validPort(port);
  return value !== undefined && MANAGEMENT_PORTS.has(value);
}

export function isDatabasePort(port: unknown): boolean {
  const value = validPort(port);
  return value !== undefined && DATABASE_PORTS.has(value);
}

export function isRiskyServicePort(port: unknown): boolean {
  const value = validPort(port);
  return value !== undefined && isRiskyPort(value);
}

export function getServiceCategory(port: unknown): ServiceCategory {
  const value = validPort(port);
  if (value === undefined) return "unknown";
  if (MANAGEMENT_PORTS.has(value)) return "management";
  if (DATABASE_PORTS.has(value)) return "database";
  if (DNS_PORTS.has(value)) return "dns";
  if (MAIL_PORTS.has(value)) return "mail";
  if (FILE_SHARING_PORTS.has(value)) return "file-sharing";
  if (WEB_PORTS.has(value)) return "web";
  return "unknown";
}

export function enrichLogWithAssetIntelligence(log: NormalizedLog): NormalizedLog {
  return {
    ...log,
    serviceCategory: getServiceCategory(log.dstPort),
    isManagementTraffic: isManagementPort(log.dstPort),
    isDatabaseTraffic: isDatabasePort(log.dstPort),
    isRiskyServiceTraffic: isRiskyServicePort(log.dstPort)
  };
}

export function enrichLogsWithAssetIntelligence(logs: NormalizedLog[]): NormalizedLog[] {
  return logs.map(enrichLogWithAssetIntelligence);
}
