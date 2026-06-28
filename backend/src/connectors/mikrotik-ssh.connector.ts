import fs from "node:fs";
import net from "node:net";
import { Client, type ConnectConfig } from "ssh2";
import { ActionType, DeviceProtocol, DeviceType, type ActionPlan, type Device } from "@prisma/client";
import { mikroTikSupportedActions, validateMikroTikAction } from "../actions/mikrotik-action-catalog.js";
import { env } from "../config/env.js";
import { resolveCredentialById, resolveCredentialByName } from "../services/credential.service.js";
import { evaluateMikroTikExpertPolicy } from "../services/mikrotik-policy-guard.service.js";
import type {
  ConnectorAudit,
  ConnectorDryRun,
  ConnectorExecutionResult,
  DeviceCapabilities,
  DeviceConnectionTestResult,
  DeviceConnector,
  MikroTikDiscovery
} from "./types.js";

type MikroTikCredential = {
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

export class MikroTikConnectorError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "MikroTikConnectorError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const SUPPORTED_ACTIONS: ActionType[] = mikroTikSupportedActions();

const BASIC_COMMANDS = [
  "/system identity print",
  "/system resource print",
  "/system package print",
  "/interface print terse",
  "/ip address print terse",
  "/ip route print terse"
] as const;

const READONLY_DISCOVERY_COMMANDS = [
  "/ip firewall filter print terse",
  "/ip firewall nat print terse",
  "/ip firewall mangle print terse",
  "/ip firewall address-list print terse",
  "/ip service print terse",
  "/log print count-only",
  "/log print without-paging"
] as const;

const READONLY_COMMANDS = new Set<string>([...BASIC_COMMANDS, ...READONLY_DISCOVERY_COMMANDS]);
const FORBIDDEN_COMMAND_PATTERN = /\b(add|set|remove|disable|enable|reset|reboot|password|user)\b|export\s+show-sensitive|certificate\s+private-key\s+export/i;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseCredentialsJson() {
  const raw = process.env.SSH_CREDENTIALS_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, MikroTikCredential>;
    return Object.fromEntries(Object.entries(parsed).map(([name, credential]) => [name, { ...credential, name }]));
  } catch {
    throw new MikroTikConnectorError("MIKROTIK_CREDENTIAL_MISSING", "SSH_CREDENTIALS_JSON is not valid JSON.", 500);
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

async function getCredential(device: Device): Promise<MikroTikCredential> {
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

  throw new MikroTikConnectorError("MIKROTIK_CREDENTIAL_MISSING", "No MikroTik SSH credential is configured for this device.", 400);
}

function connectConfig(device: Device, credential: MikroTikCredential): ConnectConfig {
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

function mapSshError(error: unknown): MikroTikConnectorError {
  const source = error as { level?: string; code?: string; message?: string };
  const message = source?.message ?? "MikroTik SSH connection failed.";
  if (source?.level === "client-authentication" || /auth|authentication/i.test(message)) {
    return new MikroTikConnectorError("MIKROTIK_AUTH_FAILED", "MikroTik SSH authentication failed.", 401);
  }
  if (source?.code === "ETIMEDOUT" || /timed out|timeout/i.test(message)) {
    return new MikroTikConnectorError("MIKROTIK_SSH_HANDSHAKE_TIMEOUT", "MikroTik SSH handshake timed out.", 504);
  }
  return new MikroTikConnectorError("MIKROTIK_TCP_CONNECT_FAILED", message, 502);
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
    socket.once("timeout", () => finish(new MikroTikConnectorError("MIKROTIK_TCP_CONNECT_FAILED", `TCP connection to ${host}:${port} timed out.`, 502)));
    socket.once("error", (error) => finish(new MikroTikConnectorError("MIKROTIK_TCP_CONNECT_FAILED", error.message, 502)));
  });
}

async function withSshWithCredential<T>(device: Device, credential: MikroTikCredential, callback: (client: Client) => Promise<T>) {
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
      callback(client)
        .then((value) => finish(() => resolve(value)))
        .catch((error) => finish(() => reject(error)));
    });
    client.once("error", (error) => finish(() => reject(mapSshError(error))));
    client.once("timeout", () => finish(() => reject(new MikroTikConnectorError("MIKROTIK_SSH_HANDSHAKE_TIMEOUT", "MikroTik SSH handshake timed out.", 504))));
    client.connect(connectConfig(device, credential));
  });
}

