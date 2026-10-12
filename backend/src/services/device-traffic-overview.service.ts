import { prisma } from "../db/prisma.js";
import { Prisma } from "@prisma/client";
import { metricSourceForVendor } from "./device-metric-source.js";

type Sample = { metricKey: string; value: number; timestamp: Date; labelsJson: unknown };
type InterfaceRate = { name: string; rxMbps: number | null; txMbps: number | null; totalMbps: number | null; sampledAt: string | null; stale: boolean; method: "counter_delta" | "device_5m_average" };
type FlowVolumeRow = { kind: string; value: string; bytes: string; records: number; sampled?: boolean };

export function normalizedFlowBytes(normalized: unknown): number | null {
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return null;
  const row = normalized as Record<string, unknown>;
  const valid = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (valid(row.bytes)) return row.bytes as number;
  const sent = valid(row.bytesSent) ? row.bytesSent as number : null;
  const received = valid(row.bytesReceived) ? row.bytesReceived as number : null;
  return sent === null && received === null ? null : sent !== null && received !== null && Number.isSafeInteger(sent + received) ? sent + received : null;
}

async function flowVolumes(deviceId: string, since: Date) {
  const netflowRows = await prisma.$queryRaw<FlowVolumeRow[]>(Prisma.sql`
    SELECT "labelsJson"->>'kind' AS kind, "labelsJson"->>'value' AS value,
      SUM(value)::numeric::text AS bytes,
      SUM(COALESCE(("labelsJson"->>'records')::int, 1))::int AS records,
      BOOL_OR(COALESCE(("labelsJson"->>'samplingRate')::int, 1) > 1) AS sampled
    FROM "MetricSample"
    WHERE "deviceId" = ${deviceId} AND source = 'netflow-v5' AND "metricKey" = 'flow.bytes' AND timestamp >= ${since}
      AND "labelsJson"->>'kind' IN ('port', 'sourceIp', 'destinationIp', 'interfaceIn', 'interfaceOut')
    GROUP BY "labelsJson"->>'kind', "labelsJson"->>'value'
  `);
  // Only explicit allow records with numeric byte evidence represent confirmed forwarded volume.
  // No byte count is inferred from log frequency or interface totals.
  const rows = netflowRows.length ? netflowRows : await prisma.$queryRaw<FlowVolumeRow[]>(Prisma.sql`
    WITH measured AS (
      SELECT "srcIp", "dstIp", "dstPort", "interfaceIn", "interfaceOut",
        CASE
          WHEN jsonb_typeof("normalizedJson"->'bytes') = 'number' THEN ("normalizedJson"->>'bytes')::numeric
          WHEN jsonb_typeof("normalizedJson"->'bytesSent') = 'number' AND jsonb_typeof("normalizedJson"->'bytesReceived') = 'number'
            THEN ("normalizedJson"->>'bytesSent')::numeric + ("normalizedJson"->>'bytesReceived')::numeric
          ELSE NULL
        END AS bytes
      FROM "SecurityEvent"
      WHERE "deviceId" = ${deviceId} AND "receivedAt" >= ${since} AND LOWER("action") IN ('allow', 'accept', 'pass', 'permit')
        AND ("normalizedJson" ? 'bytes' OR ("normalizedJson" ? 'bytesSent' AND "normalizedJson" ? 'bytesReceived'))
    ), ranked AS (
      SELECT dimension.kind, dimension.value, SUM(measured.bytes)::text AS bytes, COUNT(*)::int AS records,
        ROW_NUMBER() OVER (PARTITION BY dimension.kind ORDER BY SUM(measured.bytes) DESC) AS rank
      FROM measured CROSS JOIN LATERAL (VALUES
        ('port', measured."dstPort"::text), ('sourceIp', measured."srcIp"),
        ('destinationIp', measured."dstIp"), ('interfaceIn', measured."interfaceIn"), ('interfaceOut', measured."interfaceOut")
      ) AS dimension(kind, value)
      WHERE measured.bytes >= 0 AND dimension.value IS NOT NULL
      GROUP BY dimension.kind, dimension.value
    )
    SELECT kind, value, bytes, records FROM ranked WHERE rank <= 8
  `);
  const list = (kind: string) => rows.filter((row) => row.kind === kind && Number.isFinite(Number(row.bytes)))
    .map((row) => ({ value: row.value, bytes: Number(row.bytes), records: row.records }))
    .sort((a, b) => b.bytes - a.bytes).slice(0, 8);
  return { source: netflowRows.length ? "netflow-v5" : rows.length ? "allowed-flow-logs" : "none", sampled: netflowRows.some((row) => row.sampled), ports: list("port"), sourceIps: list("sourceIp"), destinationIps: list("destinationIp"), interfaceIn: list("interfaceIn"), interfaceOut: list("interfaceOut") };
}

function interfaceName(labels: unknown): string | null {
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) return null;
  const name = (labels as Record<string, unknown>).interface;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function round(value: number) { return Math.round(value * 1000) / 1000; }

