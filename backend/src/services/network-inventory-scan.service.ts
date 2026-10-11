import { spawn } from "node:child_process";
import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import type { Device, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { runLinuxTelemetryCommands } from "../connectors/linux-ssh.connector.js";
import { collectMikroTikNetworkNeighbors } from "../connectors/mikrotik-ssh.connector.js";
import { collectMikroTikRestNetworkNeighbors } from "../connectors/mikrotik-rest.connector.js";
import { collectFortiGateNetworkNeighbors } from "../connectors/fortigate-ssh.connector.js";
import { collectEsxiNetworkNeighbors } from "../connectors/esxi-ssh.connector.js";
import { ciscoIosXeSshConnector } from "../connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";

export type NetworkInventoryProfile = "discovery" | "deep";
export type NetworkInventoryMode = "vendor" | "range";
export type NetworkInventoryPort = { protocol: "tcp"; port: number; state: string; service: string | null; product: string | null; version: string | null };
export type NetworkInventoryHost = {
  key: string;
  ip: string | null;
  mac: string | null;
  manufacturer: string | null;
  hostname: string | null;
  state: "up" | "vendor_seen" | "down";
  latencyMs: number | null;
  ports: NetworkInventoryPort[];
  web: string | null;
  deviceHint: string | null;
  interfaceName: string | null;
  vlan: string | null;
  evidence: string[];
  confidence: "high" | "medium" | "low";
};

export type NetworkInventoryScan = {
  id: string;
  state: "completed" | "partial" | "failed";
  createdAt: string;
  device: { id: string; name: string; host: string; vendor: string; type: string };
  mode: NetworkInventoryMode;
  cidr: string | null;
  profile: NetworkInventoryProfile;
  ports: number[];
  durationMs: number;
  summary: { addressCount: number; up: number; vendorSeen: number; down: number; macKnown: number; hostnameKnown: number; openPorts: number };
  hosts: NetworkInventoryHost[];
  coverage: { activeProbe: "available" | "failed" | "skipped"; vendorNeighbors: "available" | "partial" | "unsupported" | "failed"; hostnameResolution: "available" | "partial" | "unavailable"; macScope: string };
  warnings: string[];
};

type AuthUser = { id: string; username: string; scopeOwnerId?: string | null };
type VendorNeighbor = Pick<NetworkInventoryHost, "ip" | "mac" | "hostname" | "interfaceName" | "vlan"> & { evidence: string[] };
type ParsedNmapHost = { ip: string; mac: string | null; manufacturer: string | null; hostname: string | null; latencyMs: number | null; ports: NetworkInventoryPort[] };

const DEFAULT_PORTS = [22, 53, 80, 443, 445, 3389, 8291, 8443];
const MAX_ADDRESSES = 256;
const MAX_PORTS = 24;
const MAX_VENDOR_ROWS = 2_048;
const MAX_HOSTNAME_LOOKUPS = 512;
const IPV4_RE = /(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])/;
const MAC_RE = /(?<![0-9a-f])(?:[0-9a-f]{2}(?:[:-][0-9a-f]{2}){5}|[0-9a-f]{4}(?:\.[0-9a-f]{4}){2})(?![0-9a-f])/i;

function ipv4ToNumber(ip: string) {
  return ip.split(".").reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0) >>> 0;
}

function numberToIpv4(value: number) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

function isPrivateIpv4(ip: string) {
  if (isIP(ip) !== 4) return false;
  const value = ipv4ToNumber(ip);
  return (value >= ipv4ToNumber("10.0.0.0") && value <= ipv4ToNumber("10.255.255.255"))
    || (value >= ipv4ToNumber("172.16.0.0") && value <= ipv4ToNumber("172.31.255.255"))
    || (value >= ipv4ToNumber("192.168.0.0") && value <= ipv4ToNumber("192.168.255.255"));
}

export function normalizePrivateCidr(raw: string) {
  const value = raw.trim();
  const [ip, prefixText = "32"] = value.split("/");
  if (isIP(ip) !== 4) throw new Error("SCAN_CIDR_INVALID");
  const prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 24 || prefix > 32) throw new Error("SCAN_RANGE_TOO_LARGE");
  if (!isPrivateIpv4(ip)) throw new Error("SCAN_PRIVATE_RANGE_REQUIRED");
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = ipv4ToNumber(ip) & mask;
  return `${numberToIpv4(network)}/${prefix}`;
}

