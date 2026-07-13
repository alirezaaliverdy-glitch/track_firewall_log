import { Client, type ConnectConfig } from "ssh2";
import { DeviceProtocol, type Device } from "@prisma/client";
import { env } from "../../../config/env.js";
import { resolveCredentialById, resolveCredentialByName, type ResolvedDeviceCredential } from "../../../services/credential.service.js";
import type { CiscoReadCommandId } from "./cisco-iosxe.templates.js";
import { ciscoReadCommand } from "./cisco-iosxe.templates.js";

export type CiscoIosXeCommandResult = {
  commandId: CiscoReadCommandId;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
};

export class CiscoConnectorError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400) {
    super(message);
    this.name = "CiscoConnectorError";
  }
}

export function isCiscoIosXeSshCandidate(device: Pick<Device, "vendor" | "protocol" | "capabilities">) {
  const vendor = String(device.vendor ?? "").toLowerCase();
  const caps = device.capabilities && typeof device.capabilities === "object" ? JSON.stringify(device.capabilities).toLowerCase() : "";
  return (vendor.includes("cisco") || caps.includes("cisco")) && device.protocol === DeviceProtocol.ssh;
}

async function resolveDeviceCredential(device: Pick<Device, "credentialId" | "credentialRef">) {
  if (device.credentialId) {
    const credential = await resolveCredentialById(device.credentialId);
    if (credential) return credential;
  }
  if (device.credentialRef) {
    const credential = await resolveCredentialByName(device.credentialRef);
    if (credential) return credential;
  }
  throw new CiscoConnectorError("CISCO_SSH_CREDENTIAL_MISSING", "A stored credential reference is required for Cisco SSH.", 400);
}

function connectConfig(device: Pick<Device, "host" | "managementPort">, credential: ResolvedDeviceCredential): ConnectConfig {
  const config: ConnectConfig = {
    host: device.host,
    port: device.managementPort,
    username: credential.username,
    readyTimeout: env.sshHandshakeTimeoutMs
  };
  if (credential.password) config.password = credential.password;
  if (credential.privateKey) config.privateKey = credential.privateKey;
  if (credential.passphrase) config.passphrase = credential.passphrase;
  return config;
}

function mapSshError(error: unknown) {
  const source = error as { level?: string; code?: string; message?: string };
  const message = source?.message ?? "Cisco SSH connection failed.";
  if (source?.level === "client-authentication" || /auth|authentication/i.test(message)) {
    return new CiscoConnectorError("CISCO_SSH_AUTH_FAILED", "Cisco SSH authentication failed.", 401);
  }
  if (source?.code === "ETIMEDOUT" || /timed out|timeout/i.test(message)) {
    return new CiscoConnectorError("CISCO_SSH_TIMEOUT", "Cisco SSH connection timed out.", 504);
  }
  return new CiscoConnectorError("CISCO_SSH_CONNECT_FAILED", message, 502);
}

function exec(client: Client, command: string, timeoutMs: number, outputLimitBytes: number) {
  return new Promise<Omit<CiscoIosXeCommandResult, "command" | "commandId">>((resolve, reject) => {
    const started = Date.now();
    client.exec(command, (error, stream) => {
      if (error) return reject(error);
      let stdout = "";
      let stderr = "";
      let exitCode: number | null = null;
      const timer = setTimeout(() => {
        stream.close();
        reject(new CiscoConnectorError("CISCO_COMMAND_TIMEOUT", `Cisco read command timed out: ${command}`, 504));
      }, timeoutMs);
      const append = (current: string, chunk: Buffer) => {
        const next = current + chunk.toString("utf8");
        if (Buffer.byteLength(next, "utf8") > outputLimitBytes) {
          stream.close();
          throw new CiscoConnectorError("CISCO_OUTPUT_LIMIT", "Cisco command output exceeded the safe limit.", 502);
        }
        return next;
      };
      stream.on("data", (chunk: Buffer) => {
        try { stdout = append(stdout, chunk); } catch (failure) { clearTimeout(timer); reject(failure); }
      });
      stream.stderr.on("data", (chunk: Buffer) => {
        try { stderr = append(stderr, chunk); } catch (failure) { clearTimeout(timer); reject(failure); }
      });
      stream.on("exit", (code: number | null) => { exitCode = code; });
      stream.on("close", () => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode, durationMs: Date.now() - started });
      });
    });
  });
}

export class CiscoIosXeSshConnector {
  readonly connectorType = "cisco-iosxe-ssh";
  readonly outputLimitBytes = 512_000;
  readonly commandTimeoutMs = 20_000;

  async runReadOnlyCommands(device: Device, commandIds: CiscoReadCommandId[]): Promise<{ connectorInvoked: boolean; results: CiscoIosXeCommandResult[]; warnings: string[] }> {
    if (!isCiscoIosXeSshCandidate(device)) {
      throw new CiscoConnectorError("CISCO_DEVICE_UNSUPPORTED", "The selected device is not a Cisco SSH candidate.", 400);
    }
    const credential = await resolveDeviceCredential(device);
    const client = new Client();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        client.end();
        callback();
      };
      client.once("ready", async () => {
        try {
          const results: CiscoIosXeCommandResult[] = [];
          for (const commandId of commandIds) {
            const command = ciscoReadCommand(commandId);
            const result = await exec(client, command, this.commandTimeoutMs, this.outputLimitBytes);
            results.push({ commandId, command, ...result });
          }
          finish(() => resolve({ connectorInvoked: true, results, warnings: [] }));
        } catch (error) {
          finish(() => reject(error));
        }
      });
      client.once("error", (error) => finish(() => reject(mapSshError(error))));
      client.connect(connectConfig(device, credential));
    });
  }
}

export const ciscoIosXeSshConnector = new CiscoIosXeSshConnector();
