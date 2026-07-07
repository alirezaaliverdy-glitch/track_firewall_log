import fs from "node:fs";
import net from "node:net";
import { Client, type ConnectConfig } from "ssh2";
import { ActionType, DeviceProtocol, DeviceType, type ActionPlan, type Device } from "@prisma/client";
import { env } from "../config/env.js";
import { resolveCredentialById, resolveCredentialByName } from "../services/credential.service.js";
import type {
  ConnectorAudit,
  ConnectorDryRun,
  ConnectorExecutionResult,
  DeviceCapabilities,
  DeviceConnectionTestResult,
  DeviceConnector
} from "./types.js";

type SshCredential = {
  name?: string;
  username: string;
  password?: string;
  privateKey?: string;
  privateKeyPath?: string;
  passphrase?: string;
  sudo?: boolean;
  port?: number;
};

type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export type LinuxTelemetryCommandId = keyof typeof LINUX_TELEMETRY_COMMANDS;

export const LINUX_TELEMETRY_COMMANDS = Object.freeze({
  identity: { command: "hostname; hostnamectl 2>/dev/null; uname -a; uptime; timedatectl 2>/dev/null", privileged: false },
  network: { command: "ip addr; ip route; (ss -tulpen 2>/dev/null || ss -tunap 2>/dev/null)", privileged: false },
  sshConfig: { command: "sshd -T 2>/dev/null", privileged: true },
  sshLogs: { command: "journalctl -u ssh -u sshd -n 300 --no-pager 2>/dev/null || tail -n 300 /var/log/auth.log 2>/dev/null || tail -n 300 /var/log/secure 2>/dev/null", privileged: true },
  users: { command: "getent passwd; getent group sudo; getent group wheel; last -n 50 2>/dev/null", privileged: false },
  failedLogins: { command: "lastb -n 50 2>/dev/null", privileged: true },
  firewall: { command: "ufw status verbose 2>/dev/null; iptables -S 2>/dev/null; nft list ruleset 2>/dev/null; firewall-cmd --state 2>/dev/null; firewall-cmd --list-all 2>/dev/null", privileged: true },
  securityTools: { command: "fail2ban-client status 2>/dev/null; for s in fail2ban auditd ssh sshd ufw firewalld; do printf '%s=' \"$s\"; systemctl is-active \"$s\" 2>/dev/null || true; done; command -v unattended-upgrade 2>/dev/null", privileged: true },
  containers: { command: "docker ps --format '{{json .}}' 2>/dev/null || docker ps 2>/dev/null; docker network ls 2>/dev/null; docker compose ls 2>/dev/null", privileged: false },
  web: { command: "systemctl is-active nginx apache2 httpd 2>/dev/null; find /etc/nginx/sites-enabled /etc/apache2/sites-enabled -maxdepth 1 -type l -printf '%f\\n' 2>/dev/null", privileged: false },
  warnings: { command: "journalctl -p warning..alert -n 300 --no-pager 2>/dev/null; dmesg --level=err,warn 2>/dev/null", privileged: true }
} as const);

export const LINUX_STREAM_COMMANDS = Object.freeze({
  auth: "journalctl -f -n 0 -u ssh -u sshd -o short-iso --since now --no-pager 2>/dev/null || tail -n 0 -F /var/log/auth.log /var/log/secure 2>/dev/null",
  system: "journalctl -f -n 0 -o short-iso --since now --no-pager 2>/dev/null || tail -n 0 -F /var/log/syslog /var/log/messages 2>/dev/null",
  kernel: "journalctl -f -n 0 -k -o short-iso --since now --no-pager 2>/dev/null",
  firewall: "tail -n 0 -F /var/log/ufw.log 2>/dev/null || journalctl -f -n 0 -k -o short-iso --since now --no-pager 2>/dev/null",
  nginx: "tail -n 0 -F /var/log/nginx/access.log /var/log/nginx/error.log 2>/dev/null",
  docker: "journalctl -f -n 0 -u docker -o short-iso --since now --no-pager 2>/dev/null"
} as const);