function cidrAddresses(cidr: string) {
  const [ip, prefixText] = cidr.split("/");
  const prefix = Number(prefixText);
  const count = 2 ** (32 - prefix);
  if (count > MAX_ADDRESSES) throw new Error("SCAN_RANGE_TOO_LARGE");
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = ipv4ToNumber(ip) & mask;
  const start = prefix <= 30 ? 1 : 0;
  const end = prefix <= 30 ? count - 1 : count;
  return Array.from({ length: Math.max(0, end - start) }, (_, index) => numberToIpv4((network + start + index) >>> 0));
}

function cidrContains(cidr: string, ip: string) {
  if (isIP(ip) !== 4) return false;
  const [base, prefixText] = cidr.split("/");
  const prefix = Number(prefixText);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToNumber(base) & mask) === (ipv4ToNumber(ip) & mask);
}

function normalizePorts(input: unknown) {
  const values = Array.isArray(input) ? input : DEFAULT_PORTS;
  const ports = [...new Set(values.map(Number).filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535))];
  if (!ports.length || ports.length > MAX_PORTS) throw new Error("SCAN_PORTS_INVALID");
  return ports.sort((a, b) => a - b);
}

function normalizeMac(value: string | null | undefined) {
  if (!value) return null;
  const hex = value.replace(/[^0-9a-f]/gi, "").toUpperCase();
  return hex.length === 12 ? hex.match(/.{2}/g)!.join(":") : null;
}

function decodeXml(value: string | undefined) {
  return String(value ?? "").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function parseNmapXml(xml: string): ParsedNmapHost[] {
  return [...xml.matchAll(/<host\b[\s\S]*?<\/host>/g)].flatMap((match) => {
    const block = match[0];
    if (!/<status[^>]*state="up"/.test(block)) return [];
    const addresses = [...block.matchAll(/<address\b([^>]*)\/?\s*>/g)].map((item) => {
      const attrs = item[1];
      return {
        address: decodeXml(attrs.match(/addr="([^"]+)"/)?.[1]),
        type: attrs.match(/addrtype="([^"]+)"/)?.[1] ?? "",
        vendor: decodeXml(attrs.match(/vendor="([^"]+)"/)?.[1]) || null
      };
    });
    const ip = addresses.find((item) => item.type === "ipv4")?.address;
    if (!ip) return [];
    const macEntry = addresses.find((item) => item.type === "mac");
    const hostname = decodeXml(block.match(/<hostname[^>]*name="([^"]+)"/)?.[1]) || null;
    const srtt = Number(block.match(/<times[^>]*srtt="(\d+)"/)?.[1] ?? NaN);
    const ports = [...block.matchAll(/<port[^>]*protocol="([^"]+)"[^>]*portid="([^"]+)"[\s\S]*?<\/port>/g)].flatMap((item): NetworkInventoryPort[] => {
      const portBlock = item[0];
      const state = portBlock.match(/<state[^>]*state="([^"]+)"/)?.[1] ?? "unknown";
      if (state !== "open") return [];
      const serviceAttrs = portBlock.match(/<service\b([^>]*)\/?\s*>/)?.[1] ?? "";
      return [{
        protocol: "tcp",
        port: Number(item[2]),
        state,
        service: decodeXml(serviceAttrs.match(/name="([^"]+)"/)?.[1]) || null,
        product: decodeXml(serviceAttrs.match(/product="([^"]+)"/)?.[1]) || null,
        version: decodeXml(serviceAttrs.match(/version="([^"]+)"/)?.[1]) || null
      }];
    });
    return [{ ip, mac: normalizeMac(macEntry?.address), manufacturer: macEntry?.vendor ?? null, hostname, latencyMs: Number.isFinite(srtt) ? srtt / 1000 : null, ports }];
  });
}

