import https from "node:https";
import net from "node:net";
import { ActionType, type ActionPlan, type Device } from "@prisma/client";
import { resolveCredentialById, resolveCredentialByName } from "../services/credential.service.js";
import type { ConnectorDryRun, ConnectorExecutionResult, DeviceCapabilities, DeviceConnectionTestResult, DeviceConnector, SophosDiscovery } from "./types.js";

const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const SUPPORTED_ACTIONS = [ActionType.generic_security_action] as const;
const DISCOVERY_ENTITIES = ["Interface", "Zone", "Gateway", "FirewallRule", "IPHost", "Services", "IPSecConnection"] as const;

type SophosOperation = "inventory" | "enable-interface" | "disable-interface" | "set-interface-ipv4" | "enable-firewall-rule" | "disable-firewall-rule";

export class SophosApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 502) {
    super(message);
    this.name = "SophosApiError";
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function escapeXml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
}

function tagValue(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")) : undefined;
}

function tagInner(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1];
}

function tagValues(xml: string, tag: string) {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
    .map((match) => decodeXml(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")))
    .filter(Boolean);
}

function blocks(xml: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tokens = [...xml.matchAll(new RegExp(`<\\/?${escaped}(?=\\s|>)[^>]*>`, "gi"))];
  const stack: number[] = [];
  const result: string[] = [];
  for (const token of tokens) {
    if (!token[0].startsWith("</")) {
      stack.push(token.index ?? 0);
      continue;
    }
    const start = stack.pop();
    if (start === undefined) continue;
    const candidate = xml.slice(start, (token.index ?? start) + token[0].length);
    const bodyStart = candidate.indexOf(">");
    const body = candidate.slice(bodyStart + 1, candidate.lastIndexOf("</"));
    if (!new RegExp(`<${escaped}(?=\\s|>)`, "i").test(body)) result.push(candidate);
  }
  return result;
}

function normalizeLink(value: unknown): "up" | "down" | "unknown" {
  const text = String(value ?? "").toLowerCase();
  if (/^(up|connected|active|on|enable|enabled)$/.test(text)) return "up";
  if (/^(down|disconnected|unplugged|inactive|off|disable|disabled)$/.test(text)) return "down";
  return "unknown";
}

function assertSafeName(value: unknown, field: string) {
  const name = String(value ?? "").trim();
  if (!name || name.length > 128 || /[<>\u0000-\u001f]/.test(name)) throw new SophosApiError("SOPHOS_INVALID_PARAMETER", `${field} is invalid.`, 400);
  return name;
}

function actionMetadata(plan: ActionPlan) {
  const parameters = record(plan.parametersJson);
  return { parameters, metadata: record(parameters.metadata), normalized: record(record(parameters.metadata).normalizedParams) };
}

function operationFromPlan(plan: ActionPlan): SophosOperation {
  const { metadata } = actionMetadata(plan);
  const id = String(metadata.catalogCommandId ?? metadata.executionTemplateRef ?? "");
  const table: Record<string, SophosOperation> = {
    "sophos.inventory": "inventory",
    "sophos.enable-interface": "enable-interface",
    "sophos.disable-interface": "disable-interface",
    "sophos.set-interface-ipv4": "set-interface-ipv4",
    "sophos.enable-firewall-rule": "enable-firewall-rule",
    "sophos.disable-firewall-rule": "disable-firewall-rule"
  };
  const operation = table[id];
  if (!operation) throw new SophosApiError("SOPHOS_OPERATION_NOT_REGISTERED", "Sophos operation is not registered for controlled execution.", 400);
  return operation;
}

async function credential(device: Device) {
  const saved = device.credentialId ? await resolveCredentialById(device.credentialId) : device.credentialRef ? await resolveCredentialByName(device.credentialRef) : null;
  if (!saved?.username || !saved.password) throw new SophosApiError("SOPHOS_CREDENTIAL_MISSING", "A stored username/password credential is required for the Sophos XML API.", 400);
  return saved;
}

function tlsVerification(device: Device) {
  const capabilities = record(device.capabilities);
  return capabilities.sophosTlsVerify === true;
}

async function postXml(device: Device, bodyXml: string) {
  const encoded = new URLSearchParams({ reqxml: bodyXml }).toString();
  return await new Promise<string>((resolve, reject) => {
    const request = https.request({
      hostname: device.host,
      port: device.managementPort,
      path: "/webconsole/APIController",
      method: "POST",
      rejectUnauthorized: tlsVerification(device),
      timeout: REQUEST_TIMEOUT_MS,
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(encoded), Accept: "application/xml,text/xml" }
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) request.destroy(new SophosApiError("SOPHOS_RESPONSE_TOO_LARGE", "Sophos API response exceeded the safe size limit."));
        else chunks.push(chunk);
      });
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) return reject(new SophosApiError("SOPHOS_HTTP_ERROR", `Sophos API returned HTTP ${response.statusCode ?? "unknown"}.`));
        resolve(text);
      });
    });
    request.once("timeout", () => request.destroy(new SophosApiError("SOPHOS_API_TIMEOUT", "Sophos API request timed out.", 504)));
    request.once("error", (error) => reject(error instanceof SophosApiError ? error : new SophosApiError("SOPHOS_API_UNREACHABLE", "Sophos API endpoint is unreachable.")));
    request.end(encoded);
  });
}

