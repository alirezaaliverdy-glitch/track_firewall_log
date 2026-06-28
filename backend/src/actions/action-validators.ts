import net from "node:net";

const SAFE_OBJECT_NAME = /^[A-Za-z0-9][A-Za-z0-9_. :/()-]{0,126}$/;
const SAFE_NETWORK_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,62}$/;

export type StructuredValidationError = {
  field: string;
  message: string;
  expectedFormat: string;
  currentValue: unknown;
};

export const EXPECTED_FORMATS: Record<string, string> = {
  deviceId: "registered device ID",
  sourceIp: "IPv4 address, for example 192.168.1.10",
  sourceCidr: "IPv4 CIDR, for example 192.168.1.0/24",
  destinationIp: "IPv4 address, for example 192.168.1.10",
  destinationCidr: "IPv4 CIDR, for example 10.0.0.0/8",
  trustedSource: "IPv4 address, for example 192.168.1.10",
  trustedSourceCidr: "IPv4 address or CIDR, for example 192.168.1.10 or 192.168.1.0/24",
  port: "port 1-65535 or comma-separated ports/ranges",
  newPort: "port number from 1 to 65535",
  protocol: "tcp, udp, icmp, or any",
  srcInterface: "interface name",
  dstInterface: "interface name",
  srcZone: "zone name",
  dstZone: "zone name",
  serviceName: "service name",
  services: "one or more service names",
  schedule: "schedule name",
  addressObjectName: "address object name"
};

export function validationError(field: string, message: string, currentValue: unknown, expectedFormat = EXPECTED_FORMATS[field] ?? "valid value"): StructuredValidationError {
  return { field, message, expectedFormat, currentValue: currentValue ?? null };
}

export function isValidIpv4(value: unknown): value is string {
  return typeof value === "string" && net.isIP(value.trim()) === 4;
}

export function isValidIpv4Cidr(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.trim().match(/^([^/]+)\/(\d{1,2})$/);
  return Boolean(match && net.isIP(match[1]) === 4 && Number(match[2]) >= 0 && Number(match[2]) <= 32);
}

export function isValidIpOrCidr(value: unknown): value is string {
  return isValidIpv4(value) || isValidIpv4Cidr(value);
}

export function isValidPort(value: unknown): boolean {
  const port = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : value;
  return typeof port === "number" && Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function parsePortList(value: unknown): number[] | null {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [value];
  const ports = items.map((item) => typeof item === "number" ? item : Number(String(item).trim()));
  return ports.length > 0 && ports.every(isValidPort) ? Array.from(new Set(ports)) : null;
}

export function isValidPortRange(value: unknown): boolean {
  if (isValidPort(value)) return true;
  if (typeof value !== "string") return false;
  return value.split(",").every((part) => {
    const range = part.trim().split("-");
    if (range.length === 1) return isValidPort(range[0]);
    if (range.length !== 2 || !isValidPort(range[0]) || !isValidPort(range[1])) return false;
    return Number(range[0]) <= Number(range[1]);
  });
}

export function isValidProtocol(value: unknown): value is "tcp" | "udp" | "icmp" | "any" {
  return typeof value === "string" && ["tcp", "udp", "icmp", "any"].includes(value.trim().toLowerCase());
}

export function isValidServiceName(value: unknown): value is string {
  return typeof value === "string" && SAFE_OBJECT_NAME.test(value.trim());
}

export function isValidInterfaceName(value: unknown): value is string {
  return typeof value === "string" && SAFE_NETWORK_NAME.test(value.trim());
}

export const isValidZoneName = isValidInterfaceName;
export const isValidAddressObjectName = isValidServiceName;
export const isValidScheduleName = isValidServiceName;

export const actionValidators = {
  ipv4: isValidIpv4,
  ipv4Cidr: isValidIpv4Cidr,
  ipOrCidr: isValidIpOrCidr,
  port: isValidPort,
  portRange: isValidPortRange,
  protocol: isValidProtocol,
  serviceName: isValidServiceName,
  interfaceName: isValidInterfaceName,
  zoneName: isValidZoneName,
  addressObjectName: isValidAddressObjectName,
  scheduleName: isValidScheduleName
} as const;

export function validateCanonicalFieldShapes(parameters: Record<string, unknown>) {
  const issues: StructuredValidationError[] = [];
  const checks: Array<[string, (value: unknown) => boolean]> = [
    ["sourceIp", isValidIpv4], ["destinationIp", isValidIpv4], ["trustedSource", isValidIpv4],
    ["sourceCidr", isValidIpv4Cidr], ["destinationCidr", isValidIpv4Cidr], ["trustedSourceCidr", isValidIpOrCidr],
    ["port", isValidPortRange], ["newPort", isValidPort], ["protocol", isValidProtocol],
    ["srcInterface", isValidInterfaceName], ["dstInterface", isValidInterfaceName],
    ["srcZone", isValidZoneName], ["dstZone", isValidZoneName], ["serviceName", isValidServiceName]
  ];
  for (const [field, validator] of checks) {
    const value = parameters[field];
    if (value !== undefined && value !== null && value !== "" && !validator(value)) {
      issues.push(validationError(field, `${field} has an invalid value.`, value));
    }
  }
  if (parameters.services !== undefined) {
    const values = Array.isArray(parameters.services) ? parameters.services : String(parameters.services).split(",");
    if (values.length === 0 || values.some((value) => !isValidServiceName(String(value).trim()))) {
      issues.push(validationError("services", "One or more service names are invalid.", parameters.services));
    }
  }
  return issues;
}
