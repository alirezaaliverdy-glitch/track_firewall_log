import type { Device, DeviceConnectionChannel } from "@prisma/client";
import type { Client, ClientChannel } from "ssh2";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { resolveCredentialById, resolveCredentialByName } from "../services/credential.service.js";
import { withSharedSsh } from "../services/shared-ssh-session.service.js";
import { ciscoIosXeSshConnector } from "../connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import { backupProfile } from "./backup-profiles.js";
import { readFortigateConfig } from "./fortigate-scp.js";
export class BackupError extends Error {
  constructor(public code: string, public statusCode = 400) { super(code); }
}
// Commands and paths are fixed by the server, never supplied by an HTTP client.
export function readBackupCommand(client: Client, command: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let settled = false, size = 0;
    let channel: ClientChannel | undefined;
    const chunks: Buffer[] = [];
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) { channel?.close(); reject(error); } else resolve(Buffer.concat(chunks));
    };
    const timer = setTimeout(() => finish(new BackupError("BACKUP_TIMEOUT", 504)), 60_000);
    client.exec(command, (error, stream) => {
      if (error) return finish(new BackupError("BACKUP_CHANNEL_FAILED", 502));
      channel = stream;
      if (settled) { stream.close(); return; }
      let stderr = "";
      stream.on("data", (chunk: Buffer) => {
        if (settled) return;
        const bytes = Buffer.from(chunk); size += bytes.length;
        if (size > 20 * 1024 * 1024) return finish(new BackupError("BACKUP_TOO_LARGE", 413));
        chunks.push(bytes);
      });
      stream.stderr.on("data", (chunk: Buffer) => {
        if (!settled && stderr.length < 8192) stderr += String(chunk).slice(0, 8192 - stderr.length);
      });
      stream.on("error", () => finish(new BackupError("BACKUP_CHANNEL_FAILED", 502)));
      stream.on("close", (code: number | undefined) => {
        if (code === 0 && !stderr) return finish();
        // Classify locally; raw paths, configuration and stderr never leave this function.
        const reason = /password is required|terminal is required|not allowed to execute/i.test(stderr) ? "BACKUP_SUDO_REQUIRED"
          : /permission denied|operation not permitted/i.test(stderr) ? "BACKUP_PERMISSION_DENIED"
          : /file changed as we read|file removed before we read/i.test(stderr) ? "BACKUP_SOURCE_CHANGED"
          : "BACKUP_COMMAND_FAILED";
        finish(new BackupError(reason, 502));
      });
    });
  });
}
export function backupSshTarget(device: Device, channels: DeviceConnectionChannel[]) {
  const ssh = channels.filter(channel => channel.enabled && channel.method === "ssh")
    .sort((a, b) => Number(b.role === "management") - Number(a.role === "management") || a.priority - b.priority)[0];
  if (ssh) return { ...device, protocol: "ssh" as const, host: ssh.host ?? device.host,
    managementPort: ssh.port ?? device.managementPort, credentialId: ssh.credentialId ?? device.credentialId };
  // Never bypass a deliberately disabled registered management path.
  if (device.protocol !== "ssh" || channels.some(channel => channel.role === "management" && channel.method === "ssh")) {
    throw new BackupError("BACKUP_SSH_REQUIRED");
  }
  return device;
}
export async function collectLinuxBackup(client: Client, sudo: boolean, read = readBackupCommand) {
  const command = "tar -czf - -C / etc";
  if (sudo) return read(client, "sudo -n " + command);
  try { return await read(client, command); }
  catch (error) {
    // Backup-specific, fixed read-only elevation; do not enable sudo for unrelated actions.
    if (!(error instanceof BackupError) || error.code !== "BACKUP_PERMISSION_DENIED") throw error;
    return read(client, "sudo -n " + command);
  }
}
export async function collectDeviceBackup(device: Device) {
  const profile = backupProfile(device.vendor, device.type);
  const channels = await prisma.deviceConnectionChannel.findMany({ where: { deviceId: device.id }, orderBy: { priority: "asc" } });
  const sshDevice = backupSshTarget(device, channels);
  if (profile.key === "cisco") {
    const result = await ciscoIosXeSshConnector.runCliCommands(sshDevice, [{ commandId: "backup-running-config", command: "show running-config", strict: true, write: false, redactOutput: false }]);
    return Buffer.from(result.results[0]?.stdout ?? "", "utf8");
  }
  const credential = sshDevice.credentialId ? await resolveCredentialById(sshDevice.credentialId) : sshDevice.credentialRef ? await resolveCredentialByName(sshDevice.credentialRef) : undefined;
  if (!credential) throw new BackupError("BACKUP_CREDENTIAL_REQUIRED");
  return withSharedSsh(device.id, {
    host: sshDevice.host, port: sshDevice.managementPort, username: credential.username,
    password: credential.password, privateKey: credential.privateKey, passphrase: credential.passphrase,
    tryKeyboard: Boolean(credential.password), readyTimeout: env.sshHandshakeTimeoutMs
  }, async (client) => {
    if (profile.key === "linux") return collectLinuxBackup(client, credential.sudo);
    if (profile.key === "pfsense") return readBackupCommand(client, "cat /conf/config.xml");
    if (profile.key === "fortigate") return readFortigateConfig(client);
    if (profile.key !== "mikrotik") throw new BackupError("BACKUP_VENDOR_UNSUPPORTED");
    const version = (await readBackupCommand(client, ":put [/system resource get version]")).toString("utf8").trim();
    if (!/^[67]\./.test(version)) throw new BackupError("BACKUP_ROUTEROS_VERSION_UNSUPPORTED");
    return readBackupCommand(client, version.startsWith("7.") ? "/export terse show-sensitive" : "/export terse hide-sensitive=no");
  });
}
