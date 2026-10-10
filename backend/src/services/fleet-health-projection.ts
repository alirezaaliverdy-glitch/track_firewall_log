export const FLEET_FRESH_MS = 5 * 60_000;
export type ResourceSample = { metricKey: string; value: number; timestamp: Date; unit: string | null; labelsJson?: unknown };
const RESOURCE_KEYS = ["cpu.usage_percent", "memory.usage_percent", "disk.usage_percent", "datastore.usage_percent"];
const companions: Record<string, { used?: string; total: string; unit: "bytes" | "cores" }> = {
  "cpu.usage_percent": { total: "cpu.total_cores", unit: "cores" },
  "memory.usage_percent": { used: "memory.used_bytes", total: "memory.total_bytes", unit: "bytes" },
  "disk.usage_percent": { used: "disk.used_bytes", total: "disk.total_bytes", unit: "bytes" },
  "datastore.usage_percent": { used: "datastore.used_bytes", total: "datastore.total_bytes", unit: "bytes" }
};
function labels(sample: ResourceSample | undefined) {
  return sample?.labelsJson && typeof sample.labelsJson === "object" && !Array.isArray(sample.labelsJson) ? sample.labelsJson as Record<string, unknown> : {};
}
function sameSeries(left: ResourceSample, right: ResourceSample) {
  if (left.metricKey.startsWith("datastore.") || right.metricKey.startsWith("datastore.")) return labels(left).datastore === labels(right).datastore;
  if (left.metricKey.startsWith("disk.") || right.metricKey.startsWith("disk.")) return labels(left).mount === labels(right).mount;
  return true;
}
export function projectFleetResources(samples: ResourceSample[], now = Date.now()) {
  const keys = ["cpu.usage_percent", "memory.usage_percent", "disk.usage_percent", "datastore.usage_percent", "interfaces.down_count", "vpn.active_count", "sessions.count"];
  const rows = keys.map(metricKey => {
    const candidates = samples.filter(s => s.metricKey === metricKey && Number.isFinite(s.value) && s.value >= 0 && (s.unit !== "percent" || s.value <= 100)).sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime());
    const first = candidates[0];
    // Datastores are labelled series: expose the busiest datastore at the latest collection only.
    const selected = first && metricKey === "datastore.usage_percent"
      ? candidates.filter(s => Math.abs(s.timestamp.getTime() - first.timestamp.getTime()) < 1000).sort((a,b) => b.value-a.value)[0]
      : first;
    const companion = companions[metricKey];
    const paired = (key: string | undefined) => !selected || !key ? undefined : samples
      .filter(s => s.metricKey === key && Number.isFinite(s.value) && s.value >= 0 && Math.abs(s.timestamp.getTime() - selected.timestamp.getTime()) < 2000 && sameSeries(selected, s))
      .sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
    const used = paired(companion?.used), total = paired(companion?.total);
    return {
      metricKey, value: selected?.value ?? null, unit: selected?.unit ?? "percent",
      measuredAt: selected?.timestamp.toISOString() ?? null,
      fresh: !!selected && now - selected.timestamp.getTime() <= FLEET_FRESH_MS && selected.timestamp.getTime() <= now + 30_000,
      usedValue: used?.value ?? null, totalValue: total?.value ?? null, quantityUnit: companion?.unit ?? null,
      seriesLabel: typeof labels(selected).datastore === "string" ? labels(selected).datastore as string : typeof labels(selected).mount === "string" ? labels(selected).mount as string : null
    };
  });
  const resources = rows.filter(r => RESOURCE_KEYS.includes(r.metricKey) && r.fresh && r.value !== null);
  const score = resources.length ? Math.round(Math.max(0, 100 - Math.max(0, Math.max(...resources.map(r => r.value!)) - 60) * 2.5)) : null;
  return { rows, score, measuredResources: resources.length, fresh: resources.length > 0 };
}
