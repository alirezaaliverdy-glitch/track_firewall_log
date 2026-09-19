import https from "node:https";
import { ActionType, DeviceProtocol, DeviceType, type ActionPlan, type Device } from "@prisma/client";
import { resolveCredentialById, resolveCredentialByName } from "../services/credential.service.js";
import type {
  ConnectorDryRun,
  ConnectorExecutionResult,
  DeviceCapabilities,
  DeviceConnectionTestResult,
  DeviceConnector,
  MikroTikDiscovery
} from "./types.js";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 6 * 1024 * 1024;

const READ_ACTIONS = [
  ActionType.mikrotik_read_firewall_summary,
  ActionType.mikrotik_list_filter_rules,
  ActionType.mikrotik_search_filter_rules,
  ActionType.mikrotik_list_nat_rules,
  ActionType.mikrotik_list_address_list,
  ActionType.mikrotik_list_ip_services,
  ActionType.mikrotik_list_management_services,
  ActionType.mikrotik_list_interfaces,
  ActionType.mikrotik_list_routes,
  ActionType.mikrotik_show_dns_settings,
  ActionType.mikrotik_list_dhcp_servers,
  ActionType.mikrotik_list_dhcp_leases,
  ActionType.mikrotik_show_clock,
  ActionType.mikrotik_check_login_logs,
  ActionType.mikrotik_show_logs,
  ActionType.mikrotik_show_resources,
  ActionType.mikrotik_daily_check
] as const;

const READ_ACTION_SET = new Set<ActionType>(READ_ACTIONS);

type JsonRecord = Record<string, unknown>;

