import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { isIP } from "node:net";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { diagnosticInternalsForTest } from "./diagnostics.service.js";

type NmapProfile = "host_discovery" | "quick_tcp";
type NmapScanResult = {
  id: string;
  createdAt: string;
  state: "completed" | "failed" | "rejected";
  [key: string]: unknown;
};

const DEFAULT_NMAP_PATHS = [
  process.env.NMAP_PATH,
  "C:\\Program Files (x86)\\Nmap\\nmap.exe",
  "C:\\Program Files\\Nmap\\nmap.exe",
  "nmap"
].filter(Boolean) as string[];

function resolveNmapPath() {
  return DEFAULT_NMAP_PATHS.find((candidate) => candidate === "nmap" || existsSync(candidate));
}

function profileArgs(profile: NmapProfile, target: string) {
  if (profile === "host_discovery") return ["-sn", "-oX", "-", target];
  if (profile === "quick_tcp") return ["-Pn", "-sT", "--top-ports", "20", "-T3", "-oX", "-", target];
  throw new Error("NMAP_PROFILE_UNSUPPORTED");
}

function classifyNmapTarget(target: string) {
  const classified = diagnosticInternalsForTest.classifyTarget(target);
  if (!classified.publicAllowed) return { allowed: false, reason: classified.reason ?? "TARGET_NOT_ALLOWED", normalizedTarget: classified.normalizedTarget, host: classified.host };
  if (classified.targetKind === "url" || classified.targetKind === "host_port" || classified.targetKind === "cidr") return { allowed: false, reason: "NMAP_TARGET_MUST_BE_PUBLIC_HOST_OR_IP", normalizedTarget: classified.normalizedTarget, host: classified.host };
  return { allowed: true, normalizedTarget: classified.normalizedTarget, host: classified.host };
}

type DnsLookup = (hostname: string, options: { all: true; verbatim: true }) => Promise<Array<{ address: string; family: number }>>;

async function resolveNmapScanAddress(policy: ReturnType<typeof classifyNmapTarget>, resolver: DnsLookup = lookup) {
  if (!policy.allowed) return { ...policy, scanHost: null, resolvedAddresses: [] as string[] };
  if (isIP(policy.host)) return { ...policy, scanHost: policy.host, resolvedAddresses: [policy.host] };
  try {
    const resolvedAddresses = [...new Set((await resolver(policy.host, { all: true, verbatim: true })).map(({ address }) => address))];
    if (!resolvedAddresses.length) return { ...policy, allowed: false, reason: "DNS_NO_ADDRESS", scanHost: null, resolvedAddresses };
    const unsafe = resolvedAddresses.find((address) => !diagnosticInternalsForTest.classifyHost(address).publicAllowed);
    if (unsafe) return { ...policy, allowed: false, reason: "DNS_PRIVATE_OR_RESERVED_TARGET_BLOCKED", scanHost: null, resolvedAddresses: [] as string[] };
    return { ...policy, scanHost: resolvedAddresses[0], resolvedAddresses };
  } catch {
    return { ...policy, allowed: false, reason: "DNS_RESOLUTION_FAILED", scanHost: null, resolvedAddresses: [] as string[] };
  }
}

function parseXml(xml: string) {
  const hosts = [...xml.matchAll(/<host\b[\s\S]*?<\/host>/g)].map((match) => {
    const block = match[0];
    const state = block.match(/<status[^>]*state="([^"]+)"/)?.[1] ?? "unknown";
    const addresses = [...block.matchAll(/<address[^>]*addr="([^"]+)"[^>]*addrtype="([^"]+)"/g)].map((item) => ({ address: item[1], type: item[2] }));
    const hostnames = [...block.matchAll(/<hostname[^>]*name="([^"]+)"/g)].map((item) => item[1]);
    const ports = [...block.matchAll(/<port[^>]*protocol="([^"]+)"[^>]*portid="([^"]+)"[\s\S]*?<\/port>/g)].map((item) => {
      const portBlock = item[0];
      return {
        protocol: item[1],
        port: Number(item[2]),
        state: portBlock.match(/<state[^>]*state="([^"]+)"/)?.[1] ?? "unknown",
        service: portBlock.match(/<service[^>]*name="([^"]+)"/)?.[1] ?? null,
        product: portBlock.match(/<service[^>]*product="([^"]+)"/)?.[1] ?? null,
        version: portBlock.match(/<service[^>]*version="([^"]+)"/)?.[1] ?? null
      };
    });
    return { state, addresses, hostnames, ports };
  });
  const elapsed = Number(xml.match(/<finished[^>]*elapsed="([^"]+)"/)?.[1] ?? 0);
  return { hosts, elapsedSeconds: elapsed, rawXmlStored: true };
}

async function persistNmap(metadata: Record<string, unknown>, targetId: string) {
  const jsonMetadata = JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.auditLog.create({
        data: {
          action: "nmap_scan",
          targetType: "diagnostic_nmap",
          targetId,
          dryRun: false,
          approvalStatus: "not_required",
          metadata: jsonMetadata
        }
      });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function runNmapScan(input: { target: string; profile: NmapProfile }): Promise<NmapScanResult> {
  const policy = await resolveNmapScanAddress(classifyNmapTarget(input.target));
  if (!policy.allowed) {
    const record = await persistNmap({
      state: "rejected",
      target: input.target,
      normalizedTarget: policy.normalizedTarget,
      profile: input.profile,
      workerInvoked: false,
      policyDecision: "rejected",
      reason: policy.reason
    }, policy.normalizedTarget || input.target || "invalid");
    return { id: record.id, createdAt: record.createdAt.toISOString(), ...(record.metadata as Record<string, unknown>) } as NmapScanResult;
  }
  const nmapPath = resolveNmapPath();
  if (!nmapPath) throw new Error("NMAP_BINARY_NOT_FOUND");
  const args = profileArgs(input.profile, policy.scanHost!);
  const startedAt = Date.now();
  const result = await new Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }>((resolve, reject) => {
    const child = spawn(nmapPath, args, { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ stdout, stderr, exitCode: null, timedOut: true });
    }, input.profile === "quick_tcp" ? 120000 : 60000);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, timedOut: false });
    });
  });
  const parsed = parseXml(result.stdout);
  const metadata = {
    state: result.exitCode === 0 && !result.timedOut ? "completed" : "failed",
    target: input.target,
    normalizedTarget: policy.normalizedTarget,
    resolvedAddress: policy.scanHost,
    profile: input.profile,
    worker: "isolated-nmap-worker",
    workerInvoked: true,
    policyDecision: "allowed",
    executable: nmapPath,
    args,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: Date.now() - startedAt,
    stderr: result.stderr.slice(0, 1000),
    result: parsed
  };
  const record = await persistNmap(metadata, policy.normalizedTarget);
  return { id: record.id, createdAt: record.createdAt.toISOString(), ...(record.metadata as Record<string, unknown>) } as NmapScanResult;
}

export async function listNmapScans(limit = 20) {
  const records = await prisma.auditLog.findMany({ where: { action: "nmap_scan", targetType: "diagnostic_nmap" }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 100) });
  return records.map((record) => ({ id: record.id, createdAt: record.createdAt.toISOString(), ...(record.metadata as Record<string, unknown>) }));
}

export const nmapInternalsForTest = { classifyNmapTarget, resolveNmapScanAddress, profileArgs, parseXml, resolveNmapPath, isIp: isIP };
