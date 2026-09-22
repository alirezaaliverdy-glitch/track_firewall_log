import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath: string) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

test("global typography uses readable application scale", () => {
  const typography = readSource("src/design-system/typography.css");
  const app = readSource("src/App.css");
  const base = readSource("src/index.css");

  assert.match(typography, /--text-xs:\s*0\.8125rem/);
  assert.match(typography, /--text-sm:\s*0\.9375rem/);
  assert.match(typography, /--text-md:\s*1\.0625rem/);
  assert.match(app, /body\s*\{[^}]*font-size:\s*var\(--text-md\)/s);
  assert.match(base, /optgroup\s*\{[^}]*font-size:\s*inherit/s);
});

test("mobile navigation and report history avoid tiny labels", () => {
  const mobile = readSource("src/components/layout/MobileShell.css");
  const reports = readSource("src/features/reports/pages/ReportsPage.css");

  assert.match(mobile, /platform-bottom-nav button\s*\{\s*font-size:\s*\.64rem/);
  assert.match(mobile, /platform-mobile-brand small\s*\{[^}]*font-size:\s*\.7rem/s);
  assert.match(reports, /\.history-row small\s*\{font-size:13px\}/);
  assert.match(reports, /\.history-row__date strong\s*\{font-size:15px\}/);
});
