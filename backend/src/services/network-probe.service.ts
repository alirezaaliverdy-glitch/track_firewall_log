import { spawn } from "node:child_process";
import { isIP, Socket } from "node:net";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export type NetworkProbeKind = "icmp" | "tcp";
export type NetworkProbeStatus = "reachable" | "unreachable" | "open" | "closed" | "timeout" | "error";

export type NetworkProbe = {
  id: string;
  kind: NetworkProbeKind;
  source: "asset" | "custom";
  target: string;
  displayName: string;
  deviceId: string | null;
  companyName: string | null;
  vendor: string | null;
  port: number | null;
  status: NetworkProbeStatus;
  reachable: boolean;
  latencyMs: number | null;
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
  packetLossPercent: number | null;
  attempts: number;
  successfulAttempts: number;
  message: string;
  createdAt: string;
};

type ProbeInput = { kind?: NetworkProbeKind; deviceId?: string; target?: string; port?: number; attempts?: number };
type ExecutionResult = Pick<NetworkProbe, "status" | "reachable" | "latencyMs" | "minLatencyMs" | "maxLatencyMs" | "packetLossPercent" | "attempts" | "successfulAttempts" | "message">;
const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function normalizeProbeTarget(raw: string) {
  const target = raw.trim().replace(/^\[|\]$/g, "").toLowerCase();
  if (!target) throw new Error("TARGET_REQUIRED");
  if (isIP(target) === 0 && !HOSTNAME_RE.test(target)) throw new Error("TARGET_INVALID");
  return target;
}

export function normalizeProbePort(value: unknown) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT_INVALID");
  return port;
}

function normalizeAttempts(value: unknown) {
  const attempts = Number(value ?? 4);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 6) throw new Error("ATTEMPTS_INVALID");
  return attempts;
}

function parsePingOutput(output: string, attempts: number) {
  const lossMatch = output.match(/(\d+(?:\.\d+)?)%\s*(?:packet )?loss/i);
  const packetLossPercent = lossMatch ? Number(lossMatch[1]) : null;
  const unixRtt = output.match(/(?:rtt|round-trip)[^=]*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i);
  const windowsAverage = output.match(/average\s*=\s*(\d+)ms/i);
  const receivedMatch = output.match(/(\d+)\s+(?:packets )?received/i) ?? output.match(/received\s*=\s*(\d+)/i);
  const successfulAttempts = receivedMatch ? Number(receivedMatch[1]) : packetLossPercent === null ? 0 : Math.max(0, Math.round(attempts * (100 - packetLossPercent) / 100));
  return {
    packetLossPercent,
    successfulAttempts,
    minLatencyMs: unixRtt ? Number(unixRtt[1]) : windowsAverage ? Number(windowsAverage[1]) : null,
    latencyMs: unixRtt ? Number(unixRtt[2]) : windowsAverage ? Number(windowsAverage[1]) : null,
    maxLatencyMs: unixRtt ? Number(unixRtt[3]) : windowsAverage ? Number(windowsAverage[1]) : null
  };
}

async function runIcmp(target: string, attempts: number) {
  const args = process.platform === "win32" ? ["-n", String(attempts), "-w", "2000", target] : ["-c", String(attempts), "-W", "2", target];
  const startedAt = Date.now();
  return await new Promise<ExecutionResult>((resolve) => {
    const child = spawn("ping", args, { shell: false, windowsHide: true });
    let output = "";
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (status: NetworkProbeStatus, message: string) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      const parsed = parsePingOutput(output, attempts);
      resolve({ status, reachable: status === "reachable", latencyMs: parsed.latencyMs ?? (status === "reachable" ? Date.now() - startedAt : null), minLatencyMs: parsed.minLatencyMs, maxLatencyMs: parsed.maxLatencyMs, packetLossPercent: parsed.packetLossPercent, attempts, successfulAttempts: parsed.successfulAttempts, message });
    };
    child.stdout.on("data", (chunk) => { output = `${output}${String(chunk)}`.slice(-16_000); });
    child.stderr.on("data", (chunk) => { output = `${output}${String(chunk)}`.slice(-16_000); });
    child.on("error", (error) => finish("error", error.message.includes("ENOENT") ? "PING_BINARY_UNAVAILABLE" : "PING_EXECUTION_FAILED"));
    child.on("close", (code) => finish(code === 0 ? "reachable" : "unreachable", code === 0 ? "ICMP_REPLY_RECEIVED" : "ICMP_NO_REPLY"));
    timeout = setTimeout(() => { if (!settled) { child.kill(); finish("timeout", "ICMP_TIMEOUT"); } }, Math.min(15_000, attempts * 2_500));
  });
}

