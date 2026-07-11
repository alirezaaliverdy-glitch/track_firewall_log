import fs from "node:fs";
import net from "node:net";
import { Client, type ConnectConfig } from "ssh2";
import { ActionType, DeviceProtocol, DeviceType, type ActionPlan, type Device } from "@prisma/client";
import { fortiGateSupportedActions } from "../actions/fortigate-action-catalog.js";
import { env } from "../config/env.js";
import { resolveCredentialById, resolveCredentialByName } from "../services/credential.service.js";
import { resolveEphemeralSecretRef } from "../services/ephemeral-secret.service.js";
import { compileFortiGateAction } from "../services/fortigate-command-compiler.js";
import { evaluateFortiGatePolicy } from "../services/fortigate-policy-guard.service.js";
import type {
  ConnectorAudit,
  ConnectorDryRun,
  ConnectorExecutionResult,
  DeviceCapabilities,
  DeviceConnectionTestResult,
  DeviceConnector,
  FortiGateDiscovery
} from "./types.js";

type FortiGateCredential = {
  name?: string;
  username: string;
  password?: string;
  privateKey?: string;
  privateKeyPath?: string;
  passphrase?: string;
};

type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export class FortiGateConnectorError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "FortiGateConnectorError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const SUPPORTED_ACTIONS: ActionType[] = fortiGateSupportedActions();

const BASIC_COMMANDS = [
  "get system status"
] as const;

const DISCOVERY_COMMANDS = [
  "get system performance status",
  "diagnose sys top-summary",
  "show system interface",
  "get router info routing-table all",
  "get system dns",
  "show system fortiguard",
  "show system admin",
  "show system zone",
  "show firewall policy",
  "show firewall address",
  "show firewall addrgrp",
  "show firewall service custom",
  "show firewall service group",
  "show firewall schedule recurring"
] as const;

const OPTIONAL_COMMANDS = [
  "get system ha status"
] as const;