export function buildInterfaceRates(samples: Sample[], now = Date.now()): InterfaceRate[] {
  const groups = new Map<string, Sample[]>();
  for (const sample of samples) {
    const name = interfaceName(sample.labelsJson);
    if (!name || !/^network\.(rx|tx)_(bytes|mbps)$/.test(sample.metricKey) || !Number.isFinite(sample.value) || sample.value < 0) continue;
    groups.set(name, [...(groups.get(name) ?? []), sample]);
  }
  const result: InterfaceRate[] = [];
  for (const [name, rows] of groups) {
    const latest = (key: string) => rows.filter((row) => row.metricKey === key).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const directRx = latest("network.rx_mbps")[0];
    const directTx = latest("network.tx_mbps")[0];
    const latestDirectAt = Math.max(directRx?.timestamp.getTime() ?? 0, directTx?.timestamp.getTime() ?? 0);
    const latestCounterAt = Math.max(latest("network.rx_bytes")[0]?.timestamp.getTime() ?? 0, latest("network.tx_bytes")[0]?.timestamp.getTime() ?? 0);
    const direct = latestDirectAt > 0 && latestDirectAt >= latestCounterAt;
    const fresh = (row: Sample | undefined) => Boolean(row && now - row.timestamp.getTime() <= 15 * 60_000 && row.timestamp.getTime() <= now + 60_000);
    const counterRate = (key: string) => {
      const [current, previous] = latest(key);
      if (!current || !previous || !fresh(current)) return null;
      const seconds = (current.timestamp.getTime() - previous.timestamp.getTime()) / 1000;
      if (seconds < 5 || seconds > 3600 || !Number.isSafeInteger(current.value) || !Number.isSafeInteger(previous.value) || current.value < previous.value) return null;
      return round((current.value - previous.value) * 8 / seconds / 1_000_000);
    };
    const chosen = direct ? [directRx, directTx] : [latest("network.rx_bytes")[0], latest("network.tx_bytes")[0]];
    const sampled = chosen.filter((row): row is Sample => Boolean(row)).map((row) => row.timestamp.getTime());
    const sampledAt = sampled.length ? Math.max(...sampled) : null;
    const stale = sampledAt === null || now - sampledAt > 15 * 60_000 || sampledAt > now + 60_000;
    const rx = direct ? fresh(directRx) ? directRx!.value : null : counterRate("network.rx_bytes");
    const tx = direct ? fresh(directTx) ? directTx!.value : null : counterRate("network.tx_bytes");
    result.push({ name, rxMbps: stale ? null : rx, txMbps: stale ? null : tx, totalMbps: stale || rx === null && tx === null ? null : round((rx ?? 0) + (tx ?? 0)), sampledAt: sampledAt === null ? null : new Date(sampledAt).toISOString(), stale, method: direct ? "device_5m_average" : "counter_delta" });
  }
  return result.sort((a, b) => (b.totalMbps ?? -1) - (a.totalMbps ?? -1) || a.name.localeCompare(b.name));
}

export async function listDeviceTrafficOverview(ownerId: string) {
  const devices = await prisma.device.findMany({ where: { deletedAt: null, company: { ownerId, deletedAt: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, vendor: true, host: true, status: true } });
  const fromMetrics = new Date(Date.now() - 2 * 3600_000);
  const fromEvents = new Date(Date.now() - 24 * 3600_000);
  const result = [];
  for (let index = 0; index < devices.length; index += 6) {
    const batch = await Promise.all(devices.slice(index, index + 6).map(async (device) => {
      const source = metricSourceForVendor(device.vendor);
      const [samples, ports, sourceIps, destinationIps, volume] = await Promise.all([
        prisma.metricSample.findMany({ where: { deviceId: device.id, timestamp: { gte: fromMetrics }, metricKey: { in: ["network.rx_bytes", "network.tx_bytes", "network.rx_mbps", "network.tx_mbps"] }, ...(source ? { source } : {}) }, orderBy: { timestamp: "desc" }, take: 4096, select: { metricKey: true, value: true, timestamp: true, labelsJson: true } }),
        prisma.securityEvent.groupBy({ by: ["dstPort"], where: { deviceId: device.id, receivedAt: { gte: fromEvents }, dstPort: { not: null } }, _sum: { count: true }, orderBy: { _sum: { count: "desc" } }, take: 8 }),
        prisma.securityEvent.groupBy({ by: ["srcIp"], where: { deviceId: device.id, receivedAt: { gte: fromEvents }, srcIp: { not: null } }, _sum: { count: true }, orderBy: { _sum: { count: "desc" } }, take: 8 }),
        prisma.securityEvent.groupBy({ by: ["dstIp"], where: { deviceId: device.id, receivedAt: { gte: fromEvents }, dstIp: { not: null } }, _sum: { count: true }, orderBy: { _sum: { count: "desc" } }, take: 8 }),
        flowVolumes(device.id, fromEvents)
      ]);
      return { ...device, interfaces: buildInterfaceRates(samples), volume, observed: {
        ports: ports.filter((row) => row.dstPort !== null).map((row) => ({ value: String(row.dstPort), count: row._sum.count ?? 0 })),
        sourceIps: sourceIps.filter((row) => row.srcIp).map((row) => ({ value: row.srcIp!, count: row._sum.count ?? 0 })),
        destinationIps: destinationIps.filter((row) => row.dstIp).map((row) => ({ value: row.dstIp!, count: row._sum.count ?? 0 }))
      } };
    }));
    result.push(...batch);
  }
  return { generatedAt: new Date().toISOString(), devices: result };
}
