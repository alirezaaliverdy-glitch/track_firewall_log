import type { NvrReport } from "./nvr-monitor.js";
export type NvrSensor = { id: string; labelFa: string; labelEn: string; group: "connection" | "storage" | "recording" | "hardware";
  value: number | null; unit: string; status: "ok" | "warning" | "critical" | "unknown" | "stale"; source: string; observedAt: string | null; noteFa: string; noteEn: string };

export function nvrSensors(report: NvrReport | null, intervalSeconds = 300, now = Date.now()): NvrSensor[] {
  const observedAt = report?.checkedAt ?? null, age = observedAt ? now - Date.parse(observedAt) : NaN;
  const stale = Boolean(report) && (!Number.isFinite(age) || age < -30000 || age > intervalSeconds * 2000);
  const result: NvrSensor[] = [];
  const add = (id: string, labelFa: string, labelEn: string, group: NvrSensor["group"], value: number | null, unit: string, status: NvrSensor["status"], source: string, noteFa: string, noteEn: string) => {
    const measured = value !== null && Number.isFinite(value);
    result.push({ id, labelFa, labelEn, group, value: measured ? value : null, unit, status: stale && measured ? "stale" : measured ? status : "unknown", source, observedAt, noteFa, noteEn });
  };
  const storageRead = report?.storage?.status === "measured", source = report?.storage?.source ?? "ONVIF", disks = storageRead ? report!.storage!.disks : [];
  const total = (field: "capacityBytes" | "usedBytes") => storageRead && disks.length && disks.every(d => d[field] !== null) ? disks.reduce((sum, disk) => sum + disk[field]!, 0) : null;
  const capacity = total("capacityBytes"), used = total("usedBytes"), temperatures = disks.flatMap(d => d.temperatureC === null ? [] : [d.temperatureC]);
  const temperature = temperatures.length ? Math.max(...temperatures) : null;
  const health = disks.some(d => d.health === "error" || d.smart === "failed") ? 0 : disks.length && disks.every(d => d.health === "reported_ok") ? 1 : null;
  const smart = disks.some(d => d.smart === "failed") ? 0 : disks.length && disks.every(d => d.smart === "passed") ? 1 : null;
  add("connection", "پاسخ تجهیز", "Device response", "connection", report ? Number(report.reachable) : null, "boolean", report?.reachable ? "ok" : "critical", report?.coverage.identity === "measured" ? "ONVIF" : storageRead ? source : "collector", "پاسخ واقعی آخرین پایش؛ تأیید کلی سلامت ضبط نیست.", "Response at last probe, not proof of recording health.");
  add("response_time", "زمان پایش", "Probe duration", "connection", report?.durationMs ?? null, "ms", "ok", "collector", "مدت کل بررسی سرویس‌ها؛ زمان Ping نیست.", "Total service probe duration, not ping latency.");
  const drift = report?.clockDriftSeconds ?? null;
  add("clock", "اختلاف ساعت", "Clock drift", "connection", drift, "s", drift !== null && Math.abs(drift) > 300 ? "critical" : drift !== null && Math.abs(drift) > 120 ? "warning" : "ok", "ONVIF", "بیش از ۱۲۰ ثانیه هشدار؛ بیش از ۳۰۰ ثانیه بحرانی.", "Warning above 120 seconds; critical above 300 seconds.");
  add("disks", "هاردهای گزارش‌شده", "Reported disks", "storage", storageRead ? disks.length : null, "count", disks.length ? "ok" : "critical", source, "فقط از فهرست واقعی هارد؛ صفر یعنی دستگاه هاردی گزارش نکرده.", "From the actual disk list; zero means no disks reported.");
  add("capacity", "ظرفیت هاردها", "Disk capacity", "storage", capacity, "bytes", "ok", source, "جمع فقط زمانی محاسبه می‌شود که ظرفیت تمام هاردها موجود باشد.", "Total only when every reported disk has capacity data.");
  add("usage", "فضای مصرف‌شده", "Disk space used", "storage", capacity && used !== null ? Math.round(used / capacity * 1000) / 10 : null, "%", "ok", source, "پرشدن در ضبط چرخشی الزاماً خطا نیست؛ بر اساس درصد، هشدار خرابی نمی‌سازیم.", "Full overwrite storage may be normal; utilization alone is not a disk-failure alarm.");
  add("disk_health", "وضعیت گزارش‌شده هارد", "Reported disk health", "storage", health, "boolean", health === 0 ? "critical" : "ok", source, "نبود وضعیت یا کد نامستند به معنی سالم‌بودن نیست.", "Missing or undocumented status is not treated as healthy.");
  add("temperature", "بیشترین دمای هارد", "Highest disk temperature", "storage", temperature, "°C", temperature !== null && temperature >= 65 ? "critical" : temperature !== null && temperature >= 55 ? "warning" : "ok", source, "آستانهٔ عمومی ۵۵/۶۵ درجه؛ مشخصات سازنده اولویت دارد. پوشش ممکن است فقط بعضی هاردها باشد.", "Generic 55/65°C thresholds; manufacturer limits take priority. Coverage may be partial.");
  add("smart", "ارزیابی SMART", "SMART assessment", "storage", smart, "boolean", smart === 0 ? "critical" : "ok", source, "فقط نتیجهٔ ارائه‌شده؛ آزمون جدیدی روی هارد شروع نمی‌شود.", "Reported result only. No disk test is started.");
  add("channels", "کانال پیکربندی‌شده", "Configured channels", "recording", report?.coverage.identity === "measured" ? report.configuredChannels : null, "count", "ok", "ONVIF profiles", "تعداد تنظیم کانال، نه تعداد کانال آنلاین.", "Configured source count, not online channels.");
  const observedErrors = report?.jobs.filter(job => job.error).length ?? 0;
  const failedJobs = report?.coverage.recordingJobs === "measured" && (observedErrors || !report.truncated && report.jobs.every(job => job.state !== "Unknown")) ? observedErrors : null;
  add("job_errors", "خطاهای کار ضبط", "Recording job errors", "recording", failedJobs, "count", failedJobs ? "critical" : "ok", "ONVIF recording", "بی‌کار بودن ممکن است زمان‌بندی باشد؛ فقط خطای صریح هشدار می‌سازد.", "Idle may be scheduled; only explicit job errors trigger an alarm.");
  add("cpu", "پردازنده", "CPU", "hardware", null, "%", "unknown", "unsupported", "این آداپتور مقدار واقعی CPU ارائه نکرده است.", "This adapter has not provided an actual CPU measurement.");
  add("memory", "حافظه", "Memory", "hardware", null, "%", "unknown", "unsupported", "این آداپتور مقدار واقعی حافظه ارائه نکرده است.", "This adapter has not provided an actual memory measurement.");
  return result;
}