function assertReadOnlyCommand(command: string) {
  if (!READONLY_COMMANDS.has(command) || FORBIDDEN_COMMAND_PATTERN.test(command)) {
    throw new MikroTikConnectorError("MIKROTIK_COMMAND_FAILED", "RouterOS command is not allowed by the read-only connector.", 500);
  }
}

function assertCatalogCommand(command: string, allowedCommands: Set<string>) {
  if (!allowedCommands.has(command)) {
    throw new MikroTikConnectorError("MIKROTIK_COMMAND_FAILED", "RouterOS command is not part of the approved MikroTik action plan.", 500);
  }
  if (/\/system\s+reset-configuration|\/export\s+show-sensitive|\/user\b|\/certificate\b|remove\s+all|disable\s+all/i.test(command)) {
    throw new MikroTikConnectorError("MIKROTIK_COMMAND_FAILED", "RouterOS command is blocked by MikroTik policy guard.", 500);
  }
}

function exec(client: Client, command: string, timeoutMs = env.sshCommandTimeoutMs, allowedCommands?: Set<string>): Promise<ExecResult> {
  if (allowedCommands) assertCatalogCommand(command, allowedCommands);
  else assertReadOnlyCommand(command);

  return new Promise((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }

      let stdout = "";
      let stderr = "";
      let exitCode: number | null = null;
      const timer = setTimeout(() => {
        stream.close();
        reject(new MikroTikConnectorError("MIKROTIK_COMMAND_FAILED", "MikroTik SSH command timed out.", 504));
      }, timeoutMs);

      stream.on("close", (code: number | null) => {
        clearTimeout(timer);
        exitCode = code;
        resolve({ stdout: cleanOutput(stdout), stderr: cleanOutput(stderr), exitCode });
      });
      stream.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      stream.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
    });
  });
}

function cleanOutput(value: string) {
  return value.replace(/\u001b\[[0-9;]*m/g, "").trim();
}

function quoteRouterOs(value: string | number | boolean) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function addressListCommands(parameters: Record<string, unknown>) {
  const listName = String(parameters.listName ?? "ai_blocklist");
  const address = String(parameters.address ?? parameters.srcIp ?? "");
  const timeout = typeof parameters.timeout === "string" && parameters.timeout.trim() ? parameters.timeout.trim() : undefined;
  const comment = String(parameters.comment ?? "created-by-firewall-log-analyzer");
  const timeoutPart = timeout ? ` timeout=${quoteRouterOs(timeout)}` : "";
  return {
    listName,
    address,
    timeout,
    comment,
    check: `/ip firewall address-list print terse where list=${quoteRouterOs(listName)} address=${quoteRouterOs(address)}`,
    add: `/ip firewall address-list add list=${quoteRouterOs(listName)} address=${quoteRouterOs(address)}${timeoutPart} comment=${quoteRouterOs(comment)}`,
    update: `/ip firewall address-list set [find list=${quoteRouterOs(listName)} address=${quoteRouterOs(address)}]${timeoutPart} comment=${quoteRouterOs(comment)}`
  };
}

function addressListEntryExists(result: ExecResult, address: string) {
  const combined = `${result.stdout}\n${result.stderr}`.trim();
  return result.exitCode === 0 && combined.length > 0 && combined.includes(address);
}

function duplicateAddressEntry(result: ExecResult) {
  return /already have such entry/i.test(`${result.stdout}\n${result.stderr}`);
}

function lines(value: string, limit?: number) {
  const result = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return typeof limit === "number" ? result.slice(0, limit) : result;
}

function parseKeyValueOutput(value: string) {
  const result: Record<string, string> = {};
  for (const line of lines(value)) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) result[match[1].trim()] = match[2].trim();
  }
  return result;
}

