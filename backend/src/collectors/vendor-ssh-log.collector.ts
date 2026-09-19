import { Client, type ConnectConfig } from "ssh2";
import { DeviceProtocol, DeviceType, type Device } from "@prisma/client";
import { env } from "../config/env.js";
import { collectFortiGateRecentLogs } from "../connectors/fortigate-ssh.connector.js";
import { collectMikroTikRecentLogs } from "../connectors/mikrotik-ssh.connector.js";
import {
  ciscoIosXeSshConnector,
  isCiscoIosXeSshCandidate
} from "../connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";
import { resolveCredentialById, resolveCredentialByName } from "../services/credential.service.js";
import type { CollectedLogLine, CollectorSourceType, DeviceCollector } from "./types.js";
import { parseVendorLogTimestamp } from "./vendor-log-parser.js";

function sanitizeLine(value: string) {
  return value
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/(password|passwd|passphrase|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .trim()
    .slice(0, 4000);
}

function collectedLines(lines: string[], sourceType: CollectorSourceType, command: string): CollectedLogLine[] {
  return lines
    .map(sanitizeLine)
    .filter(Boolean)
    .slice(-500)
    .map((raw) => ({ sourceType, timestamp: parseVendorLogTimestamp(raw), raw, command }));
}

async function resolvePfSenseCredential(device: Device) {
  const credential = device.credentialId
    ? await resolveCredentialById(device.credentialId)
    : device.credentialRef
      ? await resolveCredentialByName(device.credentialRef)
      : null;
  if (!credential) throw new Error("PFSENSE_CREDENTIAL_MISSING");
  return credential;
}

async function collectPfSenseLogs(device: Device) {
  const credential = await resolvePfSenseCredential(device);
  const config: ConnectConfig = {
    host: device.host,
    port: device.managementPort,
    username: credential.username,
    readyTimeout: env.sshHandshakeTimeoutMs
  };
  if (credential.password) config.password = credential.password;
  if (credential.privateKey) config.privateKey = credential.privateKey;
  if (credential.passphrase) config.passphrase = credential.passphrase;
  const command = "tail -n 500 /var/log/system.log /var/log/auth.log /var/log/filter.log /var/log/openvpn.log /var/log/ipsec.log 2>/dev/null";

  return new Promise<string[]>((resolve, reject) => {
    const client = new Client();
    let settled = false;
    const finish = (error?: Error, lines: string[] = []) => {
      if (settled) return;
      settled = true;
      client.end();
      if (error) reject(error);
      else resolve(lines);
    };
    client.once("ready", () => {
      client.exec(command, (error, stream) => {
        if (error) return finish(new Error("PFSENSE_LOG_COMMAND_FAILED"));
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          stream.close();
          finish(new Error("PFSENSE_LOG_COMMAND_TIMEOUT"));
        }, env.sshCommandTimeoutMs);
        stream.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
        stream.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
        stream.on("close", (exitCode: number | null) => {
          clearTimeout(timer);
          if (exitCode !== 0 && !stdout.trim()) return finish(new Error(stderr.trim() ? "PFSENSE_LOG_COMMAND_FAILED" : "PFSENSE_LOGS_UNAVAILABLE"));
          finish(undefined, stdout.split(/\r?\n/));
        });
      });
    });
    client.once("error", () => finish(new Error("PFSENSE_SSH_CONNECTION_FAILED")));
    client.once("timeout", () => finish(new Error("PFSENSE_SSH_TIMEOUT")));
    client.connect(config);
  });
}

function result(device: Device, vendor: "mikrotik" | "fortigate" | "cisco" | "pfsense", name: string, sourceType: CollectorSourceType, command: string, lines: string[], startedAt: Date) {
  return {
    deviceId: device.id,
    vendor,
    collectorName: name,
    sourceTypes: [sourceType],
    lines: collectedLines(lines, sourceType, command),
    warnings: [],
    startedAt,
    completedAt: new Date()
  };
}

export const mikroTikLogCollector: DeviceCollector = {
  name: "mikrotik_ssh_log",
  stateSourceType: "mikrotik_log",
  sourceTypes: ["mikrotik_log"],
  supports(device) {
    const vendor = String(device?.vendor ?? "").toLowerCase();
    return Boolean(device && device.protocol === DeviceProtocol.ssh && (device.type === DeviceType.mikrotik || /mikrotik|routeros/.test(vendor)));
  },
  async runOnce(device) {
    const startedAt = new Date();
    return result(device, "mikrotik", this.name, this.stateSourceType, "/log print without-paging", await collectMikroTikRecentLogs(device), startedAt);
  }
};

export const fortiGateLogCollector: DeviceCollector = {
  name: "fortigate_ssh_log",
  stateSourceType: "fortigate_log",
  sourceTypes: ["fortigate_log"],
  supports(device) {
    const vendor = String(device?.vendor ?? "").toLowerCase();
    return Boolean(device && device.protocol === DeviceProtocol.ssh && (device.type === DeviceType.fortigate || /fortigate|fortinet/.test(vendor)));
  },
  async runOnce(device) {
    const startedAt = new Date();
    return result(device, "fortigate", this.name, this.stateSourceType, "execute log display", await collectFortiGateRecentLogs(device), startedAt);
  }
};

export const ciscoLogCollector: DeviceCollector = {
  name: "cisco_ssh_log",
  stateSourceType: "cisco_syslog",
  sourceTypes: ["cisco_syslog"],
  supports(device) { return Boolean(device && isCiscoIosXeSshCandidate(device)); },
  async runOnce(device) {
    const startedAt = new Date();
    const response = await ciscoIosXeSshConnector.runCliCommands(device, [{ commandId: "logging", command: "show logging", strict: false, write: false }]);
    const output = response.results.find((item) => item.commandId === "logging")?.stdout ?? "";
    return result(device, "cisco", this.name, this.stateSourceType, "show logging", output.split(/\r?\n/), startedAt);
  }
};

export const pfSenseLogCollector: DeviceCollector = {
  name: "pfsense_ssh_log",
  stateSourceType: "pfsense_log",
  sourceTypes: ["pfsense_log"],
  supports(device) {
    const vendor = String(device?.vendor ?? "").toLowerCase();
    return Boolean(device && device.protocol === DeviceProtocol.ssh && (device.type === DeviceType.pfsense || /pfsense|netgate/.test(vendor)));
  },
  async runOnce(device) {
    const startedAt = new Date();
    return result(device, "pfsense", this.name, this.stateSourceType, "tail pfSense security logs", await collectPfSenseLogs(device), startedAt);
  }
};
