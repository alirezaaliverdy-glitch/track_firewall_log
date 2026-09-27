import type { DeviceConnectionTestResult } from "../connectors/types.js";
import type { LinuxServerOverview } from "../telemetry/linux/linux-telemetry.types.js";
import type { ReportEquipmentCategory, ReportEquipmentState } from "./company-status-report.types.js";

export type ReportLiveData = { collectedAt: string; connector?: DeviceConnectionTestResult; linux?: LinuxServerOverview; collectionError?: string } | null;
type Stored = { status: string; vendor: string; type: string; asset?: { role?: { name: string } | null; platform?: { name: string } | null } | null; statusChecks: Array<{ status: string; message: string | null; checkedAt: Date }>; healthSnapshots: Array<{ state: string; summary: string; collectedAt: Date }> };
export function reportCategory(device: Pick<Stored, "vendor" | "type" | "asset">): ReportEquipmentCategory {
  const vendor = device.vendor.toLowerCase();
  if (/linux/.test(vendor)) return "server";
  if (/cisco/.test(vendor)) return /router/.test(`${device.asset?.role?.name ?? ""} ${device.asset?.platform?.name ?? ""}`.toLowerCase()) ? "router" : "switch";
  if (/forti|sophos|pfsense/.test(vendor)) return "firewall";
  if (/mikrotik/.test(vendor)) return "router";
  const raw = `${device.type} ${device.asset?.role?.name ?? ""}`.toLowerCase();
  return /server/.test(raw) ? "server" : /switch/.test(raw) ? "switch" : /router/.test(raw) ? "router" : /firewall/.test(raw) ? "firewall" : "other";
}

export function explainReportSignal(raw: string): { reason: string; action: string } {
  if (/CPU.*overload|CPU.*elevated/i.test(raw)) return { reason: "فشار پردازنده بالا است", action: "در نمای کلی، مصرف CPU و فرایندهای پرمصرف را بررسی کنید؛ پیش از توقف هر فرایند، اثر آن بر سرویس را بسنجید." };
  if (/memory.*pressure|memory.*high/i.test(raw)) return { reason: "مصرف حافظه بالا است", action: "مصرف RAM و فرایندهای پرمصرف را بررسی و علت رشد حافظه را مشخص کنید." };
  if (/disk.*full|disk.*high/i.test(raw)) return { reason: "فضای آزاد دیسک کم است", action: "پارتیشن پُر و فایل‌های حجیم را بررسی کنید؛ پیش از پاک‌سازی، بک‌آپ بگیرید." };
  if (/service.*fail/i.test(raw)) return { reason: "یک سرویس گزارش خطا دارد", action: "در سنسورها نام سرویس و لاگ خطا را ببینید؛ پس از مشخص‌شدن علت، اقدام اصلاحی را با پیش‌نمایش انجام دهید." };
  if (/security.*warn|security.*signal/i.test(raw)) return { reason: "رویداد امنیتی نیازمند بازبینی ثبت شده است؛ به‌تنهایی نشانهٔ نفوذ قطعی نیست", action: "رخدادهای امنیتی، زمان و منبع تلاش‌های ورود را بررسی کنید؛ رویداد مجاز را از تلاش مشکوک تفکیک کنید." };
  if (/sudo|privilege|permission|not permitted|access denied/i.test(raw)) return { reason: "بخشی از اطلاعات با مجوز حساب اتصال قابل خواندن نیست", action: "در تنظیم اتصال، حساب و مجوز خواندن را بررسی کنید؛ فقط مجوز لازم را اختصاص دهید و دوباره جمع‌آوری کنید." };
  if (/auth|credential|password/i.test(raw)) return { reason: "احراز هویت کانال مدیریتی تأیید نشده است", action: "اعتبارنامهٔ انتخاب‌شده، نام کاربری و روش ورود را در تنظیم اتصال اصلاح و تست اتصال را اجرا کنید." };
  if (/TCP|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/i.test(raw)) return { reason: "کانال مدیریتی دستگاه در دسترس نیست", action: "IP، پورت ثبت‌شده، مسیر شبکه و فایروال را بررسی کنید؛ سپس تست اتصال بگیرید." };
  if (/timeout|timed out|banner|handshake/i.test(raw)) return { reason: "پاسخ کانال مدیریتی در زمان مجاز دریافت نشده است؛ خاموش‌بودن دستگاه ثابت نشده", action: "پورت ثبت‌شده و سرویس SSH/API، محدودیت اتصال و لاگ مسدودسازی را بررسی و تست اتصال را تکرار کنید." };
  if (/license|expired/i.test(raw)) return { reason: "وضعیت مجوز یا اشتراک وندور نیازمند بررسی است", action: "جزئیات مجوز و تاریخ اعتبار را در دستگاه بررسی کنید؛ سپس داده‌ها را دوباره جمع‌آوری کنید." };
  if (/no output|partial|unavailable|skipped|exited with code/i.test(raw)) return { reason: "جمع‌آوری بعضی سنسورها کامل نشده است", action: "در نمای کلی، سنسورهای بدون داده و خطای جمع‌آوری را بررسی و پس از رفع علت دوباره جمع‌آوری کنید." };
  return { reason: "یک هشدار فنی ثبت شده و علت دقیق نیازمند بررسی جزئیات است", action: "جزئیات هشدار را در نمای کلی و سنسورها بررسی کنید؛ صرفاً از برچسب وضعیت، خطای سخت‌افزاری یا کمبود مجوز را نتیجه نگیرید." };
}