export type LinuxStreamSource = keyof typeof LINUX_STREAM_COMMANDS;

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
  ActionType.linux_open_port,
  ActionType.close_port,
  ActionType.linux_block_ip,
  ActionType.block_source_ip_temporary,
  ActionType.unblock_source_ip,
  ActionType.linux_check_service_status,
  ActionType.linux_check_ssh_status,
  ActionType.linux_check_failed_logins,
  ActionType.linux_check_sudo_users,
  ActionType.linux_check_fail2ban_status,
  ActionType.linux_remove_user_from_sudo,
  ActionType.linux_add_user_to_sudo,
  ActionType.linux_check_user_groups,
  ActionType.linux_lock_user,
  ActionType.linux_unlock_user,
  ActionType.linux_read_hostname,
  ActionType.linux_read_interfaces,
  ActionType.linux_read_routes,
  ActionType.linux_list_open_ports,
  ActionType.linux_read_listening_ports,
  ActionType.linux_check_firewall_status,
  ActionType.linux_read_firewall_status,
  ActionType.linux_read_auth_logs,
  ActionType.linux_read_users,
  ActionType.linux_read_docker,
  ActionType.linux_read_nginx,
  "linux_list_running_services" as ActionType,
  "linux_list_failed_services" as ActionType,
  "linux_check_important_services" as ActionType
  ,ActionType.linux_daily_check
];

const LINUX_READ_ACTIONS = new Set<ActionType>([
  ActionType.linux_check_ssh_status, ActionType.linux_check_failed_logins,
  ActionType.linux_check_sudo_users, ActionType.linux_check_fail2ban_status,
  ActionType.linux_read_hostname, ActionType.linux_read_interfaces, ActionType.linux_read_routes,
  ActionType.linux_list_open_ports, ActionType.linux_read_listening_ports, ActionType.linux_check_firewall_status, ActionType.linux_read_firewall_status, ActionType.linux_read_auth_logs,
  ActionType.linux_read_users, ActionType.linux_read_docker, ActionType.linux_read_nginx,
  "linux_list_running_services" as ActionType, "linux_list_failed_services" as ActionType, "linux_check_important_services" as ActionType
]);

function linuxReadCommand(actionType: ActionType, sudo = "") {
  const commands: Partial<Record<ActionType, { template: string; command: string }>> = {
    [ActionType.linux_check_ssh_status]: { template: "SSH service status", command: "systemctl is-active ssh || systemctl is-active sshd || service ssh status || service sshd status" },
    [ActionType.linux_check_failed_logins]: { template: "failed SSH logins in last 24 hours", command: `${sudo}journalctl -u ssh -u sshd --since '24 hours ago' --no-pager 2>/dev/null || ${sudo}tail -n 300 /var/log/auth.log 2>/dev/null || ${sudo}tail -n 300 /var/log/secure 2>/dev/null` },
    [ActionType.linux_check_sudo_users]: { template: "sudo, wheel, and UID 0 users", command: "getent group sudo; getent group wheel; awk -F: '$3==0 {print $1}' /etc/passwd" },
    [ActionType.linux_check_fail2ban_status]: { template: "fail2ban service status", command: `systemctl is-active fail2ban; command -v fail2ban-client >/dev/null 2>&1 && ${sudo}fail2ban-client status || true` },
    [ActionType.linux_read_hostname]: { template: "hostname", command: "hostname" },
    [ActionType.linux_read_interfaces]: { template: "ip -brief address", command: "ip -brief address" },
    [ActionType.linux_read_routes]: { template: "ip route show", command: "ip route show" },
    [ActionType.linux_list_open_ports]: { template: "ss/netstat listening ports", command: "ss -lntup || netstat -lntup" },
    [ActionType.linux_read_listening_ports]: { template: "ss/netstat listening ports", command: "ss -lntup || netstat -lntup" },
    [ActionType.linux_check_firewall_status]: { template: "firewall status", command: `${sudo}ufw status verbose || ${sudo}nft list ruleset || ${sudo}iptables -S` },
    [ActionType.linux_read_firewall_status]: { template: "firewall status", command: `${sudo}ufw status verbose || ${sudo}nft list ruleset || ${sudo}iptables -S` },
    [ActionType.linux_read_auth_logs]: { template: "journalctl SSH authentication events", command: `${sudo}journalctl -u ssh -u sshd --since '24 hours ago' --no-pager -n 200` },
    [ActionType.linux_read_users]: { template: "getent passwd", command: "getent passwd" },
    [ActionType.linux_read_docker]: { template: "docker ps", command: "docker ps --no-trunc" },
    [ActionType.linux_read_nginx]: { template: "nginx -t", command: `${sudo}nginx -t` },
    ["linux_list_running_services" as ActionType]: { template: "running services", command: "systemctl list-units --type=service --state=running --no-pager --plain" },
    ["linux_list_failed_services" as ActionType]: { template: "failed services", command: "systemctl --failed --type=service --no-pager --plain" },
    ["linux_check_important_services" as ActionType]: { template: "important services", command: "for s in ssh sshd nginx apache2 httpd docker fail2ban postgresql mysql mariadb redis; do if systemctl list-unit-files --type=service 2>/dev/null | grep -q \"^${s}\\.service\"; then printf '=== %s ===\\n' \"$s\"; systemctl is-active \"$s\" 2>/dev/null || true; systemctl status \"$s\" --no-pager --lines=5 2>/dev/null || true; fi; done" }
  };
  return commands[actionType];
}

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

