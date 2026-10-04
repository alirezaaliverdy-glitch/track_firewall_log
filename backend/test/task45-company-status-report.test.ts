import assert from "node:assert/strict";
import test from "node:test";
import { findMutationPermission } from "../src/security/authorization.js";
import { getProductNavigation, validateProductState } from "../src/product-state/product-state.registry.js";
import { renderCompanyReportHtml, renderCompanyReportXlsx, sanitizeCompanyStatusReport } from "../src/reports/company-status-report.service.js";
import type { CompanyStatusReport } from "../src/reports/company-status-report.types.js";

function fixture(): CompanyStatusReport {
  return {
    schemaVersion: 1, generatedAt: "2026-09-21T10:11:12.000Z", reportDateFa: "۱۴۰۵/۰۶/۳۰", reportDateGregorian: "2026-09-21", reportTime: "۱۳:۴۱:۱۲", timezone: "Asia/Tehran", reportNumber: "ACME-20260921101112", preparedBy: "مدیر شبکه",
    company: { id: "company-1", name: "شرکت نمونه", code: "ACME" }, summary: { total: 2, active: 1, limited: 1, inactive: 0, healthScore: 75 },
    equipment: [
      { id: "linux-1", name: "سرور اصلی", host: "10.0.0.10", vendor: "Linux", model: "Ubuntu", category: "server", status: "active", description: "سالم", physicalLocation: "", vendorFields: [{ label: "Kernel", value: "6.8" }], cpuPercent: 23, diskPercent: 41, collectedAt: "2026-09-21T10:10:00.000Z", source: "live" },
      { id: "fw-1", name: "فایروال", host: "10.0.0.1", vendor: "FortiGate", model: "FG-100F", category: "firewall", status: "limited", description: "نیازمند بررسی", physicalLocation: "", vendorFields: [{ label: "FortiOS", value: "7.4" }], cpuPercent: null, diskPercent: null, collectedAt: "2026-09-21T10:09:00.000Z", source: "snapshot" }
    ], completedActions: ["بازبینی سیاست"], futureActions: ["بررسی فایروال"], additionalNotes: "", responsibleName: "مدیر شبکه"
  };
}

test("Task 45 report is registered, asset-scoped and protected", () => {
  assert.equal(validateProductState(), true);
  const reports = getProductNavigation(["assets"]).find((group) => group.key === "reports");
  assert.equal(reports?.route, "/reports");
  assert.equal(findMutationPermission("POST", "/api/reports/company-status"), "devices.read");
  assert.equal(findMutationPermission("POST", "/api/reports/company-status/export"), "devices.read");
});

test("Task 45 report uses paginated pages, dual dates and dynamic vendor sections", async () => {
  const html = await renderCompanyReportHtml(fixture());
  assert.equal((html.match(/<section class="page">/g) ?? []).length, 3);
  assert.match(html, /۱۴۰۵\/۰۶\/۳۰/);
  assert.match(html, /2026-09-21/);
  assert.match(html, /FortiGate/);
  assert.match(html, /Kernel/);
  assert.match(html, /CPU/);
  const workbook = await renderCompanyReportXlsx(fixture());
  assert.ok(workbook.byteLength > 5_000);
});

test("Task 45 report vendor summary includes every vendor", async () => {
  const report = fixture();
  report.equipment.push(...Array.from({ length: 9 }, (_, index) => ({ ...report.equipment[0], id: `vendor-${index}`, name: `تجهیز وندور ${index}`, vendor: `Vendor ${index}`, status: "limited" as const })));
  const html = await renderCompanyReportHtml(report);
  assert.match(html, /Vendor 8/);
  assert.doesNotMatch(html, /وندور دیگر در فایل Excel/);
  assert.equal((html.match(/data-full-device=/g) ?? []).length, report.equipment.length);
  assert.match(html, /ادامهٔ جدول وندورها در صفحات بعدی/);
});

test("Task 45 editable report is bounded and physical location remains user-controlled", () => {
  const input = fixture(); input.equipment[0].physicalLocation = "اتاق سرور"; input.equipment[0].description = "x".repeat(1000);
  const clean = sanitizeCompanyStatusReport(input, "company-1");
  assert.equal(clean.equipment[0].physicalLocation, "اتاق سرور");
  assert.equal(clean.equipment[0].description.length, 300);
  assert.throws(() => sanitizeCompanyStatusReport(input, "another-company"), /INVALID_REPORT/);
});
