import fs from "node:fs";
import net from "node:net";
import { Client, type ConnectConfig } from "ssh2";
import { ActionType, DeviceProtocol, DeviceType, type ActionPlan, type Device } from "@prisma/client";
import type {
  ConnectorAudit,
  ConnectorDryRun,
  ConnectorExecutionResult,
  DeviceCapabilities,
  DeviceConnectionTestResult,
  DeviceConnector
} from "./types.js";

type SshCredential = {
  username: string;
  password?: string;
  privateKey?: string;
  privateKeyPath?: string;
  passphrase?: string;
  sudo?: boolean;
};

type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export class ConnectorError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const SUPPORTED_ACTIONS: ActionType[] = [
  ActionType.open_port,
  ActionType.close_port,
  ActionType.block_source_ip_temporary,
  ActionType.unblock_source_ip
];

const DANGEROUS_CLOSE_PORTS = new Set([22, 22022, 80, 443, 4000, 4050, 50, 5173]);

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function portParam(value: unknown) {
  const port = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConnectorError("INVALID_PORT", "Port must be an integer between 1 and 65535.");
  }
  return port;
}

function protocolParam(value: unknown) {
  const protocol = String(value ?? "tcp").toLowerCase();
  if (protocol !== "tcp" && protocol !== "udp") {
    throw new ConnectorError("INVALID_PROTOCOL", "Protocol must be tcp or udp.");
  }
  return protocol;
}

function ipParam(value: unknown) {
  const ip = text(value);
  if (!ip || net.isIP(ip) === 0) {
    throw new ConnectorError("INVALID_IP", "A valid source IP address is required.");
  }
  return ip;
}

function isPrivateOrLocalIp(ip: string) {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  }

  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  const [a, b] = parts;
  return a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254);
}

function parseCredentialsJson() {
  const raw = process.env.SSH_CREDENTIALS_JSON;
  if (!raw) return {};
  const normalized = raw.replace(/[“”]/g, "\"").replace(/[‘’]/g, "'");
  try {
    return JSON.parse(normalized) as Record<string, SshCredential>;
  } catch {
    throw new ConnectorError("SSH_CREDENTIALS_INVALID", "SSH_CREDENTIALS_JSON is not valid JSON.", 500);
  }
}

function credentialRef(device: Device) {
  const ref = "credentialRef" in device ? device.credentialRef : undefined;
  return typeof ref === "string" && ref.trim() ? ref.trim() : undefined;
}

function getCredential(device: Device) {
  const ref = credentialRef(device);
  if (!ref) throw new ConnectorError("SSH_CREDENTIAL_MISSING", "Device credentialRef is required for SSH.", 400);
  const credential = parseCredentialsJson()[ref];
  if (!credential?.username) {
    throw new ConnectorError("SSH_CREDENTIAL_MISSING", `No SSH credential configured for credentialRef ${ref}.`, 400);
  }
  return credential;
}

function connectConfig(device: Device, credential: SshCredential): ConnectConfig {
  const config: ConnectConfig = {
    host: device.host,
    port: device.managementPort,
    username: credential.username,
    readyTimeout: 8000
  };

  if (credential.password) config.password = credential.password;
  if (credential.privateKey) config.privateKey = credential.privateKey;
  if (credential.privateKeyPath) config.privateKey = fs.readFileSync(credential.privateKeyPath, "utf8");
  if (credential.passphrase) config.passphrase = credential.passphrase;
  return config;
}

function mapSshError(error: unknown): ConnectorError {
  const source = error as { level?: string; code?: string; message?: string };
  const message = source?.message ?? "SSH connection failed.";
  if (source?.level === "client-authentication" || /auth|authentication/i.test(message)) {
    return new ConnectorError("SSH_AUTH_FAILED", "SSH authentication failed.", 401);
  }
  return new ConnectorError("SSH_CONNECTION_FAILED", message, 502);
}

async function withSsh<T>(device: Device, callback: (client: Client, credential: SshCredential) => Promise<T>) {
  const credential = getCredential(device);
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
      callback(client, credential)
        .then((value) => finish(() => resolve(value)))
        .catch((error) => finish(() => reject(error)));
    });
    client.once("error", (error) => finish(() => reject(mapSshError(error))));
    client.once("timeout", () => finish(() => reject(new ConnectorError("SSH_CONNECTION_FAILED", "SSH connection timed out.", 502))));
    client.connect(connectConfig(device, credential));
  });
}

