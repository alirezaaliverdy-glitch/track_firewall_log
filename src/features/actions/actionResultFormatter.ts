import { normalizeArray, normalizeObject, type ActionPlan } from "@/lib/actions";
import { actionRawOutput, parseOpenPorts } from "@/lib/actionResult";

type ResultSection = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

export type FormattedActionResult = {
  summaryFa: string;
  nextActionsFa: string[];
  structuredSections: ResultSection[];
  rawOutput: string;
};

function parseServiceUnits(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      line &&
      !line.startsWith("UNIT ") &&
      !line.startsWith("LOAD ") &&
      !line.startsWith("0 loaded units listed") &&
      !line.startsWith("Legend:")
    )
    .map((line) => {
      const parts = line.split(/\s+/);
      return {
        unit: parts[0] ?? "-",
        load: parts[1] ?? "-",
        active: parts[2] ?? "-",
        sub: parts[3] ?? "-",
        description: parts.slice(4).join(" ") || "-",
      };
    });
}

function parseDailySections(action: ActionPlan) {
  const parsedResult = normalizeObject(normalizeObject(action.resultJson).parsedResult);
  return normalizeArray<Record<string, unknown>>(parsedResult.sections);
}

function executionStateFa(action: ActionPlan) {
  const result = normalizeObject(action.resultJson);
  const metadata = normalizeObject(normalizeObject(action.parametersJson).metadata);
  return action.status === "succeeded" && result.executed === true && metadata.connectorInvoked === true ? "موفق" : "ناموفق";
}

function genericFormatted(action: ActionPlan): FormattedActionResult {
  const result = normalizeObject(action.resultJson);
  return {
    summaryFa: String(result.message ?? (executionStateFa(action) === "موفق" ? "اجرای واقعی با موفقیت ثبت شد." : "اجرای واقعی کامل نشد.")),
    nextActionsFa: ["وضعیت دستگاه و خروجی خام را برای تصمیم بعدی بررسی کنید."],
    structuredSections: [],
    rawOutput: actionRawOutput(action),
  };
}

function mapRows(title: string, rows: Array<{ label: string; value: string }>): ResultSection[] {
  return rows.length > 0 ? [{ title, rows }] : [];
}

