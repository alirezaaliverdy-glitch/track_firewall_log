import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { VENDOR_DAILY_CHECK_PROFILES } from "../src/daily-check/vendor-daily-check-profiles.js";

const root = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("core monitoring vendors expose complete, standards-tagged check domains", () => {
  for (const vendor of ["linux", "mikrotik", "fortigate", "cisco", "pfsense"] as const) {
    const profile = VENDOR_DAILY_CHECK_PROFILES[vendor];
    assert.ok(profile.sections.length >= 7, `${vendor} should expose at least seven operational domains`);
    for (const section of profile.sections) {
      assert.ok(section.standardRefs.includes("nist-sp-800-137"), `${vendor}/${section.key} must map to continuous monitoring`);
      assert.ok(section.standardRefs.includes("vendor-operational-guidance"), `${vendor}/${section.key} must retain vendor guidance`);
    }
  }
  assert.equal(VENDOR_DAILY_CHECK_PROFILES.linux.implementationState, "implemented");
  assert.equal(VENDOR_DAILY_CHECK_PROFILES.mikrotik.implementationState, "implemented");
  assert.equal(VENDOR_DAILY_CHECK_PROFILES.fortigate.implementationState, "implemented");
  assert.equal(VENDOR_DAILY_CHECK_PROFILES.cisco.implementationState, "manualOnly");
  assert.equal(VENDOR_DAILY_CHECK_PROFILES.pfsense.implementationState, "manualOnly");
});

test("monitoring workspace distinguishes definitions, readiness, and connector-backed results", () => {
  const panel = read("src/components/daily-check/DailyCheckPanel.tsx");
  const page = read("src/features/monitoring/pages/MonitoringPage.tsx");
  const route = read("backend/src/routes/daily-check.ts");

  assert.match(panel, /listActionCenter/);
  assert.match(panel, /evidence\.connectorInvoked/);
  assert.match(panel, /VENDOR_DOMAINS/);
  assert.match(panel, /HealthRing/);
  assert.match(panel, /monitoring-essential-grid/);
  assert.match(panel, /شروع بررسی/);
  assert.match(panel, /implementationState === "implemented"/);
  assert.doesNotMatch(panel, /monitoring-domain-list/);
  assert.doesNotMatch(panel, /monitoring-vendors/);
  assert.doesNotMatch(page, /LinuxTelemetryPanel/);
  assert.match(route, /credentialConfigured: Boolean\(device\.credentialId\)/);
  assert.match(route, /lastConnectionCheckAt/);
});

test("Linux monitoring uses readable fleet cards and persisted metric trends", () => {
  const page = read("src/features/monitoring/pages/LinuxMonitoringPage.tsx");
  const styles = read("src/features/monitoring/pages/LinuxMonitoringPage.css");
  const client = read("src/lib/linuxMonitoring.ts");

  assert.match(page, /getLinuxMonitoringMetrics/);
  assert.match(page, /refreshLinuxMonitoringDevice/);
  assert.match(page, /linux-fleet-grid/);
  assert.match(page, /TrendChart/);
  assert.match(page, /warningsJson/);
  assert.doesNotMatch(page, /<table/);
  assert.match(client, /\/metrics\?hours=/);
  assert.match(styles, /@media\(max-width:760px\)/);
});
