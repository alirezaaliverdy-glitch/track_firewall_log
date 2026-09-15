import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../../src/features/dashboard/pages/DashboardPage.tsx", import.meta.url), "utf8");
const motion = readFileSync(new URL("../../src/components/dashboard/NetworkDefenseMotion.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../src/features/dashboard/pages/DashboardPage.css", import.meta.url), "utf8");

test("dashboard uses a code-native, data-aware network defense scene", () => {
  assert.match(page, /<NetworkDefenseMotion/);
  assert.match(page, /tone=\{overallTone\}/);
  assert.match(page, /activeDevices=\{activeDevices\}/);
  assert.match(page, /activeAlerts=\{criticalFindings\}/);
  assert.match(motion, /Router/);
  assert.match(motion, /ShieldCheck/);
  assert.match(motion, /Server/);
  assert.doesNotMatch(motion, /<img|canvas|data:image|https?:\/\//);
});

test("dashboard motion is restrained, responsive, and honors reduced-motion", () => {
  for (const animation of ["packet-to-firewall", "packet-to-server", "packet-curve", "threat-blocked", "firewall-halo", "firewall-orbit", "network-scanner", "network-live-breathe"]) {
    assert.match(styles, new RegExp(`@keyframes ${animation}`));
  }
  assert.match(motion, /network-defense-motion__paths/);
  assert.match(motion, /network-defense-node__activity/);
  assert.doesNotMatch(motion, /<small|network-defense-motion__footer/);
  assert.match(styles, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(styles, /animation:none!important/);
  assert.match(styles, /@media \(max-width:900px\)/);
  assert.match(styles, /@media \(max-width:620px\)/);
});

test("dashboard is simplified without removing operational navigation", () => {
  assert.equal((page.match(/<KpiCard/g) ?? []).length, 4);
  assert.match(page, /dashboard-main-grid/);
  assert.match(page, /\.slice\(0, 3\)/);
  assert.match(page, /to="\/actions"/);
  assert.match(page, /to="\/assets\/devices\/new"/);
  assert.match(page, /to="\/monitoring\/linux"/);
  assert.match(page, /recentExecutions/);
});

test("dashboard animation density and cadence stay load-bounded", () => {
  assert.match(motion, /\{\[0, 1\]\.map\(\(packet\) => <i key=\{`incoming-/);
  assert.equal((motion.match(/network-threat network-threat--/g) ?? []).length, 2);
  assert.match(styles, /contain:layout paint style/);
  assert.match(styles, /packet-to-firewall 11s/);
  assert.match(styles, /network-scanner 18s/);
  assert.doesNotMatch(styles, /\.network-defense-motion__scanner \{[^}]*filter:/);
});