export function formatActionResult(action: ActionPlan): FormattedActionResult {
  const rawOutput = actionRawOutput(action);
  const params = normalizeObject(action.parametersJson);
  const parsed = normalizeObject(normalizeObject(action.resultJson).parsedResult);

  if (["fortigate_show_interfaces", "fortigate_route_dns_check", "fortigate_license_status", "fortigate_admin_users"].includes(action.actionType)) {
    const evidence = normalizeArray<unknown>(parsed.evidence).map(String);
    const recommendations = normalizeArray<unknown>(parsed.recommendationsFa).map(String);
    const commands = normalizeArray<Record<string, unknown>>(normalizeObject(action.resultJson).commands).map((item) => String(item.template ?? "-"));
    return {
      summaryFa: String(parsed.summaryFa ?? "نتیجه بررسی FortiGate ثبت شد."),
      nextActionsFa: recommendations,
      structuredSections: [{
        title: action.actionType === "fortigate_license_status" ? "وضعیت لایسنس و FortiGuard" : action.actionType === "fortigate_route_dns_check" ? "مسیر و DNS" : action.actionType === "fortigate_admin_users" ? "کاربران مدیر" : "وضعیت اینترفیس‌ها و دسترسی مدیریتی",
        rows: [
          { label: "وضعیت", value: String(parsed.status ?? "not_checked") },
          { label: "خلاصه", value: String(parsed.summaryFa ?? "قابل تشخیص نیست") },
          { label: "شواهد", value: evidence.slice(0, 12).join("\n") || "شواهد قابل اتکا استخراج نشد" },
          { label: "فرمان‌ها", value: commands.join("، ") || "ثبت نشده" },
          { label: "اطمینان parser", value: String(parsed.confidence ?? "-") },
        ],
      }],
      rawOutput,
    };
  }

  if (action.actionType === "linux_open_port" || action.actionType === "linux_close_port" || action.actionType === "close_port") {
    const port = String(params.port ?? params.toPort ?? "-");
    const protocol = String(params.protocol ?? "tcp");
    const isOpen = action.actionType === "linux_open_port";
    return {
      summaryFa: isOpen ? `درخواست باز کردن پورت ${port}/${protocol} ثبت و اجرا/بررسی شد.` : `درخواست بستن پورت ${port}/${protocol} ثبت و اجرا/بررسی شد.`,
      nextActionsFa: ["وضعیت فایروال و دسترسی سرویس روی همین پورت را دوباره بررسی کنید."],
      structuredSections: mapRows("جزئیات عملیات", [
        { label: "پورت", value: port },
        { label: "پروتکل", value: protocol },
        { label: "وضعیت اجرا", value: executionStateFa(action) },
      ]),
      rawOutput,
    };
  }

  if (action.actionType === "linux_check_service_status") {
    const serviceName = String(params.serviceName ?? params.service ?? "-");
    return {
      summaryFa: `وضعیت سرویس ${serviceName} جمع‌آوری شد.`,
      nextActionsFa: ["اگر سرویس inactive یا failed است، لاگ و وابستگی‌های همان سرویس را بررسی کنید."],
      structuredSections: mapRows("وضعیت سرویس", [
        { label: "سرویس", value: serviceName },
        { label: "وضعیت اجرا", value: executionStateFa(action) },
        { label: "خلاصه", value: rawOutput.split(/\r?\n/).slice(0, 8).join("\n") || "بدون خروجی" },
      ]),
      rawOutput,
    };
  }

  if (action.actionType === "linux_list_running_services" || action.actionType === "linux_list_failed_services") {
    const units = parseServiceUnits(rawOutput).slice(0, 25);
    const title = action.actionType === "linux_list_running_services" ? "سرویس‌های فعال" : "سرویس‌های خطادار";
    return {
      summaryFa: action.actionType === "linux_list_running_services" ? "فهرست سرویس‌های فعال جمع‌آوری شد." : "فهرست سرویس‌های خطادار جمع‌آوری شد.",
      nextActionsFa: ["برای هر سرویس مهم، بررسی وضعیت دقیق همان سرویس را از پنل سرویس‌های لینوکس اجرا کنید."],
      structuredSections: mapRows(title, units.map((unit) => ({
        label: unit.unit,
        value: `${unit.active}/${unit.sub} — ${unit.description}`,
      }))),
      rawOutput,
    };
  }

  if (action.actionType === "linux_daily_check" || action.actionType === "mikrotik_daily_check" || action.actionType === "fortigate_daily_check") {
    const sections = parseDailySections(action);
    const overallStatus = String(normalizeObject(normalizeObject(action.resultJson).parsedResult).overallStatus ?? "نامشخص");
    return {
      summaryFa: `نتیجه چک روزانه با وضعیت کلی ${overallStatus} ثبت شد.`,
      nextActionsFa: sections.flatMap((section) => normalizeArray<unknown>(normalizeObject(section).suggestedActions).map(String)).slice(0, 8),
      structuredSections: sections.map((section) => ({
        title: String(section.titleFa ?? "بخش"),
        rows: [
          { label: "وضعیت", value: String(section.status ?? section.severity ?? "-") },
          { label: "خلاصه", value: String(section.summaryFa ?? "-") },
          { label: "اقلام", value: normalizeArray<unknown>(section.items).map(String).join(" | ") || "-" },
        ],
      })),
      rawOutput,
    };
  }

  if (action.actionType === "mikrotik_check_login_logs" || action.actionType === "mikrotik_show_logs") {
    return {
      summaryFa: "لاگ‌های MikroTik جمع‌آوری شد.",
      nextActionsFa: ["ورودی‌های account، warning و error را برای تلاش‌های مشکوک یا خطاهای عملیاتی بازبینی کنید."],
      structuredSections: mapRows("خلاصه لاگ", [
        { label: "وضعیت اجرا", value: executionStateFa(action) },
        { label: "نمونه خروجی", value: rawOutput.split(/\r?\n/).slice(0, 10).join("\n") || "بدون خروجی" },
      ]),
      rawOutput,
    };
  }

  if (action.actionType === "mikrotik_list_management_services" || action.actionType === "mikrotik_list_ip_services") {
    return {
      summaryFa: "سرویس‌های مدیریتی MikroTik جمع‌آوری شد.",
      nextActionsFa: ["سرویس‌های غیرضروری را محدود یا غیرفعال کنید و آدرس‌های مجاز مدیریتی را بازبینی کنید."],
      structuredSections: mapRows("سرویس‌های مدیریتی", [
        { label: "وضعیت اجرا", value: executionStateFa(action) },
        { label: "نمونه خروجی", value: rawOutput.split(/\r?\n/).slice(0, 12).join("\n") || "بدون خروجی" },
      ]),
      rawOutput,
    };
  }

  if (action.actionType === "linux_list_open_ports" || action.actionType === "linux_read_listening_ports") {
    const ports = parseOpenPorts(rawOutput).slice(0, 30);
    return {
      summaryFa: "پورت‌های شنونده جمع‌آوری شد.",
      nextActionsFa: ["پورت‌های غیرمنتظره را با سرویس‌های فعال و سیاست فایروال تطبیق دهید."],
      structuredSections: mapRows("پورت‌های شنونده", ports.map((port) => ({
        label: `${port.protocol} ${port.port}`,
        value: `${port.localAddress} — ${port.process}`,
      }))),
      rawOutput,
    };
  }

  return genericFormatted(action);
}