function exec(client: Client, command: string, timeoutMs = 12000): Promise<ExecResult> {
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
        reject(new ConnectorError("SSH_COMMAND_TIMEOUT", "SSH command timed out.", 504));
      }, timeoutMs);

      stream.on("close", (code: number | null) => {
        clearTimeout(timer);
        exitCode = code;
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode });
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

function sudoPrefix(credential: SshCredential) {
  return credential.username === "root" ? "" : "sudo -n ";
}

async function execChecked(client: Client, command: string) {
  const result = await exec(client, command);
  if (result.exitCode !== 0) {
    throw new ConnectorError("SSH_COMMAND_FAILED", result.stderr || `Command failed: ${command}`, 502);
  }
  return result;
}

function parseCurrentSshPort(value: string) {
  const match = value.match(/\bPort\s+(\d{1,5})\b/);
  if (!match) return 22;
  const port = Number.parseInt(match[1], 10);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 22;
}

function commandLabel(command: string) {
  return command.replace(/firewall-log-analyzer action [a-z0-9]+/gi, "firewall-log-analyzer action <actionPlanId>");
}

async function collectLinuxStatus(device: Device): Promise<DeviceConnectionTestResult> {
  const warnings: string[] = [];

  return withSsh(device, async (client, credential) => {
    const sudo = sudoPrefix(credential);
    const [whoami, hostname, os, id, ufwPath, ufwStatus, ports, sshStatus, sshdPort] = await Promise.all([
      exec(client, "whoami"),
      exec(client, "hostname"),
      exec(client, "uname -a"),
      exec(client, "id"),
      exec(client, "command -v ufw"),
      exec(client, `${sudo}ufw status verbose`),
      exec(client, "ss -lntup"),
      exec(client, "systemctl is-active ssh || systemctl is-active sshd"),
      exec(client, "grep -E '^[[:space:]]*Port[[:space:]]+[0-9]+' /etc/ssh/sshd_config | tail -n 1")
    ]);

    if (ufwStatus.exitCode !== 0) warnings.push("UFW status command failed or requires passwordless sudo.");
    if (ports.exitCode !== 0) warnings.push("Listening port collection failed.");
    if (sshStatus.exitCode !== 0) warnings.push("SSH service status check failed.");

    return {
      connected: true,
      username: whoami.stdout || credential.username,
      hostname: hostname.stdout,
      os: os.stdout,
      ufwAvailable: ufwPath.exitCode === 0 && Boolean(ufwPath.stdout),
      ufwStatus: ufwStatus.stdout || ufwStatus.stderr,
      listeningPorts: ports.stdout || ports.stderr,
      sshServiceStatus: sshStatus.stdout || sshStatus.stderr,
      currentSshPort: parseCurrentSshPort(sshdPort.stdout),
      warnings
    };
  });
}

