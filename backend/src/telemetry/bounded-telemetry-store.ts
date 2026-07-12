import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { env } from "../config/env.js";

export type StoredTelemetryEvent = {
  id: string;
  deviceId: string;
  vendor: string;
  type: string;
  source: string;
  timestamp: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  category: string;
  rawMessage: string;
  normalizedMessage: string;
  parsedFields: Record<string, unknown>;
  findingId?: string;
};

export type TelemetryRetentionPolicy = {
  maxBytesPerDevice: number;
  maxEventCountPerDevice: number;
  maxAgeDays: number;
};

function safeDeviceFile(deviceId: string, rootDir = env.telemetryStoreDir) {
  const safe = deviceId.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return path.join(rootDir, `${safe}.jsonl`);
}

function sizeOf(line: string) {
  return Buffer.byteLength(line, "utf8") + 1;
}

export class BoundedTelemetryStore {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly rootDir = env.telemetryStoreDir, private readonly policy: TelemetryRetentionPolicy = {
    maxBytesPerDevice: env.telemetryMaxBytesPerDevice,
    maxEventCountPerDevice: env.telemetryMaxEventsPerDevice,
    maxAgeDays: env.telemetryMaxAgeDays
  }) {}

  async append(event: StoredTelemetryEvent) {
    const prior = this.queues.get(event.deviceId) ?? Promise.resolve();
    const next = prior.then(() => this.appendUnlocked(event), () => this.appendUnlocked(event));
    const queued = next.finally(() => {
      if (this.queues.get(event.deviceId) === queued) this.queues.delete(event.deviceId);
    });
    this.queues.set(event.deviceId, queued);
    return next;
  }

  private async appendUnlocked(event: StoredTelemetryEvent) {
    await this.ensureDirectory();
    const file = safeDeviceFile(event.deviceId, this.rootDir);
    const current = await this.readEvents(event.deviceId).catch(() => []);
    const cutoff = Date.now() - this.policy.maxAgeDays * 24 * 60 * 60 * 1000;
    const next = [...current, event]
      .filter((item) => Date.parse(item.timestamp) >= cutoff)
      .slice(-this.policy.maxEventCountPerDevice);

    let lines = next.map((item) => JSON.stringify(item));
    let bytes = lines.reduce((sum, line) => sum + sizeOf(line), 0);
    while (lines.length > 0 && bytes > this.policy.maxBytesPerDevice) {
      bytes -= sizeOf(lines.shift()!);
    }

    const tmp = `${file}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
    await writeFile(tmp, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
    await rename(tmp, file);
    return { eventCount: lines.length, bytes };
  }

  async ensureDirectory() {
    await mkdir(this.rootDir, { recursive: true });
  }

  async readEvents(deviceId: string, limit = this.policy.maxEventCountPerDevice) {
    await this.ensureDirectory();
    const file = safeDeviceFile(deviceId, this.rootDir);
    const content = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StoredTelemetryEvent)
      .slice(-limit);
  }

  async status(deviceId: string) {
    await this.ensureDirectory();
    const file = safeDeviceFile(deviceId, this.rootDir);
    const info = await stat(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    const events = await this.readEvents(deviceId).catch(() => []);
    return {
      deviceId,
      bytesUsed: info?.size ?? 0,
      maxBytesPerDevice: this.policy.maxBytesPerDevice,
      eventCount: events.length,
      maxEventCountPerDevice: this.policy.maxEventCountPerDevice,
      maxAgeDays: this.policy.maxAgeDays,
      oldestEventTime: events[0]?.timestamp ?? null,
      newestEventTime: events.at(-1)?.timestamp ?? null
    };
  }
}

export const boundedTelemetryStore = new BoundedTelemetryStore();