function nmap(args: string[], timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("nmap", args, { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(stdout);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error("SCAN_TIMEOUT")); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${String(chunk)}`.slice(-4_000_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-4_000); });
    child.once("error", (error) => finish(new Error((error as NodeJS.ErrnoException).code === "ENOENT" ? "NMAP_BINARY_NOT_FOUND" : "SCAN_WORKER_FAILED")));
    child.once("close", (code) => finish(code === 0 ? undefined : new Error(stderr.includes("requires root privileges") ? "NMAP_PRIVILEGE_REQUIRED" : "SCAN_WORKER_FAILED")));
  });
}

async function activeDiscovery(cidr: string, profile: NetworkInventoryProfile, ports: number[], vendorTargets: string[]) {
  const discoveryXml = await nmap(["--unprivileged", "-sn", "-R", "--max-retries", "1", "--host-timeout", "8s", "-T4", "-oX", "-", cidr], 90_000);
  let hosts = parseNmapXml(discoveryXml);
  if (profile === "deep") {
    const targets = [...new Set([...hosts.map((host) => host.ip), ...vendorTargets.filter((ip) => cidrContains(cidr, ip))])].slice(0, MAX_ADDRESSES);
    if (!targets.length) return hosts;
    const serviceXml = await nmap(["--unprivileged", "-Pn", "-sT", "-sV", "--version-light", "--max-retries", "1", "--host-timeout", "20s", "-T3", "-p", ports.join(","), "-oX", "-", ...targets], 180_000);
    const serviceHosts = new Map(parseNmapXml(serviceXml).map((host) => [host.ip, host]));
    const discovered = new Map(hosts.map((host) => [host.ip, host]));
    hosts = targets.flatMap((ip) => {
      const host = discovered.get(ip);
      const service = serviceHosts.get(ip);
      if (!host && !service?.ports.length) return [];
      return [{
        ip,
        mac: service?.mac ?? host?.mac ?? null,
        manufacturer: service?.manufacturer ?? host?.manufacturer ?? null,
        hostname: service?.hostname ?? host?.hostname ?? null,
        latencyMs: host?.latencyMs ?? service?.latencyMs ?? null,
        ports: service?.ports ?? []
      }];
    });
  }
  return hosts;
}

async function activeDiscoveryTargets(input: string[], profile: NetworkInventoryProfile, ports: number[]) {
  const targets = [...new Set(input.filter(isPrivateIpv4))].slice(0, MAX_ADDRESSES);
  if (!targets.length) return [];
  const discoveryXml = await nmap(["--unprivileged", "-sn", "-R", "--max-retries", "1", "--host-timeout", "8s", "-T4", "-oX", "-", ...targets], 90_000);
  const discovered = parseNmapXml(discoveryXml);
  if (profile !== "deep") return discovered;
  const serviceXml = await nmap(["--unprivileged", "-Pn", "-R", "-sT", "-sV", "--version-light", "--max-retries", "1", "--host-timeout", "20s", "-T3", "-p", ports.join(","), "-oX", "-", ...targets], 180_000);
  const byDiscovery = new Map(discovered.map((host) => [host.ip, host]));
  const byService = new Map(parseNmapXml(serviceXml).map((host) => [host.ip, host]));
  return targets.flatMap((ip) => {
    const host = byDiscovery.get(ip);
    const service = byService.get(ip);
    if (!host && !service?.ports.length) return [];
    return [{
      ip,
      mac: service?.mac ?? host?.mac ?? null,
      manufacturer: service?.manufacturer ?? host?.manufacturer ?? null,
      hostname: service?.hostname ?? host?.hostname ?? null,
      latencyMs: host?.latencyMs ?? service?.latencyMs ?? null,
      ports: service?.ports ?? []
    }];
  });
}

function vendorKind(device: Device) {
  const source = `${device.vendor} ${device.type}`.toLowerCase();
  if (source.includes("mikrotik") || source.includes("routeros")) return "mikrotik";
  if (source.includes("forti")) return "fortigate";
  if (source.includes("cisco")) return "cisco";
  if (source.includes("esxi") || source.includes("vmware")) return "esxi";
  if (source.includes("linux") || source.includes("ubuntu") || source.includes("debian")) return "linux";
  return "unsupported";
}

function hostnameCandidate(value: string | undefined) {
  const candidate = value?.replace(/[(),]/g, "").trim();
  if (!candidate || candidate.length > 253 || !/[a-z]/i.test(candidate) || !/^[a-z0-9_.-]+$/i.test(candidate)) return null;
  if (["ip", "dev", "lladdr", "arpa", "dynamic", "static", "reachable", "stale", "delay", "failed", "incomplete"].includes(candidate.toLowerCase())) return null;
  return candidate;
}

function hostnameFromLine(line: string, ip: string | null, evidence: string) {
  const explicit = line.match(/(?:^|\s)(?:host-name|hostname|dns-name|name)\s*[=:]\s*['"]?([^\s'"]+)/i)?.[1];
  if (hostnameCandidate(explicit)) return hostnameCandidate(explicit);
  if (!ip) return null;
  if (evidence.startsWith("linux:") && line.startsWith(ip)) return hostnameCandidate(line.slice(ip.length).trim().split(/\s+/)[0]);
  const ciscoHost = evidence === "cisco:hosts" ? line.match(/^([^\s]+)\s+.*\bIP\s+(?:\*\*)?\s*(?:\[[^\]]+\]\s*)?\b\d{1,3}(?:\.\d{1,3}){3}\b/i)?.[1] : undefined;
  return hostnameCandidate(ciscoHost);
}

function parseNeighborText(output: string, evidence: string): VendorNeighbor[] {
  return output.split(/\r?\n/).flatMap((raw) => {
    const line = raw.trim();
    if (!line) return [];
    const ip = line.match(IPV4_RE)?.[0] ?? null;
    const mac = normalizeMac(line.match(MAC_RE)?.[0]);
    if (!ip && !mac) return [];
    const hostname = hostnameFromLine(line, ip, evidence);
    const explicitInterface = line.match(/(?:interface|on-interface|interface-name|dev)=['"]?([^\s'"]+)/i)?.[1]
      ?? line.match(/\bdev\s+(\S+)/i)?.[1]
      ?? line.match(/\b(?:ARPA|DYNAMIC|STATIC)\s+(\S+)\s*$/i)?.[1]
      ?? null;
    const vlan = line.match(/(?:vlan-id|vlan)=['"]?([^\s'"]+)/i)?.[1]
      ?? line.match(/^\*?\s*(\d{1,4})\s+[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}\b/i)?.[1]
      ?? null;
    return [{ ip, mac, hostname, interfaceName: explicitInterface, vlan, evidence: [evidence] }];
  });
}

export function mergeVendorNeighbors(rows: VendorNeighbor[]) {
  const byIp = new Map<string, VendorNeighbor>();
  const byMac = new Map<string, VendorNeighbor>();
  for (const row of rows) {
    const existing = (row.ip && byIp.get(row.ip)) || (row.mac && byMac.get(row.mac));
    const merged: VendorNeighbor = existing ? {
      ip: existing.ip ?? row.ip,
      mac: existing.mac ?? row.mac,
      hostname: existing.hostname ?? row.hostname,
      interfaceName: existing.interfaceName ?? row.interfaceName,
      vlan: existing.vlan ?? row.vlan,
      evidence: [...new Set([...existing.evidence, ...row.evidence])]
    } : row;
    if (merged.ip) byIp.set(merged.ip, merged);
    if (merged.mac) byMac.set(merged.mac, merged);
  }
  return [...new Set([...byIp.values(), ...byMac.values()])];
}

async function resolvePtrHostnames(rows: VendorNeighbor[]) {
  const unresolved = [...new Set(rows.filter((row) => row.ip && !row.hostname).map((row) => row.ip!))].slice(0, MAX_HOSTNAME_LOOKUPS);
  const resolved = new Map<string, string>();
  for (let offset = 0; offset < unresolved.length; offset += 24) {
    await Promise.all(unresolved.slice(offset, offset + 24).map(async (ip) => {
      let timer: NodeJS.Timeout | undefined;
      try {
        const names = await Promise.race([
          dns.reverse(ip),
          new Promise<string[]>((resolve) => { timer = setTimeout(() => resolve([]), 1_200); })
        ]);
        const name = hostnameCandidate(names[0]?.replace(/\.$/, ""));
        if (name) resolved.set(ip, name);
      } catch {
        // A missing PTR record is normal and must not fail vendor inventory.
      } finally {
        if (timer) clearTimeout(timer);
      }
    }));
  }
  return rows.map((row): VendorNeighbor => {
    const hostname = row.hostname ?? (row.ip ? resolved.get(row.ip) ?? null : null);
    return hostname && hostname !== row.hostname
      ? { ...row, hostname, evidence: [...new Set([...row.evidence, "dns:ptr"])] }
      : row;
  });
}

async function collectVendorNeighbors(device: Device): Promise<{ state: NetworkInventoryScan["coverage"]["vendorNeighbors"]; rows: VendorNeighbor[]; warnings: string[] }> {
  const kind = vendorKind(device);
  try {
    let outputs: Record<string, string> = {};
    if (kind === "linux") {
      const result = await runLinuxTelemetryCommands(device, ["neighbors"]);
      outputs = { "linux-neighbor-table": result.results.neighbors?.stdout ?? "" };
    } else if (kind === "mikrotik") outputs = String(device.protocol).toLowerCase() === "api"
      ? await collectMikroTikRestNetworkNeighbors(device)
      : await collectMikroTikNetworkNeighbors(device);
    else if (kind === "fortigate") outputs = await collectFortiGateNetworkNeighbors(device);
    else if (kind === "esxi") outputs = await collectEsxiNetworkNeighbors(device);
    else if (kind === "cisco") {
      const result = await ciscoIosXeSshConnector.runReadOnlyCommands(device, ["arp", "macAddressTable", "dhcpBindings", "hosts", "cdpNeighbors", "lldpNeighbors"]);
      outputs = Object.fromEntries(result.results.map((item) => [item.commandId, item.stdout]));
    } else return { state: "unsupported", rows: [], warnings: ["این وندور جدول همسایهٔ زنده را از Connector فعلی ارائه نمی‌کند؛ نتیجهٔ اسکن فعال همچنان نمایش داده می‌شود."] };
    const allRows = mergeVendorNeighbors(Object.entries(outputs).flatMap(([source, output]) => parseNeighborText(output, `${kind}:${source}`)));
    const rows = allRows.slice(0, MAX_VENDOR_ROWS);
    const warnings = allRows.length > MAX_VENDOR_ROWS ? [`وندور بیش از ${MAX_VENDOR_ROWS} رکورد برگرداند؛ ${MAX_VENDOR_ROWS} رکورد نخست برای جلوگیری از سنگین‌شدن گزارش نگه‌داری شد.`] : [];
    if (!rows.length) warnings.push("Connector وندور پاسخ داد، اما جدول ARP/MAC فعالی پیدا نشد.");
    return { state: rows.length ? "available" : "partial", rows, warnings };
  } catch {
    return { state: "failed", rows: [], warnings: ["خواندن جدول ARP/MAC از تجهیز ناموفق بود؛ اتصال و سطح دسترسی حساب وندور را بررسی کنید."] };
  }
}

function deviceHint(host: Pick<NetworkInventoryHost, "ports" | "manufacturer">) {
  const ports = new Set(host.ports.map((item) => item.port));
  if (ports.has(8291)) return "RouterOS / MikroTik";
  if (ports.has(3389)) return "Windows endpoint";
  if (ports.has(445)) return "Windows / SMB host";
  if (ports.has(22) && (ports.has(80) || ports.has(443))) return "Server or network appliance";
  if (ports.has(22)) return "SSH host";
  if (ports.has(80) || ports.has(443) || ports.has(8080) || ports.has(8443)) return "Web-enabled device";
  return host.manufacturer;
}

function webSummary(ports: NetworkInventoryPort[]) {
  const web = ports.find((item) => [80, 443, 8080, 8443].includes(item.port));
  if (!web) return null;
  return [web.product, web.version].filter(Boolean).join(" ") || `${web.service ?? "web"}:${web.port}`;
}

function buildHosts(cidr: string, active: ParsedNmapHost[], vendor: VendorNeighbor[]) {
  const activeByIp = new Map(active.map((host) => [host.ip, host]));
  const vendorByIp = new Map(vendor.filter((host): host is VendorNeighbor & { ip: string } => Boolean(host.ip && cidrContains(cidr, host.ip))).map((host) => [host.ip, host]));
  const vendorMacOnly = vendor.filter((host) => !host.ip && host.mac);
  const addressRows: NetworkInventoryHost[] = cidrAddresses(cidr).map((ip) => {
    const live = activeByIp.get(ip);
    const observed = vendorByIp.get(ip);
    const ports = live?.ports ?? [];
    const evidence = [...new Set([...(observed?.evidence ?? []), ...(live ? ["active:nmap"] : [])])];
    const host: NetworkInventoryHost = {
      key: ip,
      ip,
      mac: observed?.mac ?? live?.mac ?? null,
      manufacturer: live?.manufacturer ?? null,
      hostname: observed?.hostname ?? live?.hostname ?? null,
      state: live ? "up" : observed ? "vendor_seen" : "down",
      latencyMs: live?.latencyMs ?? null,
      ports,
      web: webSummary(ports),
      deviceHint: null,
      interfaceName: observed?.interfaceName ?? null,
      vlan: observed?.vlan ?? null,
      evidence,
      confidence: live && observed ? "high" : live ? "medium" : observed ? "medium" : "low"
    };
    host.deviceHint = deviceHint(host);
    return host;
  });
  const macRows: NetworkInventoryHost[] = vendorMacOnly.map((observed) => ({
    key: observed.mac!, ip: null, mac: observed.mac, manufacturer: null, hostname: observed.hostname, state: "vendor_seen", latencyMs: null,
    ports: [], web: null, deviceHint: null, interfaceName: observed.interfaceName, vlan: observed.vlan, evidence: observed.evidence, confidence: "low"
  }));
  return [...addressRows, ...macRows];
}

function buildVendorHosts(active: ParsedNmapHost[], vendor: VendorNeighbor[]) {
  const activeByIp = new Map(active.map((host) => [host.ip, host]));
  return vendor.map((observed): NetworkInventoryHost => {
    const live = observed.ip ? activeByIp.get(observed.ip) : undefined;
    const ports = live?.ports ?? [];
    const evidence = [...new Set([...observed.evidence, ...(live ? ["active:nmap"] : [])])];
    const host: NetworkInventoryHost = {
      key: observed.ip ?? observed.mac ?? evidence.join(":"),
      ip: observed.ip,
      mac: observed.mac ?? live?.mac ?? null,
      manufacturer: live?.manufacturer ?? null,
      hostname: observed.hostname ?? live?.hostname ?? null,
      state: live ? "up" : "vendor_seen",
      latencyMs: live?.latencyMs ?? null,
      ports,
      web: webSummary(ports),
      deviceHint: null,
      interfaceName: observed.interfaceName,
      vlan: observed.vlan,
      evidence,
      confidence: live ? "high" : observed.ip && observed.mac ? "medium" : "low"
    };
    host.deviceHint = deviceHint(host);
    return host;
  });
}

function scanSummary(hosts: NetworkInventoryHost[]) {
  return {
    addressCount: hosts.filter((host) => host.ip).length,
    up: hosts.filter((host) => host.state === "up").length,
    vendorSeen: hosts.filter((host) => host.state === "vendor_seen").length,
    down: hosts.filter((host) => host.state === "down").length,
    macKnown: hosts.filter((host) => host.mac).length,
    hostnameKnown: hosts.filter((host) => host.hostname).length,
    openPorts: hosts.reduce((sum, host) => sum + host.ports.length, 0)
  };
}

function normalizeRecord(record: { id: string; metadata: unknown; createdAt: Date }) {
  return { id: record.id, createdAt: record.createdAt.toISOString(), ...(record.metadata as Omit<NetworkInventoryScan, "id" | "createdAt">) } as NetworkInventoryScan;
}

export async function runNetworkInventoryScan(input: { deviceId?: string; mode?: NetworkInventoryMode; cidr?: string; profile?: NetworkInventoryProfile; ports?: number[] }, user: AuthUser) {
  const ownerId = user.scopeOwnerId ?? user.id;
  const device = input.deviceId ? await prisma.device.findFirst({ where: { id: input.deviceId, deletedAt: null, company: { ownerId, deletedAt: null } } }) : null;
  if (!device) throw new Error("DEVICE_NOT_FOUND");
  const mode: NetworkInventoryMode = input.mode === "vendor" || (!input.mode && !String(input.cidr ?? "").trim()) ? "vendor" : "range";
  const cidr = mode === "range" ? normalizePrivateCidr(String(input.cidr ?? "")) : null;
  const profile: NetworkInventoryProfile = input.profile === "deep" ? "deep" : "discovery";
  const ports = normalizePorts(input.ports);
  const startedAt = Date.now();
  const collectedVendor = await collectVendorNeighbors(device);
  const vendorRows = await resolvePtrHostnames(collectedVendor.rows);
  const vendorTargets = vendorRows.flatMap((row) => row.ip ? [row.ip] : []);
  const activeTargets = vendorTargets.filter(isPrivateIpv4).slice(0, MAX_ADDRESSES);
  const activeRun = mode === "range"
    ? activeDiscovery(cidr!, profile, ports, vendorTargets)
    : activeTargets.length ? activeDiscoveryTargets(activeTargets, profile, ports) : null;
  const activeResult = activeRun
    ? await activeRun.then((hosts) => ({ hosts, error: null as string | null, skipped: false })).catch((error) => ({ hosts: [] as ParsedNmapHost[], error: error instanceof Error ? error.message : "SCAN_WORKER_FAILED", skipped: false }))
    : { hosts: [] as ParsedNmapHost[], error: null as string | null, skipped: true };
  const warnings = [...collectedVendor.warnings];
  if (mode === "vendor" && vendorTargets.filter(isPrivateIpv4).length > MAX_ADDRESSES) warnings.push("همهٔ رکوردهای وندور نمایش داده می‌شوند؛ غنی‌سازی فعال Nmap برای ۲۵۶ IP خصوصی نخست محدود شده است.");
  if (mode === "vendor" && vendorTargets.length > MAX_HOSTNAME_LOOKUPS) warnings.push("جست‌وجوی PTR برای ۵۱۲ IP نخست انجام شد؛ hostnameهای ثبت‌شده توسط خود وندور بدون محدودیت نمایش داده می‌شوند.");
  if (activeResult.error) warnings.push(activeResult.error === "NMAP_BINARY_NOT_FOUND" ? "موتور Nmap روی سرویس API نصب نیست." : activeResult.error === "SCAN_TIMEOUT" ? "اسکن فعال به محدودیت زمانی رسید؛ شواهد وندور همچنان نمایش داده می‌شود." : "اسکن فعال شبکه کامل نشد؛ مسیر شبکهٔ سرویس API را بررسی کنید.");
  const hosts = mode === "range" ? buildHosts(cidr!, activeResult.hosts, vendorRows) : buildVendorHosts(activeResult.hosts, vendorRows);
  const state: NetworkInventoryScan["state"] = mode === "vendor"
    ? hosts.length === 0 ? "failed" : activeResult.error || collectedVendor.state !== "available" ? "partial" : "completed"
    : activeResult.error && vendorRows.length === 0 ? "failed" : activeResult.error || collectedVendor.state !== "available" ? "partial" : "completed";
  const summary = scanSummary(hosts);
  const metadata: Omit<NetworkInventoryScan, "id" | "createdAt"> = {
    state,
    device: { id: device.id, name: device.name, host: device.host, vendor: device.vendor, type: device.type },
    mode,
    cidr,
    profile,
    ports,
    durationMs: Date.now() - startedAt,
    summary,
    hosts,
    coverage: {
      activeProbe: activeResult.skipped ? "skipped" : activeResult.error ? "failed" : "available",
      vendorNeighbors: collectedVendor.state,
      hostnameResolution: summary.hostnameKnown === 0 ? "unavailable" : summary.hostnameKnown < summary.addressCount ? "partial" : "available",
      macScope: "MAC فقط وقتی قطعی است که جدول ARP/MAC تجهیز یا همان دامنهٔ لایهٔ ۲ آن را گزارش کند."
    },
    warnings
  };
  const record = await prisma.auditLog.create({ data: {
    deviceId: device.id,
    actor: user.username,
    action: "network_inventory_scan",
    targetType: "network_inventory_scan",
    targetId: cidr ?? `vendor:${device.id}`,
    dryRun: false,
    approvalStatus: "not_required",
    metadata: metadata as unknown as Prisma.InputJsonValue
  } });
  return normalizeRecord(record);
}

export async function listNetworkInventoryScans(username: string, ownerId: string, limit = 12) {
  const records = await prisma.auditLog.findMany({
    where: { action: "network_inventory_scan", targetType: "network_inventory_scan", actor: username, device: { deletedAt: null, company: { ownerId, deletedAt: null } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(Math.trunc(limit), 1), 30)
  });
  return records.map(normalizeRecord);
}

export async function clearNetworkInventoryScans(username: string, ownerId: string) {
  const result = await prisma.auditLog.deleteMany({ where: { action: "network_inventory_scan", targetType: "network_inventory_scan", actor: username, device: { deletedAt: null, company: { ownerId, deletedAt: null } } } });
  return result.count;
}

export const networkInventoryScanInternalsForTest = { normalizePrivateCidr, cidrAddresses, cidrContains, normalizePorts, normalizeMac, parseNmapXml, parseNeighborText, mergeVendorNeighbors, buildHosts, buildVendorHosts, scanSummary };