export class MikroTikRestError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 502) {
    super(message);
    this.name = "MikroTikRestError";
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function rows(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  const item = record(value);
  return Object.keys(item).length ? [item] : [];
}

function compact(value: unknown) {
  return JSON.stringify(value, (_key, item) => typeof item === "string" && item.length > 2_000 ? `${item.slice(0, 2_000)}…` : item);
}

function lineRows(value: unknown, limit = 1_000) {
  return rows(value).slice(0, limit).map((item) => compact(item));
}

function boolCapability(device: Device, key: string) {
  return record(device.capabilities)[key] === true;
}

async function credentials(device: Device) {
  const saved = device.credentialId
    ? await resolveCredentialById(device.credentialId)
    : device.credentialRef
      ? await resolveCredentialByName(device.credentialRef)
      : null;
  if (!saved?.username || !saved.password) {
    throw new MikroTikRestError("MIKROTIK_REST_CREDENTIAL_MISSING", "A stored username/password credential is required for the RouterOS REST API.", 400);
  }
  return saved;
}

async function requestJson(device: Device, path: string) {
  if (!path.startsWith("/rest/") || path.includes("..")) throw new MikroTikRestError("MIKROTIK_REST_PATH_BLOCKED", "RouterOS REST path is not allowed.", 400);
  const auth = await credentials(device);
  return await new Promise<unknown>((resolve, reject) => {
    const request = https.request({
      hostname: device.host,
      port: device.managementPort,
      path,
      method: "GET",
      timeout: REQUEST_TIMEOUT_MS,
      rejectUnauthorized: boolCapability(device, "mikrotikTlsVerify"),
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`
      }
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) request.destroy(new MikroTikRestError("MIKROTIK_REST_RESPONSE_TOO_LARGE", "RouterOS REST response exceeded the safe size limit."));
        else chunks.push(chunk);
      });
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode === 401 || response.statusCode === 403) {
          return reject(new MikroTikRestError("MIKROTIK_REST_AUTH_FAILED", "RouterOS REST authentication failed or the user lacks rest-api/read policies.", 401));
        }
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new MikroTikRestError("MIKROTIK_REST_HTTP_ERROR", `RouterOS REST returned HTTP ${response.statusCode ?? "unknown"}.`, 502));
        }
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          reject(new MikroTikRestError("MIKROTIK_REST_INVALID_JSON", "RouterOS REST returned an invalid JSON response.", 502));
        }
      });
    });
    request.once("timeout", () => request.destroy(new MikroTikRestError("MIKROTIK_REST_TIMEOUT", "RouterOS REST request timed out.", 504)));
    request.once("error", (error) => {
      if (error instanceof MikroTikRestError) return reject(error);
      const source = error as NodeJS.ErrnoException;
      if (source.code === "DEPTH_ZERO_SELF_SIGNED_CERT" || source.code === "SELF_SIGNED_CERT_IN_CHAIN" || source.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
        return reject(new MikroTikRestError("MIKROTIK_REST_TLS_UNTRUSTED", "RouterOS HTTPS certificate is not trusted. Install a trusted certificate or explicitly allow the stored device certificate.", 502));
      }
      reject(new MikroTikRestError("MIKROTIK_REST_UNREACHABLE", "RouterOS REST endpoint is unreachable.", 502));
    });
    request.end();
  });
}

async function optional(device: Device, path: string, warnings: DeviceConnectionTestResult["warnings"]) {
  try {
    return await requestJson(device, path);
  } catch (error) {
    const failure = error instanceof MikroTikRestError ? error : new MikroTikRestError("MIKROTIK_REST_REQUEST_FAILED", error instanceof Error ? error.message : "RouterOS REST request failed.");
    warnings.push({ code: failure.code, message: `${path}: ${failure.message}` });
    return [];
  }
}

async function discover(device: Device, warnings: DeviceConnectionTestResult["warnings"]): Promise<MikroTikDiscovery> {
  const [identityValue, resourceValue, packagesValue, interfacesValue, addressesValue, routesValue, filtersValue, natValue, mangleValue, listsValue, servicesValue, logsValue] = await Promise.all([
    requestJson(device, "/rest/system/identity"),
    requestJson(device, "/rest/system/resource"),
    optional(device, "/rest/system/package", warnings),
    optional(device, "/rest/interface", warnings),
    optional(device, "/rest/ip/address", warnings),
    optional(device, "/rest/ip/route", warnings),
    optional(device, "/rest/ip/firewall/filter", warnings),
    optional(device, "/rest/ip/firewall/nat", warnings),
    optional(device, "/rest/ip/firewall/mangle", warnings),
    optional(device, "/rest/ip/firewall/address-list", warnings),
    optional(device, "/rest/ip/service", warnings),
    optional(device, "/rest/log", warnings)
  ]);
  const identity = rows(identityValue)[0] ?? {};
  const resource = rows(resourceValue)[0] ?? {};
  const packages = rows(packagesValue);
  const routeros = packages.find((item) => String(item.name ?? "").toLowerCase() === "routeros");
  return {
    identity: String(identity.name ?? "") || undefined,
    routerosVersion: String(resource.version ?? routeros?.version ?? "") || undefined,
    architecture: String(resource["architecture-name"] ?? "") || undefined,
    uptime: String(resource.uptime ?? "") || undefined,
    cpuLoad: String(resource["cpu-load"] ?? "") || undefined,
    memoryFree: String(resource["free-memory"] ?? "") || undefined,
    interfaces: lineRows(interfacesValue),
    ipAddresses: lineRows(addressesValue),
    routes: lineRows(routesValue),
    firewallFilterRules: lineRows(filtersValue),
    natRules: lineRows(natValue),
    mangleRules: lineRows(mangleValue),
    addressLists: lineRows(listsValue),
    services: lineRows(servicesValue),
    recentLogs: lineRows(logsValue, 200),
    raw: { transport: "rest_api", resource: compact(resource), package: compact(packages) }
  };
}

function capabilitiesFrom(discovery?: MikroTikDiscovery, warnings: DeviceConnectionTestResult["warnings"] = []): DeviceCapabilities {
  return {
    canTestConnection: true,
    canCollectStatus: true,
    canReadSystem: true,
    canReadInterfaces: true,
    canReadFirewall: true,
    canReadLogs: true,
    canExecuteWriteActions: false,
    canOpenPort: false,
    canClosePort: false,
    canBlockSourceIp: false,
    canUnblockSourceIp: false,
    canChangeSshPortDryRunOnly: false,
    canExecuteChangeSshPort: false,
    identity: discovery?.identity,
    routerosVersion: discovery?.routerosVersion,
    architecture: discovery?.architecture,
    uptime: discovery?.uptime,
    cpuLoad: discovery?.cpuLoad,
    memoryFree: discovery?.memoryFree,
    interfaceCount: discovery?.interfaces.length,
    firewallFilterRuleCount: discovery?.firewallFilterRules.length,
    natRuleCount: discovery?.natRules.length,
    addressListCount: discovery?.addressLists.length,
    serviceSummary: discovery?.services.slice(0, 25),
    warnings,
    mikrotik: discovery,
    supportedActions: [...READ_ACTIONS]
  };
}

async function connection(device: Device): Promise<DeviceConnectionTestResult> {
  const warnings: DeviceConnectionTestResult["warnings"] = [];
  if (!boolCapability(device, "mikrotikTlsVerify")) warnings.push({ code: "MIKROTIK_REST_TLS_VERIFICATION_DISABLED", message: "HTTPS is encrypted, but certificate verification is disabled for this RouterOS device. Install a trusted certificate before production use." });
  try {
    const discovery = await discover(device, warnings);
    return {
      connected: true,
      deviceId: device.id,
      vendor: "mikrotik",
      host: device.host,
      port: device.managementPort,
      credentialResolved: true,
      hostname: discovery.identity,
      os: discovery.routerosVersion ? `RouterOS ${discovery.routerosVersion}` : "RouterOS",
      stages: [
        { name: "resolve_device", status: "ok" },
        { name: "resolve_credential", status: "ok" },
        { name: "tcp_connect", status: "ok" },
        { name: "ssh_handshake", status: "warning", code: "NOT_APPLICABLE", message: "HTTPS REST transport selected." },
        { name: "ssh_auth", status: "warning", code: "NOT_APPLICABLE", message: "HTTP Basic authentication over HTTPS selected." },
        { name: "basic_commands", status: "ok", message: "RouterOS REST identity and resource endpoints responded." },
        { name: "readonly_discovery", status: warnings.length > 1 ? "warning" : "ok" }
      ],
      warnings,
      capabilities: { canConnect: true, canRunBasicReadOnly: true, canReadSystem: true, canReadInterfaces: true, canReadFirewall: true, canReadLogs: true, canExecuteWriteActions: false },
      mikrotik: discovery,
      message: "RouterOS REST connection and read-only discovery succeeded."
    };
  } catch (error) {
    const failure = error instanceof MikroTikRestError ? error : new MikroTikRestError("MIKROTIK_REST_FAILED", error instanceof Error ? error.message : "RouterOS REST connection failed.");
    const missing = failure.code === "MIKROTIK_REST_CREDENTIAL_MISSING";
    return {
      connected: false,
      deviceId: device.id,
      vendor: "mikrotik",
      host: device.host,
      port: device.managementPort,
      credentialResolved: !missing,
      stages: [
        { name: "resolve_device", status: "ok" },
        { name: "resolve_credential", status: missing ? "failed" : "ok", code: missing ? failure.code : undefined, message: missing ? failure.message : undefined },
        { name: "tcp_connect", status: missing ? "warning" : "failed", code: missing ? undefined : failure.code, message: missing ? undefined : failure.message }
      ],
      warnings,
      capabilities: { canConnect: false, canRunBasicReadOnly: false, canReadSystem: false, canReadInterfaces: false, canReadFirewall: false, canReadLogs: false, canExecuteWriteActions: false },
      errorCode: failure.code,
      message: failure.message
    };
  }
}

function pathsFor(plan: Pick<ActionPlan, "actionType">) {
  const table = new Map<ActionType, string[]>([
    [ActionType.mikrotik_read_firewall_summary, ["/rest/ip/firewall/filter", "/rest/ip/firewall/nat", "/rest/ip/firewall/address-list", "/rest/ip/service"]],
    [ActionType.mikrotik_list_filter_rules, ["/rest/ip/firewall/filter"]],
    [ActionType.mikrotik_search_filter_rules, ["/rest/ip/firewall/filter"]],
    [ActionType.mikrotik_list_nat_rules, ["/rest/ip/firewall/nat"]],
    [ActionType.mikrotik_list_address_list, ["/rest/ip/firewall/address-list"]],
    [ActionType.mikrotik_list_ip_services, ["/rest/ip/service"]],
    [ActionType.mikrotik_list_management_services, ["/rest/ip/service"]],
    [ActionType.mikrotik_list_interfaces, ["/rest/interface"]],
    [ActionType.mikrotik_list_routes, ["/rest/ip/route"]],
    [ActionType.mikrotik_show_dns_settings, ["/rest/ip/dns"]],
    [ActionType.mikrotik_list_dhcp_servers, ["/rest/ip/dhcp-server"]],
    [ActionType.mikrotik_list_dhcp_leases, ["/rest/ip/dhcp-server/lease"]],
    [ActionType.mikrotik_show_clock, ["/rest/system/clock"]],
    [ActionType.mikrotik_check_login_logs, ["/rest/log"]],
    [ActionType.mikrotik_show_logs, ["/rest/log"]],
    [ActionType.mikrotik_show_resources, ["/rest/system/resource"]],
    [ActionType.mikrotik_daily_check, ["/rest/system/resource", "/rest/interface", "/rest/ip/firewall/filter", "/rest/log"]]
  ]);
  return table.get(plan.actionType) ?? [];
}

export const mikrotikRestConnector: DeviceConnector = {
  name: "mikrotik",
  supportedActions: [...READ_ACTIONS],
  supports(device) {
    return Boolean(device && device.protocol === DeviceProtocol.api && (
      device.type === DeviceType.mikrotik || /mikrotik|routeros/i.test(String(device.vendor ?? ""))
    ));
  },
  testConnection: connection,
  async getCapabilities(device) {
    const status = record(record(device.capabilities).mikrotikStatus);
    const discovery = status.mikrotik && typeof status.mikrotik === "object" ? status.mikrotik as MikroTikDiscovery : undefined;
    return capabilitiesFrom(discovery);
  },
  collectStatus: connection,
  async dryRun(plan): Promise<ConnectorDryRun> {
    if (!READ_ACTION_SET.has(plan.actionType)) throw new MikroTikRestError("MIKROTIK_REST_WRITE_REQUIRES_SSH", "This operation changes RouterOS. Select the SSH/CLI connection method for controlled write actions.", 409);
    const paths = pathsFor(plan);
    return { plannedCommands: paths.map((path) => `GET ${path}`), validationWarnings: ["Read-only RouterOS REST operation."], affectedPorts: [], affectedServices: [], rollbackSteps: [], riskLevel: plan.riskLevel, requiresApproval: true, exactTarget: { deviceId: plan.deviceId, transport: "rest_api" } };
  },
  async execute(plan, device): Promise<ConnectorExecutionResult> {
    if (!READ_ACTION_SET.has(plan.actionType)) throw new MikroTikRestError("MIKROTIK_REST_WRITE_REQUIRES_SSH", "This operation changes RouterOS. Select the SSH/CLI connection method for controlled write actions.", 409);
    const commands = [];
    for (const path of pathsFor(plan)) {
      const value = await requestJson(device, path);
      commands.push({ template: `GET ${path}`, stdout: compact(value), stderr: "", exitCode: 0 });
    }
    return { executed: true, actionType: plan.actionType, deviceId: device.id, commands, warnings: ["Read-only RouterOS REST operation completed."] };
  },
  async rollback(plan, device): Promise<ConnectorExecutionResult> {
    return { executed: false, actionType: plan.actionType, deviceId: device.id, commands: [], warnings: ["Read-only RouterOS REST operations do not require rollback."] };
  }
};