async function call(device: Device, operationXml = "") {
  const auth = await credential(device);
  const xml = `<Request><Login><Username>${escapeXml(auth.username)}</Username><Password>${escapeXml(auth.password)}</Password></Login>${operationXml}</Request>`;
  const response = await postXml(device, xml);
  if (/authentication\s+(failed|failure)|invalid\s+(user|password|credential)|login\s+failed/i.test(response)) {
    throw new SophosApiError("SOPHOS_AUTH_FAILED", "Sophos administrator authentication failed.", 401);
  }
  const failure = [...response.matchAll(/<Status\s+code=["'](\d+)["'][^>]*>([\s\S]*?)<\/Status>/gi)]
    .map((match) => ({ code: Number(match[1]), message: decodeXml(match[2].replace(/<[^>]+>/g, " ")) }))
    .find((status) => status.code >= 400);
  if (failure) throw new SophosApiError("SOPHOS_OPERATION_FAILED", `Sophos rejected the operation (${failure.code}): ${failure.message.slice(0, 240)}`, 409);
  return response;
}

export function parseSophosDiscovery(xml: string): SophosDiscovery {
  const interfaces = blocks(xml, "Interface").map((entry) => {
    const hardware = tagValue(entry, "Hardware") ?? tagValue(entry, "Name") ?? "unknown";
    return {
      name: tagValue(entry, "Name") ?? hardware,
      hardware,
      zone: tagValue(entry, "NetworkZone"),
      ipAddresses: tagValues(entry, "IPAddress"),
      netmask: tagValue(entry, "Netmask"),
      macAddress: tagValue(entry, "MACAddress"),
      speed: tagValue(entry, "InterfaceSpeed"),
      operationalStatus: normalizeLink(tagValue(entry, "Status")),
      administrativeStatus: normalizeLink(tagValue(entry, "InterfaceStatus"))
    };
  }).filter((entry) => entry.hardware !== "unknown");
  const firewallRules = blocks(xml, "FirewallRule").map((entry) => ({
    name: tagValue(entry, "Name") ?? "unnamed",
    status: normalizeLink(tagValue(entry, "Status")) === "up" ? "enabled" as const : normalizeLink(tagValue(entry, "Status")) === "down" ? "disabled" as const : "unknown" as const,
    action: tagValue(entry, "Action"),
    sourceZones: tagValues(tagInner(entry, "SourceZones") ?? "", "Zone"),
    destinationZones: tagValues(tagInner(entry, "DestinationZones") ?? "", "Zone"),
    services: tagValues(tagInner(entry, "Services") ?? "", "Service")
  }));
  return {
    product: "Sophos Firewall",
    apiVersion: xml.match(/<Response[^>]*APIVersion=["']([^"']+)/i)?.[1],
    interfaces,
    zones: unique(blocks(xml, "Zone").map((entry) => xmlName(entry)).filter(Boolean)),
    gateways: blocks(xml, "Gateway").map((entry) => tagValue(entry, "Name") ?? tagValue(entry, "GatewayName") ?? "").filter(Boolean),
    firewallRules,
    ipHosts: blocks(xml, "IPHost").map((entry) => ({ name: tagValue(entry, "Name") ?? "unnamed", address: tagValue(entry, "IPAddress"), hostType: tagValue(entry, "HostType") })),
    services: blocks(xml, "Services").map((entry) => ({ name: tagValue(entry, "Name") ?? "unnamed", protocol: tagValue(entry, "Protocol"), ports: [...tagValues(entry, "SourcePort"), ...tagValues(entry, "DestinationPort"), ...tagValues(entry, "Port")] })),
    vpnConnections: blocks(xml, "IPSecConnection").map((entry) => ({ name: tagValue(entry, "Name") ?? "unnamed", status: tagValue(entry, "Status") })),
    collectedAt: new Date().toISOString()
  };
}

function d(value: string) { return decodeXml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")); }
function xmlName(xml: string) { return tagValue(xml, "Name") ?? tagValue(xml, "Hardware") ?? d(xml); }
function unique(values: string[]) { return [...new Set(values.filter(Boolean))]; }
function textFrom(value: unknown) { return String(value ?? "").trim(); }
function firstIp(value: unknown) { const raw = textFrom(value); if (!raw) throw new SophosApiError("SOPHOS_INVALID_PARAMETER", "IPv4 address is required.", 400); const [ip, prefix = "24"] = raw.split("/"); if (net.isIP(ip) !== 4 || !/^\d{1,2}$/.test(prefix) || Number(prefix) > 32) throw new SophosApiError("SOPHOS_INVALID_PARAMETER", "A valid IPv4/CIDR value is required.", 400); return { ip, prefix: Number(prefix) }; }
function mask(prefix: number) { const bits = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0; return [24, 16, 8, 0].map((shift) => (bits >>> shift) & 255).join("."); }
function replaceTag(xml: string, tag: string, value: string) { const node = `<${tag}>${escapeXml(value)}</${tag}>`; return new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, "i").test(xml) ? xml.replace(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, "i"), node) : xml.replace(/<\/[^>]+>\s*$/, `${node}$&`); }
function findEntity(xml: string, tag: string, name: string, alternate = "Name") { return blocks(xml, tag).find((entry) => tagValue(entry, alternate) === name || tagValue(entry, "Name") === name); }
function getXml(entities: readonly string[]) { return `<Get>${entities.map((entity) => `<${entity}></${entity}>`).join("")}</Get>`; }

async function discover(device: Device) {
  return parseSophosDiscovery(await call(device, getXml(DISCOVERY_ENTITIES)));
}

async function setInterface(device: Device, parameters: Record<string, unknown>, enabled?: boolean) {
  const interfaceName = assertSafeName(parameters.interfaceName ?? parameters.name, "interfaceName");
  const currentXml = await call(device, `<Get><Interface></Interface></Get>`);
  let entity = findEntity(currentXml, "Interface", interfaceName, "Hardware");
  if (!entity) throw new SophosApiError("SOPHOS_INTERFACE_NOT_FOUND", `Sophos interface ${interfaceName} was not found.`, 404);
  const before = { interfaceName, interfaceStatus: tagValue(entity, "InterfaceStatus"), ipAddress: tagValue(entity, "IPAddress"), netmask: tagValue(entity, "Netmask") };
  if (enabled !== undefined) entity = replaceTag(entity, "InterfaceStatus", enabled ? "ON" : "OFF");
  if (parameters.ipAddress) { const address = firstIp(parameters.ipAddress); entity = replaceTag(replaceTag(entity, "IPAddress", address.ip), "Netmask", mask(address.prefix)); }
  const response = await call(device, `<Set operation="update">${entity}</Set>`);
  const expected = { interfaceStatus: enabled === undefined ? before.interfaceStatus : enabled ? "ON" : "OFF", ipAddress: parameters.ipAddress ? firstIp(parameters.ipAddress).ip : before.ipAddress };
  const verifiedXml = await call(device, `<Get><Interface></Interface></Get>`);
  const verified = findEntity(verifiedXml, "Interface", interfaceName, "Hardware");
  const actual = { interfaceStatus: verified ? tagValue(verified, "InterfaceStatus") : undefined, ipAddress: verified ? tagValue(verified, "IPAddress") : undefined };
  if (!verified || (expected.interfaceStatus && String(actual.interfaceStatus).toUpperCase() !== String(expected.interfaceStatus).toUpperCase()) || (expected.ipAddress && actual.ipAddress !== expected.ipAddress)) {
    throw new SophosApiError("SOPHOS_POST_VERIFY_FAILED", `Sophos did not confirm the requested state for interface ${interfaceName}.`, 409);
  }
  return { response, before, after: { interfaceName, ...actual }, verified: true };
}

async function setFirewallRule(device: Device, parameters: Record<string, unknown>, enabled: boolean) {
  const ruleName = assertSafeName(parameters.ruleName ?? parameters.name, "ruleName");
  const currentXml = await call(device, `<Get><FirewallRule><Filter><key name="Name" criteria="=">${escapeXml(ruleName)}</key></Filter></FirewallRule></Get>`);
  let entity = findEntity(currentXml, "FirewallRule", ruleName);
  if (!entity) throw new SophosApiError("SOPHOS_RULE_NOT_FOUND", `Sophos firewall rule ${ruleName} was not found.`, 404);
  const previousStatus = tagValue(entity, "Status") ?? "unknown";
  entity = replaceTag(entity, "Status", enabled ? "Enable" : "Disable");
  const response = await call(device, `<Set operation="update">${entity}</Set>`);
  const verifiedXml = await call(device, `<Get><FirewallRule><Filter><key name="Name" criteria="=">${escapeXml(ruleName)}</key></Filter></FirewallRule></Get>`);
  const verified = findEntity(verifiedXml, "FirewallRule", ruleName);
  const actualStatus = verified ? tagValue(verified, "Status") : undefined;
  if (!verified || String(actualStatus).toLowerCase() !== (enabled ? "enable" : "disable")) {
    throw new SophosApiError("SOPHOS_POST_VERIFY_FAILED", `Sophos did not confirm the requested state for firewall rule ${ruleName}.`, 409);
  }
  return { response, before: { ruleName, status: previousStatus }, after: { ruleName, status: actualStatus }, verified: true };
}

function params(plan: ActionPlan) { const { parameters, normalized } = actionMetadata(plan); return { ...normalized, ...parameters }; }

async function connection(device: Device): Promise<DeviceConnectionTestResult> {
  try {
    const sophos = await discover(device);
    const tlsWarning = tlsVerification(device) ? [] : [{ code: "SOPHOS_SELF_SIGNED_TLS", message: "TLS certificate verification is disabled for this private Sophos endpoint. Install a trusted certificate and enable sophosTlsVerify for strict validation." }];
    return {
      connected: true, deviceId: device.id, vendor: "sophos", host: device.host, port: device.managementPort, credentialResolved: true, sophos,
      stages: [
        { name: "resolve_device", status: "ok" }, { name: "resolve_credential", status: "ok" }, { name: "tcp_connect", status: "ok" },
        { name: "ssh_handshake", status: "ok", message: "HTTPS/TLS API channel established." }, { name: "ssh_auth", status: "ok", message: "Sophos API authentication succeeded." },
        { name: "readonly_discovery", status: "ok", message: `${sophos.interfaces.length} interfaces and ${sophos.firewallRules.length} firewall rules collected.` }
      ],
      warnings: tlsWarning,
      capabilities: { canConnect: true, canRunBasicReadOnly: true, canReadSystem: true, canReadInterfaces: true, canReadFirewall: true, canExecuteWriteActions: true },
      message: "Sophos XML API authentication and read-only discovery succeeded."
    };
  } catch (error) {
    const failure = error instanceof SophosApiError ? error : new SophosApiError("SOPHOS_API_FAILED", "Sophos API connection failed.");
    return {
      connected: false, deviceId: device.id, vendor: "sophos", host: device.host, port: device.managementPort,
      credentialResolved: failure.code !== "SOPHOS_CREDENTIAL_MISSING",
      stages: [{ name: "resolve_device", status: "ok" }, { name: "resolve_credential", status: failure.code.includes("CREDENTIAL") ? "failed" : "ok" }, { name: "tcp_connect", status: "failed", code: failure.code, message: failure.message }],
      warnings: [], capabilities: { canConnect: false, canRunBasicReadOnly: false, canReadInterfaces: false, canReadFirewall: false, canExecuteWriteActions: false }, errorCode: failure.code, message: failure.message
    };
  }
}

export const sophosApiConnector: DeviceConnector = {
  name: "sophos",
  supportedActions: [...SUPPORTED_ACTIONS],
  supports(device) { return Boolean(device && /sophos|sfos|cyberoam/i.test(`${device.vendor} ${device.type}`) && device.protocol === "api"); },
  testConnection: connection,
  async getCapabilities(): Promise<DeviceCapabilities> { return { canTestConnection: true, canCollectStatus: true, canReadSystem: true, canReadInterfaces: true, canReadFirewall: true, canExecuteWriteActions: true, canExecuteChangeSshPort: false, supportedActions: [...SUPPORTED_ACTIONS] }; },
  collectStatus: connection,
  async dryRun(plan): Promise<ConnectorDryRun> {
    const operation = operationFromPlan(plan); const values = params(plan); const target = operation.includes("interface") ? { interfaceName: values.interfaceName ?? values.name } : operation.includes("rule") ? { ruleName: values.ruleName ?? values.name } : {};
    return { plannedCommands: [`Sophos XML API: ${operation}`], validationWarnings: ["The current object is read first; only the registered field is changed and the API response is verified."], affectedPorts: [], affectedServices: [], rollbackSteps: operation === "inventory" ? [] : ["Restore the previous object value captured immediately before execution."], riskLevel: plan.riskLevel, requiresApproval: true, commandSpecs: [{ template: `sophos_${operation.replace(/-/g, "_")}`, command: `POST /webconsole/APIController (${operation})`, write: operation !== "inventory", target }], exactTarget: { deviceId: plan.deviceId, ...target } };
  },
  async execute(plan, device, audit): Promise<ConnectorExecutionResult> {
    const operation = operationFromPlan(plan); const values = params(plan);
    await audit?.("sophos.api.invoked", `Sophos controlled API operation ${operation} started.`, { deviceId: device.id, operation });
    let output: Record<string, unknown>;
    if (operation === "inventory") { const snapshot = await discover(device); output = { product: snapshot.product, apiVersion: snapshot.apiVersion, interfaces: snapshot.interfaces.length, firewallRules: snapshot.firewallRules.length, ipHosts: snapshot.ipHosts.length, services: snapshot.services.length, vpnConnections: snapshot.vpnConnections.length, collectedAt: snapshot.collectedAt }; }
    else if (operation === "enable-interface" || operation === "disable-interface" || operation === "set-interface-ipv4") output = await setInterface(device, values, operation === "enable-interface" ? true : operation === "disable-interface" ? false : undefined);
    else output = await setFirewallRule(device, values, operation === "enable-firewall-rule");
    const safeOutput = { ...output }; delete safeOutput.response;
    await audit?.("sophos.api.succeeded", `Sophos controlled API operation ${operation} succeeded.`, { deviceId: device.id, operation, result: safeOutput });
    return { executed: true, actionType: plan.actionType, deviceId: device.id, commands: [{ template: `sophos_${operation.replace(/-/g, "_")}`, stdout: JSON.stringify(safeOutput), stderr: "", exitCode: 0 }], warnings: [], rollbackJson: operation === "inventory" ? { available: false, outcome: "read_only" } : { available: true, ...record(output.before), verification: safeOutput } };
  },
  async rollback(plan, device): Promise<ConnectorExecutionResult> { return { executed: false, actionType: plan.actionType, deviceId: device.id, commands: [], warnings: ["Use the captured previous Sophos object state through a reviewed follow-up ActionPlan."], rollbackJson: { available: true, automatic: false } }; }
};