async function runTcp(target: string, port: number) {
  const startedAt = Date.now();
  return await new Promise<ExecutionResult>((resolve) => {
    const socket = new Socket();
    let settled = false;
    const finish = (status: NetworkProbeStatus, message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ status, reachable: status === "open", latencyMs: status === "open" ? Date.now() - startedAt : null, minLatencyMs: null, maxLatencyMs: null, packetLossPercent: null, attempts: 1, successfulAttempts: status === "open" ? 1 : 0, message });
    };
    socket.setTimeout(5_000);
    socket.once("connect", () => finish("open", "TCP_PORT_OPEN"));
    socket.once("timeout", () => finish("timeout", "TCP_CONNECTION_TIMEOUT"));
    socket.once("error", (error: NodeJS.ErrnoException) => finish(error.code === "ECONNREFUSED" ? "closed" : error.code === "ETIMEDOUT" ? "timeout" : "error", error.code ?? "TCP_CONNECTION_FAILED"));
    socket.connect({ host: target, port });
  });
}

function normalizeRecord(record: { id: string; metadata: unknown; createdAt: Date }): NetworkProbe {
  const metadata = record.metadata as Omit<NetworkProbe, "id" | "createdAt">;
  return { id: record.id, ...metadata, createdAt: record.createdAt.toISOString() };
}

export async function runNetworkProbe(input: ProbeInput, user: { id: string; username: string }) {
  const kind: NetworkProbeKind = input.kind === "tcp" ? "tcp" : "icmp";
  const device = input.deviceId ? await prisma.device.findFirst({ where: { id: input.deviceId, deletedAt: null, company: { ownerId: user.id, deletedAt: null } }, include: { company: { select: { name: true } } } }) : null;
  if (input.deviceId && !device) throw new Error("DEVICE_NOT_FOUND");
  const target = normalizeProbeTarget(device?.host ?? String(input.target ?? ""));
  const attempts = kind === "icmp" ? normalizeAttempts(input.attempts) : 1;
  const port = kind === "tcp" ? normalizeProbePort(input.port ?? device?.managementPort) : null;
  const execution = kind === "icmp" ? await runIcmp(target, attempts) : await runTcp(target, port as number);
  const metadata: Omit<NetworkProbe, "id" | "createdAt"> = { kind, source: device ? "asset" : "custom", target, displayName: device?.name ?? target, deviceId: device?.id ?? null, companyName: device?.company?.name ?? null, vendor: device?.vendor ?? null, port, ...execution };
  const record = await prisma.auditLog.create({ data: { deviceId: device?.id, actor: user.username, action: "network_probe", targetType: "network_probe", targetId: target, dryRun: false, approvalStatus: "not_required", metadata: metadata as Prisma.InputJsonValue } });
  return normalizeRecord(record);
}

export async function listNetworkProbes(username: string, limit = 30) {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : 30;
  const records = await prisma.auditLog.findMany({ where: { action: "network_probe", targetType: "network_probe", actor: username }, orderBy: { createdAt: "desc" }, take: safeLimit });
  return records.map(normalizeRecord);
}

export const networkProbeInternalsForTest = { normalizeProbeTarget, normalizeProbePort, parsePingOutput };
