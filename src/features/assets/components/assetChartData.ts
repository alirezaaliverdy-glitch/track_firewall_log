export type Reading = { timestamp: string; value: number; unit?: string | null; label?: string };

export function orderedReadings(points: Reading[]) {
  const byTime = new Map<number, Reading>();
  for (const point of points) {
    const time = Date.parse(point.timestamp);
    if (Number.isFinite(time) && Number.isFinite(point.value)) byTime.set(time, point);
  }
  return [...byTime.entries()].sort(([a], [b]) => a - b).map(([, point]) => point);
}

// Preserve holes in monitoring evidence: do not plot long outages of the collector as uptime/zero traffic.
export function chartReadings(points: Reading[], binary: boolean) {
  const ordered = orderedReadings(points);
  const intervals = ordered.slice(1).map((point, index) => Date.parse(point.timestamp) - Date.parse(ordered[index].timestamp)).filter((value) => value > 0).sort((a, b) => a - b);
  const cadence = intervals.length ? intervals[Math.floor((intervals.length - 1) / 2)] : 0;
  const gapLimit = binary ? 10 * 60_000 : Math.max(5 * 60_000, cadence * 3);
  const result: Array<[number, number | null]> = [];
  for (const point of ordered) {
    const x = Date.parse(point.timestamp);
    const previous = result.at(-1);
    if (previous && x - previous[0] > gapLimit) result.push([previous[0] + 1, null]);
    result.push([x, point.value]);
  }
  return result;
}

export function latencyReadings(checks: Array<Record<string, unknown>>) {
  return orderedReadings(checks.flatMap((check) => check.status === "online" && typeof check.latencyMs === "number" && Number.isFinite(check.latencyMs) && check.latencyMs > 0 && !/RECENT_COLLECTION_VERIFIED|PASSIVE_HEARTBEAT|AUTHENTICATED_COLLECTION_VERIFIED/.test(String(check.message ?? ""))
    ? [{ timestamp: String(check.checkedAt), value: check.latencyMs, unit: "ms" }] : []));
}