function routerosVersion(resource: Record<string, string>, packages: string[]) {
  if (resource.version) return resource.version;
  const routeros = packages.find((line) => /\brouteros\b/i.test(line));
  return routeros?.match(/\b\d+(?:\.\d+)+(?:\S*)?\b/)?.[0];
}

function discoveryFrom(results: Record<string, ExecResult>): MikroTikDiscovery {
  const identity = parseKeyValueOutput(results["/system identity print"]?.stdout ?? "");
  const resource = parseKeyValueOutput(results["/system resource print"]?.stdout ?? "");
  const packages = lines(results["/system package print"]?.stdout ?? "");
  const recentLogs = lines(results["/log print without-paging"]?.stdout ?? "").slice(0, 200);

  return {
    identity: identity.name,
    routerosVersion: routerosVersion(resource, packages),
    architecture: resource["architecture-name"],
    uptime: resource.uptime,
    cpuLoad: resource["cpu-load"],
    memoryFree: resource["free-memory"],
    interfaces: lines(results["/interface print terse"]?.stdout ?? ""),
    ipAddresses: lines(results["/ip address print terse"]?.stdout ?? ""),
    routes: lines(results["/ip route print terse"]?.stdout ?? ""),
    firewallFilterRules: lines(results["/ip firewall filter print terse"]?.stdout ?? ""),
    natRules: lines(results["/ip firewall nat print terse"]?.stdout ?? ""),
    mangleRules: lines(results["/ip firewall mangle print terse"]?.stdout ?? ""),
    addressLists: lines(results["/ip firewall address-list print terse"]?.stdout ?? ""),
    services: lines(results["/ip service print terse"]?.stdout ?? ""),
    recentLogs,
    raw: {
      resource: results["/system resource print"]?.stdout ?? "",
      package: results["/system package print"]?.stdout ?? "",
      logCount: results["/log print count-only"]?.stdout ?? ""
    }
  };
}

async function runCommands(client: Client, commands: readonly string[], warnings: DeviceConnectionTestResult["warnings"]) {
  const results: Record<string, ExecResult> = {};
  for (const command of commands) {
    try {
      const result = await exec(client, command);
      results[command] = result;
      if (result.exitCode !== 0) {
        warnings.push({
          code: "MIKROTIK_COMMAND_FAILED",
          message: `${command} failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`
        });
      }
    } catch (error) {
      const connectorError = error instanceof MikroTikConnectorError ? error : new MikroTikConnectorError("MIKROTIK_COMMAND_FAILED", error instanceof Error ? error.message : "MikroTik command failed.", 502);
      warnings.push({ code: connectorError.code, message: `${command} failed: ${connectorError.message}` });
      results[command] = { stdout: "", stderr: connectorError.message, exitCode: 1 };
    }
  }
  return results;
}

