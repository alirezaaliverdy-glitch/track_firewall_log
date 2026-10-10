/** Health is derived from fresh evidence, never from an operator's resolution click. */
type Status = { status: string; checkedAt: Date | string };
type Collection = { status: string; startedAt: Date | string; completedAt?: Date | string | null };
type Snapshot = { state: string; score: number; collectedAt: Date | string };
type Metric = { metricKey: string; value: number; timestamp: Date | string };
type Finding = { severity: string; status: string };

const CONNECTION_MAX_AGE_MS = 5 * 60_000;
const TELEMETRY_MAX_AGE_MS = 15 * 60_000;
const RESOURCE_KEYS = new Set(["cpu.usage_percent", "memory.usage_percent", "disk.usage_percent", "datastore.usage_percent"]);

function isFresh(value: Date | string | null | undefined, now: Date, maxAge: number) {
  if (!value) return false;
  const age = now.getTime() - new Date(value).getTime();
  return Number.isFinite(age) && age >= -30_000 && age <= maxAge;
}

export type DeviceHealthAssessment = {
  state: "healthy" | "warning" | "critical" | "unknown";
  score: number | null;
  coverage: "measured" | "partial" | "none";
  reasons: string[];
};

export function assessDeviceHealth(input: {
  status?: Status | null;
  collection?: Collection | null;
  snapshot?: Snapshot | null;
  metrics: Metric[];
  findings: Finding[];
  now?: Date;
}): DeviceHealthAssessment {
  const now = input.now ?? new Date();
  const statusFresh = input.status && isFresh(input.status.checkedAt, now, CONNECTION_MAX_AGE_MS);
  const collectionFresh = input.collection && isFresh(input.collection.completedAt ?? input.collection.startedAt, now, TELEMETRY_MAX_AGE_MS);
  const snapshotFresh = input.snapshot && isFresh(input.snapshot.collectedAt, now, TELEMETRY_MAX_AGE_MS);
  const status = statusFresh ? input.status!.status.toLowerCase() : "";
  const collection = collectionFresh ? input.collection!.status.toLowerCase() : "";
  const snapshot = snapshotFresh ? input.snapshot!.state.toLowerCase() : "";
  const metrics = new Map<string, Metric>();
  for (const metric of input.metrics) {
    if (!RESOURCE_KEYS.has(metric.metricKey) || !isFresh(metric.timestamp, now, TELEMETRY_MAX_AGE_MS) || !Number.isFinite(metric.value) || metric.value < 0 || metric.value > 100) continue;
    const previous = metrics.get(metric.metricKey);
    if (!previous || new Date(metric.timestamp).getTime() > new Date(previous.timestamp).getTime()) metrics.set(metric.metricKey, metric);
  }

  const reasons: string[] = [];
  let severity: "warning" | "critical" | null = null;
  const raise = (level: "warning" | "critical", reason: string) => {
    if (level === "critical" || severity === null) severity = level;
    reasons.push(reason);
  };
  if (["offline", "error"].includes(status)) raise("critical", "connection_failed");
  if (["failed", "error"].includes(collection)) raise("warning", "collection_failed");
  if (["critical", "error"].includes(snapshot)) raise("critical", "health_snapshot_critical");
  else if (["warning", "degraded", "unhealthy"].includes(snapshot)) raise("warning", "health_snapshot_warning");
  for (const [key, metric] of metrics) {
    if (metric.value >= 95) raise("critical", `resource_critical:${key}`);
    else if (metric.value >= 85) raise("warning", `resource_high:${key}`);
  }
  // Security findings are intentionally not part of operational device health.
  // They remain visible in Security and remediation views, but an alert must not
  // turn a reachable device with healthy resources into a failed device.

  const verifiedReachability = status === "online" || ["succeeded", "completed"].includes(collection);
  const measured = Boolean(snapshotFresh) || metrics.size > 0;
  const coverage = measured && verifiedReachability ? "measured" : statusFresh || collectionFresh || snapshotFresh || metrics.size ? "partial" : "none";
  const measuredScore = snapshotFresh && Number.isFinite(input.snapshot!.score) ? Math.max(0, Math.min(100, input.snapshot!.score)) : null;
  if (severity) return { state: severity, score: measuredScore === null ? null : Math.min(measuredScore, severity === "critical" ? 39 : 79), coverage, reasons };
  if (!verifiedReachability || !measured) return { state: "unknown", score: null, coverage, reasons: ["insufficient_fresh_evidence"] };
  return { state: "healthy", score: measuredScore, coverage, reasons };
}