function serviceParam(value: unknown) {
  const service = text(value) ?? "nginx";
  if (!/^[a-zA-Z0-9_.@-]+$/.test(service)) {
    throw new ConnectorError("INVALID_SERVICE", "Service name must contain only letters, numbers, dot, underscore, dash, or @.");
  }
  return service;
}

function usernameParam(value: unknown) {
  const username = text(value);
  if (!username || !/^[a-z_][a-z0-9_.-]{0,31}$/i.test(username)) throw new ConnectorError("INVALID_USERNAME", "A valid Linux username is required.");
  return username;
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
    const parsed = JSON.parse(normalized) as Record<string, SshCredential>;
    return Object.fromEntries(Object.entries(parsed).map(([name, credential]) => [name, { ...credential, name }]));
  } catch {
    throw new ConnectorError("SSH_CREDENTIALS_INVALID", "SSH_CREDENTIALS_JSON is not valid JSON.", 500);
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

async function getCredential(device: Device) {
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

  throw new ConnectorError("SSH_CREDENTIAL_MISSING", "No SSH credential is configured for this device.", 400);
}

function validPort(value: unknown) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : undefined;
}

export function isLinuxSshCapable(device: Pick<Device, "type" | "vendor" | "protocol" | "capabilities"> | null | undefined) {
  if (!device) return false;
  const vendor = String(device.vendor ?? "").trim().toLowerCase();
  const type = String(device.type ?? "").trim().toLowerCase();
  const capabilities = device.capabilities && typeof device.capabilities === "object" ? JSON.stringify(device.capabilities).toLowerCase() : "";
  const linux = type === "linux_edge" || type === "linux" || vendor === "linux" || vendor.includes("ubuntu") || vendor.includes("linux") || capabilities.includes("linux");
  const ssh = String(device.protocol ?? "").toLowerCase() === "ssh" || capabilities.includes("ssh");
  return linux && ssh;
}

export function resolveLinuxConnectionPort(device: Device | (Partial<Device> & Record<string, unknown>), credential?: SshCredential) {
  const source = device as Record<string, unknown>;
  const capabilities = source.capabilities && typeof source.capabilities === "object" ? source.capabilities as Record<string, unknown> : {};
  const connection = capabilities.connection && typeof capabilities.connection === "object" ? capabilities.connection as Record<string, unknown> : {};
  return validPort(source.managementPort) ?? validPort(source.port) ?? validPort(credential?.port) ?? validPort(connection.port) ?? 22;
}

