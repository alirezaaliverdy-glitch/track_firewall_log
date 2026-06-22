import crypto from "node:crypto";
import { EventBatchStatus, EventSourceStatus, EventSourceType, type Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import type { CollectedLogLine, CollectorRunResult } from "../collectors/types.js";

export type NormalizedCollectedEvent = {
  deviceId: string;
  sourceType: string;
  vendor: string;
  eventType: string;
  action: string;
  severity: "low" | "medium" | "high" | "critical";
  timestamp?: Date;
  srcIp?: string;
  dstIp?: string;
  srcPort?: number;
  dstPort?: number;
  protocol?: string;
  username?: string;
  message: string;
  rawSnippet: string;
  evidenceJson: Record<string, unknown>;
  dedupeKey: string;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function snippet(value: string) {
  return value.slice(0, env.eventMaxRawSnippetChars);
}

function ip(value: string) {
  return value.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0];
}

function port(value: string) {
  const match = value.match(/\b(?:port|DPT=|SPT=)\s*=?\s*(\d{1,5})\b/i);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : undefined;
}

function userFromAuth(line: string) {
  return line.match(/invalid user\s+([^\s]+)/i)?.[1] ??
    line.match(/for\s+([^\s]+)\s+from/i)?.[1];
}

function minuteBucket(date: Date) {
  const bucketMs = env.eventDedupWindowMinutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / bucketMs) * bucketMs).toISOString();
}

function dedupe(input: {
  deviceId: string;
  sourceType: string;
  action: string;
  srcIp?: string;
  username?: string;
  dstPort?: number;
  timestamp: Date;
  raw: string;
}) {
  const stable = [
    input.deviceId,
    input.sourceType,
    input.action,
    input.srcIp ?? "",
    input.username ?? "",
    input.dstPort ?? "",
    minuteBucket(input.timestamp),
    input.action === "unknown" ? input.raw.slice(0, 160) : ""
  ].join("|");
  return crypto.createHash("sha256").update(stable).digest("hex");
}

export function normalizeCollectedLine(deviceId: string, line: CollectedLogLine): NormalizedCollectedEvent {
  const raw = line.raw;
  const lower = raw.toLowerCase();
  const timestamp = line.timestamp ?? new Date();
  let action = "unknown";
  let severity: NormalizedCollectedEvent["severity"] = "low";
  let srcIp = ip(raw);
  let username = userFromAuth(raw);
  let srcPort: number | undefined;
  let dstPort: number | undefined;
  let protocol: string | undefined;

  if (lower.includes("failed password") || lower.includes("authentication failure")) {
    action = "auth_failed";
    severity = lower.includes("invalid user root") || lower.includes("for root") ? "high" : "medium";
    srcPort = port(raw);
  } else if (lower.includes("accepted password") || lower.includes("accepted publickey")) {
    action = "auth_success";
    severity = "low";
    srcPort = port(raw);
  } else if (lower.includes("sudo") && (lower.includes("authentication failure") || lower.includes("incorrect password"))) {
    action = "sudo_failed";
    severity = "medium";
  } else if (line.sourceType === "linux_ufw" && (lower.includes("block") || lower.includes("deny") || lower.includes("[ufw block]"))) {
    action = "port_blocked";
    severity = "medium";
    srcIp = raw.match(/\bSRC=((?:\d{1,3}\.){3}\d{1,3})\b/)?.[1] ?? srcIp;
    dstPort = port(raw);
    protocol = raw.match(/\bPROTO=([A-Z0-9]+)\b/i)?.[1]?.toLowerCase();
  } else if (line.sourceType === "linux_ufw" && lower.includes("status")) {
    action = "ufw_status";
    severity = "low";
  } else if (line.sourceType === "linux_kernel") {
    action = lower.includes("ufw") || lower.includes("firewall") ? "kernel_firewall" : "unknown";
    severity = action === "kernel_firewall" ? "low" : "low";
  } else if (lower.includes("invalid user root")) {
    action = "suspicious_activity";
    severity = "high";
  }

  const event = {
    deviceId,
    sourceType: line.sourceType,
    vendor: "linux",
    eventType: line.sourceType,
    action,
    severity,
    timestamp,
    srcIp,
    srcPort,
    dstPort,
    protocol,
    username,
    message: raw,
    rawSnippet: snippet(raw),
    evidenceJson: {
      command: line.command,
      hostname: line.hostname,
      parser: "linux-ssh-log-v1"
    },
    dedupeKey: ""
  };

  event.dedupeKey = dedupe({
    deviceId,
    sourceType: event.sourceType,
    action,
    srcIp,
    username,
    dstPort,
    timestamp,
    raw
  });
  return event;
}

