import { BlockList, isIP } from "node:net";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

type CheckKind = "dns" | "http" | "ping" | "tcp";
type TargetKind = "domain" | "ipv4" | "ipv6" | "url" | "host_port" | "cidr";

type DiagnosticSession = {
  id: string;
  state: "completed" | "failed";
  target: string;
  normalizedTarget: string;
  targetKind: TargetKind;
  provider: "check-host";
  providerInvoked: boolean;
  checks: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
  evidence: Record<string, unknown>;
  createdAt: string;
};

const CHECK_HOST_BASE = "https://check-host.net";
const PUBLIC_HOST_RE = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;
const blockedAddresses = new BlockList();

for (const [network, prefix, type] of [
  ["0.0.0.0", 8, "ipv4"], ["10.0.0.0", 8, "ipv4"], ["100.64.0.0", 10, "ipv4"],
  ["127.0.0.0", 8, "ipv4"], ["169.254.0.0", 16, "ipv4"], ["172.16.0.0", 12, "ipv4"],
  ["192.0.0.0", 24, "ipv4"], ["192.0.2.0", 24, "ipv4"], ["192.168.0.0", 16, "ipv4"],
  ["198.18.0.0", 15, "ipv4"], ["198.51.100.0", 24, "ipv4"], ["203.0.113.0", 24, "ipv4"],
  ["224.0.0.0", 4, "ipv4"], ["240.0.0.0", 4, "ipv4"],
  ["::", 128, "ipv6"], ["::1", 128, "ipv6"],
  ["64:ff9b::", 96, "ipv6"], ["100::", 64, "ipv6"], ["2001:db8::", 32, "ipv6"],
  ["fc00::", 7, "ipv6"], ["fe80::", 10, "ipv6"], ["ff00::", 8, "ipv6"]
] as const) blockedAddresses.addSubnet(network, prefix, type);

function classifyTarget(raw: string): { target: string; normalizedTarget: string; targetKind: TargetKind; host: string; port?: number; publicAllowed: boolean; reason?: string } {
  const target = raw.trim();
  if (!target) return { target, normalizedTarget: target, targetKind: "domain", host: target, publicAllowed: false, reason: "TARGET_REQUIRED" };
  if (/\/\d{1,3}$/.test(target)) return { target, normalizedTarget: target, targetKind: "cidr", host: target, publicAllowed: false, reason: "CIDR_REQUIRES_AUTHORIZED_SCOPE" };
  let parsed: URL | null = null;
  try {
    parsed = target.includes("://") ? new URL(target) : null;
  } catch {
    return { target, normalizedTarget: target, targetKind: "url", host: target, publicAllowed: false, reason: "URL_INVALID" };
  }
  if (parsed) {
    if (!["http:", "https:"].includes(parsed.protocol)) return { target, normalizedTarget: target, targetKind: "url", host: parsed.hostname, publicAllowed: false, reason: "URL_SCHEME_BLOCKED" };
    if (parsed.username || parsed.password) return { target, normalizedTarget: target, targetKind: "url", host: parsed.hostname, publicAllowed: false, reason: "URL_USERINFO_BLOCKED" };
    const hostCheck = classifyHost(parsed.hostname);
    return { target, normalizedTarget: parsed.toString(), targetKind: "url", host: parsed.hostname, port: parsed.port ? Number(parsed.port) : undefined, publicAllowed: hostCheck.publicAllowed, reason: hostCheck.reason };
  }
  const hostPort = target.match(/^([a-z0-9.-]+):(\d{1,5})$/i);
  if (hostPort) {
    const port = Number(hostPort[2]);
    const hostCheck = classifyHost(hostPort[1]);
    return { target, normalizedTarget: `${hostPort[1].toLowerCase()}:${port}`, targetKind: "host_port", host: hostPort[1], port, publicAllowed: port >= 1 && port <= 65535 && hostCheck.publicAllowed, reason: port < 1 || port > 65535 ? "PORT_INVALID" : hostCheck.reason };
  }
  const hostCheck = classifyHost(target);
  return { target, normalizedTarget: target.toLowerCase(), targetKind: hostCheck.targetKind, host: target, publicAllowed: hostCheck.publicAllowed, reason: hostCheck.reason };
}

function classifyHost(host: string): { targetKind: "domain" | "ipv4" | "ipv6"; publicAllowed: boolean; reason?: string } {
  const normalizedHost = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  const ipVersion = isIP(normalizedHost);
  if (ipVersion === 4) {
    const blocked = blockedAddresses.check(normalizedHost, "ipv4");
    return { targetKind: "ipv4", publicAllowed: !blocked, reason: blocked ? "PRIVATE_OR_RESERVED_TARGET_BLOCKED" : undefined };
  }
  if (ipVersion === 6) {
    const mappedTail = normalizedHost.toLowerCase().match(/^::ffff:(.+)$/)?.[1];
    if (mappedTail) {
      const dotted = isIP(mappedTail) === 4
        ? mappedTail
        : mappedTail.split(":").length === 2
          ? mappedTail.split(":").flatMap((part) => {
              const value = Number.parseInt(part, 16);
              return [value >> 8, value & 255];
            }).join(".")
          : null;
      if (dotted && isIP(dotted) === 4) {
        const blocked = blockedAddresses.check(dotted, "ipv4");
        return { targetKind: "ipv6", publicAllowed: !blocked, reason: blocked ? "PRIVATE_OR_RESERVED_TARGET_BLOCKED" : undefined };
      }
      return { targetKind: "ipv6", publicAllowed: false, reason: "PRIVATE_OR_RESERVED_TARGET_BLOCKED" };
    }
    const blocked = blockedAddresses.check(normalizedHost, "ipv6");
    return { targetKind: "ipv6", publicAllowed: !blocked, reason: blocked ? "PRIVATE_OR_RESERVED_TARGET_BLOCKED" : undefined };
  }
  if (!PUBLIC_HOST_RE.test(host)) return { targetKind: "domain", publicAllowed: false, reason: "DOMAIN_INVALID" };
  return { targetKind: "domain", publicAllowed: true };
}