const READONLY_COMMANDS = new Set<string>([...BASIC_COMMANDS, ...DISCOVERY_COMMANDS, ...OPTIONAL_COMMANDS]);
const FORBIDDEN_READ_PATTERN = /\b(config|edit|set|unset|delete|purge|execute\s+(factoryreset|reboot|restore|backup)|diagnose\s+debug|show\s+full-configuration\s*\|\s*grep\s+password)\b/i;
const FORBIDDEN_EXEC_PATTERN = /\b(factoryreset|format|reboot|shutdown|show\s+full-configuration\s+.*password|set\s+password|private-key|set\s+(?!psksecret\b)[A-Za-z0-9_-]*secret)\b|;|`|\|\s*(?!grep\b)/i;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseCredentialsJson() {
  const raw = process.env.SSH_CREDENTIALS_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, FortiGateCredential>;
    return Object.fromEntries(Object.entries(parsed).map(([name, credential]) => [name, { ...credential, name }]));
  } catch {
    throw new FortiGateConnectorError("FORTIGATE_CREDENTIAL_MISSING", "SSH_CREDENTIALS_JSON is not valid JSON.", 500);
  }
}

function credentialRef(device: Device) {
  const ref = "credentialRef" in device ? device.credentialRef : undefined;
  return typeof ref === "string" && ref.trim() ? ref.trim() : undefined;
}

function credentialId(device: Device) {
  const id = "credentialId" in device ? device.credentialId : undefined;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

async function getCredential(device: Device): Promise<FortiGateCredential> {
  const id = credentialId(device);
  if (id) {
    const credential = await resolveCredentialById(id);
    if (credential) return credential;
  }

  const ref = credentialRef(device);
  if (ref) {
    const dbCredential = await resolveCredentialByName(ref);
    if (dbCredential) return dbCredential;

    const envCredential = parseCredentialsJson()[ref];
    if (envCredential?.username) return envCredential;
  }

  throw new FortiGateConnectorError("FORTIGATE_CREDENTIAL_MISSING", "No FortiGate SSH credential is configured for this device.", 400);
}

function connectConfig(device: Device, credential: FortiGateCredential): ConnectConfig {
  const config: ConnectConfig = {
    host: device.host,
    port: device.managementPort,
    username: credential.username,
    readyTimeout: env.sshHandshakeTimeoutMs
  };
  if (credential.password) config.password = credential.password;
  if (credential.privateKey) config.privateKey = credential.privateKey;
  if (credential.privateKeyPath) config.privateKey = fs.readFileSync(credential.privateKeyPath, "utf8");
  if (credential.passphrase) config.passphrase = credential.passphrase;
  return config;
}

function mapSshError(error: unknown): FortiGateConnectorError {
  const source = error as { level?: string; code?: string; message?: string };
  const message = source?.message ?? "FortiGate SSH connection failed.";
  if (source?.level === "client-authentication" || /auth|authentication/i.test(message)) {
    return new FortiGateConnectorError("FORTIGATE_AUTH_FAILED", "FortiGate SSH authentication failed.", 401);
  }
  if (source?.code === "ETIMEDOUT" || /timed out|timeout/i.test(message)) {
    return new FortiGateConnectorError("FORTIGATE_SSH_HANDSHAKE_TIMEOUT", "FortiGate SSH handshake timed out.", 504);
  }
  return new FortiGateConnectorError("FORTIGATE_TCP_CONNECT_FAILED", message, 502);
}

function tcpConnect(host: string, port: number) {
  return new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const finish = (error?: Error) => {
      socket.removeAllListeners();
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(env.sshConnectTimeoutMs);
    socket.once("connect", () => finish());
    socket.once("timeout", () => finish(new FortiGateConnectorError("FORTIGATE_TCP_CONNECT_FAILED", `TCP connection to ${host}:${port} timed out.`, 502)));
    socket.once("error", (error) => finish(new FortiGateConnectorError("FORTIGATE_TCP_CONNECT_FAILED", error.message, 502)));
  });
}

async function withSshWithCredential<T>(device: Device, credential: FortiGateCredential, callback: (client: Client) => Promise<T>) {
  const client = new Client();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      client.end();
      fn();
    };
    client.once("ready", () => {
      callback(client).then((value) => finish(() => resolve(value))).catch((error) => finish(() => reject(error)));
    });
    client.once("error", (error) => finish(() => reject(mapSshError(error))));
    client.once("timeout", () => finish(() => reject(new FortiGateConnectorError("FORTIGATE_SSH_HANDSHAKE_TIMEOUT", "FortiGate SSH handshake timed out.", 504))));
    client.connect(connectConfig(device, credential));
  });
}

function sanitizeOutput(value: string) {
  return value
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/(set\s+(?:password|passwd|private-key|secret)\s+).+/gi, "$1<redacted>")
    .replace(/(ENC\s+)[A-Za-z0-9+/=]+/g, "$1<redacted>")
    .trim();
}

function assertReadOnlyCommand(command: string) {
  if (!READONLY_COMMANDS.has(command) || FORBIDDEN_READ_PATTERN.test(command)) {
    throw new FortiGateConnectorError("FORTIGATE_COMMAND_FAILED", "FortiGate command is not allowed by the read-only connector.", 500);
  }
}

function assertCatalogCommand(command: string, allowedCommands: Set<string>) {
  if (!allowedCommands.has(command)) {
    throw new FortiGateConnectorError("FORTIGATE_COMMAND_FAILED", "FortiGate command is not part of the approved action plan.", 500);
  }
  if (FORBIDDEN_EXEC_PATTERN.test(command)) {
    throw new FortiGateConnectorError("FORTIGATE_COMMAND_FAILED", "FortiGate command is blocked by PolicyGuard.", 500);
  }
}

const PROMPT_PATTERN = /(?:^|\r?\n)[^\r\n]{1,160}(?:\s+\([^)]+\))?\s*[#$]\s*$/;
const MORE_PATTERN = /(?:\u001b\[[0-9;?]*[A-Za-z])*\s*--More--\s*(?:\u001b\[[0-9;?]*[A-Za-z])*/g;

function exec(client: Client, command: string, timeoutMs = env.sshCommandTimeoutMs, allowedCommands?: Set<string>): Promise<ExecResult> {
  if (allowedCommands) assertCatalogCommand(command, allowedCommands);
  else assertReadOnlyCommand(command);
  return new Promise((resolve, reject) => {
    client.shell({ term: "vt100", cols: 200, rows: 1000 }, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }
      let stdout = "";
      let stderr = "";
      let commandSent = false;
      let settled = false;
      const finish = (result: ExecResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stream.close();
        const withoutPrompt = result.stdout.replace(PROMPT_PATTERN, "").replace(new RegExp(`^\\s*${command.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*`, "i"), "");
        resolve({ ...result, stdout: sanitizeOutput(withoutPrompt) });
      };
      const timer = setTimeout(() => {
        stream.close();
        reject(new FortiGateConnectorError("FORTIGATE_COMMAND_FAILED", "FortiGate SSH command timed out.", 504));
      }, timeoutMs);
      stream.on("close", () => finish({ stdout, stderr: sanitizeOutput(stderr), exitCode: PROMPT_PATTERN.test(stdout) ? 0 : 1 }));
      stream.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stdout += text;
        if (!commandSent && PROMPT_PATTERN.test(stdout)) {
          stdout = "";
          commandSent = true;
          stream.write(`${command}\n`);
          return;
        }
        if (commandSent && MORE_PATTERN.test(stdout)) {
          stdout = stdout.replace(MORE_PATTERN, "");
          MORE_PATTERN.lastIndex = 0;
          stream.write(" ");
          return;
        }
        MORE_PATTERN.lastIndex = 0;
        if (commandSent && PROMPT_PATTERN.test(stdout)) finish({ stdout, stderr: sanitizeOutput(stderr), exitCode: 0 });
      });
      stream.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    });
  });
}

function lines(value: string, limit?: number) {
  const result = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return typeof limit === "number" ? result.slice(0, limit) : result;
}

function matchStatus(status: string, label: string) {
  return status.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "im"))?.[1]?.trim();
}

function parseEditNames(output: string) {
  return Array.from(output.matchAll(/^\s*edit\s+"?([^"\r\n]+)"?/gim)).map((match) => match[1].trim()).filter(Boolean);
}

function parsePolicies(output: string) {
  return Array.from(output.matchAll(/^\s*edit\s+(\d+)/gim)).map((match) => `policy ${match[1]}`).filter(Boolean);
}

function parseInterfaceDetails(output: string): FortiGateDiscovery["interfaceDetails"] {
  return output.split(/^\s*edit\s+/m).slice(1).map((block) => {
    const name = block.match(/^"?([^"\r\n]+)"?/)?.[1]?.trim() ?? "";
    const ip = block.match(/^\s*set\s+ip\s+([^\s]+)(?:\s+([^\s]+))?/m);
    return {
      name,
      ip: ip ? `${ip[1]}${ip[2] ? ` ${ip[2]}` : ""}` : undefined,
      allowAccess: block.match(/^\s*set\s+allowaccess\s+(.+)$/m)?.[1]?.trim().split(/\s+/).filter(Boolean) ?? [],
      status: block.match(/^\s*set\s+status\s+(\S+)/m)?.[1]
    };
  }).filter((item) => item.name);
}

function parseAdmins(output: string): FortiGateDiscovery["adminUsers"] {
  return output.split(/^\s*edit\s+/m).slice(1).map((block) => ({
    name: block.match(/^"?([^"\r\n]+)"?/)?.[1]?.trim() ?? "",
    profile: block.match(/^\s*set\s+accprofile\s+"?([^"\r\n]+)"?/m)?.[1]?.trim(),
    trustHosts: Array.from(block.matchAll(/^\s*set\s+trusthost\d+\s+(.+)$/gm)).map((match) => match[1].trim())
  })).filter((item) => item.name);
}

function discoveryFrom(results: Record<string, ExecResult>): FortiGateDiscovery {
  const status = results["get system status"]?.stdout ?? "";
  const hostname = matchStatus(status, "Hostname");
  const versionLine = status.match(/Version:\s*(.+)$/im)?.[1]?.trim();
  const version = versionLine?.match(/v?(\d+\.\d+(?:\.\d+)?)/i)?.[1];
  const performance = results["get system performance status"]?.stdout ?? "";
  const interfacesOutput = results["show system interface"]?.stdout ?? "";
  const routesOutput = results["get router info routing-table all"]?.stdout ?? "";
  const defaultRouteLine = routesOutput.split(/\r?\n/).find((line) => /(?:^|\s)(?:S\*|0\.0\.0\.0\/0)/.test(line));
  const defaultRouteMatch = defaultRouteLine?.match(/via\s+([^,\s]+)(?:,\s*(\S+))?/i);
  const dnsOutput = results["get system dns"]?.stdout ?? "";
  const interfaceDetails = parseInterfaceDetails(interfacesOutput);
  const vdomMode = /Virtual domain configuration:\s*(enable|multiple)/i.test(status) ? "enabled" : /Virtual domain configuration:\s*disable/i.test(status) ? "disabled" : "unknown";
  return {
    version,
    model: matchStatus(status, "Version")?.split(" v")?.[0]?.trim(),
    serial: matchStatus(status, "Serial-Number"),
    hostname,
    operationMode: matchStatus(status, "Current HA mode") ?? matchStatus(status, "Operation Mode"),
    systemTime: matchStatus(status, "System time"),
    licenseStatus: matchStatus(status, "License Status") ?? matchStatus(status, "License Status Validation"),
    cpuUsage: Number(performance.match(/CPU states:\s*(\d+)%\s*user/i)?.[1] ?? performance.match(/CPU.*?(\d+)%/i)?.[1] ?? NaN) || undefined,
    memoryUsage: Number(performance.match(/Memory:\s*(\d+)%/i)?.[1] ?? NaN) || undefined,
    sessionCount: Number(performance.match(/Average network usage:.*?sessions\s+(\d+)/i)?.[1] ?? performance.match(/sessions?\s*[:=]\s*(\d+)/i)?.[1] ?? NaN) || undefined,
    vdomMode,
    currentVdom: status.match(/Current virtual domain:\s*(.+)$/im)?.[1]?.trim(),
    zones: parseEditNames(results["show system zone"]?.stdout ?? ""),
    interfaces: interfaceDetails.map((item) => item.name),
    interfaceDetails,
    defaultRoute: defaultRouteMatch ? { gateway: defaultRouteMatch[1], interface: defaultRouteMatch[2] } : undefined,
    dnsServers: Array.from(dnsOutput.matchAll(/^\s*(?:primary|secondary)\s*:\s*(\S+)/gim)).map((match) => match[1]),
    adminUsers: parseAdmins(results["show system admin"]?.stdout ?? ""),
    policies: parsePolicies(results["show firewall policy"]?.stdout ?? ""),
    addressObjects: parseEditNames(results["show firewall address"]?.stdout ?? ""),
    addressGroups: parseEditNames(results["show firewall addrgrp"]?.stdout ?? ""),
    services: parseEditNames(results["show firewall service custom"]?.stdout ?? ""),
    serviceGroups: parseEditNames(results["show firewall service group"]?.stdout ?? ""),
    schedules: parseEditNames(results["show firewall schedule recurring"]?.stdout ?? ""),
    routes: lines(results["get router info routing-table all"]?.stdout ?? "", 200),
    haStatus: lines(results["get system ha status"]?.stdout ?? "", 80),
    raw: Object.fromEntries(Object.entries(results).map(([command, result]) => [command, result.stdout]))
  };
}

async function runCommands(client: Client, commands: readonly string[], warnings: DeviceConnectionTestResult["warnings"]) {
  const results: Record<string, ExecResult> = {};
  for (const command of commands) {
    try {
      const result = await exec(client, command);
      results[command] = result;
      if (result.exitCode !== 0) warnings.push({ code: "FORTIGATE_COMMAND_FAILED", message: `${command} failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}` });
    } catch (error) {
      const connectorError = error instanceof FortiGateConnectorError ? error : new FortiGateConnectorError("FORTIGATE_COMMAND_FAILED", error instanceof Error ? error.message : "FortiGate command failed.", 502);
      warnings.push({ code: connectorError.code, message: `${command} failed: ${connectorError.message}` });
      results[command] = { stdout: "", stderr: connectorError.message, exitCode: 1 };
    }
  }
  return results;
}

async function collectFortiGateStatus(device: Device): Promise<DeviceConnectionTestResult> {
  const stages: DeviceConnectionTestResult["stages"] = [{ name: "resolve_device", status: "ok" }];
  const warnings: DeviceConnectionTestResult["warnings"] = [];
  const base = { deviceId: device.id, vendor: "fortigate" as const, host: device.host, port: device.managementPort, stages, warnings };

  let credential: FortiGateCredential;
  try {
    credential = await getCredential(device);
    stages.push({ name: "resolve_credential", status: "ok" });
  } catch (error) {
    const connectorError = error instanceof FortiGateConnectorError ? error : new FortiGateConnectorError("FORTIGATE_CREDENTIAL_MISSING", "No FortiGate SSH credential is configured for this device.");
    stages.push({ name: "resolve_credential", status: "failed", code: connectorError.code, message: connectorError.message });
    return { ...base, connected: false, credentialResolved: false, capabilities: { canConnect: false, canReadSystem: false, canReadInterfaces: false, canReadFirewall: false, canReadLogs: false, canExecuteWriteActions: true }, errorCode: connectorError.code, message: connectorError.message };
  }

  try {
    await tcpConnect(device.host, device.managementPort);
    stages.push({ name: "tcp_connect", status: "ok" });
  } catch (error) {
    const connectorError = error instanceof FortiGateConnectorError ? error : new FortiGateConnectorError("FORTIGATE_TCP_CONNECT_FAILED", "FortiGate TCP connection failed.");
    stages.push({ name: "tcp_connect", status: "failed", code: connectorError.code, message: connectorError.message });
    return { ...base, connected: false, credentialResolved: true, credentialName: credential.name ?? credentialRef(device), username: credential.username, capabilities: { canConnect: false, canReadSystem: false, canReadInterfaces: false, canReadFirewall: false, canReadLogs: false, canExecuteWriteActions: true }, errorCode: connectorError.code, message: connectorError.message };
  }

  return withSshWithCredential(device, credential, async (client) => {
    stages.push({ name: "ssh_handshake", status: "ok" }, { name: "ssh_auth", status: "ok" });
    const basicResults = await runCommands(client, BASIC_COMMANDS, warnings);
    if (BASIC_COMMANDS.some((command) => basicResults[command]?.exitCode !== 0)) {
      stages.push({ name: "basic_commands", status: "failed", code: "FORTIGATE_COMMAND_FAILED", message: "Required FortiGate status command failed." });
      return { ...base, connected: false, credentialResolved: true, credentialName: credential.name ?? credentialRef(device), username: credential.username, capabilities: { canConnect: true, canReadSystem: false, canReadInterfaces: false, canReadFirewall: false, canReadLogs: false, canExecuteWriteActions: true }, errorCode: "FORTIGATE_COMMAND_FAILED", message: "FortiGate basic command failed." };
    }
    stages.push({ name: "basic_commands", status: "ok" });
    const discoveryResults = await runCommands(client, DISCOVERY_COMMANDS, warnings);
    const optionalResults = await runCommands(client, OPTIONAL_COMMANDS, warnings);
    const allResults = { ...basicResults, ...discoveryResults, ...optionalResults };
    const fortigate = discoveryFrom(allResults);
    stages.push({ name: "discovery", status: warnings.length > 0 ? "warning" : "ok", code: warnings.length > 0 ? "FORTIGATE_DISCOVERY_PARTIAL" : undefined });
    stages.push({ name: "optional_capabilities", status: warnings.length > 0 ? "warning" : "ok" });
    return {
      ...base,
      connected: true,
      credentialResolved: true,
      credentialName: credential.name ?? credentialRef(device),
      username: credential.username,
      hostname: fortigate.hostname,
      fortigate,
      capabilities: { canConnect: true, canReadSystem: true, canReadInterfaces: fortigate.interfaces.length > 0, canReadFirewall: true, canReadLogs: true, canExecuteWriteActions: true },
      errorCode: warnings.length > 0 ? "FORTIGATE_DISCOVERY_PARTIAL" : undefined,
      message: warnings.length > 0 ? "FortiGate SSH discovery completed with warnings." : "FortiGate SSH discovery succeeded."
    };
  }).catch((error) => {
    const connectorError = error instanceof FortiGateConnectorError ? error : mapSshError(error);
    if (!stages.some((stage) => stage.name === "ssh_handshake")) {
      stages.push(connectorError.code === "FORTIGATE_AUTH_FAILED"
        ? { name: "ssh_auth", status: "failed", code: connectorError.code, message: connectorError.message }
        : { name: "ssh_handshake", status: "failed", code: connectorError.code, message: connectorError.message });
    }
    return { ...base, connected: false, credentialResolved: true, credentialName: credential.name ?? credentialRef(device), username: credential.username, capabilities: { canConnect: true, canReadSystem: false, canReadInterfaces: false, canReadFirewall: false, canReadLogs: false, canExecuteWriteActions: true }, errorCode: connectorError.code, message: connectorError.message };
  });
}

function capabilitiesFromStatus(status: Record<string, unknown>): DeviceCapabilities {
  const fortigate = asObject(status.fortigate) as FortiGateDiscovery;
  const capabilities = asObject(status.capabilities);
  const warnings = Array.isArray(status.warnings) ? status.warnings as Array<{ code: string; message: string }> : [];
  return {
    canTestConnection: true,
    canCollectStatus: true,
    canReadSystem: capabilities.canReadSystem === true,
    canReadInterfaces: capabilities.canReadInterfaces === true,
    canReadFirewall: capabilities.canReadFirewall === true,
    canReadLogs: capabilities.canReadLogs === true,
    canExecuteWriteActions: true,
    canExecuteChangeSshPort: false,
    supportedActions: SUPPORTED_ACTIONS,
    identity: fortigate.hostname,
    interfaceCount: Array.isArray(fortigate.interfaces) ? fortigate.interfaces.length : 0,
    firewallFilterRuleCount: Array.isArray(fortigate.policies) ? fortigate.policies.length : 0,
    serviceSummary: Array.isArray(fortigate.services) ? fortigate.services.slice(0, 25) : [],
    warnings,
    fortigate
  };
}

export const fortigateSshConnector: DeviceConnector = {
  name: "fortigate",
  supportedActions: SUPPORTED_ACTIONS,
  supports(device) {
    return Boolean(device && device.protocol === DeviceProtocol.ssh && (
      device.type === DeviceType.fortigate ||
      String(device.vendor ?? "").toLowerCase().includes("fortigate") ||
      String(device.vendor ?? "").toLowerCase().includes("fortinet")
    ));
  },
  testConnection(device) {
    return collectFortiGateStatus(device);
  },
  async getCapabilities(device) {
    const stored = asObject(device.capabilities);
    const status = asObject(stored.fortigateStatus);
    if (Object.keys(status).length > 0) return capabilitiesFromStatus(status);
    return {
      canTestConnection: true,
      canCollectStatus: true,
      canReadSystem: false,
      canReadInterfaces: false,
      canReadFirewall: false,
      canReadLogs: false,
      canExecuteWriteActions: true,
      canExecuteChangeSshPort: false,
      supportedActions: SUPPORTED_ACTIONS,
      warnings: [{ code: "FORTIGATE_DISCOVERY_REQUIRED", message: "Run Test/Discover first to populate FortiGate discovery." }]
    };
  },
  collectStatus(device) {
    return collectFortiGateStatus(device);
  },
  async dryRun(actionPlan: ActionPlan, device: Device): Promise<ConnectorDryRun> {
    const policy = evaluateFortiGatePolicy(actionPlan, device);
    const validation = policy.validation;
    if (!policy.valid) throw new FortiGateConnectorError("CONNECTOR_ACTION_UNSUPPORTED", policy.errors.join(" "), 400);
    const backupSpecs = policy.backupCommands.map((command) => ({ template: command, command, write: false, target: { backupName: policy.backupName, preflight: true } }));
    return {
      plannedCommands: [...policy.preflightCommands, ...validation.commandSpecs.map((item) => item.command)],
      validationWarnings: [
        ...policy.warnings,
        ...(policy.requiresBackup ? [`Backup/export preflight required: ${policy.backupName}`] : []),
        ...(policy.requiresBreakGlass ? ["Break-glass confirmation is required for this critical FortiGate action."] : [])
      ],
      affectedPorts: [],
      affectedServices: ["fortios-firewall"],
      rollbackSteps: validation.commandSpecs.flatMap((spec) => spec.rollbackSteps),
      riskLevel: validation.riskLevel,
      requiresApproval: true,
      commandSpecs: [...backupSpecs, ...validation.commandSpecs.map((spec) => ({ template: spec.template, command: spec.command, write: spec.write, target: spec.target }))],
      exactTarget: { ...validation.normalizedParameters, backupName: policy.backupName, requiresBackup: policy.requiresBackup, requiresBreakGlass: policy.requiresBreakGlass, lockoutSensitive: policy.lockoutSensitive }
    };
  },
  async execute(actionPlan: ActionPlan, device: Device, audit?: ConnectorAudit): Promise<ConnectorExecutionResult> {
    const rawParams = asObject(actionPlan.parametersJson);
    const pskSecretRef = typeof rawParams.pskSecretRef === "string" ? rawParams.pskSecretRef : undefined;
    const pskSecretValue = pskSecretRef ? resolveEphemeralSecretRef(pskSecretRef, "fortigate_ipsec_psk") : undefined;
    if (pskSecretRef && !pskSecretValue) {
      throw new FortiGateConnectorError("FORTIGATE_SECRET_REF_EXPIRED", "The temporary FortiGate VPN PSK reference is missing or expired. Rebuild the ActionPlan before execution.", 409);
    }
    const executionPlan = pskSecretRef
      ? { ...actionPlan, parametersJson: { ...rawParams, pskSecretValue } }
      : actionPlan;
    const policy = evaluateFortiGatePolicy(executionPlan as ActionPlan, device);
    const validation = policy.validation;
    if (!policy.valid) throw new FortiGateConnectorError("CONNECTOR_ACTION_UNSUPPORTED", policy.errors.join(" "), 400);
    const params = asObject(actionPlan.parametersJson);
    const breakGlassReady = policy.breakGlass && params.deviceNameConfirmation === device.name && params.executeConfirmation === "EXECUTE" && typeof params.reason === "string" && params.reason.trim().length > 0;
    if (policy.requiresBreakGlass && !breakGlassReady) {
      throw new FortiGateConnectorError("FORTIGATE_BREAK_GLASS_REQUIRED", "Critical FortiGate action requires breakGlass=true, executeConfirmation=EXECUTE, matching deviceNameConfirmation, and a reason.", 409);
    }
    const allowedCommands = new Set([...policy.preflightCommands, ...validation.commandSpecs.map((spec) => spec.command)]);
    const commands: ConnectorExecutionResult["commands"] = [];
    const credential = await getCredential(device);
    await audit?.("policy_guard_passed", "FortiGate catalog validation passed.", { actionType: actionPlan.actionType, target: validation.normalizedParameters, commandCount: validation.commandSpecs.length });
    return withSshWithCredential(device, credential, async (client) => {
      await audit?.("connection_attempt", "FortiGate SSH execution connection is ready.", { host: device.host, port: device.managementPort, actionType: actionPlan.actionType });
      for (const command of policy.preflightCommands) {
        const result = await exec(client, command, env.sshCommandTimeoutMs, allowedCommands);
        const isBackup = policy.backupCommands.includes(command);
        const safeStdout = isBackup ? "[redacted-backup-output]" : result.stdout.slice(0, 4000);
        commands.push({ template: command, stdout: safeStdout, stderr: result.stderr.slice(0, 2000), exitCode: result.exitCode });
        await audit?.(isBackup ? "backup_export_created" : "preflight_object_collected", "FortiGate preflight command executed.", { template: command, exitCode: result.exitCode, stdout: isBackup ? "[redacted-backup-output]" : result.stdout.slice(0, 2000), stderr: result.stderr.slice(0, 2000) });
        if (result.exitCode !== 0 && policy.requiresBackup) throw new FortiGateConnectorError("FORTIGATE_BACKUP_FAILED", result.stderr || "FortiGate backup/export preflight failed.", 502);
      }
      for (const spec of validation.commandSpecs) {
        const result = await exec(client, spec.command, env.sshCommandTimeoutMs, allowedCommands);
        commands.push({ template: spec.template, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode });
        await audit?.("command_executed", `FortiGate template executed: ${spec.template}`, { template: spec.template, write: spec.write, target: spec.target, exitCode: result.exitCode, stdout: result.stdout.slice(0, 2000), stderr: result.stderr.slice(0, 2000) });
        if (result.exitCode !== 0) throw new FortiGateConnectorError("FORTIGATE_COMMAND_FAILED", result.stderr || result.stdout || `FortiGate command failed: ${spec.template}`, 502);
      }
      await audit?.("rollback_available", "Rollback metadata is available for this FortiGate action.", validation.rollbackJson);
      return { executed: true, actionType: actionPlan.actionType, deviceId: device.id, commands, warnings: validation.warnings, rollbackJson: validation.rollbackJson };
    });
  },
  async rollback(): Promise<ConnectorExecutionResult> {
    throw new FortiGateConnectorError("CONNECTOR_ACTION_UNSUPPORTED", "FortiGate automatic rollback is not available; use stored rollback metadata and backup/export.", 409);
  }
};
