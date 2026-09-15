import crypto from "node:crypto";
import { EventBatchStatus, EventSourceStatus, EventSourceType, type Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { scheduleSecurityDetection } from "./security-detection-dispatcher.service.js";
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
  ruleName?: string;
  interfaceIn?: string;
  interfaceOut?: string;
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

function numberedField(value: string, key: string) {
  const match = value.match(new RegExp(`\\b${key}=([0-9]{1,5})\\b`, "i"));
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : undefined;
}

function parseFortiGateFields(raw: string) {
  const fields: Record<string, string> = {};
  const pattern = /(?:^|\s)([a-zA-Z][\w-]*)=("(?:\\.|[^"])*"|[^\s]*)/g;
  for (const match of raw.matchAll(pattern)) {
    const value = match[2].startsWith('"')
      ? match[2].slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
      : match[2];
    fields[match[1].toLowerCase()] = value;
  }
  return fields;
}

function validPort(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : undefined;
}

function fortiSeverity(level: string | undefined): NormalizedCollectedEvent["severity"] {
  const value = String(level ?? "").toLowerCase();
  if (/emergency|alert|critical/.test(value)) return "critical";
  if (/error|warning/.test(value)) return "high";
  if (/notice/.test(value)) return "medium";
  return "low";
}

function fortiProtocol(value: string | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "6") return "tcp";
  if (normalized === "17") return "udp";
  if (normalized === "1" || normalized === "58") return "icmp";
  return normalized || undefined;
}

function normalizeFortiGateLine(deviceId: string, line: CollectedLogLine): NormalizedCollectedEvent {
  const raw = line.raw;
  const fields = parseFortiGateFields(raw);
  const searchable = [fields.type, fields.subtype, fields.eventtype, fields.logdesc, fields.msg, fields.reason, fields.attack, fields.virus, fields.botnetdomain, fields.action, fields.status]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const rawAction = String(fields.action ?? fields.status ?? "unknown").toLowerCase();
  let action = rawAction;
  let eventType = `fortigate_${fields.subtype || fields.type || "log"}`.replace(/[^a-z0-9_]+/g, "_");
  let severity = fortiSeverity(fields.level ?? fields.severity);

  const authFailure = /login fail|login failed|authentication fail|invalid credential|status=fail/.test(`${searchable} ${raw.toLowerCase()}`);
  const vpnFailure = /ssl.?vpn|ipsec|vpn/.test(searchable) && /fail|error|denied|invalid/.test(searchable);
  const ipsAttack = fields.subtype === "ips" || fields.type === "ips" || Boolean(fields.attack) || /ips signature|intrusion/.test(searchable);
  const dosAttack = fields.subtype === "anomaly" || fields.eventtype === "anomaly" || /dos attack|flood|anomaly/.test(searchable);
  const malware = /virus|malware|trojan|ransomware/.test(searchable) && /detected|blocked|infected|quarantine/.test(searchable);
  const botnet = /botnet|command.?and.?control|\bc2\b/.test(searchable);
  const webAttack = fields.subtype === "waf" || /web application attack|sql injection|cross.?site scripting|path traversal/.test(searchable);

  if (vpnFailure) {
    eventType = "fortigate_vpn_auth_failure";
    action = "vpn_auth_failed";
    severity = severity === "low" ? "high" : severity;
  } else if (authFailure && /admin|administrator|ui|ssh|https|api/.test(searchable)) {
    eventType = "fortigate_admin_auth_failure";
    action = "admin_auth_failed";
    severity = severity === "low" ? "high" : severity;
  } else if (dosAttack) {
    eventType = "fortigate_dos_attack";
    action = /block|deny|drop|reset/.test(rawAction) ? "blocked" : "threat_detected";
    severity = severity === "low" || severity === "medium" ? "high" : severity;
  } else if (malware) {
    eventType = "fortigate_malware_detected";
    action = /block|deny|drop|quarantine/.test(rawAction) ? "blocked" : "threat_detected";
    severity = "critical";
  } else if (botnet) {
    eventType = "fortigate_botnet_detected";
    action = /block|deny|drop/.test(rawAction) ? "blocked" : "threat_detected";
    severity = "critical";
  } else if (webAttack) {
    eventType = "fortigate_web_attack";
    action = /block|deny|drop|reset/.test(rawAction) ? "blocked" : "threat_detected";
    severity = severity === "low" || severity === "medium" ? "high" : severity;
  } else if (ipsAttack) {
    eventType = "fortigate_ips_attack";
    action = /block|deny|drop|reset/.test(rawAction) ? "blocked" : "threat_detected";
    severity = severity === "low" || severity === "medium" ? "high" : severity;
  } else if (/deny|blocked|drop|reset/.test(rawAction)) {
    eventType = fields.subtype === "local" || fields.eventtype === "local" ? "fortigate_local_in_denied" : "fortigate_traffic_denied";
    action = "denied";
    severity = severity === "low" ? "medium" : severity;
  }

  const srcIp = fields.srcip ?? fields.remip ?? fields.clientip ?? fields.src_ip;
  const dstIp = fields.dstip ?? fields.dst_ip;
  const username = fields.user ?? fields.unauthuser ?? fields.xauthuser;
  const event: NormalizedCollectedEvent = {
    deviceId,
    sourceType: line.sourceType,
    vendor: "fortigate",
    eventType,
    action,
    severity,
    timestamp: line.timestamp,
    srcIp,
    dstIp,
    srcPort: validPort(fields.srcport),
    dstPort: validPort(fields.dstport),
    protocol: fortiProtocol(fields.proto ?? fields.protocol),
    username,
    ruleName: fields.attack ?? fields.logdesc ?? fields.policyname,
    interfaceIn: fields.srcintf,
    interfaceOut: fields.dstintf,
    message: fields.msg ?? fields.logdesc ?? raw,
    rawSnippet: snippet(raw),
    evidenceJson: {
      command: line.command,
      parser: "fortios-kv-v1",
      logId: fields.logid,
      type: fields.type,
      subtype: fields.subtype,
      eventType: fields.eventtype,
      action: rawAction,
      attack: fields.attack,
      attackId: fields.attackid,
      policyId: fields.policyid,
      sourceCountry: fields.srccountry,
      destinationCountry: fields.dstcountry,
      virtualDomain: fields.vd
    },
    dedupeKey: ""
  };
  event.dedupeKey = dedupe({ deviceId, sourceType: event.sourceType, action, srcIp, username, dstPort: event.dstPort, timestamp: line.timestamp, raw });
  return event;
}

