export type DeviceIssue = {
  id: string;
  severity: "warning" | "critical";
  titleFa: string;
  titleEn: string;
  causeFa: string;
  causeEn: string;
  nextStepFa: string;
  nextStepEn: string;
  observedAt: string | null;
  action: { kind: "connection_test" | "setup" | "finding_plan" | "monitoring"; findingId?: string };
};

type Status = { status: string; checkedAt: Date | string; message?: string | null };
type Collection = { status: string; startedAt: Date | string; completedAt?: Date | string | null; errorCode?: string | null };
type Finding = { id: string; title: string; severity: string; status: string; lastSeen: Date | string };
type Sensor = { key: string; value: string | number; measuredAt: Date | string | null };

const iso = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : null;
const recent = (value: Date | string | null | undefined, now: Date, maxAgeMs: number) => {
  const timestamp = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(timestamp) && now.getTime() - timestamp <= maxAgeMs && timestamp <= now.getTime() + 60_000;
};

export function diagnoseDeviceIssues(input: {
  status?: Status | null;
  collection?: Collection | null;
  credentialConfigured: boolean;
  findings: Finding[];
  sensors: Sensor[];
  now?: Date;
}): DeviceIssue[] {
  const now = input.now ?? new Date();
  const issues: DeviceIssue[] = [];
  const status = input.status;
  if (status && recent(status.checkedAt, now, 90_000) && ["offline", "error"].includes(status.status.toLowerCase())) {
    issues.push({ id: "connection", severity: "critical", titleFa: "ارتباط تجهیز قطع است", titleEn: "Device connection is down", causeFa: "پایش ارتباط، پاسخ معتبر از مسیر مدیریت دریافت نکرده است؛ علت دقیق هنوز تأیید نشده است.", causeEn: "Connectivity monitoring did not receive a valid response; the exact cause is not confirmed.", nextStepFa: input.credentialConfigured ? "اتصال را دوباره بررسی کنید. اگر قطع بود، مسیر شبکه، پورت و سرویس مدیریت تجهیز را بررسی کنید." : "ابتدا اعتبارنامه و مسیر اتصال تجهیز را تکمیل کنید.", nextStepEn: input.credentialConfigured ? "Retest the connection; if still down, inspect the network path, port and management service." : "Configure credentials and the management channel first.", observedAt: iso(status.checkedAt), action: { kind: input.credentialConfigured ? "connection_test" : "setup" } });
  }
  const collection = input.collection;
  if (collection && ["failed", "error"].includes(collection.status.toLowerCase()) && recent(collection.completedAt ?? collection.startedAt, now, 15 * 60_000)) {
    const code = String(collection.errorCode ?? "").toUpperCase();
    const authentication = /AUTH|CREDENTIAL|LOGIN|PERMISSION|FORBIDDEN/.test(code);
    const certificate = /TLS|CERT|HOST_KEY|FINGERPRINT/.test(code);
    const timeout = /TIMEOUT|UNREACHABLE|ECONNREFUSED|NETWORK/.test(code);
    issues.push({ id: "collection", severity: "warning", titleFa: authentication ? "ورود به تجهیز پذیرفته نشد" : certificate ? "اعتماد به گواهی یا کلید تجهیز برقرار نیست" : timeout ? "جمع‌آوری به تجهیز نرسید" : "آخرین جمع‌آوری ناموفق بود", titleEn: authentication ? "Device authentication failed" : certificate ? "Device certificate or host key is untrusted" : timeout ? "Collection could not reach the device" : "Latest collection failed", causeFa: authentication ? "تجهیز اعتبارنامهٔ ذخیره‌شده را رد کرده است؛ آنلاین بودن شبکه به معنی تأیید ورود نیست." : certificate ? "هویت امن تجهیز تأیید نشده است؛ بررسی گواهی یا کلید میزبان لازم است." : timeout ? "اتصال در زمان مجاز کامل نشده است؛ قطعی شبکه، پورت یا سرویس مدیریت محتمل است." : "جمع‌آوری‌کننده خطا گزارش کرده، اما از کد فعلی علت قطعی مشخص نیست.", causeEn: authentication ? "The device rejected the stored credentials; network reachability does not prove login." : certificate ? "The device identity could not be verified; inspect its certificate or host key." : timeout ? "The connection timed out; inspect the network, port and management service." : "The collector failed, but its code does not establish a definite cause.", nextStepFa: authentication ? "اعتبارنامه، سطح دسترسی و وضعیت حساب را در تنظیمات اتصال بررسی کنید." : certificate ? "اثر انگشت یا زنجیرهٔ گواهی را از مسیر مورداعتماد تطبیق دهید و سپس تنظیمات اتصال را اصلاح کنید." : timeout ? "آدرس، پورت و فایروال مسیر را بررسی کنید؛ سپس اتصال را دوباره آزمایش کنید." : "جزئیات پایش را ببینید و کد خطا را بررسی کنید؛ بدون شواهد کافی تغییری روی تجهیز انجام نمی‌شود.", nextStepEn: authentication ? "Review credentials, permissions and account state in connection settings." : certificate ? "Verify the fingerprint or certificate chain out of band, then correct connection settings." : timeout ? "Check the address, port and firewall path, then retest." : "Inspect monitoring details and the error code; no device change is made without evidence.", observedAt: iso(collection.completedAt ?? collection.startedAt), action: { kind: authentication || certificate ? "setup" : timeout ? "connection_test" : "monitoring" } });
  }
  for (const finding of input.findings.filter((item) => !["resolved", "closed", "false_positive", "suppressed"].includes(item.status) && ["high", "critical"].includes(item.severity)).slice(0, 3)) {
    issues.push({ id: `finding:${finding.id}`, severity: finding.severity === "critical" ? "critical" : "warning", titleFa: "یافتهٔ امنیتی نیازمند بررسی", titleEn: "Security finding needs review", causeFa: "این یافته از شواهد ثبت‌شده برای همین تجهیز ایجاد شده است؛ عنوان و شواهد آن را پیش از اقدام بررسی کنید.", causeEn: "This finding came from stored evidence for this device; review its title and evidence before acting.", nextStepFa: "با یک کلیک برنامهٔ رفع بسازید، سپس پیش‌نمایش و اثر احتمالی آن را تأیید کنید. ساخت برنامه تغییری روی تجهیز نمی‌دهد.", nextStepEn: "Create a remediation plan, then review its preview and impact. Plan creation does not change the device.", observedAt: iso(finding.lastSeen), action: { kind: "finding_plan", findingId: finding.id } });
  }
  if (!issues.some((item) => item.id === "connection")) for (const sensor of input.sensors) {
    if (!recent(sensor.measuredAt, now, 15 * 60_000) || !/^(cpu|memory|disk)\.usage_percent$/.test(sensor.key) || typeof sensor.value !== "number" || sensor.value < 85) continue;
    const name = sensor.key.split(".")[0].toUpperCase();
    issues.push({ id: `resource:${sensor.key}`, severity: sensor.value >= 95 ? "critical" : "warning", titleFa: `مصرف ${name} بالا است`, titleEn: `${name} usage is high`, causeFa: `آخرین اندازه‌گیری معتبر ${name} برابر ${sensor.value}٪ است؛ عامل مصرف هنوز مشخص نشده است.`, causeEn: `The latest valid ${name} measurement is ${sensor.value}%; the process causing it is not yet known.`, nextStepFa: "روند مصرف و پردازش‌ها را بررسی کنید؛ بدون شناخت عامل مصرف، سرویس یا تجهیز خودکار تغییر نمی‌کند.", nextStepEn: "Review the trend and processes; no service or device is changed without identifying the cause.", observedAt: iso(sensor.measuredAt), action: { kind: "monitoring" } });
  }
  return issues.slice(0, 6);
}
