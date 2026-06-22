import fs from "node:fs";
import { Client, type ConnectConfig } from "ssh2";
import { DeviceProtocol, DeviceType, type Device } from "@prisma/client";
import { resolveCredentialById, resolveCredentialByName, type ResolvedDeviceCredential } from "../services/credential.service.js";
import type { CollectedLogLine, CollectorRunResult, CollectorSourceType, DeviceCollector } from "./types.js";

const LINUX_SOURCE_TYPES: CollectorSourceType[] = ["linux_ssh", "linux_ufw", "linux_kernel"];

type EnvSshCredential = ResolvedDeviceCredential & {
  privateKeyPath?: string;
};

type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

function parseCredentialsJson() {
  const raw = process.env.SSH_CREDENTIALS_JSON;
  if (!raw) return {};
  try {
    return JSON.parse(raw.replace(/[“”]/g, "\"").replace(/[‘’]/g, "'")) as Record<string, EnvSshCredential>;
  } catch {
    return {};
  }
}

function credentialId(device: Device) {
  return typeof device.credentialId === "string" && device.credentialId.trim() ? device.credentialId.trim() : undefined;
}

function credentialRef(device: Device) {
  return typeof device.credentialRef === "string" && device.credentialRef.trim() ? device.credentialRef.trim() : undefined;
}

async function resolveCredential(device: Device): Promise<EnvSshCredential> {
  const id = credentialId(device);
  if (id) {
    const credential = await resolveCredentialById(id);
    if (credential) return credential;
  }

  const ref = credentialRef(device);
  if (ref) {
    const credential = await resolveCredentialByName(ref);
    if (credential) return credential;
    const envCredential = parseCredentialsJson()[ref];
    if (envCredential?.username) return envCredential;
  }

  throw new Error("SSH_CREDENTIAL_MISSING");
}

function connectConfig(device: Device, credential: EnvSshCredential): ConnectConfig {
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

async function withSsh<T>(device: Device, callback: (client: Client, credential: EnvSshCredential) => Promise<T>) {
  const credential = await resolveCredential(device);
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
    client.once("error", (error) => finish(() => reject(error)));
    client.once("timeout", () => finish(() => reject(new Error("SSH_CONNECTION_FAILED"))));
    client.connect(connectConfig(device, credential));
  });
}

function exec(client: Client, command: string, timeoutMs = 15000): Promise<ExecResult> {
  return new Promise((resolve) => {
    client.exec(command, (error, stream) => {
      if (error) {
        resolve({ stdout: "", stderr: error.message, exitCode: 1 });
        return;
      }
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        stream.close();
        resolve({ stdout, stderr: `${stderr}\nCOMMAND_TIMEOUT`.trim(), exitCode: 124 });
      }, timeoutMs);
      stream.on("close", (code: number | null) => {
        clearTimeout(timer);
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code });
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

function sudoPrefix(credential: EnvSshCredential) {
  return credential.username === "root" ? "" : "sudo -n ";
}

function parseTimestamp(line: string) {
  const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?)/);
  if (!match) return undefined;
  const date = new Date(match[1]);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function splitLines(raw: string, sourceType: CollectorSourceType, command: string, hostname?: string): CollectedLogLine[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-500)
    .map((line) => ({
      sourceType,
      timestamp: parseTimestamp(line),
      raw: line,
      command,
      hostname
    }));
}

function sinceArg(since: Date) {
  return since.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export const linuxSshLogCollector: DeviceCollector = {
  name: "linux_ssh_log",
  sourceTypes: LINUX_SOURCE_TYPES,
  supports(device) {
    return Boolean(device && device.protocol === DeviceProtocol.ssh && (
      device.type === DeviceType.linux_edge ||
      String(device.vendor ?? "").toLowerCase().includes("ubuntu") ||
      String(device.vendor ?? "").toLowerCase().includes("linux")
    ));
  },
  async runOnce(device, since) {
    const startedAt = new Date();
    const warnings: string[] = [];
    const lines: CollectedLogLine[] = [];
    const sinceValue = sinceArg(since);

    return withSsh(device, async (client, credential) => {
      const hostnameResult = await exec(client, "hostname");
      const hostname = hostnameResult.stdout || device.host;
      const sudo = sudoPrefix(credential);
      const commands: Array<{ sourceType: CollectorSourceType; command: string }> = [
        { sourceType: "linux_ssh", command: "whoami" },
        { sourceType: "linux_ssh", command: "hostname" },
        { sourceType: "linux_ssh", command: `journalctl -u ssh --since '${sinceValue}' --no-pager -o short-iso` },
        { sourceType: "linux_ssh", command: `journalctl -u sshd --since '${sinceValue}' --no-pager -o short-iso` },
        { sourceType: "linux_kernel", command: `journalctl -k --since '${sinceValue}' --no-pager -o short-iso` },
        { sourceType: "linux_ufw", command: `${sudo}/usr/sbin/ufw status verbose` },
        { sourceType: "linux_ufw", command: `${sudo}/usr/sbin/ufw status numbered` },
        { sourceType: "linux_ufw", command: `${sudo}journalctl -u ufw --since '${sinceValue}' --no-pager -o short-iso` },
        { sourceType: "linux_ssh", command: `${sudo}tail -n 500 /var/log/auth.log` },
        { sourceType: "linux_ufw", command: `${sudo}tail -n 500 /var/log/ufw.log` }
      ];

      for (const item of commands) {
        const result = await exec(client, item.command);
        if (result.exitCode !== 0) {
          warnings.push(`${item.command}: ${result.stderr || `exit ${result.exitCode}`}`);
          continue;
        }
        lines.push(...splitLines(result.stdout, item.sourceType, item.command, hostname));
      }

      return {
        deviceId: device.id,
        sourceTypes: LINUX_SOURCE_TYPES,
        lines,
        warnings,
        startedAt,
        completedAt: new Date()
      } satisfies CollectorRunResult;
    });
  }
};
