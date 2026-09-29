export const FLEET_FRESH_MS = 5 * 60_000;
export type ResourceSample = { metricKey: string; value: number; timestamp: Date; unit: string | null };
export function projectFleetResources(samples: ResourceSample[], now = Date.now()) {
  const keys = ["cpu.usage_percent", "memory.usage_percent", "disk.usage_percent", "datastore.usage_percent", "interfaces.down_count", "vpn.active_count", "sessions.count"];
  const rows = keys.map(metricKey => {
    const candidates = samples.filter(s => s.metricKey === metricKey && Number.isFinite(s.value) && s.value >= 0 && (s.unit !== "percent" || s.value <= 100)).sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime());
    const first = candidates[0];
    // Datastores are labelled series: expose the busiest datastore at the latest collection only.
    const value = first && metricKey === "datastore.usage_percent" ? Math.max(...candidates.filter(s => Math.abs(s.timestamp.getTime() - first.timestamp.getTime()) < 1000).map(s => s.value)) : first?.value;
    return { metricKey, value: value ?? null, unit: first?.unit ?? "percent", measuredAt: first?.timestamp.toISOString() ?? null, fresh: !!first && now - first.timestamp.getTime() <= FLEET_FRESH_MS && first.timestamp.getTime() <= now + 30_000 };
  });
  const resources = rows.filter(r => ["cpu.usage_percent", "memory.usage_percent", "disk.usage_percent", "datastore.usage_percent"].includes(r.metricKey) && r.fresh && r.value !== null);
  const score = resources.length ? Math.round(Math.max(0, 100 - Math.max(0, Math.max(...resources.map(r => r.value!)) - 60) * 2.5)) : null;
  return { rows, score, measuredResources: resources.length, fresh: resources.length > 0 };
}
