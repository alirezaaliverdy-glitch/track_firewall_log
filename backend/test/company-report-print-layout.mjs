import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import puppeteer from "puppeteer-core";
import { renderReadableReportHtml } from "../dist/reports/company-status-report.template.js";

test("dense Persian management report fits all A4 pages without overlapping sections", async () => {
  const font = (await readFile(new URL("../assets/iranyekanwebregularfanum.ttf", import.meta.url))).toString("base64");
  const now = "2026-10-04T10:00:00.000Z";
  const equipment = Array.from({ length: 28 }, (_, index) => ({
    id: `test-${index}`, name: `تجهیز آزمایشی با نام نسبتاً بلند ${index}`, host: `192.0.2.${index + 1}`,
    vendor: `Vendor ${index % 12}`, model: "مدل آزمایشی", category: "server", status: "limited",
    description: "نیازمند بررسی", statusReason: "جمع‌آوری داده ناقص است و وضعیت احراز هویت یا سنسور باید بررسی شود. ".repeat(3),
    recommendation: "حساب اتصال و مجوز خواندن را بررسی کنید و سپس تست اتصال بگیرید. ".repeat(4),
    technicalDetails: "SSH_AUTH_FAILED", connectionState: "auth_failed", physicalLocation: "",
    vendorFields: [{ label: "نسخه", value: "7.0.3" }], cpuPercent: null, diskPercent: null,
    collectedAt: now, source: "live"
  }));
  const report = {
    schemaVersion: 1, generatedAt: now, reportDateFa: "۱۴۰۵/۰۷/۱۲", reportDateGregorian: "2026-10-04",
    reportTime: "۱۳:۳۰:۰۰", timezone: "Asia/Tehran", reportNumber: "TEST-REPORT-20261004",
    preparedBy: "مدیر سامانه", company: { id: "test", name: "شرکت نمونه با نام بلند", code: "TEST" },
    summary: { total: equipment.length, active: 0, limited: equipment.length, inactive: 0, healthScore: 0 },
    equipment, completedActions: ["بررسی وضعیت اینترفیس‌ها و ثبت نتیجه"],
    futureActions: ["اتصال هاست و مجوز خواندن را بررسی کنید"], additionalNotes: "", responsibleName: "مدیر سامانه"
  };
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    await page.setContent(renderReadableReportHtml(report, font), { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => [...document.querySelectorAll("section.page")].map(section => {
      const rect = section.getBoundingClientRect();
      const children = [...section.children].map(child => {
        const box = child.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
      });
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, children };
    }));
    assert.equal(layout.length, 7);
    assert.equal(await page.$$eval("[data-full-device]", (nodes) => nodes.length), equipment.length);
    assert.equal(await page.$$eval(".appendix-vendors tbody tr", (nodes) => nodes.length), 4);
    for (const section of layout) {
      for (const child of section.children) {
        assert.ok(child.top >= section.top - 1 && child.bottom <= section.bottom - 20, "report content stays within A4 page padding");
        assert.ok(child.left >= section.left - 1 && child.right <= section.right + 1, "report content stays within page width");
      }
      for (let index = 1; index < section.children.length; index++)
        assert.ok(section.children[index].top >= section.children[index - 1].bottom - 1, "report sections do not overlap");
    }
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    assert.equal((Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length, layout.length);
  } finally { await browser.close(); }
});