async function collectMikroTikStatus(device: Device): Promise<DeviceConnectionTestResult> {
  const stages: DeviceConnectionTestResult["stages"] = [{ name: "resolve_device", status: "ok" }];
  const warnings: DeviceConnectionTestResult["warnings"] = [];
  const base = {
    deviceId: device.id,
    vendor: "mikrotik" as const,
    host: device.host,
    port: device.managementPort,
    stages,
    warnings
  };

  let credential: MikroTikCredential;
  try {
    credential = await getCredential(device);
    stages.push({ name: "resolve_credential", status: "ok" });
  } catch (error) {
    const connectorError = error instanceof MikroTikConnectorError ? error : new MikroTikConnectorError("MIKROTIK_CREDENTIAL_MISSING", "No MikroTik SSH credential is configured for this device.");
    stages.push({ name: "resolve_credential", status: "failed", code: connectorError.code, message: connectorError.message });
    return {
      ...base,
      connected: false,
      credentialResolved: false,
      capabilities: { canConnect: false, canReadSystem: false, canReadInterfaces: false, canReadFirewall: false, canReadLogs: false, canExecuteWriteActions: true },
      errorCode: connectorError.code,
      message: connectorError.message
    };
  }

  try {
    await tcpConnect(device.host, device.managementPort);
    stages.push({ name: "tcp_connect", status: "ok" });
  } catch (error) {
    const connectorError = error instanceof MikroTikConnectorError ? error : new MikroTikConnectorError("MIKROTIK_TCP_CONNECT_FAILED", "MikroTik TCP connection failed.");
    stages.push({ name: "tcp_connect", status: "failed", code: connectorError.code, message: connectorError.message });
    return {
      ...base,
      connected: false,
      credentialResolved: true,
      credentialName: credential.name ?? credentialRef(device),
      username: credential.username,
      capabilities: { canConnect: false, canReadSystem: false, canReadInterfaces: false, canReadFirewall: false, canReadLogs: false, canExecuteWriteActions: true },
      errorCode: connectorError.code,
      message: connectorError.message
    };
  }

  return withSshWithCredential(device, credential, async (client) => {
    stages.push({ name: "ssh_handshake", status: "ok" }, { name: "ssh_auth", status: "ok" });
    const basicResults = await runCommands(client, BASIC_COMMANDS, warnings);
    const basicFailed = BASIC_COMMANDS.some((command) => basicResults[command]?.exitCode !== 0);
    if (basicFailed) {
      stages.push({ name: "basic_commands", status: "failed", code: "MIKROTIK_COMMAND_FAILED", message: "One or more required read-only RouterOS commands failed." });
      return {
        ...base,
        connected: false,
        credentialResolved: true,
        credentialName: credential.name ?? credentialRef(device),
        username: credential.username,
        capabilities: { canConnect: true, canReadSystem: false, canReadInterfaces: false, canReadFirewall: false, canReadLogs: false, canExecuteWriteActions: true },
        errorCode: "MIKROTIK_COMMAND_FAILED",
        message: "MikroTik basic read-only commands failed."
      };
    }
    stages.push({ name: "basic_commands", status: "ok" });

    const discoveryResults = await runCommands(client, READONLY_DISCOVERY_COMMANDS, warnings);
    const allResults = { ...basicResults, ...discoveryResults };
    const mikrotik = discoveryFrom(allResults);
    const canReadFirewall = ["/ip firewall filter print terse", "/ip firewall nat print terse", "/ip firewall address-list print terse"]
      .every((command) => allResults[command]?.exitCode === 0);
    const canReadLogs = allResults["/log print without-paging"]?.exitCode === 0;

    if (warnings.length > 0) {
      stages.push(
        { name: "readonly_discovery", status: "warning", code: "MIKROTIK_READONLY_DISCOVERY_PARTIAL", message: "MikroTik read-only discovery completed with warnings." },
        { name: "optional_capabilities", status: "warning" }
      );
    } else {
      stages.push({ name: "readonly_discovery", status: "ok" }, { name: "optional_capabilities", status: "ok" });
    }

    return {
      ...base,
      connected: true,
      credentialResolved: true,
      credentialName: credential.name ?? credentialRef(device),
      username: credential.username,
      mikrotik,
      capabilities: {
        canConnect: true,
        canReadSystem: true,
        canReadInterfaces: true,
        canReadFirewall,
        canReadLogs,
        canExecuteWriteActions: true
      },
      errorCode: warnings.length > 0 ? "MIKROTIK_READONLY_DISCOVERY_PARTIAL" : undefined,
      message: warnings.length > 0 ? "MikroTik SSH connection succeeded with read-only discovery warnings." : "MikroTik SSH read-only discovery succeeded."
    };
  }).catch((error) => {
    const connectorError = error instanceof MikroTikConnectorError ? error : mapSshError(error);
    if (!stages.some((stage) => stage.name === "ssh_handshake")) {
      if (connectorError.code === "MIKROTIK_AUTH_FAILED") {
        stages.push(
          { name: "ssh_handshake", status: "ok" },
          { name: "ssh_auth", status: "failed", code: connectorError.code, message: connectorError.message }
        );
      } else {
        stages.push({ name: "ssh_handshake", status: "failed", code: connectorError.code, message: connectorError.message });
      }
    }
    return {
      ...base,
      connected: false,
      credentialResolved: true,
      credentialName: credential.name ?? credentialRef(device),
      username: credential.username,
      capabilities: { canConnect: true, canReadSystem: false, canReadInterfaces: false, canReadFirewall: false, canReadLogs: false, canExecuteWriteActions: true },
      errorCode: connectorError.code,
      message: connectorError.message
    };
  });
}