function connectConfig(device: Device, credential: SshCredential): ConnectConfig {
  const config: ConnectConfig = {
    host: device.host,
    port: resolveLinuxConnectionPort(device, credential),
    username: credential.username,
    readyTimeout: env.sshHandshakeTimeoutMs
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
  if (source?.code === "ETIMEDOUT" || /timed out|timeout/i.test(message)) {
    return new ConnectorError("SSH_HANDSHAKE_TIMEOUT", "SSH handshake timed out.", 504);
  }
  return new ConnectorError("SSH_TCP_CONNECT_FAILED", message, 502);
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
    socket.once("timeout", () => finish(new ConnectorError("SSH_TCP_CONNECT_FAILED", `TCP connection to ${host}:${port} timed out.`, 502)));
    socket.once("error", (error) => finish(new ConnectorError("SSH_TCP_CONNECT_FAILED", error.message, 502)));
  });
}

async function withSsh<T>(device: Device, callback: (client: Client, credential: SshCredential) => Promise<T>) {
  const credential = await getCredential(device);
  return withSshWithCredential(device, credential, (client) => callback(client, credential));
}

async function withSshWithCredential<T>(device: Device, credential: SshCredential, callback: (client: Client) => Promise<T>) {
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
    client.once("timeout", () => finish(() => reject(new ConnectorError("SSH_HANDSHAKE_TIMEOUT", "SSH handshake timed out.", 504))));
    client.connect(connectConfig(device, credential));
  });
}