function dryRunFor(plan: ActionPlan, device: Device): ConnectorDryRun {
  const parameters = asObject(plan.parametersJson);
  const protocol = protocolParam(parameters.protocol);
  const affectedPorts: number[] = [];
  const affectedServices: string[] = ["ufw"];
  const validationWarnings: string[] = [];
  let plannedCommands: string[] = [];
  let rollbackSteps: string[] = [];

  if (plan.actionType === ActionType.open_port) {
    const port = portParam(parameters.port);
    affectedPorts.push(port);
    plannedCommands = [`sudo -n ufw allow ${port}/${protocol} comment 'firewall-log-analyzer action ${plan.id}'`, "sudo -n ufw status numbered"];
    rollbackSteps = [`sudo -n ufw delete allow ${port}/${protocol}`];
  } else if (plan.actionType === ActionType.close_port) {
    const port = portParam(parameters.port);
    affectedPorts.push(port);
    if (DANGEROUS_CLOSE_PORTS.has(port)) {
      throw new ConnectorError("CONNECTOR_ACTION_UNSUPPORTED", `Closing protected port ${port} is blocked by Linux connector policy.`);
    }
    plannedCommands = [`sudo -n ufw delete allow ${port}/${protocol}`, "sudo -n ufw status numbered"];
    rollbackSteps = [`sudo -n ufw allow ${port}/${protocol}`];
  } else if (plan.actionType === ActionType.block_source_ip_temporary) {
    const srcIp = ipParam(parameters.srcIp);
    const durationMinutes = Number(parameters.durationMinutes ?? 30);
    if (isPrivateOrLocalIp(srcIp)) {
      throw new ConnectorError("CONNECTOR_ACTION_UNSUPPORTED", "Blocking private, local, or management IPs is blocked by Linux connector policy.");
    }
    plannedCommands = [`sudo -n ufw deny from ${srcIp} comment 'firewall-log-analyzer action ${plan.id}'`, "sudo -n ufw status numbered"];
    rollbackSteps = [`sudo -n ufw delete deny from ${srcIp}`];
    validationWarnings.push(`MANUAL_ROLLBACK_REQUIRED: automatic unblock is not scheduled; durationMinutes=${durationMinutes} is stored for rollback.`);
  } else if (plan.actionType === ActionType.unblock_source_ip) {
    const srcIp = ipParam(parameters.srcIp);
    plannedCommands = [`sudo -n ufw status numbered`, `sudo -n ufw delete <matching deny rule number for ${srcIp}>`];
    rollbackSteps = [`sudo -n ufw deny from ${srcIp}`];
    validationWarnings.push("Exact deny rule number will be discovered at execution time. No guessed deletion is allowed.");
  } else if (plan.actionType === ActionType.change_ssh_port) {
    throw new ConnectorError("CONNECTOR_ACTION_UNSUPPORTED", "Changing SSH port is dry-run only and cannot be executed by this MVP connector.");
  } else {
    throw new ConnectorError("CONNECTOR_ACTION_UNSUPPORTED", `${plan.actionType} is not supported by the Linux SSH connector.`);
  }

  return {
    plannedCommands,
    validationWarnings,
    affectedPorts,
    affectedServices,
    rollbackSteps,
    riskLevel: plan.riskLevel,
    requiresApproval: true
  };
}

async function currentSshPort(client: Client) {
  const result = await exec(client, "grep -E '^[[:space:]]*Port[[:space:]]+[0-9]+' /etc/ssh/sshd_config | tail -n 1");
  return parseCurrentSshPort(result.stdout);
}

