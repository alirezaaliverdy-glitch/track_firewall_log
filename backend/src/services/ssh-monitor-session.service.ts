import type { Device } from "@prisma/client";
import type { ConnectConfig } from "ssh2";
import { env } from "../config/env.js";
import { resolveCredentialById, resolveCredentialByName } from "./credential.service.js";
import { closeSharedSshSessions, probeSharedSsh } from "./shared-ssh-session.service.js";
import { ciscoCompatibilityProfile, ciscoConnectConfig, isCiscoIosXeSshCandidate } from "../connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import { esxiSshConfig, esxiSshSessionId } from "../connectors/esxi-ssh.transport.js";

export async function probeSshMonitorSession(device: Pick<Device, "id" | "credentialId" | "credentialRef" | "vendor" | "protocol" | "capabilities">, host: string, port: number) {
  const credential = device.credentialId
    ? await resolveCredentialById(device.credentialId)
    : device.credentialRef ? await resolveCredentialByName(device.credentialRef) : null;
  if (!credential) return null;
  if (device.vendor.toLowerCase() === "esxi" && device.protocol === "ssh") {
    return probeSharedSsh(esxiSshSessionId(device), esxiSshConfig(device, host, port, credential));
  }
  const config: ConnectConfig = {
    host, port, username: credential.username, readyTimeout: Math.min(env.sshHandshakeTimeoutMs, env.deviceConnectivityTimeoutMs)
  };
  if (credential.password) config.password = credential.password;
  if (credential.privateKey) config.privateKey = credential.privateKey;
  if (credential.passphrase) config.passphrase = credential.passphrase;
  if (isCiscoIosXeSshCandidate(device)) {
    const ciscoConfig = ciscoConnectConfig({ host, managementPort: port }, credential, ciscoCompatibilityProfile(device));
    config.algorithms = ciscoConfig.algorithms;
    config.tryKeyboard = ciscoConfig.tryKeyboard;
  }
  const vendor = device.vendor.toLowerCase();
  return probeSharedSsh(device.id, config, vendor.includes("linux") || vendor.includes("ubuntu"));
}

export function closeSshMonitorSessions() {
  closeSharedSshSessions();
}
