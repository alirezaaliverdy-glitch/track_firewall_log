export type LinuxHealthDiagnosis = {
  kind: "connection" | "stale" | "security" | "resource" | "collection" | "unknown";
  titleFa: string;
  titleEn: string;
  causeFa: string;
  causeEn: string;
  nextStepFa: string;
  nextStepEn: string;
  observedAt: string | null;
};

type Input = {
  state: string;
  summary?: string | null;
  warnings?: unknown;
  score?: number | null;
  observedAt?: Date | string | null;
};

function listWarnings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function observedAt(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Converts the persisted health state into an operator-facing diagnosis.
 * It deliberately never presents raw collector text as the explanation: raw
 * evidence remains available on the device workspace, while the dashboard
 * receives a short, actionable and Persian-first summary.
 */
export function diagnoseLinuxHealth(input: Input): LinuxHealthDiagnosis | null {
  const state = input.state.toLowerCase();
  const warnings = listWarnings(input.warnings);
  // The generic summary itself contains the word “warnings”; classify only
  // concrete persisted evidence so an online host is not mislabeled as a
  // security incident merely because its status is warning.
  const evidence = warnings.join(" ");
  const when = observedAt(input.observedAt);

  if (["offline", "error"].includes(state)) {
    return {
      kind: "connection",
      titleFa: "اتصال به سرور برقرار نیست",
      titleEn: "The server connection is down",
      causeFa: "آخرین بررسی از مسیر مدیریتی پاسخ معتبر نگرفته است؛ آنلاین بودن قبلی، دسترسی فعلی را تأیید نمی‌کند.",
      causeEn: "The latest management check did not receive a valid response; a previous online state does not prove current access.",
      nextStepFa: "صفحهٔ تجهیز را باز کنید، کانال مدیریت و اعتبارنامه را بررسی و سپس اتصال را دوباره آزمایش کنید.",
      nextStepEn: "Open the device workspace, review the management channel and credentials, then retest the connection.",
      observedAt: when,
    };
  }
  if (state === "stale") {
    return {
      kind: "stale",
      titleFa: "دادهٔ سلامت به‌روز نیست",
      titleEn: "Health data is stale",
      causeFa: "زمان اعتبار آخرین Snapshot گذشته و داشبورد نمی‌تواند آن را وضعیت فعلی سرور بداند.",
      causeEn: "The latest health snapshot has expired, so the dashboard cannot treat it as the current server state.",
      nextStepFa: "جزئیات تجهیز را باز کنید و جمع‌آوری احراز‌شده را اجرا کنید؛ در صورت تکرار، مسیر و سرویس SSH را بررسی کنید.",
      nextStepEn: "Open the device details and run an authenticated collection; if it repeats, inspect the path and SSH service.",
      observedAt: when,
    };
  }

  const text = evidence.toLowerCase();
  if (/(security|authentication|failed login|denied|warning|critical|alert)/i.test(text)) {
    return {
      kind: "security",
      titleFa: "رویداد امنیتی اخیر نیازمند بررسی است",
      titleEn: "A recent security event needs review",
      causeFa: "جمع‌آوری احراز‌شده در لاگ‌های اخیر یک سیگنال امنیتی ثبت کرده است؛ این کارت به‌تنهایی وقوع نفوذ را ثابت نمی‌کند.",
      causeEn: "Authenticated collection recorded a recent security signal; this card alone does not prove an intrusion.",
      nextStepFa: "جزئیات تجهیز را باز کنید، شواهد و منبع رویداد را ببینید و در صورت تأیید، برنامهٔ رفع را برای پیش‌نمایش بسازید.",
      nextStepEn: "Open the device details, inspect the evidence and source, and create a remediation plan for preview if confirmed.",
      observedAt: when,
    };
  }
  if (/(cpu|load)/i.test(text)) {
    return {
      kind: "resource",
      titleFa: "بار پردازنده بالاست",
      titleEn: "CPU load is elevated",
      causeFa: "آخرین جمع‌آوری بار پردازنده را بالاتر از آستانهٔ هشدار گزارش کرده است.",
      causeEn: "The latest collection reported CPU load above the warning threshold.",
      nextStepFa: "روند CPU و پردازش‌های فعال را در پایش ببینید؛ بدون شناسایی عامل، سرویسی خودکار متوقف نمی‌شود.",
      nextStepEn: "Review the CPU trend and active processes; no service is stopped automatically without identifying the cause.",
      observedAt: when,
    };
  }
  if (/(memory|ram|swap)/i.test(text)) {
    return {
      kind: "resource",
      titleFa: "مصرف حافظه بالاست",
      titleEn: "Memory usage is elevated",
      causeFa: "آخرین جمع‌آوری فشار حافظه را بالاتر از آستانهٔ هشدار گزارش کرده است.",
      causeEn: "The latest collection reported memory pressure above the warning threshold.",
      nextStepFa: "روند حافظه و پردازش‌های پرمصرف را بررسی کنید؛ تغییر خودکار روی سرور انجام نمی‌شود.",
      nextStepEn: "Review the memory trend and high-consumption processes; no automatic server change is made.",
      observedAt: when,
    };
  }
  if (/(disk|storage|full)/i.test(text)) {
    return {
      kind: "resource",
      titleFa: "فضای دیسک کم است",
      titleEn: "Disk space is low",
      causeFa: "آخرین Snapshot مصرف فضای دیسک را در محدودهٔ هشدار نشان می‌دهد.",
      causeEn: "The latest snapshot shows disk usage in the warning range.",
      nextStepFa: "مسیر پرمصرف را در جزئیات تجهیز بررسی و قبل از حذف، فایل‌ها را با مالک سرویس تأیید کنید.",
      nextStepEn: "Inspect the consuming mount in device details and confirm files with the service owner before deleting anything.",
      observedAt: when,
    };
  }
  if (state === "warning" || state === "critical" || input.score !== null && input.score !== undefined && input.score < 80) {
    return {
      kind: "collection",
      titleFa: "دادهٔ سلامت ناقص یا نیازمند بررسی است",
      titleEn: "Health data needs review",
      causeFa: "وضعیت هشدار ثبت شده، اما از شواهد موجود علت دقیق‌تری قابل تأیید نیست؛ متن خام نمایش داده نمی‌شود.",
      causeEn: "A warning state was recorded, but the available evidence does not confirm a more specific cause; raw text is not shown.",
      nextStepFa: "جزئیات تجهیز را باز کنید، زمان آخرین جمع‌آوری و بخش تشخیص را بررسی و سپس جمع‌آوری را دوباره اجرا کنید.",
      nextStepEn: "Open device details, review the last collection and diagnosis, then run a new collection.",
      observedAt: when,
    };
  }
  return null;
}