async function runAction(plan: ActionPlan, device: Device, audit?: ConnectorAudit): Promise<ConnectorExecutionResult> {
  if (!SUPPORTED_ACTIONS.includes(plan.actionType)) {
    throw new ConnectorError("CONNECTOR_ACTION_UNSUPPORTED", `${plan.actionType} is not executable by the Linux SSH connector.`);
  }

  const parameters = asObject(plan.parametersJson);
  const protocol = protocolParam(parameters.protocol);
  const commands: ConnectorExecutionResult["commands"] = [];
  const warnings: string[] = [];
  const rollbackJson: Record<string, unknown> = {};

  await audit?.("preflight_check", "Linux SSH connector preflight started.", {
    actionType: plan.actionType,
    deviceId: device.id
  });

  return withSsh(device, async (client, credential) => {
    const sudo = sudoPrefix(credential);
    const pushCommand = async (template: string, command: string) => {
      await audit?.("command_planned", `Command template planned: ${template}`, { template });
      const result = await execChecked(client, command);
      commands.push({ template, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode });
      await audit?.("command_executed", `Command template executed: ${template}`, {
        template,
        exitCode: result.exitCode,
        stdout: result.stdout.slice(0, 2000),
        stderr: result.stderr.slice(0, 2000)
      });
      return result;
    };

    if (plan.actionType === ActionType.open_port) {
      const port = portParam(parameters.port);
      const template = `ufw allow ${port}/${protocol}`;
      await pushCommand(template, `${sudo}ufw allow ${port}/${protocol} comment 'firewall-log-analyzer action ${plan.id}'`);
      await pushCommand("ufw status numbered", `${sudo}ufw status numbered`);
      rollbackJson.steps = [`${sudo}ufw delete allow ${port}/${protocol}`];
    } else if (plan.actionType === ActionType.close_port) {
      const port = portParam(parameters.port);
      if (DANGEROUS_CLOSE_PORTS.has(port)) {
        throw new ConnectorError("CONNECTOR_ACTION_UNSUPPORTED", `Closing protected port ${port} is blocked by Linux connector policy.`);
      }
      const sshPort = await currentSshPort(client);
      if (port === sshPort) {
        throw new ConnectorError("CONNECTOR_ACTION_UNSUPPORTED", `Closing current SSH port ${port} is blocked.`);
      }
      await pushCommand(`ufw delete allow ${port}/${protocol}`, `${sudo}ufw delete allow ${port}/${protocol}`);
      if (parameters.deny === true) {
        await pushCommand(`ufw deny ${port}/${protocol}`, `${sudo}ufw deny ${port}/${protocol} comment 'firewall-log-analyzer action ${plan.id}'`);
      }
      await pushCommand("ufw status numbered", `${sudo}ufw status numbered`);
      rollbackJson.steps = [`${sudo}ufw allow ${port}/${protocol}`];
    } else if (plan.actionType === ActionType.block_source_ip_temporary) {
      const srcIp = ipParam(parameters.srcIp);
      const durationMinutes = Number(parameters.durationMinutes ?? 30);
      if (isPrivateOrLocalIp(srcIp)) {
        throw new ConnectorError("CONNECTOR_ACTION_UNSUPPORTED", "Blocking private, local, or management IPs is blocked by Linux connector policy.");
      }
      await pushCommand(`ufw deny from ${srcIp}`, `${sudo}ufw deny from ${srcIp} comment 'firewall-log-analyzer action ${plan.id}'`);
      await pushCommand("ufw status numbered", `${sudo}ufw status numbered`);
      warnings.push("MANUAL_ROLLBACK_REQUIRED");
      rollbackJson.steps = [`${sudo}ufw delete deny from ${srcIp}`];
      rollbackJson.durationMinutes = durationMinutes;
    } else if (plan.actionType === ActionType.unblock_source_ip) {
      const srcIp = ipParam(parameters.srcIp);
      const status = await pushCommand("ufw status numbered", `${sudo}ufw status numbered`);
      const matchingRules = status.stdout
        .split("\n")
        .filter((line) => line.includes(srcIp) && /\bDENY\b/i.test(line))
        .map((line) => line.match(/^\[\s*(\d+)\]/)?.[1])
        .filter(Boolean);
      if (matchingRules.length !== 1) {
        warnings.push("NEEDS_MANUAL_ROLLBACK");
        rollbackJson.matchingRuleNumbers = matchingRules;
        return {
          executed: false,
          actionType: plan.actionType,
          deviceId: device.id,
          commands,
          warnings,
          rollbackJson
        };
      }
      await pushCommand(`ufw delete rule ${matchingRules[0]}`, `${sudo}ufw --force delete ${matchingRules[0]}`);
      await pushCommand("ufw status numbered", `${sudo}ufw status numbered`);
      rollbackJson.steps = [`${sudo}ufw deny from ${srcIp}`];
    }

    await audit?.("rollback_available", "Rollback metadata is available for this connector result.", rollbackJson);

    return {
      executed: true,
      actionType: plan.actionType,
      deviceId: device.id,
      commands: commands.map((command) => ({ ...command, template: commandLabel(command.template) })),
      warnings,
      rollbackJson
    };
  });
}

export const linuxSshConnector: DeviceConnector = {
  name: "linux_edge",
  supportedActions: SUPPORTED_ACTIONS,
  supports(device) {
    return Boolean(device && device.protocol === DeviceProtocol.ssh && (
      device.type === DeviceType.linux_edge ||
      String(device.vendor ?? "").toLowerCase().includes("ubuntu") ||
      String(device.vendor ?? "").toLowerCase().includes("linux")
    ));
  },
  async testConnection(device) {
    try {
      return await collectLinuxStatus(device);
    } catch (error) {
      const connectorError = error instanceof ConnectorError ? error : mapSshError(error);
      return {
        connected: false,
        warnings: [],
        errorCode: connectorError.code,
        message: connectorError.message
      };
    }
  },
  async getCapabilities() {
    return {
      canTestConnection: true,
      canCollectStatus: true,
      canUseUfw: true,
      canOpenPort: true,
      canClosePort: true,
      canBlockSourceIp: true,
      canUnblockSourceIp: true,
      canChangeSshPortDryRunOnly: true,
      canExecuteChangeSshPort: false,
      supportedActions: SUPPORTED_ACTIONS
    } satisfies DeviceCapabilities;
  },
  collectStatus(device) {
    return collectLinuxStatus(device);
  },
  async dryRun(actionPlan, device) {
    return dryRunFor(actionPlan, device);
  },
  execute(actionPlan, device, audit) {
    return runAction(actionPlan, device, audit);
  },
  async rollback() {
    throw new ConnectorError("CONNECTOR_ACTION_UNSUPPORTED", "Automatic rollback execution is not implemented for this MVP.");
  }
};
