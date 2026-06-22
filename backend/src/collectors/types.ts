import type { Device } from "@prisma/client";

export type CollectorSourceType = "linux_ssh" | "linux_ufw" | "linux_kernel";

export type CollectedLogLine = {
  sourceType: CollectorSourceType;
  timestamp?: Date;
  raw: string;
  command: string;
  hostname?: string;
};

export type CollectorRunResult = {
  deviceId: string;
  sourceTypes: CollectorSourceType[];
  lines: CollectedLogLine[];
  warnings: string[];
  startedAt: Date;
  completedAt: Date;
};

export type DeviceCollector = {
  name: string;
  supports(device: Device | null): boolean;
  sourceTypes: CollectorSourceType[];
  runOnce(device: Device, since: Date): Promise<CollectorRunResult>;
};
