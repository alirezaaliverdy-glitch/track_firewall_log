import { ActionType, type ActionPlan, type Device } from "@prisma/client";
import { selectDeviceConnector } from "../connectors/connector-registry.service.js";
import { env } from "../config/env.js";

type Discovery = { services?: unknown; firewallFilterRules?: unknown };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function lines(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function token(line: string, name: string) {
  return line.match(new RegExp(`(?:^|\\s)${name}=(?:"([^"]+)"|([^\\s]+))`, "i"))?.slice(1).find(Boolean);
}

export function suggestAllowedSource(host: string) {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (!match || match.slice(1).some((part) => Number(part) > 255)) return undefined;
  return `${match[1]}.${match[2]}.${match[3]}.0/24`;
}

type ManagementSourceOptions = {
  quickControlled?: boolean;
  requireManagementSource?: boolean;
  defaultTrustedSource?: string;
  allowLabUnrestrictedManagement?: boolean;
};

export function resolveTrustedManagementSource(current: Record<string, unknown>, device: Pick<Device, "host" | "capabilities">, options: ManagementSourceOptions = {}) {
  const explicit = current.trustedSourceCidr ?? current.trustedSourceIp ?? current.trustedSource;
  if (typeof explicit === "string" && explicit.trim()) return { value: explicit.trim(), autoResolved: false, unrestricted: explicit.trim() === "0.0.0.0/0", source: "explicit" };
  const quickControlled = options.quickControlled ?? env.actionExecutionMode === "quick_controlled";
  if (!quickControlled) return null;
  const capabilities = object(device.capabilities);
  const configured = capabilities.managementSubnet ?? capabilities.lanSubnet ?? capabilities.trustedManagementCidr;
  if (typeof configured === "string" && configured.trim()) return { value: configured.trim(), autoResolved: true, unrestricted: false, source: "device" };
  const inferred = suggestAllowedSource(device.host);
  if (inferred) return { value: inferred, autoResolved: true, unrestricted: false, source: "device_host" };
  const fallback = options.defaultTrustedSource ?? env.actionDefaultTrustedSource;
  if (fallback && fallback !== "auto") return { value: fallback, autoResolved: true, unrestricted: fallback === "0.0.0.0/0", source: "environment" };
  const allowUnrestricted = options.allowLabUnrestrictedManagement ?? env.actionAllowLabUnrestrictedManagement;
  if (allowUnrestricted) return { value: "0.0.0.0/0", autoResolved: true, unrestricted: true, source: "lab_unrestricted" };
  if (options.requireManagementSource ?? env.actionRequireManagementSource) return null;
  return null;
}

export function discoverMikroTikSshValues(discovery: Discovery, fallbackPort?: number) {
  const services = lines(discovery.services);
  const ssh = services.find((line) => token(line, "name")?.toLowerCase() === "ssh");
  const parsedPort = Number(ssh && token(ssh, "port"));
  const currentPort = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : fallbackPort;
  const serviceSource = ssh ? token(ssh, "address") : undefined;
  const firewallSource = lines(discovery.firewallFilterRules).flatMap((line) => {
    const port = token(line, "dst-port");
    const source = token(line, "src-address");
    const acceptsSsh = token(line, "chain") === "input" && token(line, "action") === "accept" &&
      (token(line, "protocol") ?? "tcp") === "tcp" && source && (!currentPort || port === String(currentPort));
    return acceptsSsh ? [source] : [];
  })[0];
  const trustedSourceCidr = firewallSource ?? (serviceSource && serviceSource !== "0.0.0.0/0" ? serviceSource : undefined);
  return { currentPort, trustedSourceCidr };
}

function storedDiscovery(device: Device): Discovery {
  const status = object(object(device.capabilities).mikrotikStatus);
  return object(status.mikrotik);
}

export async function preflightActionPlan(plan: ActionPlan, device: Device) {
  if (plan.actionType !== ActionType.mikrotik_change_service_port) return { parameters: object(plan.parametersJson), attempted: false };
  const current = object(plan.parametersJson);
  if (String(current.service ?? current.serviceName ?? "ssh").toLowerCase() !== "ssh") return { parameters: current, attempted: false };

  let discovery = storedDiscovery(device);
  let discoveryError: string | undefined;
  if (lines(discovery.services).length === 0 || lines(discovery.firewallFilterRules).length === 0) {
    const connector = selectDeviceConnector(device);
    try {
      const result = connector ? await connector.collectStatus(device) : null;
      if (result?.mikrotik) discovery = result.mikrotik;
    } catch (error) {
      discoveryError = error instanceof Error ? error.message : "Read-only preflight failed.";
    }
  }

  const found = discoverMikroTikSshValues(discovery, device.managementPort);
  const existingSource = current.trustedSourceCidr ?? current.trustedSourceIp ?? current.trustedSource;
  const resolved = existingSource
    ? resolveTrustedManagementSource(current, device)
    : found.trustedSourceCidr
      ? { value: found.trustedSourceCidr, autoResolved: true, unrestricted: false, source: "device_discovery" }
      : resolveTrustedManagementSource(current, device);
  const warning = resolved?.autoResolved
    ? "Management source was auto-resolved or unrestricted because quick execution mode is enabled."
    : undefined;
  return {
    attempted: true,
    discoveryError,
    missingFields: resolved ? [] : ["trustedSourceCidr"],
    suggestions: resolved ? {} : { trustedSourceCidr: suggestAllowedSource(device.host) },
    warnings: warning ? [warning] : [],
    autoResolved: Boolean(resolved?.autoResolved),
    unrestricted: Boolean(resolved?.unrestricted),
    parameters: {
      ...current,
      preflightComplete: true,
      ...(found.currentPort ? { oldPort: found.currentPort, currentPort: found.currentPort } : {}),
      ...(resolved ? { trustedSourceCidr: resolved.value, trustedSource: resolved.value } : {}),
      ...(resolved?.autoResolved ? { trustedSourceAutoResolved: true, trustedSourceResolution: resolved.source } : {}),
      ...(warning ? { policyWarnings: [warning] } : {})
    }
  };
}
