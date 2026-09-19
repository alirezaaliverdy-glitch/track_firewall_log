import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { effectiveCollectorIntervalSeconds, isCollectorDue } from "../src/services/security-monitor-schedule.js";

test("Task 34 adaptive collector scheduling backs off idle and failing devices with a cap", () => {
  const base = { deviceId: "linux-1", intervalSeconds: 60, lastCollectedAt: new Date(0), lastSuccessAt: new Date(0), lastErrorAt: null };
  const active = effectiveCollectorIntervalSeconds({ ...base, consecutiveIdleRuns: 0, consecutiveFailures: 0 });
  const idle = effectiveCollectorIntervalSeconds({ ...base, consecutiveIdleRuns: 6, consecutiveFailures: 0 });
  const failing = effectiveCollectorIntervalSeconds({ ...base, lastErrorAt: new Date(1), consecutiveIdleRuns: 0, consecutiveFailures: 4 });
  assert.ok(idle >= active * 3.5);
  assert.ok(failing >= active * 12);
  assert.ok(failing <= 990);
  assert.equal(isCollectorDue({ ...base, consecutiveIdleRuns: 0 }, new Date(active * 1000 - 1)), false);
  assert.equal(isCollectorDue({ ...base, consecutiveIdleRuns: 0 }, new Date(active * 1000)), true);
});

test("Task 34 detection is event-scoped, debounced, bounded, and never triggered by read pages", () => {
  const dispatcher = readFileSync(join(process.cwd(), "src", "services", "security-detection-dispatcher.service.ts"), "utf8");
  const monitor = readFileSync(join(process.cwd(), "src", "services", "security-monitor.service.ts"), "utf8");
  const routes = readFileSync(join(process.cwd(), "src", "routes", "security-platform.ts"), "utf8");
  const intelligence = readFileSync(join(process.cwd(), "src", "assets", "asset-intelligence.service.ts"), "utf8");
  assert.match(dispatcher, /const DEBOUNCE_MS = 750/);
  assert.match(dispatcher, /const MAX_CONCURRENCY = 2/);
  assert.match(dispatcher, /const pending = new Map/);
  assert.match(monitor, /detectChangedDevices/);
  assert.match(monitor, /distinct: \["deviceId"\]/);
  assert.doesNotMatch(routes, /app\.get[^;]+await runSecurityDetection\(\)/s);
  assert.doesNotMatch(intelligence, /listSecurityFindings[\s\S]{0,100}await runSecurityDetection/);
  assert.match(intelligence, /OR: \[\{ timestamp: \{ gte: cutoff \} \}, \{ receivedAt: \{ gte: cutoff \} \}\]/);
});

