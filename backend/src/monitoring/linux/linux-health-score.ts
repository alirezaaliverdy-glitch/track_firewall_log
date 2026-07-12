export type LinuxMetric = { metricKey: string; value: number; unit?: string; labels?: Record<string, unknown> };
export type LinuxHealthState = "healthy" | "warning" | "critical" | "offline" | "stale" | "unknown";

export function scoreLinuxHealth(metrics: LinuxMetric[], warnings: string[] = []) {
  const get = (key: string) => metrics.find((metric) => metric.metricKey === key)?.value;
  let score = 100;
  const cpu = get("cpu.usage_percent");
  const mem = get("memory.usage_percent");
  const disk = get("disk.usage_percent");
  const failed = get("services.failed_count");
  const firewall = get("firewall.enabled");
  const rxErrors = get("network.rx_errors") ?? 0;
  const txErrors = get("network.tx_errors") ?? 0;
  if (cpu !== undefined) score -= cpu > 90 ? 20 : cpu > 75 ? 10 : 0;
  if (mem !== undefined) score -= mem > 92 ? 20 : mem > 80 ? 10 : 0;
  if (disk !== undefined) score -= disk > 92 ? 25 : disk > 80 ? 12 : 0;
  if (failed !== undefined) score -= Math.min(20, failed * 5);
  if (firewall === 0) score -= 10;
  if (rxErrors + txErrors > 0) score -= 5;
  if (warnings.length) score -= Math.min(10, warnings.length * 2);
  score = Math.max(0, Math.round(score));
  const state = score < 50 ? "critical" : score < 80 ? "warning" : "healthy";
  return { score, state: state as LinuxHealthState, summary: state === "healthy" ? "Linux health is normal" : state === "warning" ? "Linux health has warnings" : "Linux health needs attention" };
}
