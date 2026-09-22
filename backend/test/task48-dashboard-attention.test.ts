import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("dashboard removes redundant copy and exposes actionable health causes", () => {
  const page = source("src/features/dashboard/pages/DashboardPage.tsx");
  assert.doesNotMatch(page, /سلامت تجهیزات، روند هشدارها، رخدادهای شبکه/);
  assert.match(page, /id="dashboard-attention"/);
  assert.match(page, /snapshotWarnings/);
  assert.match(page, /بررسی و رفع/);
  assert.match(page, /\/monitoring\/linux\/\$\{device\.id\}/);
});

test("dashboard has a dedicated readable type scale", () => {
  const css = source("src/features/dashboard/pages/DashboardCommandCenter.css");
  assert.match(css, /Dashboard readability and actionable attention center/);
  assert.match(css, /\.command-panel h2\s*\{\s*font-size:\s*1rem/);
  assert.match(css, /\.device-status-table__row b\s*\{\s*font-size:\s*\.8rem/);
  assert.match(css, /\.dashboard-attention-list/);
});