function checksForTarget(input: ReturnType<typeof classifyTarget>): CheckKind[] {
  if (input.targetKind === "url") return ["dns", "http", "tcp"];
  if (input.targetKind === "host_port") return ["dns", "tcp"];
  if (input.targetKind === "ipv4" || input.targetKind === "ipv6") return ["ping"];
  return ["dns", "http", "ping", "tcp"];
}

async function callCheckHost(kind: CheckKind, input: ReturnType<typeof classifyTarget>) {
  const host = kind === "http" && input.targetKind !== "url" ? `https://${input.host}` : kind === "tcp" ? `${input.host}:${input.port ?? 443}` : input.host;
  const startUrl = `${CHECK_HOST_BASE}/check-${kind}?host=${encodeURIComponent(host)}&max_nodes=3`;
  const startedAt = Date.now();
  const start = await fetch(startUrl, { headers: { Accept: "application/json" } });
  const startBody = await start.json() as { ok?: number; request_id?: string; nodes?: Record<string, unknown>; permanent_link?: string };
  if (!start.ok || startBody.ok !== 1 || !startBody.request_id) throw new Error(`CHECK_HOST_${kind.toUpperCase()}_START_FAILED`);
  let resultBody: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 750 : 1200));
    const result = await fetch(`${CHECK_HOST_BASE}/check-result/${startBody.request_id}`, { headers: { Accept: "application/json" } });
    resultBody = await result.json();
    if (Object.values(resultBody as Record<string, unknown>).some((value) => value !== null)) break;
  }
  return {
    kind,
    providerInvoked: true,
    providerRequestId: startBody.request_id,
    source: "Check-Host external nodes",
    permanentLink: startBody.permanent_link,
    nodes: startBody.nodes ?? {},
    result: resultBody,
    durationMs: Date.now() - startedAt
  };
}

function normalizeSession(record: { id: string; metadata: unknown; createdAt: Date }): DiagnosticSession {
  const metadata = record.metadata as Omit<DiagnosticSession, "id" | "createdAt">;
  return { id: record.id, ...metadata, createdAt: record.createdAt.toISOString() };
}

export async function runDiagnosticSession(input: { target: string; checks?: CheckKind[] }) {
  const classified = classifyTarget(input.target);
  if (!classified.publicAllowed) {
    const metadata = {
      state: "failed" as const,
      target: classified.target,
      normalizedTarget: classified.normalizedTarget,
      targetKind: classified.targetKind,
      provider: "check-host" as const,
      providerInvoked: false,
      checks: [],
      summary: { blocked: true, reason: classified.reason },
      evidence: { policyDecision: "rejected", reason: classified.reason }
    };
    const record = await prisma.auditLog.create({ data: { action: "diagnostic_session", targetType: "diagnostic_session", targetId: classified.normalizedTarget || "invalid", dryRun: false, approvalStatus: "not_required", metadata: metadata as Prisma.InputJsonValue } });
    return normalizeSession({ id: record.id, metadata: record.metadata, createdAt: record.createdAt });
  }
  const selected = (input.checks?.length ? input.checks : checksForTarget(classified)).filter((kind, index, array) => array.indexOf(kind) === index);
  const checks = [];
  for (const kind of selected) checks.push(await callCheckHost(kind, classified));
  const metadata = {
    state: "completed" as const,
    target: classified.target,
    normalizedTarget: classified.normalizedTarget,
    targetKind: classified.targetKind,
    provider: "check-host" as const,
    providerInvoked: checks.some((check) => check.providerInvoked),
    checks,
    summary: { checkCount: checks.length, providerRequestIds: checks.map((check) => check.providerRequestId), source: "Check-Host external nodes" },
    evidence: { policyDecision: "allowed", provider: "check-host", source: "Check-Host external nodes" }
  };
  const record = await prisma.auditLog.create({ data: { action: "diagnostic_session", targetType: "diagnostic_session", targetId: classified.normalizedTarget, dryRun: false, approvalStatus: "not_required", metadata: metadata as Prisma.InputJsonValue } });
  return normalizeSession({ id: record.id, metadata: record.metadata, createdAt: record.createdAt });
}

export async function listDiagnosticSessions(limit = 20) {
  const records = await prisma.auditLog.findMany({ where: { action: "diagnostic_session", targetType: "diagnostic_session" }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 100) });
  return records.map((record) => normalizeSession({ id: record.id, metadata: record.metadata, createdAt: record.createdAt }));
}

export async function getDiagnosticSession(id: string) {
  const record = await prisma.auditLog.findUnique({ where: { id } });
  if (!record || record.action !== "diagnostic_session" || record.targetType !== "diagnostic_session") return null;
  return normalizeSession({ id: record.id, metadata: record.metadata, createdAt: record.createdAt });
}

export const diagnosticInternalsForTest = { classifyTarget, classifyHost };
