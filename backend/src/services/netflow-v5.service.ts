import dgram from "node:dgram";
import net from "node:net";
import type { FastifyBaseLogger } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

const PORT = 2055;
const MAX_PENDING = 30_000;
const MAX_PACKETS_PER_SECOND = 200;
const FLUSH_MS = 10_000;
const RETENTION_DAYS = 7;

type Flow = { sourceIp: string; destinationIp: string; sourcePort: number; destinationPort: number; inputIndex: number; outputIndex: number; bytes: number };
export type NetflowPacket = { sequence: number; uptime: number; samplingRate: number; flows: Flow[] };
type Exporter = { deviceId: string; address: string };
type Rollup = { deviceId: string; kind: string; value: string; bytes: number; records: number; samplingRate: number; timestamp: Date };

function ipv4(packet: Buffer, offset: number) {
  return `${packet[offset]}.${packet[offset + 1]}.${packet[offset + 2]}.${packet[offset + 3]}`;
}

export function parseNetflowV5(packet: Buffer): NetflowPacket | null {
  if (packet.length < 24 || packet.length > 1500 || packet.readUInt16BE(0) !== 5) return null;
  const count = packet.readUInt16BE(2);
  if (count < 1 || count > 30 || packet.length !== 24 + count * 48) return null;
  const flows: Flow[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 24 + index * 48;
    flows.push({
      sourceIp: ipv4(packet, offset), destinationIp: ipv4(packet, offset + 4),
      inputIndex: packet.readUInt16BE(offset + 12), outputIndex: packet.readUInt16BE(offset + 14),
      bytes: packet.readUInt32BE(offset + 20),
      sourcePort: packet.readUInt16BE(offset + 32), destinationPort: packet.readUInt16BE(offset + 34)
    });
  }
  return { sequence: packet.readUInt32BE(16), uptime: packet.readUInt32BE(4), samplingRate: Math.max(1, packet.readUInt16BE(22) & 0x3fff), flows };
}

export function netflowExporterSettings(capabilities: unknown): { enabled: boolean; exporterIp: string | null } {
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) return { enabled: false, exporterIp: null };
  const item = (capabilities as Record<string, unknown>).netflowV5;
  if (!item || typeof item !== "object" || Array.isArray(item)) return { enabled: false, exporterIp: null };
  const settings = item as Record<string, unknown>;
  return { enabled: settings.enabled === true, exporterIp: typeof settings.exporterIp === "string" ? settings.exporterIp : null };
}

export function validExporterIp(value: unknown): value is string {
  if (typeof value !== "string" || net.isIP(value) !== 4) return false;
  const first = Number(value.split(".")[0]);
  return first > 0 && first < 224 && value !== "255.255.255.255";
}

let socket: dgram.Socket | null = null;
let flushTimer: NodeJS.Timeout | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
let retentionTimer: NodeJS.Timeout | null = null;
let logger: FastifyBaseLogger | undefined;
let exporters = new Map<string, Exporter>();
let pending = new Map<string, Rollup>();
let flushing: Promise<void> | null = null;
const recentSequences = new Map<string, number>();
const rate = new Map<string, { second: number; packets: number }>();
const devicePackets = new Map<string, { accepted: number; dropped: number; lastPacketAt: string | null }>();
const state = { receivedPackets: 0, acceptedPackets: 0, droppedPackets: 0, lastReceivedAt: null as string | null, lastAcceptedAt: null as string | null, lastError: null as string | null };

export function netflowReceiverStatus() { return { listening: socket !== null, port: PORT, hostBind: process.env.NETFLOW_BIND_IP ?? "127.0.0.1", ...state }; }
export function netflowDeviceStatus(deviceId: string) { return devicePackets.get(deviceId) ?? { accepted: 0, dropped: 0, lastPacketAt: null }; }

function recordDevicePacket(deviceId: string, accepted: boolean) {
  const status = devicePackets.get(deviceId) ?? { accepted: 0, dropped: 0, lastPacketAt: null };
  if (accepted) status.accepted += 1;
  else status.dropped += 1;
  status.lastPacketAt = new Date().toISOString();
  devicePackets.set(deviceId, status);
}

export async function refreshNetflowExporters() {
  const devices = await prisma.device.findMany({ where: { deletedAt: null, company: { deletedAt: null } }, select: { id: true, capabilities: true } });
  const next = new Map<string, Exporter>();
  const ambiguous = new Set<string>();
  for (const device of devices) {
    const settings = netflowExporterSettings(device.capabilities);
    if (!settings.enabled || !settings.exporterIp || !validExporterIp(settings.exporterIp)) continue;
    if (next.has(settings.exporterIp)) ambiguous.add(settings.exporterIp);
    next.set(settings.exporterIp, { deviceId: device.id, address: settings.exporterIp });
  }
  for (const address of ambiguous) next.delete(address);
  exporters = next;
}

function addRollup(deviceId: string, kind: string, value: string, bytes: number, samplingRate: number, timestamp: Date) {
  const windowStart = new Date(Math.floor(timestamp.getTime() / 60_000) * 60_000);
  const key = rollupKey(deviceId, kind, value, samplingRate, timestamp);
  const existing = pending.get(key);
  if (existing) { existing.bytes += bytes; existing.records += 1; return true; }
  if (pending.size >= MAX_PENDING) return false;
  pending.set(key, { deviceId, kind, value, bytes, records: 1, samplingRate, timestamp: windowStart });
  return true;
}

