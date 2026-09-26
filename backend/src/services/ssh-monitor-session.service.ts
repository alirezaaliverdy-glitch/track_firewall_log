import type { Device } from "@prisma/client";
import type { ConnectConfig } from "ssh2";
import { env } from "../config/env.js";
import { resolveCredentialById, resolveCredentialByName } from "./credential.service.js";
import { closeSharedSshSessions, probeSharedSsh } from "./shared-ssh-session.service.js";

export async function probeSshMonitorSession(device: Pick<Device, "id" | "credentialId" | "credentialRef">, host: string, port: number) {
  const credential = device.credentialId
    ? await resolveCredentialById(device.credentialId)
    : device.credentialRef ? await resolveCredentialByName(device.credentialRef) : null;
  if (!credential) return null;
  const config: ConnectConfig = {
    host, port, username: credential.username, readyTimeout: Math.min(env.sshHandshakeTimeoutMs, env.deviceConnectivityTimeoutMs)
  };
  if (credential.password) config.password = credential.password;
  if (credential.privateKey) config.privateKey = credential.privateKey;
  if (credential.passphrase) config.passphrase = credential.passphrase;
  return probeSharedSsh(device.id, config);
}

export function closeSshMonitorSessions() {
  closeSharedSshSessions();
}
