import type { Device } from "@prisma/client";
import { DeviceProtocol } from "@prisma/client";
import type { CiscoReadCommandId } from "./cisco-iosxe.templates.js";
import { ciscoReadCommand } from "./cisco-iosxe.templates.js";

export type CiscoIosXeCommandResult = { commandId: CiscoReadCommandId; command: string; stdout: string; stderr: string; exitCode: number | null; durationMs: number };

export function isCiscoIosXeSshCandidate(device: Pick<Device, "vendor" | "protocol" | "capabilities">) {
  const vendor = String(device.vendor ?? "").toLowerCase();
  const caps = device.capabilities && typeof device.capabilities === "object" ? JSON.stringify(device.capabilities).toLowerCase() : "";
  return (vendor.includes("cisco") || caps.includes("cisco")) && device.protocol === DeviceProtocol.ssh;
}

export class CiscoIosXeSshConnector {
  readonly connectorType = "cisco-iosxe-ssh";
  readonly outputLimitBytes = 512_000;
  readonly commandTimeoutMs = 20_000;

  async runReadOnlyCommands(_device: Device, commandIds: CiscoReadCommandId[]): Promise<{ connectorInvoked: boolean; results: CiscoIosXeCommandResult[]; warnings: string[] }> {
    const results = commandIds.map((commandId) => ({ commandId, command: ciscoReadCommand(commandId), stdout: "", stderr: "Cisco IOS-XE SSH execution is wired as a safe foundation; live command invocation is enabled only after credential/session hardening verification.", exitCode: null, durationMs: 0 }));
    return { connectorInvoked: false, results, warnings: ["CISCO_IOSXE_LIVE_SSH_NOT_ENABLED_IN_18_2A"] };
  }
}
