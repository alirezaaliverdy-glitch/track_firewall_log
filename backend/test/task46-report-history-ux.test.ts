import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../../src/features/reports/pages/ReportsPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../src/features/reports/pages/ReportsPage.css", import.meta.url), "utf8");
const client = readFileSync(new URL("../../src/lib/reports.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/routes/reports.ts", import.meta.url), "utf8");
const authorization = readFileSync(new URL("../src/security/authorization.ts", import.meta.url), "utf8");

test("Task 46 report preview is optional, dismissible and keyboard accessible", () => {
  assert.match(page, /previewOpen/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /بستن گزارش/);
  assert.match(page, /ویرایش و پیش‌نمایش/);
  assert.match(styles, /\.report-modal\{position:fixed/);
  assert.doesNotMatch(page, /آخرین دادهٔ واقعی تجهیزات را ببینید، در صورت نیاز ویرایش کنید و در قالب دلخواه تحویل بگیرید/);
});

test("Task 46 history is backed by owner-scoped audit records", () => {
  assert.match(routes, /company-status\/history/);
  assert.match(routes, /ownerId: request\.authUser\.id/);
  assert.match(routes, /report\.company_status\.generate/);
  assert.match(routes, /actorDisplayName/);
  assert.match(routes, /reportNumber/);
  assert.match(client, /listCompanyStatusReportHistory/);
  assert.match(page, /تاریخچه گزارش‌ها/);
  assert.match(page, /Asia\/Tehran/);
  assert.match(page, /actorDisplayName/);
});

test("Task 46 report history deletion is admin-only, confirmed and audited", () => {
  assert.match(authorization, /DELETE[^\n]+\/api\/reports\/company-status\/history[^\n]+users\.manage/);
  assert.match(routes, /request\.authUser\.role !== "admin"/);
  assert.match(routes, /DELETE REPORT HISTORY/);
  assert.match(routes, /auditLog\.deleteMany/);
  assert.match(routes, /report\.company_status\.history\.clear/);
  assert.match(client, /clearCompanyStatusReportHistory/);
  assert.match(page, /user\?\.role === "admin"/);
  assert.match(page, /role="alertdialog"/);
});
