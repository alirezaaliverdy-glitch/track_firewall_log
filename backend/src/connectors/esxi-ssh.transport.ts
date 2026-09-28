import { timingSafeEqual } from "node:crypto";
import type { Client, ConnectConfig } from "ssh2";
import type { Device } from "@prisma/client";
import type { ResolvedDeviceCredential } from "../services/credential.service.js";
import { EsxiSoapError } from "./esxi-soap.transport.js";

type SshDevice = Pick<Device, "id" | "capabilities">;
export function esxiSshFingerprint(device: SshDevice): string {
  const caps = device.capabilities as Record<string, unknown> | null;
  const value = String(caps?.esxiSshFingerprint ?? "").trim();
  if (!/^SHA256:[A-Za-z0-9+/]{43}=?$/.test(value))
    throw new EsxiSoapError("ESXI_SSH_FINGERPRINT_REQUIRED", "Enter the verified SHA256 host key fingerprint from the ESXi administrator.");
  const decoded = Buffer.from(value.slice(7), "base64");
  if (decoded.length !== 32 || decoded.toString("base64").replace(/=+$/, "") !== value.slice(7).replace(/=+$/, ""))
    throw new EsxiSoapError("ESXI_SSH_FINGERPRINT_INVALID", "Invalid SSH host key fingerprint.");
  return decoded.toString("hex");
}
export function esxiSshConfig(device: SshDevice, host: string, port: number, credential: ResolvedDeviceCredential): ConnectConfig {
  const expected = Buffer.from(esxiSshFingerprint(device), "hex");
  if (!credential.username || (!credential.password && !credential.privateKey))
    throw new EsxiSoapError("ESXI_SSH_CREDENTIAL_REQUIRED", "A stored SSH username and password or private key are required.");
  return {
    host, port, username: credential.username, password: credential.password,
    privateKey: credential.privateKey, passphrase: credential.passphrase,
    readyTimeout: 15_000, hostHash: "sha256",
    // Match the RSA host key whose fingerprint the onboarding form requests.
    // Never fall back to SHA-1 ssh-rsa or silently accept another host key.
    algorithms: {serverHostKey: ["rsa-sha2-512", "rsa-sha2-256"]},
    hostVerifier: (actual: string) => {
      const received = Buffer.from(actual, "hex");
      return received.length === expected.length && timingSafeEqual(received, expected);
    }
  };
}
export function esxiSshSessionId(device: SshDevice) {
  return `${device.id}:esxi:${esxiSshFingerprint(device)}`;
}
export function esxiExec(client: Client, command: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let channel: import("ssh2").ClientChannel | undefined;
    let output = "";
    let bytes = 0;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) { channel?.close(); reject(error); } else resolve(output);
    };
    const timer = setTimeout(() => finish(new EsxiSoapError("ESXI_SSH_COMMAND_TIMEOUT", "An ESXi read command timed out.")), timeoutMs);
    client.exec(command, (error, stream) => {
      if (error) return finish(new EsxiSoapError("ESXI_SSH_EXEC_FAILED", "ESXi rejected a read command."));
      channel = stream;
      if (settled) { stream.close(); return; }
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 512 * 1024) return finish(new EsxiSoapError("ESXI_SSH_OUTPUT_LIMIT", "ESXi command output exceeded the safe limit."));
        output += chunk.toString("utf8");
      });
      stream.stderr.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 512 * 1024) finish(new EsxiSoapError("ESXI_SSH_OUTPUT_LIMIT", "ESXi command output exceeded the safe limit."));
      });
      stream.once("error", () => finish(new EsxiSoapError("ESXI_SSH_EXEC_FAILED", "ESXi command channel failed.")));
      stream.once("close", (code: number | undefined) => finish(code === 0 ? undefined : new EsxiSoapError("ESXI_SSH_COMMAND_FAILED", "An ESXi read command failed or the account lacks permission.")));
    });
  });
}