function rollupKey(deviceId: string, kind: string, value: string, samplingRate: number, timestamp: Date) {
  return `${deviceId}|${Math.floor(timestamp.getTime() / 60_000) * 60_000}|${samplingRate}|${kind}|${value}`;
}

function ingestPacket(packet: Buffer, address: string) {
  state.receivedPackets += 1;
  state.lastReceivedAt = new Date().toISOString();
  const exporter = exporters.get(address);
  const parsed = exporter ? parseNetflowV5(packet) : null;
  if (!exporter || !parsed) { state.droppedPackets += 1; if (exporter) recordDevicePacket(exporter.deviceId, false); return; }
  const second = Math.floor(Date.now() / 1000);
  const counter = rate.get(address);
  if (counter?.second === second && counter.packets >= MAX_PACKETS_PER_SECOND) { state.droppedPackets += 1; recordDevicePacket(exporter.deviceId, false); return; }
  rate.set(address, { second, packets: counter?.second === second ? counter.packets + 1 : 1 });
  const dedupeKey = `${address}:${parsed.uptime}:${parsed.sequence}`;
  if (recentSequences.has(dedupeKey)) { state.droppedPackets += 1; return; }
  const timestamp = new Date();
  const additions: Array<[string, string, number]> = [];
  for (const flow of parsed.flows) {
    if (flow.bytes === 0) continue;
    const dimensions: Array<[string, string]> = [
      ["port", String(flow.destinationPort)], ["sourceIp", flow.sourceIp], ["destinationIp", flow.destinationIp]
    ];
    if (flow.inputIndex) dimensions.push(["interfaceIn", `ifIndex ${flow.inputIndex}`]);
    if (flow.outputIndex) dimensions.push(["interfaceOut", `ifIndex ${flow.outputIndex}`]);
    for (const [kind, value] of dimensions) additions.push([kind, value, flow.bytes]);
  }
  const newKeys = new Set(additions.map(([kind, value]) => rollupKey(exporter.deviceId, kind, value, parsed.samplingRate, timestamp)).filter((key) => !pending.has(key)));
  if (pending.size + newKeys.size > MAX_PENDING) { state.droppedPackets += 1; recordDevicePacket(exporter.deviceId, false); return; }
  recentSequences.set(dedupeKey, Date.now());
  for (const [kind, value, bytes] of additions) addRollup(exporter.deviceId, kind, value, bytes, parsed.samplingRate, timestamp);
  state.acceptedPackets += 1;
  state.lastAcceptedAt = timestamp.toISOString();
  recordDevicePacket(exporter.deviceId, true);
}

async function flush() {
  if (flushing || !pending.size) return flushing;
  const rows = [...pending.values()];
  pending = new Map();
  flushing = (async () => {
    try {
      for (let index = 0; index < rows.length; index += 1000) {
        await prisma.metricSample.createMany({ data: rows.slice(index, index + 1000).map((row) => ({
          deviceId: row.deviceId, metricKey: "flow.bytes", value: row.bytes, unit: "bytes", timestamp: row.timestamp,
          source: "netflow-v5", labelsJson: { kind: row.kind, value: row.value, records: row.records, samplingRate: row.samplingRate } as Prisma.InputJsonValue
        })) });
      }
      state.lastError = null;
    } catch (error) {
      state.lastError = "FLOW_STORAGE_FAILED";
      state.droppedPackets += rows.length;
      logger?.warn({ code: "FLOW_STORAGE_FAILED", reason: error instanceof Error ? error.name : "unknown" }, "NetFlow rollups could not be stored");
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

async function prune() {
  try {
    await prisma.metricSample.deleteMany({ where: { source: "netflow-v5", metricKey: "flow.bytes", timestamp: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) } } });
  } catch { logger?.warn({ code: "FLOW_RETENTION_FAILED" }, "NetFlow retention failed"); }
}

export async function startNetflowV5Collector(appLogger: FastifyBaseLogger) {
  if (socket) return;
  logger = appLogger;
  await refreshNetflowExporters();
  const listener = dgram.createSocket("udp4");
  listener.on("message", (packet, sender) => ingestPacket(packet, sender.address));
  listener.on("error", (error) => { state.lastError = "code" in error ? String(error.code) : "FLOW_RECEIVER_FAILED"; logger?.warn({ code: state.lastError }, "NetFlow receiver error"); });
  await new Promise<void>((resolve, reject) => { listener.once("listening", resolve); listener.once("error", reject); listener.bind(PORT, "0.0.0.0"); });
  socket = listener;
  flushTimer = setInterval(() => { void flush(); }, FLUSH_MS);
  refreshTimer = setInterval(() => {
    void refreshNetflowExporters().catch(() => { state.lastError = "FLOW_EXPORTER_REFRESH_FAILED"; });
    const cutoff = Date.now() - 120_000;
    for (const [key, seen] of recentSequences) if (seen < cutoff) recentSequences.delete(key);
    for (const [key, item] of rate) if (item.second < Math.floor(cutoff / 1000)) rate.delete(key);
  }, 60_000);
  retentionTimer = setInterval(() => { void prune(); }, 24 * 3600_000);
  void prune();
}

export async function stopNetflowV5Collector() {
  if (flushTimer) clearInterval(flushTimer);
  if (refreshTimer) clearInterval(refreshTimer);
  if (retentionTimer) clearInterval(retentionTimer);
  flushTimer = refreshTimer = retentionTimer = null;
  if (socket) { socket.close(); socket = null; }
  await flushing;
  await flush();
}