export function reportPercentage(value: unknown): number | null {
  const raw = typeof value === "string" ? value.trim() : value;
  if (typeof raw !== "number" && (typeof raw !== "string" || !/^\d+(\.\d+)?%?$/.test(raw))) return null;
  const n = typeof raw === "number" ? raw : Number(raw.replace("%", ""));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 10) / 10 : null;
}

export function reportActionTitle(raw: string) {
  if (/show clock/i.test(raw)) return "بررسی ساعت دستگاه";
  if (/show ip interface brief/i.test(raw)) return "بررسی وضعیت اینترفیس‌ها";
  if (/show version/i.test(raw)) return "بررسی نسخه و مدل دستگاه";
  if (/show.*etherchannel/i.test(raw)) return "بررسی وضعیت EtherChannel";
  if (/show.*vlan/i.test(raw)) return "بررسی VLANها";
  if (/show.*trunk/i.test(raw)) return "بررسی لینک‌های Trunk";
  return /[\u0600-\u06ff]/.test(raw) ? raw : "عملیات اجراشده و تأییدشده";
}

export function assessReportDevice(device: Stored, live: ReportLiveData, now = Date.now()): { status: ReportEquipmentState; statusReason: string; recommendation: string; technicalDetails: string; connectionState: "online" | "offline" | "unknown" } {
  const result = (status: ReportEquipmentState, statusReason: string, recommendation: string, technicalDetails = "", connectionState: "online" | "offline" | "unknown" = "unknown") => ({ status, statusReason, recommendation, technicalDetails, connectionState });
  if (live?.linux) {
    const o = live.linux;
    const reasons = [...o.health.reasons, ...o.warnings];
    if (o.connection.status === "error") { const e=explainReportSignal(reasons.join(" ")); return result("limited", e.reason, e.action, reasons.join("; ")); }
    if (o.health.status !== "healthy" || o.connection.status === "partial" || reasons.length) {
      const explained = [...new Set(reasons)].slice(0, 3).map(explainReportSignal);
      if (!explained.length) explained.push(explainReportSignal("partial"));
      return result("limited", [...new Set(explained.map(e=>e.reason))].join("؛ "), [...new Set(explained.map(e=>e.action))].join(" "), reasons.join("; "), "online");
    }
    return result("active", "اتصال برقرار است و در بررسی فعلی هشدار سلامت گزارش نشده است", "پایش دوره‌ای را ادامه دهید؛ نبود هشدار، تضمین سلامت تمام اجزای دستگاه نیست.", "", "online");
  }
  if (live?.connector) {
    const c=live.connector;
    if (c.connected && !c.warnings.length) return result("active", "اتصال و خواندن اطلاعات دستگاه با موفقیت تأیید شد", "پایش دوره‌ای و بک‌آپ منظم را ادامه دهید.", "", "online");
    const raw = c.warnings.map(w=>`${w.code}: ${w.message}`).join("; ") || c.errorCode || c.message || "partial";
    const e=explainReportSignal(raw);
    const offline=!c.connected && /TCP|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/.test(c.errorCode ?? "");
    return result(offline ? "inactive" : "limited", e.reason, e.action, raw, c.connected ? "online" : offline ? "offline" : "unknown");
  }
  if (live?.collectionError) { const e=explainReportSignal(live.collectionError); return result("limited", e.reason, e.action, live.collectionError); }
  const check=device.statusChecks[0], health=device.healthSnapshots[0];
  if (check?.status === "offline" && now-check.checkedAt.getTime() <= 120000) return result("inactive", "آخرین تست تازه، قطع کانال مدیریتی را نشان می‌دهد", explainReportSignal("TCP").action, check.message ?? "", "offline");
  if (health && now-health.collectedAt.getTime() <= 900000 && check?.status === "online" && now-check.checkedAt.getTime() <= 120000) {
    if (["healthy","active"].includes(health.state)) return result("active", "آخرین نمونهٔ معتبر بدون هشدار است؛ در این گزارش جمع‌آوری زنده انجام نشده", "برای تأیید وضعیت همین لحظه، گزارش جدید با جمع‌آوری زنده بسازید.", "", "online");
    const e=explainReportSignal(health.summary); return result("limited", e.reason, e.action, health.summary, "online");
  }
  return result("limited", "اطلاعات تازه و کافی برای تأیید وضعیت موجود نیست؛ وضعیت نامشخص است", "در تنظیم اتصال، IP و پورت و اعتبارنامه را بررسی کنید؛ تست اتصال و سپس جمع‌آوری تازه انجام دهید.");
}
