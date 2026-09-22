import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("workspace exposes bounded normalized vendor evidence without secret fields", () => {
  const service = source("backend/src/services/device-workspace.service.ts");
  assert.match(service, /export function projectVendorOverview/);
  assert.match(service, /vendorKey === "mikrotik"/);
  assert.match(service, /vendorKey === "fortigate"/);
  assert.match(service, /vendorKey === "sophos"/);
  assert.match(service, /vendorKey === "linux"/);
  assert.match(service, /SENSITIVE_FIELD/);
  assert.match(service, /vendorOverview: projectVendorOverview/);
});

test("asset overview explains attention and presents vendor domains responsively", () => {
  const page = source("src/features/assets/pages/AssetDetailPage.tsx");
  const css = source("src/features/assets/pages/AssetDetailOverview.css");
  assert.match(page, /diagnosticReasons/);
  assert.match(page, /warningsJson/);
  assert.match(page, /refreshLinuxMonitoringDevice/);
  assert.match(page, /asset-vendor-sections/);
  assert.match(css, /cisco-interface-panel\{grid-column:1\/-1\}/);
  assert.match(css, /@media\(max-width:520px\)/);
});
