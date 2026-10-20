import { createHash } from "node:crypto";
export const RESOURCE_KEYS = ["cpu.usage_percent", "memory.usage_percent", "disk.usage_percent", "datastore.usage_percent"];
export type MeasuredResource = { id: string; metricKey: string; value: number; unit: string | null; timestamp: Date; source: string; labelsJson?: unknown };
const names: Record<string, string> = { "cpu.usage_percent": "پردازنده", "memory.usage_percent": "حافظه", "disk.usage_percent": "دیسک", "datastore.usage_percent": "فضای ذخیره‌سازی" };
/** Product defaults, NOT a claim of vendor-standard thresholds. Missing/stale samples never clear a finding. */
export function resourceIssues(samples: MeasuredResource[], now = Date.now()) {
  const groups = new Map<string, MeasuredResource[]>();
  for (const sample of samples) {
    if (!RESOURCE_KEYS.includes(sample.metricKey) || sample.unit !== "percent" || !Number.isFinite(sample.value) || sample.value < 0 || sample.value > 100 || now - sample.timestamp.getTime() > 300_000 || sample.timestamp.getTime() > now + 30_000) continue;
    const labels = sample.labelsJson && typeof sample.labelsJson === "object" ? sample.labelsJson as Record<string, unknown> : {};
    const label = sample.metricKey.startsWith("datastore.") ? labels.datastore : sample.metricKey.startsWith("disk.") ? labels.mount ?? labels.storageIndex : "";
    const key = JSON.stringify([sample.metricKey, sample.source, label ?? ""]);
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  return [...groups.entries()].flatMap(([series, rows]) => {
    const ordered = rows.sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime());
    const latest = ordered[0], previous = ordered.find(row => row.timestamp.getTime() < latest.timestamp.getTime());
    // Repeated polls of the same observation are not independent measurements.
    if (!previous) return [];
    const active = latest.value >= 85 && previous.value >= 85;
    const cleared = latest.value < 80 && previous.value < 80;
    if (!active && !cleared) return [];
    return [{ fingerprint: createHash("sha256").update(`resource-v1:${series}`).digest("hex"), metricKey: latest.metricKey,
      title: `مصرف بالای ${names[latest.metricKey]}`, active, severity: latest.value >= 95 && previous.value >= 95 ? "critical" : "high",
      observedAt: latest.timestamp, references: [latest.id, previous.id],
      evidence: [`${names[latest.metricKey]}: ${previous.value}% ← ${latest.value}%`, `منبع: ${latest.source}؛ زمان اندازه‌گیری: ${latest.timestamp.toISOString()}`, `سری: ${series.slice(0, 240)}`, "آستانهٔ پیش‌فرض برنامه: هشدار ۸۵٪، بحرانی ۹۵٪، رفع زیر ۸۰٪؛ دو اندازه‌گیری تازه، نه استاندارد اختصاصی سازنده."] }];
  });
}