function userFromAuth(line: string) {
  return line.match(/invalid user\s+([^\s]+)/i)?.[1] ??
    line.match(/for\s+([^\s]+)\s+from/i)?.[1];
}

function dedupe(input: {
  deviceId: string;
  sourceType: string;
  action: string;
  srcIp?: string;
  username?: string;
  dstPort?: number;
  timestamp?: Date;
  raw: string;
}) {
  const stable = [
    input.deviceId,
    input.sourceType,
    input.timestamp?.toISOString() ?? "timestamp-unavailable",
    input.raw.trim()
  ].join("|");
  return crypto.createHash("sha256").update(stable).digest("hex");
}

export function normalizeCollectedLine(deviceId: string, line: CollectedLogLine, vendor = "linux"): NormalizedCollectedEvent {
  if (/fortigate|fortinet/i.test(vendor) || line.sourceType === "fortigate_log") return normalizeFortiGateLine(deviceId, line);
  const raw = line.raw;
  const lower = raw.toLowerCase();
  let action = "unknown";
  let severity: NormalizedCollectedEvent["severity"] = "low";
  let srcIp = ip(raw);
  const username = userFromAuth(raw);
  let srcPort: number | undefined;
  let dstPort: number | undefined;
  let eventDestination: string | undefined;
  let protocol: string | undefined;

  if (/timeout, client not responding|disconnected from|session (?:opened|closed)/i.test(raw)) {
    action = "session_lifecycle";
    severity = "low";
  } else if (/(?:\.env|\.git\/config|wp-login\.php|\/etc\/passwd|\.\.\/|cmd\.php|shell\.php|phpmyadmin)/i.test(raw)) {
    action = "web_probe";
    severity = "medium";
    dstPort = numberedField(raw, "DPT") ?? port(raw);
  } else if (lower.includes("failed password") || lower.includes("authentication failure")) {
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
    srcPort = numberedField(raw, "SPT");
    dstPort = numberedField(raw, "DPT") ?? port(raw);
    const parsedDestination = raw.match(/\bDST=((?:\d{1,3}\.){3}\d{1,3})\b/)?.[1];
    if (parsedDestination) eventDestination = parsedDestination;
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
  } else if (/login failure|login failed|authentication failed|aaa.*fail|webgui.*fail/.test(lower)) {
    action = "auth_failed";
    severity = "high";
  } else if (/configured from|configuration.*changed|policy.*changed|firewall.*changed|nat.*changed|admin.*(?:added|deleted|changed)/.test(lower)) {
    action = "configuration_change";
    severity = "high";
  } else if (/(ips|utm|antivirus|virus|botnet|malware).*(critical|high|blocked|detected)/.test(lower)) {
    action = "threat_detected";
    severity = "critical";
  } else if (/(openvpn|ssl.?vpn|ipsec|ike|l2tp|wireguard|anyconnect).*(auth|handshake|negotiat).*(fail|error|denied)/.test(lower)) {
    action = "vpn_auth_failed";
    severity = "high";
  }

  const event: NormalizedCollectedEvent = {
    deviceId,
    sourceType: line.sourceType,
    vendor,
    eventType: action === "web_probe" ? `${vendor}_web_probe` : action === "port_blocked" ? `${vendor}_firewall_denied` : `${vendor}_log`,
    action,
    severity,
    timestamp: line.timestamp,
    srcIp,
    srcPort,
    dstIp: eventDestination,
    dstPort,
    protocol,
    username,
    message: raw,
    rawSnippet: snippet(raw),
    evidenceJson: {
      command: line.command,
      hostname: line.hostname,
      parser: "collector-normalizer-v2"
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
    timestamp: line.timestamp,
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
      name: `${result.collectorName} ${result.deviceId}`,
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
    const event = normalizeCollectedLine(result.deviceId, line, result.vendor);
    const existing = await prisma.securityEvent.findUnique({ where: { dedupeKey: event.dedupeKey } });
    if (existing) {
      const storedNormalized = existing.normalizedJson && typeof existing.normalizedJson === "object" && !Array.isArray(existing.normalizedJson) ? existing.normalizedJson as Record<string, unknown> : {};
      const storedEvidence = storedNormalized.evidenceJson && typeof storedNormalized.evidenceJson === "object" && !Array.isArray(storedNormalized.evidenceJson) ? storedNormalized.evidenceJson as Record<string, unknown> : {};
      const requiresFortiUpgrade = event.vendor === "fortigate" && (storedEvidence.parser !== "fortios-kv-v1" || existing.eventType !== event.eventType || existing.action !== event.action);
      if (requiresFortiUpgrade) {
        await prisma.securityEvent.update({
          where: { id: existing.id },
          data: {
            eventType: event.eventType,
            action: event.action,
            severity: event.severity,
            srcIp: event.srcIp,
            srcPort: event.srcPort,
            dstIp: event.dstIp,
            dstPort: event.dstPort,
            protocol: event.protocol,
            username: event.username,
            ruleName: event.ruleName,
            interfaceIn: event.interfaceIn,
            interfaceOut: event.interfaceOut,
            normalizedJson: toJson(event),
            evidenceJson: toJson(event.evidenceJson)
          }
        });
      }
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
          ruleName: event.ruleName,
          interfaceIn: event.interfaceIn,
          interfaceOut: event.interfaceOut,
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

  const detection = await scheduleSecurityDetection({ deviceId: result.deviceId });
  return { batchId: batch.id, inserted, updated, warnings: result.warnings, detection };
}

async function findOrCreateSourceId(deviceId: string) {
  const existing = await prisma.eventSource.findFirst({
    where: { deviceId, type: EventSourceType.agent },
    select: { id: true }
  });
  if (existing) return existing.id;
  const created = await prisma.eventSource.create({
    data: {
      name: `Device log collector ${deviceId}`,
      type: EventSourceType.agent,
      deviceId,
      status: EventSourceStatus.active,
      lastSeenAt: new Date()
    },
    select: { id: true }
  });
  return created.id;
}
