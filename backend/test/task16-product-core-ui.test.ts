import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("Daily Check panel exposes Persian vendor-aware UX", () => {
  const panel = read("../../src/components/daily-check/DailyCheckPanel.tsx");
  assert.match(panel, /چک روزانه/);
  assert.match(panel, /اجرای چک روزانه/);
  assert.match(panel, /اجرای واقعی/);
  assert.match(panel, /چک‌لیست دستی/);
  assert.match(panel, /در حال توسعه/);
  assert.match(panel, /سلامت کلی|پیشنهادهای بعدی|وضعیت پشتیبانی/);
});

test("Linux Service Health panel exposes quick checks and important service actions", () => {
  const panel = read("../../src/components/services/LinuxServiceHealthPanel.tsx");
  assert.match(panel, /سرویس‌های لینوکس/);
  assert.match(panel, /نمایش سرویس‌های فعال/);
  assert.match(panel, /نمایش سرویس‌های خطادار/);
  assert.match(panel, /بررسی وضعیت/);
  assert.match(panel, /بررسی سرویس‌های مهم/);
  for (const chip of ["nginx", "ssh", "docker", "fail2ban", "apache", "postgres", "mysql", "redis"]) {
    assert.match(panel, new RegExp(chip));
  }
});

test("Action result view and formatter cover structured output and raw fallback", () => {
  const resultView = read("../../src/components/actions/ActionResultView.tsx");
  const formatter = read("../../src/features/actions/actionResultFormatter.ts");
  assert.match(resultView, /خلاصه نتیجه/);
  assert.match(resultView, /وضعیت اجرا/);
  assert.match(resultView, /خروجی ساختاریافته/);
  assert.match(resultView, /پیشنهادهای بعدی/);
  assert.match(resultView, /خروجی خام/);
  for (const actionType of ["linux_open_port", "linux_check_service_status", "linux_list_running_services", "linux_list_failed_services", "linux_daily_check", "mikrotik_daily_check", "mikrotik_check_login_logs", "mikrotik_list_management_services"]) {
    assert.match(formatter, new RegExp(actionType));
  }
});

test("result navigation uses new tab helper with popup fallback", () => {
  const center = read("../../src/components/actions/ActionCenterPanel.tsx");
  const helper = read("../../src/lib/actionResultNavigation.ts");
  assert.match(center, /openActionResultInNewTab/);
  assert.match(center, /مشاهده نتیجه در تب جدید/);
  assert.match(helper, /window\.open/);
  assert.match(helper, /\/actions\/\$\{encodeURIComponent\(actionPlanId\)\}\/result/);
});
