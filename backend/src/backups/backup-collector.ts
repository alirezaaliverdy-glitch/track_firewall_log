import type { Device } from "@prisma/client";
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
      let stderr = false;
      stream.on("data", (chunk: Buffer) => {
        const bytes = Buffer.from(chunk); size += bytes.length;
        if (size > 20 * 1024 * 1024) return finish(new BackupError("BACKUP_TOO_LARGE", 413));
        chunks.push(bytes);
      });
      stream.stderr.on("data", () => { stderr = true; });
      stream.on("error", () => finish(new BackupError("BACKUP_CHANNEL_FAILED", 502)));
      stream.on("close", (code: number | undefined) => finish(code !== 0 || stderr ? new BackupError("BACKUP_COMMAND_FAILED", 502) : undefined));
    });
  });
}
export async function collectDeviceBackup(device: Device) {
  const profile = backupProfile(device.vendor, device.type);
  let sshDevice = device;
  if (device.protocol !== "ssh") {
    const channel = await prisma.deviceConnectionChannel.findFirst({ where: { deviceId: device.id, enabled: true, method: "ssh" }, orderBy: { priority: "asc" } });
    if (!channel?.port) throw new BackupError("BACKUP_SSH_REQUIRED");
    sshDevice = { ...device, protocol: "ssh", host: channel.host ?? device.host, managementPort: channel.port, credentialId: channel.credentialId ?? device.credentialId };
  }
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
    if (profile.key === "linux") return readBackupCommand(client, `${credential.sudo ? "sudo -n " : ""}tar -czf - -C / etc`);
    if (profile.key === "pfsense") return readBackupCommand(client, "cat /conf/config.xml");
    if (profile.key === "fortigate") return readFortigateConfig(client);
    if (profile.key !== "mikrotik") throw new BackupError("BACKUP_VENDOR_UNSUPPORTED");
    const version = (await readBackupCommand(client, ":put [/system resource get version]")).toString("utf8").trim();
    if (!/^[67]\./.test(version)) throw new BackupError("BACKUP_ROUTEROS_VERSION_UNSUPPORTED");
    return readBackupCommand(client, version.startsWith("7.") ? "/export terse show-sensitive" : "/export terse hide-sensitive=no");
  });
}