export async function ingestCollectorRun(result: CollectorRunResult) {
  const source = await prisma.eventSource.upsert({
    where: {
      // Existing schema has no natural unique key; use create path through a lookup below.
      id: await findOrCreateSourceId(result.deviceId)
    },
    update: { status: EventSourceStatus.active, lastSeenAt: new Date() },
    create: {
      name: `Linux collector ${result.deviceId}`,
      type: EventSourceType.agent,
      deviceId: result.deviceId,
      status: EventSourceStatus.active,
      lastSeenAt: new Date()
    }
  });

  const batch = await prisma.eventBatch.create({
    data: {
      sourceId: source.id,
      deviceId: result.deviceId,
      status: EventBatchStatus.processing,
      totalEvents: result.lines.length,
      parsedEvents: 0,
      failedEvents: 0
    }
  });

  let inserted = 0;
  let updated = 0;
  for (const line of result.lines) {
    const event = normalizeCollectedLine(result.deviceId, line);
    const existing = await prisma.securityEvent.findUnique({ where: { dedupeKey: event.dedupeKey } });
    if (existing) {
      await prisma.securityEvent.update({
        where: { id: existing.id },
        data: {
          count: { increment: 1 },
          lastSeen: event.timestamp,
          receivedAt: new Date(),
          severity: existing.severity === "high" || existing.severity === "critical" ? existing.severity : event.severity,
          batchId: batch.id
        }
      });
      updated += 1;
    } else {
      await prisma.securityEvent.create({
        data: {
          deviceId: result.deviceId,
          sourceId: source.id,
          batchId: batch.id,
          timestamp: event.timestamp,
          receivedAt: new Date(),
          sourceType: event.sourceType,
          vendor: event.vendor,
          eventType: event.eventType,
          action: event.action,
          severity: event.severity,
          srcIp: event.srcIp,
          srcPort: event.srcPort,
          dstIp: event.dstIp,
          dstPort: event.dstPort,
          protocol: event.protocol,
          username: event.username,
          rawMessage: event.rawSnippet,
          rawSnippet: event.rawSnippet,
          normalizedJson: toJson(event),
          evidenceJson: toJson(event.evidenceJson),
          dedupeKey: event.dedupeKey,
          firstSeen: event.timestamp,
          lastSeen: event.timestamp,
          count: 1,
          tags: toJson({ collector: true, warnings: result.warnings.slice(0, 20) })
        }
      });
      inserted += 1;
    }
  }

  await prisma.eventBatch.update({
    where: { id: batch.id },
    data: {
      status: EventBatchStatus.completed,
      parsedEvents: inserted + updated,
      failedEvents: 0,
      completedAt: new Date()
    }
  });

  return { batchId: batch.id, inserted, updated, warnings: result.warnings };
}

async function findOrCreateSourceId(deviceId: string) {
  const existing = await prisma.eventSource.findFirst({
    where: { deviceId, type: EventSourceType.agent, name: { startsWith: "Linux collector" } },
    select: { id: true }
  });
  if (existing) return existing.id;
  const created = await prisma.eventSource.create({
    data: {
      name: `Linux collector ${deviceId}`,
      type: EventSourceType.agent,
      deviceId,
      status: EventSourceStatus.active,
      lastSeenAt: new Date()
    },
    select: { id: true }
  });
  return created.id;
}