function capabilitiesFromStatus(status: Record<string, unknown>): DeviceCapabilities {
  const mikrotik = asObject(status.mikrotik) as MikroTikDiscovery;
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
    canExecuteChangeSshPort: true,
    supportedActions: SUPPORTED_ACTIONS,
    identity: mikrotik.identity,
    routerosVersion: mikrotik.routerosVersion,
    architecture: mikrotik.architecture,
    uptime: mikrotik.uptime,
    cpuLoad: mikrotik.cpuLoad,
    memoryFree: mikrotik.memoryFree,
    interfaceCount: Array.isArray(mikrotik.interfaces) ? mikrotik.interfaces.length : 0,
    firewallFilterRuleCount: Array.isArray(mikrotik.firewallFilterRules) ? mikrotik.firewallFilterRules.length : 0,
    natRuleCount: Array.isArray(mikrotik.natRules) ? mikrotik.natRules.length : 0,
    addressListCount: Array.isArray(mikrotik.addressLists) ? mikrotik.addressLists.length : 0,
    serviceSummary: Array.isArray(mikrotik.services) ? mikrotik.services.slice(0, 25) : [],
    warnings,
    mikrotik
  };
}

export const mikrotikSshConnector: DeviceConnector = {
  name: "mikrotik",
  supportedActions: SUPPORTED_ACTIONS,
  supports(device) {
    return Boolean(device && device.protocol === DeviceProtocol.ssh && (
      device.type === DeviceType.mikrotik ||
      String(device.vendor ?? "").toLowerCase().includes("mikrotik") ||
      String(device.vendor ?? "").toLowerCase().includes("routeros")
    ));
  },
  testConnection(device) {
    return collectMikroTikStatus(device);
  },
  async getCapabilities(device) {
    const stored = asObject(device.capabilities);
    const status = asObject(stored.mikrotikStatus);
    if (Object.keys(status).length > 0) return capabilitiesFromStatus(status);

    return {
      canTestConnection: true,
      canCollectStatus: true,
      canReadSystem: false,
      canReadInterfaces: false,
      canReadFirewall: false,
      canReadLogs: false,
      canExecuteWriteActions: true,
      canExecuteChangeSshPort: true,
      supportedActions: SUPPORTED_ACTIONS,
      warnings: [{ code: "MIKROTIK_READONLY_DISCOVERY_PARTIAL", message: "Run Test first to populate MikroTik read-only discovery." }]
    };
  },
  collectStatus(device) {
    return collectMikroTikStatus(device);
  },
  async dryRun(actionPlan: ActionPlan, device: Device): Promise<ConnectorDryRun> {
    const policy = evaluateMikroTikExpertPolicy(actionPlan, device);
    const validation = policy.validation;
    if (!policy.valid) {
      throw new MikroTikConnectorError("CONNECTOR_ACTION_UNSUPPORTED", policy.errors.join(" "), 400);
    }
    const backupSpecs = policy.backupCommands.map((command) => ({
      template: command.startsWith("/system backup") ? "/system backup save name=<preflight>" : "/export hide-sensitive file=<preflight>",
      command,
      write: true,
      target: { backupName: policy.backupName, preflight: true }
    }));

    const sshPortChange = actionPlan.actionType === ActionType.mikrotik_change_service_port && validation.normalizedParameters.service === "ssh";
    const newPort = Number(validation.normalizedParameters.newPort ?? validation.normalizedParameters.port);
    const oldPort = Number(validation.normalizedParameters.oldPort);
    return {
      plannedCommands: [...policy.backupCommands, ...validation.commandSpecs.map((spec) => spec.command)],
      validationWarnings: [
        ...policy.warnings,
        ...(policy.requiresBackup ? [`Backup/export preflight required: ${policy.backupName}`] : []),
        ...(policy.requiresBreakGlass ? ["Break-glass confirmation is required for this critical MikroTik action."] : []),
        ...(policy.lockoutWarning ? [policy.lockoutWarning] : [])
      ],
      affectedPorts: sshPortChange
        ? [newPort, ...(Number.isInteger(oldPort) && oldPort > 0 ? [oldPort] : [])]
        : [],
      affectedServices: sshPortChange ? ["routeros-firewall", "routeros-ssh"] : ["routeros-firewall"],
      rollbackSteps: validation.commandSpecs.flatMap((spec) => spec.rollbackSteps),
      riskLevel: validation.riskLevel,
      requiresApproval: true,
      commandSpecs: [...backupSpecs, ...validation.commandSpecs.map((spec) => ({
        template: spec.template,
        command: spec.command,
        write: spec.write,
        target: spec.target
      }))],
      exactTarget: {
        ...validation.normalizedParameters,
        backupName: policy.backupName,
        requiresBackup: policy.requiresBackup,
        requiresBreakGlass: policy.requiresBreakGlass,
        lockoutSensitive: policy.lockoutSensitive
      }
    };
  },
  async execute(actionPlan: ActionPlan, device: Device, audit?: ConnectorAudit): Promise<ConnectorExecutionResult> {
    const policy = evaluateMikroTikExpertPolicy(actionPlan, device);
    const validation = policy.validation;
    if (!policy.valid) {
      throw new MikroTikConnectorError("CONNECTOR_ACTION_UNSUPPORTED", policy.errors.join(" "), 400);
    }
    const executionParameters = asObject(actionPlan.parametersJson);
    const breakGlassReady = policy.breakGlass &&
      executionParameters.deviceNameConfirmation === device.name &&
      typeof executionParameters.reason === "string" &&
      executionParameters.reason.trim().length > 0;
    if (policy.requiresBreakGlass && !breakGlassReady) {
      throw new MikroTikConnectorError("MIKROTIK_BREAK_GLASS_REQUIRED", "Critical MikroTik action requires breakGlass=true, matching deviceNameConfirmation, and a reason.", 409);
    }

    const idempotentAddressList = actionPlan.actionType === ActionType.mikrotik_block_ip_temporary;
    const updateAddressList = actionPlan.actionType === ActionType.mikrotik_update_address_list_entry;
    const addressListPlan = idempotentAddressList || updateAddressList ? addressListCommands(validation.normalizedParameters) : null;
    const allowedCommands = new Set([
      ...policy.backupCommands,
      ...validation.commandSpecs.map((spec) => spec.command),
      ...(addressListPlan ? [addressListPlan.check, addressListPlan.add, addressListPlan.update] : [])
    ]);
    const commands: ConnectorExecutionResult["commands"] = [];
    const warnings = [...validation.warnings];
    const credential = await getCredential(device);
    const sshPortChange = actionPlan.actionType === ActionType.mikrotik_change_service_port && validation.normalizedParameters.service === "ssh";

    if (sshPortChange) {
      await audit?.("ssh_port_change_execution_started", "Approved MikroTik SSH port change execution started.", {
        deviceId: device.id,
        oldPort: validation.normalizedParameters.oldPort ?? null,
        newPort: validation.normalizedParameters.newPort,
        trustedSource: validation.normalizedParameters.trustedSource,
        approvalStatus: "approved",
        rollbackPreview: validation.rollbackJson
      });
    }

    await audit?.("policy_guard_passed", "MikroTik catalog validation passed.", {
      actionType: actionPlan.actionType,
      target: validation.normalizedParameters,
      commandCount: validation.commandSpecs.length
    });

    return withSshWithCredential(device, credential, async (client) => {
      await audit?.("connection_attempt", "MikroTik SSH execution connection is ready.", {
        host: device.host,
        port: device.managementPort,
        actionType: actionPlan.actionType
      });

      for (const backupCommand of policy.backupCommands) {
        const result = await exec(client, backupCommand, env.sshCommandTimeoutMs, allowedCommands);
        commands.push({
          template: backupCommand.startsWith("/system backup") ? "/system backup save name=<preflight>" : "/export hide-sensitive file=<preflight>",
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        });
        await audit?.("backup_export_created", "MikroTik preflight backup/export command executed.", {
          backupName: policy.backupName,
          template: backupCommand.startsWith("/system backup") ? "/system backup save" : "/export hide-sensitive",
          exitCode: result.exitCode,
          stdout: result.stdout.slice(0, 2000),
          stderr: result.stderr.slice(0, 2000)
        });
        if (result.exitCode !== 0) {
          throw new MikroTikConnectorError("MIKROTIK_COMMAND_FAILED", result.stderr || "MikroTik backup/export preflight failed.", 502);
        }
      }

      if (addressListPlan && idempotentAddressList) {
        const checkResult = await exec(client, addressListPlan.check, env.sshCommandTimeoutMs, allowedCommands);
        commands.push({
          template: "check exact address-list entry by list/address",
          stdout: checkResult.stdout,
          stderr: checkResult.stderr,
          exitCode: checkResult.exitCode
        });
        await audit?.("command_executed", "MikroTik address-list existence check executed.", {
          template: "check exact address-list entry by list/address",
          command: addressListPlan.check,
          target: { listName: addressListPlan.listName, address: addressListPlan.address },
          exitCode: checkResult.exitCode,
          stdout: checkResult.stdout.slice(0, 2000),
          stderr: checkResult.stderr.slice(0, 2000)
        });

        const exists = addressListEntryExists(checkResult, addressListPlan.address);
        const writeCommand = exists ? addressListPlan.update : addressListPlan.add;
        const writeTemplate = exists
          ? "existing entry found: update timeout/comment"
          : "missing entry: add address-list entry";
        let writeResult = await exec(client, writeCommand, env.sshCommandTimeoutMs, allowedCommands);
        let recoveredDuplicate = false;
        if (!exists && writeResult.exitCode !== 0 && duplicateAddressEntry(writeResult)) {
          recoveredDuplicate = true;
          commands.push({
            template: "add address-list entry returned duplicate; recovering with update",
            stdout: writeResult.stdout,
            stderr: writeResult.stderr,
            exitCode: writeResult.exitCode
          });
          await audit?.("address_list_duplicate_recovered", "Existing entry found during add; updating timeout/comment instead.", {
            target: { listName: addressListPlan.listName, address: addressListPlan.address },
            stdout: writeResult.stdout.slice(0, 2000),
            stderr: writeResult.stderr.slice(0, 2000)
          });
          writeResult = await exec(client, addressListPlan.update, env.sshCommandTimeoutMs, allowedCommands);
        }
        commands.push({
          template: recoveredDuplicate ? "existing entry found: timeout/comment updated after duplicate add" : writeTemplate,
          stdout: writeResult.stdout,
          stderr: writeResult.stderr,
          exitCode: writeResult.exitCode
        });
        await audit?.("command_executed", recoveredDuplicate || exists ? "MikroTik address-list entry updated." : "MikroTik address-list entry added.", {
          template: recoveredDuplicate || exists ? "address-list set existing entry" : "address-list add missing entry",
          command: recoveredDuplicate || exists ? addressListPlan.update : addressListPlan.add,
          target: { listName: addressListPlan.listName, address: addressListPlan.address, timeout: addressListPlan.timeout, comment: addressListPlan.comment },
          exitCode: writeResult.exitCode,
          stdout: writeResult.stdout.slice(0, 2000),
          stderr: writeResult.stderr.slice(0, 2000),
          note: recoveredDuplicate || exists ? "Existing entry found; timeout/comment updated." : undefined
        });
        if (writeResult.exitCode !== 0) {
          throw new MikroTikConnectorError("MIKROTIK_COMMAND_FAILED", writeResult.stderr || writeResult.stdout || "RouterOS address-list upsert failed.", 502);
        }
        await audit?.("rollback_available", "Rollback metadata is available for this MikroTik action.", validation.rollbackJson);
        return {
          executed: true,
          actionType: actionPlan.actionType,
          deviceId: device.id,
          commands,
          warnings: [
            ...warnings,
            recoveredDuplicate || exists ? "Existing entry found; timeout/comment updated." : "Address-list entry added."
          ],
          rollbackJson: validation.rollbackJson
        };
      }

      if (addressListPlan && updateAddressList) {
        const result = await exec(client, addressListPlan.update, env.sshCommandTimeoutMs, allowedCommands);
        commands.push({
          template: "/ip firewall address-list set [find list=<listName> address=<address>] timeout=<timeout> comment=<comment>",
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        });
        await audit?.("command_executed", "MikroTik address-list entry update executed.", {
          template: "address-list set existing entry",
          command: addressListPlan.update,
          target: { listName: addressListPlan.listName, address: addressListPlan.address, timeout: addressListPlan.timeout, comment: addressListPlan.comment },
          exitCode: result.exitCode,
          stdout: result.stdout.slice(0, 2000),
          stderr: result.stderr.slice(0, 2000)
        });
        if (result.exitCode !== 0) {
          throw new MikroTikConnectorError("MIKROTIK_COMMAND_FAILED", result.stderr || result.stdout || "RouterOS address-list update failed.", 502);
        }
        await audit?.("rollback_available", "Rollback metadata is available for this MikroTik action.", validation.rollbackJson);
        return {
          executed: true,
          actionType: actionPlan.actionType,
          deviceId: device.id,
          commands,
          warnings,
          rollbackJson: validation.rollbackJson
        };
      }

      for (const spec of validation.commandSpecs) {
        const result = await exec(client, spec.command, env.sshCommandTimeoutMs, allowedCommands);
        commands.push({
          template: spec.template,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        });
        await audit?.("command_executed", `MikroTik template executed: ${spec.template}`, {
          template: spec.template,
          write: spec.write,
          target: spec.target,
          exitCode: result.exitCode,
          stdout: result.stdout.slice(0, 2000),
          stderr: result.stderr.slice(0, 2000)
        });

        if (result.exitCode !== 0) {
          throw new MikroTikConnectorError("MIKROTIK_COMMAND_FAILED", result.stderr || result.stdout || `RouterOS command failed: ${spec.template}`, 502);
        }
      }

      await audit?.("rollback_available", "Rollback metadata is available for this MikroTik action.", validation.rollbackJson);

      if (sshPortChange) {
        await audit?.("ssh_port_change_execution_succeeded", "MikroTik SSH port change command sequence completed.", {
          deviceId: device.id,
          oldPort: validation.normalizedParameters.oldPort ?? null,
          newPort: validation.normalizedParameters.newPort,
          trustedSource: validation.normalizedParameters.trustedSource,
          approvalStatus: "approved",
          executionResult: "succeeded",
          rollbackPreview: validation.rollbackJson
        });
      }

      return {
        executed: true,
        actionType: actionPlan.actionType,
        deviceId: device.id,
        commands,
        warnings,
        rollbackJson: validation.rollbackJson
      };
    });
  },
  async rollback(): Promise<ConnectorExecutionResult> {
    throw new MikroTikConnectorError("CONNECTOR_ACTION_UNSUPPORTED", "MikroTik rollback is not available because write actions are disabled.");
  }
};