function exec(client: Client, command: string, timeoutMs = env.sshCommandTimeoutMs): Promise<ExecResult> {
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

function telemetryCommand(command: string, privileged: boolean, privilegeLevel: "root" | "sudo" | "limited") {
  if (!privileged || privilegeLevel === "root") return command;
  if (privilegeLevel === "sudo") return `sudo -n sh -c ${JSON.stringify(command)}`;
  return null;
}

export function detectLinuxPrivilege(username: string, uidOutput: string, sudoExitCode: number | null): "root" | "sudo" | "limited" {
  return uidOutput.trim() === "0" || username === "root" ? "root" : sudoExitCode === 0 ? "sudo" : "limited";
}

export async function runLinuxTelemetryCommands(device: Device, commandIds: LinuxTelemetryCommandId[]) {
  if (!isLinuxSshCapable(device)) {
    throw new ConnectorError("LINUX_SSH_REQUIRED", "Selected device is not Linux/SSH capable.", 404);
  }
  if (commandIds.some((id) => !(id in LINUX_TELEMETRY_COMMANDS))) {
    throw new ConnectorError("TELEMETRY_COMMAND_NOT_ALLOWED", "Telemetry command is not allowlisted.", 400);
  }
  return withSsh(device, async (client, credential) => {
    const uid = await exec(client, "id -u");
    const root = uid.stdout.trim() === "0" || credential.username === "root";
    const sudoCheck = root ? null : await exec(client, "sudo -n true");
    const privilegeLevel = detectLinuxPrivilege(credential.username, uid.stdout, sudoCheck?.exitCode ?? null);
    const results: Record<string, ExecResult & { skipped?: boolean }> = {};
    for (const id of commandIds) {
      const definition = LINUX_TELEMETRY_COMMANDS[id];
      const command = telemetryCommand(definition.command, definition.privileged, privilegeLevel);
      if (!command) {
        results[id] = { stdout: "", stderr: "Privileged read unavailable.", exitCode: null, skipped: true };
        continue;
      }
      try {
        results[id] = await exec(client, command, Math.max(env.sshCommandTimeoutMs, 20000));
      } catch (error) {
        results[id] = { stdout: "", stderr: error instanceof Error ? error.message : "Read failed.", exitCode: null };
      }
    }
    return { privilegeLevel, sudoAvailable: privilegeLevel === "root" || privilegeLevel === "sudo", connectionPort: resolveLinuxConnectionPort(device, credential), results };
  });
}

export async function openLinuxTelemetryStream(
  device: Device,
  source: LinuxStreamSource,
  onLine: (line: string) => void,
  onWarning: (message: string) => void
) {
  if (!(source in LINUX_STREAM_COMMANDS)) throw new ConnectorError("STREAM_SOURCE_NOT_ALLOWED", "Stream source is not allowlisted.", 400);
  const credential = await getCredential(device);
  const client = new Client();
  let closed = false;
  let channel: { close: () => void } | null = null;
  const ready = new Promise<void>((resolve, reject) => {
    client.once("ready", async () => {
      try {
        const uid = await exec(client, "id -u");
        const root = uid.stdout.trim() === "0" || credential.username === "root";
        const sudoCheck = root ? null : await exec(client, "sudo -n true");
        const privileged = root || sudoCheck?.exitCode === 0;
        const command = privileged && !root
          ? `sudo -n sh -c ${JSON.stringify(LINUX_STREAM_COMMANDS[source])}`
          : LINUX_STREAM_COMMANDS[source];
        client.exec(command, (error, stream) => {
          if (error) return reject(error);
          channel = stream;
          let buffer = "";
          const consume = (chunk: Buffer) => {
            buffer += chunk.toString("utf8");
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";
            lines.filter(Boolean).forEach(onLine);
          };
          stream.on("data", consume);
          stream.stderr.on("data", (chunk: Buffer) => onWarning(chunk.toString("utf8").trim()));
          stream.on("close", () => { if (!closed) onWarning(`${source} stream closed.`); });
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
    client.once("error", reject);
    client.connect(connectConfig(device, credential));
  });
  await ready;
  return {
    close() {
      closed = true;
      channel?.close();
      client.end();
    }
  };
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
  const stages: DeviceConnectionTestResult["stages"] = [{ name: "resolve_device", status: "ok" }];
  const warnings: DeviceConnectionTestResult["warnings"] = [];
  const base = {
    deviceId: device.id,
    host: device.host,
    port: resolveLinuxConnectionPort(device),
    stages,
    warnings
  };

  let credential: SshCredential;
  try {
    credential = await getCredential(device);
    stages.push({ name: "resolve_credential", status: "ok" });
  } catch (error) {
    const connectorError = error instanceof ConnectorError ? error : new ConnectorError("SSH_CREDENTIAL_MISSING", "No SSH credential is configured for this device.");
    stages.push({ name: "resolve_credential", status: "failed", code: connectorError.code, message: connectorError.message });
    return {
      ...base,
      connected: false,
      credentialResolved: false,
      capabilities: { canConnect: false, canRunBasicReadOnly: false, canUseUfw: false, canOpenPort: false, canClosePort: false },
      errorCode: connectorError.code,
      message: connectorError.message
    };
  }

  try {
    await tcpConnect(device.host, resolveLinuxConnectionPort(device, credential));
    stages.push({ name: "tcp_connect", status: "ok" });
  } catch (error) {
    const connectorError = error instanceof ConnectorError ? error : new ConnectorError("SSH_TCP_CONNECT_FAILED", "TCP connection failed.");
    stages.push({ name: "tcp_connect", status: "failed", code: connectorError.code, message: connectorError.message });
    return {
      ...base,
      connected: false,
      credentialResolved: true,
      credentialName: credential.name ?? credentialRef(device),
      username: credential.username,
      capabilities: { canConnect: false, canRunBasicReadOnly: false, canUseUfw: false, canOpenPort: false, canClosePort: false },
      errorCode: connectorError.code,
      message: connectorError.message
    };
  }

  return withSshWithCredential(device, credential, async (client) => {
    stages.push({ name: "ssh_handshake", status: "ok" }, { name: "ssh_auth", status: "ok" });
    const sudo = sudoPrefix(credential);
    const [hostname, whoami, os] = await Promise.all([exec(client, "hostname"), exec(client, "whoami"), exec(client, "uname -a")]);
    const basicFailed = [hostname, whoami, os].find((result) => result.exitCode !== 0);
    if (basicFailed) {
      stages.push({ name: "basic_commands", status: "failed", code: "SSH_COMMAND_FAILED", message: basicFailed.stderr || "Basic read-only command failed." });
      return {
        ...base,
        connected: false,
        credentialResolved: true,
        credentialName: credential.name ?? credentialRef(device),
        username: credential.username,
        capabilities: { canConnect: true, canRunBasicReadOnly: false, canUseUfw: false, canOpenPort: false, canClosePort: false },
        errorCode: "SSH_COMMAND_FAILED",
        message: basicFailed.stderr || "Basic read-only command failed."
      };
    }
    stages.push({ name: "basic_commands", status: "ok" });

    const [ufwPath, ufwStatus, ports, sshStatus, sshdPort] = await Promise.all([
      exec(client, "command -v ufw"),
      exec(client, `${sudo}/usr/sbin/ufw status verbose`),
      exec(client, "ss -lntup"),
      exec(client, "systemctl is-active ssh || systemctl is-active sshd"),
      exec(client, "grep -E '^[[:space:]]*Port[[:space:]]+[0-9]+' /etc/ssh/sshd_config | tail -n 1")
    ]);

    if (ufwPath.exitCode !== 0 || !ufwPath.stdout) warnings.push({ code: "UFW_NOT_FOUND", message: "ufw command not available" });
    if (ufwStatus.exitCode !== 0) warnings.push({ code: "SUDO_PERMISSION_DENIED", message: "NOPASSWD sudo for ufw is missing or ufw status failed" });
    if (ports.exitCode !== 0) warnings.push({ code: "SSH_COMMAND_FAILED", message: "ss command unavailable or permission denied" });
    if (sshStatus.exitCode !== 0) warnings.push({ code: "SSH_COMMAND_FAILED", message: "systemctl ssh status unavailable" });
    if (sshdPort.exitCode !== 0) warnings.push({ code: "SSH_COMMAND_FAILED", message: "Could not read SSH port from sshd_config" });
    stages.push({ name: "optional_capabilities", status: warnings.length > 0 ? "warning" : "ok" });
    const canUseUfw = ufwPath.exitCode === 0 && Boolean(ufwPath.stdout) && ufwStatus.exitCode === 0;

    return {
      ...base,
      connected: true,
      credentialResolved: true,
      credentialName: credential.name ?? credentialRef(device),
      username: whoami.stdout || credential.username,
      hostname: hostname.stdout,
      os: os.stdout,
      ufwAvailable: canUseUfw,
      ufwStatus: ufwStatus.stdout || ufwStatus.stderr,
      listeningPorts: ports.stdout || ports.stderr,
      sshServiceStatus: sshStatus.stdout || sshStatus.stderr,
      currentSshPort: parseCurrentSshPort(sshdPort.stdout),
      capabilities: {
        canConnect: true,
        canRunBasicReadOnly: true,
        canUseUfw,
        canOpenPort: canUseUfw,
        canClosePort: canUseUfw
      },
      message: warnings.length > 0 ? "SSH connection succeeded with optional capability warnings." : "SSH connection succeeded."
    };
  }).catch((error) => {
    const connectorError = error instanceof ConnectorError ? error : mapSshError(error);
    if (!stages.some((stage) => stage.name === "ssh_handshake")) {
      if (connectorError.code === "SSH_AUTH_FAILED") {
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
      capabilities: { canConnect: true, canRunBasicReadOnly: false, canUseUfw: false, canOpenPort: false, canClosePort: false },
      errorCode: connectorError.code,
      message: connectorError.message
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

  if (plan.actionType === ActionType.open_port || plan.actionType === ActionType.linux_open_port) {
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
  } else if (plan.actionType === ActionType.block_source_ip_temporary || plan.actionType === ActionType.linux_block_ip) {
    const srcIp = ipParam(parameters.srcIp ?? parameters.ipAddress);
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
    throw new ConnectorError("CONNECTOR_ACTION_UNSUPPORTED", "Changing SSH port has an execution preview but is not enabled in this connector.");
  } else if (plan.actionType === ActionType.linux_daily_check) {
    plannedCommands = ["controlled Linux daily-check bundle (read-only)"];
    rollbackSteps = [];
  } else if (plan.actionType === ActionType.linux_check_service_status) {
    const service = serviceParam(parameters.serviceName ?? parameters.service);
    affectedServices.push(service);
    plannedCommands = [`systemctl status ${service} --no-pager || service ${service} status`];
    validationWarnings.push("Read-only service status check. No service restart or config change is planned.");
  } else if (new Set<ActionType>([ActionType.linux_remove_user_from_sudo, ActionType.linux_add_user_to_sudo, ActionType.linux_check_user_groups, ActionType.linux_lock_user, ActionType.linux_unlock_user]).has(plan.actionType)) {
    const username = usernameParam(parameters.username);
    affectedServices.push("local-accounts");
    if (plan.actionType === ActionType.linux_remove_user_from_sudo) { plannedCommands = [`sudo -n gpasswd -d ${username} sudo || sudo -n deluser ${username} sudo`, `groups ${username} || id ${username}`]; rollbackSteps = [`sudo -n usermod -aG sudo ${username}`]; }
    if (plan.actionType === ActionType.linux_add_user_to_sudo) { plannedCommands = [`sudo -n usermod -aG sudo ${username}`, `groups ${username} || id ${username}`]; rollbackSteps = [`sudo -n gpasswd -d ${username} sudo || sudo -n deluser ${username} sudo`]; }
    if (plan.actionType === ActionType.linux_check_user_groups) { plannedCommands = [`id ${username}; groups ${username}`]; rollbackSteps = []; }
    if (plan.actionType === ActionType.linux_lock_user) { plannedCommands = [`sudo -n usermod -L ${username}`, `passwd -S ${username} || true`]; rollbackSteps = [`sudo -n usermod -U ${username}`]; }
    if (plan.actionType === ActionType.linux_unlock_user) { plannedCommands = [`sudo -n usermod -U ${username}`, `passwd -S ${username} || true`]; rollbackSteps = [`sudo -n usermod -L ${username}`]; }
  } else if (LINUX_READ_ACTIONS.has(plan.actionType)) {
    const read = linuxReadCommand(plan.actionType);
    if (!read) throw new ConnectorError("CONNECTOR_ACTION_UNSUPPORTED", `${plan.actionType} has no controlled read template.`);
    plannedCommands = [read.template];
    rollbackSteps = [];
    validationWarnings.push("Read-only inventory command. No device state change is planned.");
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

    if (plan.actionType === ActionType.linux_daily_check) {
      const daily = [
        "printf '===SYSTEM===\\n'; uptime; free -m; swapon --show 2>/dev/null || true; df -h; df -i",
        "printf '===SERVICES===\\n'; systemctl --failed --no-pager 2>/dev/null || true; systemctl is-active ssh sshd nginx apache2 httpd docker fail2ban 2>/dev/null || true",
        "printf '===NETWORK===\\n'; ip -brief address; ip route; ss -lntup 2>/dev/null || ss -lntp 2>/dev/null || true",
        `${sudo}sh -c \"printf '===FIREWALL===\\n'; ufw status verbose 2>/dev/null || nft list ruleset 2>/dev/null || iptables -S 2>/dev/null || true\"`,
        `${sudo}sh -c \"printf '===LOGS===\\n'; journalctl -p err..alert --since '24 hours ago' -n 150 --no-pager 2>/dev/null || true; journalctl -u ssh -u sshd --since '24 hours ago' --no-pager 2>/dev/null | grep -Ei 'failed|invalid user|authentication failure' | tail -n 100 || true\"`,
        "printf '===UPDATES===\\n'; (apt list --upgradable 2>/dev/null || dnf check-update 2>/dev/null || yum check-update 2>/dev/null || true) | head -n 100"
      ];
      for (const command of daily) await pushCommand("linux daily check", command);
      rollbackJson.readOnly = true;
    } else if (plan.actionType === ActionType.open_port || plan.actionType === ActionType.linux_open_port) {
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
    } else if (plan.actionType === ActionType.block_source_ip_temporary || plan.actionType === ActionType.linux_block_ip) {
      const srcIp = ipParam(parameters.srcIp ?? parameters.ipAddress);
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
    } else if (plan.actionType === ActionType.linux_check_service_status) {
      const service = serviceParam(parameters.serviceName ?? parameters.service);
      const status = await exec(client, `systemctl status ${service} --no-pager || service ${service} status`);
      commands.push({ template: `service status ${service}`, stdout: status.stdout.slice(0, 4000), stderr: status.stderr.slice(0, 4000), exitCode: status.exitCode });
      rollbackJson.readOnly = true;
      warnings.push(status.exitCode === 0 ? "SERVICE_AVAILABLE" : "SERVICE_NOT_AVAILABLE");
    } else if (new Set<ActionType>([ActionType.linux_remove_user_from_sudo, ActionType.linux_add_user_to_sudo, ActionType.linux_check_user_groups, ActionType.linux_lock_user, ActionType.linux_unlock_user]).has(plan.actionType)) {
      const username = usernameParam(parameters.username);
      if (plan.actionType === ActionType.linux_remove_user_from_sudo) { await pushCommand("remove user from sudo", `${sudo}gpasswd -d ${username} sudo || ${sudo}deluser ${username} sudo`); rollbackJson.steps = [`${sudo}usermod -aG sudo ${username}`]; }
      if (plan.actionType === ActionType.linux_add_user_to_sudo) { await pushCommand("add user to sudo", `${sudo}usermod -aG sudo ${username}`); rollbackJson.steps = [`${sudo}gpasswd -d ${username} sudo || ${sudo}deluser ${username} sudo`]; }
      if (plan.actionType === ActionType.linux_check_user_groups) rollbackJson.readOnly = true;
      if (plan.actionType === ActionType.linux_lock_user) { await pushCommand("lock Linux user", `${sudo}usermod -L ${username}`); rollbackJson.steps = [`${sudo}usermod -U ${username}`]; }
      if (plan.actionType === ActionType.linux_unlock_user) { await pushCommand("unlock Linux user", `${sudo}usermod -U ${username}`); rollbackJson.steps = [`${sudo}usermod -L ${username}`]; }
      await pushCommand("verify Linux user groups", `id ${username}; groups ${username}`);
    } else if (LINUX_READ_ACTIONS.has(plan.actionType)) {
      const read = linuxReadCommand(plan.actionType, sudo);
      if (!read) throw new ConnectorError("CONNECTOR_ACTION_UNSUPPORTED", `${plan.actionType} has no controlled read template.`);
      await pushCommand(read.template, read.command);
      rollbackJson.readOnly = true;
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
    return isLinuxSshCapable(device);
  },
  async testConnection(device) {
    try {
      return await collectLinuxStatus(device);
    } catch (error) {
      const connectorError = error instanceof ConnectorError ? error : mapSshError(error);
      return {
        connected: false,
        deviceId: device.id,
        host: device.host,
        port: resolveLinuxConnectionPort(device),
        credentialResolved: false,
        stages: [
          { name: "resolve_device", status: "ok" },
          { name: "ssh_handshake", status: "failed", code: connectorError.code, message: connectorError.message }
        ],
        warnings: [],
        capabilities: { canConnect: false, canRunBasicReadOnly: false, canUseUfw: false, canOpenPort: false, canClosePort: false },
        errorCode: connectorError.code,
        message: connectorError.message
      };
    }
  },
  async getCapabilities(device) {
    const stored = asObject(device.capabilities);
    const linuxStatus = asObject(stored.linuxStatus);
    const statusCapabilities = asObject(linuxStatus.capabilities);
    const canUseUfw = typeof statusCapabilities.canUseUfw === "boolean" ? statusCapabilities.canUseUfw : true;
    return {
      canTestConnection: true,
      canCollectStatus: true,
      canUseUfw,
      canOpenPort: canUseUfw,
      canClosePort: canUseUfw,
      canBlockSourceIp: canUseUfw,
      canUnblockSourceIp: canUseUfw,
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
