import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { BoundedTelemetryStore } from "../src/telemetry/bounded-telemetry-store.js";
import { parseLinuxLiveLogLine, telemetryStorageWarning } from "../src/telemetry/linux/linux-log-stream.service.js";
import { evaluateVendorTelemetry, resetFindingEngineWindows } from "../src/telemetry/vendor-finding-engine.js";
import { buildLinuxServiceStatusCommand, parseLinuxServiceStatus, validateLinuxServiceName } from "../src/linux/service-status.js";

function telemetryEvent(index: number, rawPadding = 80) {
  return {
    id: `event-${index}`,
    deviceId: "linux-1",
    vendor: "linux",
    type: "linux",
    source: "auth",
    timestamp: new Date(Date.now() + index * 1000).toISOString(),
    severity: "medium" as const,
    category: "authentication",
    rawMessage: `Failed password from 203.0.113.${index} ${"x".repeat(rawPadding)}`,
    normalizedMessage: "Failed SSH authentication",
    parsedFields: { sourceIp: `203.0.113.${index}` }
  };
}

test("bounded telemetry store rotates old events after count limit", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "fla-telemetry-"));
  const store = new BoundedTelemetryStore(dir, { maxBytesPerDevice: 50_000, maxEventCountPerDevice: 4, maxAgeDays: 30 });
  try {
    for (let index = 0; index < 10; index += 1) {
      await store.append(telemetryEvent(index));
    }
    const status = await store.status("linux-1");
    const events = await store.readEvents("linux-1");
    assert.equal(status.eventCount, 4);
    assert.equal(events.length, 4);
    assert.equal(events.at(-1)?.id, "event-9");
    assert.ok(!events.some((event) => event.id === "event-0"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("bounded telemetry store creates missing telemetry directory and first device file", async () => {
  const dir = path.join(await mkdtemp(path.join(tmpdir(), "fla-telemetry-parent-")), "missing", "telemetry");
  const store = new BoundedTelemetryStore(dir, { maxBytesPerDevice: 50_000, maxEventCountPerDevice: 10, maxAgeDays: 30 });
  try {
    await store.append(telemetryEvent(1));
    const events = await store.readEvents("linux-1");
    const status = await store.status("linux-1");
    assert.equal(events.length, 1);
    assert.equal(events[0].id, "event-1");
    assert.equal(status.eventCount, 1);
    assert.ok(status.bytesUsed > 0);
  } finally {
    await rm(path.dirname(path.dirname(dir)), { recursive: true, force: true });
  }
});

test("bounded telemetry store rotates old events after byte limit", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "fla-telemetry-"));
  const store = new BoundedTelemetryStore(dir, { maxBytesPerDevice: 1500, maxEventCountPerDevice: 100, maxAgeDays: 30 });
  try {
    for (let index = 0; index < 8; index += 1) {
      await store.append(telemetryEvent(index, 450));
    }
    const status = await store.status("linux-1");
    const events = await store.readEvents("linux-1");
    assert.ok(status.bytesUsed <= 1500, `bytesUsed=${status.bytesUsed}`);
    assert.ok(events.length < 8);
    assert.equal(events.at(-1)?.id, "event-7");
    assert.ok(!events.some((event) => event.id === "event-0"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("bounded telemetry store uses Windows path-safe unique temp writes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "fla-telemetry-win-"));
  const store = new BoundedTelemetryStore(dir, { maxBytesPerDevice: 50_000, maxEventCountPerDevice: 20, maxAgeDays: 30 });
  try {
    await Promise.all(Array.from({ length: 8 }, (_, index) => store.append({ ...telemetryEvent(index), deviceId: "linux\\edge:01/../../bad" })));
    const files = await readdir(dir);
    const events = await store.readEvents("linux\\edge:01/../../bad");
    assert.equal(events.length, 8);
    assert.equal(files.filter((file) => file.endsWith(".tmp")).length, 0);
    assert.ok(files.some((file) => file === "linux_edge_01_.._.._bad.jsonl"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("live stream parser classifies Linux auth, sudo, service, web, and fail2ban events", () => {
  const samples = [
    parseLinuxLiveLogLine("auth", "sshd[10]: Failed password for invalid user admin from 203.0.113.9 port 55123 ssh2"),
    parseLinuxLiveLogLine("auth", "sudo: pam_unix(sudo:auth): authentication failure; user=bob"),
    parseLinuxLiveLogLine("system", "systemd[1]: nginx.service: Failed with result 'exit-code'."),
    parseLinuxLiveLogLine("nginx", '203.0.113.10 - - [x] "GET / HTTP/1.1" 500 12', { repeated: 5 }),
    parseLinuxLiveLogLine("apache", '203.0.113.10 - - [x] "GET /secret HTTP/1.1" 403 12', { repeated: 12 }),
    parseLinuxLiveLogLine("fail2ban", "fail2ban.actions [sshd] Ban 203.0.113.11")
  ];
  assert.ok(samples.some((event) => event.tags.includes("auth_failure")));
  assert.ok(samples.some((event) => event.tags.includes("sudo_failure")));
  assert.ok(samples.some((event) => event.tags.includes("service_failure")));
  assert.ok(samples.some((event) => event.tags.includes("web_error")));
  assert.ok(samples.some((event) => event.tags.includes("web_denied")));
  assert.ok(samples.some((event) => event.tags.includes("fail2ban_event")));
});

test("finding analyzer deduplicates repeated Linux events by fingerprint", () => {
  resetFindingEngineWindows();
  const device = { id: "linux-1", vendor: "linux", type: "linux_edge" };
  const events = Array.from({ length: 5 }, (_, index) => ({ id: `e-${index}`, raw: `Failed password for root from 203.0.113.50 port ${5000 + index}`, source: "auth", srcIp: "203.0.113.50" }));
  const result = evaluateVendorTelemetry({ device, events, now: new Date("2026-01-01T00:00:00Z") });
  const sshFindings = result.findings.filter((finding) => finding.title === "Repeated SSH authentication failures");
  assert.equal(new Set(sshFindings.map((finding) => finding.fingerprint)).size, 1);
  assert.equal(sshFindings.at(-1)?.count, 5);
  assert.equal(sshFindings.at(-1)?.severity, "high");
});

test("storage failure warning is clean and does not block monitoring findings", () => {
  const warning = telemetryStorageWarning(new Error("ENOENT: no such file or directory, rename backend\\storage\\telemetry\\x.tmp -> backend\\storage\\telemetry\\x.jsonl"), { deviceId: "linux-1" });
  assert.equal(warning, "Telemetry storage is temporarily unavailable; live monitoring continues.");
  assert.doesNotMatch(warning, /ENOENT|rename|backend\\storage|\.jsonl|stack/i);

  resetFindingEngineWindows();
  const result = evaluateVendorTelemetry({
    device: { id: "linux-1", vendor: "linux", type: "linux_edge" },
    events: Array.from({ length: 5 }, (_, index) => ({ id: `storage-failed-${index}`, raw: `Failed password for root from 203.0.113.77 port ${5100 + index}`, source: "auth", srcIp: "203.0.113.77" })),
    now: new Date("2026-01-01T00:00:00Z")
  });
  assert.ok(result.findings.some((finding) => finding.title === "Repeated SSH authentication failures"));
});

test("service status parser normalizes active, inactive, failed, not_found, and systemctl-unavailable states", () => {
  assert.equal(parseLinuxServiceStatus("nginx", "__FLA_SYSTEMCTL__\nLoadState=loaded\nActiveState=active\n__FLA_IS_ACTIVE__\nactive\n__FLA_IS_ENABLED__\nenabled\n").state, "active");
  assert.equal(parseLinuxServiceStatus("nginx", "__FLA_SYSTEMCTL__\nLoadState=loaded\nActiveState=inactive\n__FLA_IS_ACTIVE__\ninactive\n").state, "inactive");
  assert.equal(parseLinuxServiceStatus("nginx", "__FLA_SYSTEMCTL__\nLoadState=loaded\nActiveState=failed\n__FLA_IS_ACTIVE__\nfailed\n").state, "failed");
  assert.equal(parseLinuxServiceStatus("missing", "__FLA_SYSTEMCTL__\nLoadState=not-found\nActiveState=inactive\n__FLA_IS_ACTIVE__\nunknown\n").state, "not_found");
  const sysvFallback = parseLinuxServiceStatus("cron", "__FLA_SYSV__\ncron is running\n");
  assert.equal(sysvFallback.systemctlAvailable, false);
  assert.equal(sysvFallback.sysvAvailable, true);
  assert.equal(sysvFallback.state, "active");
  assert.equal(parseLinuxServiceStatus("cron", "__FLA_SYSV__\ncron is not running\n").state, "inactive");
});

test("service command safety accepts only safe service names and uses structured command detection", () => {
  for (const name of ["nginx", "ssh.service", "postgresql@14-main", "my-service:blue"]) {
    assert.equal(validateLinuxServiceName(name), name);
  }
  for (const name of ["nginx;reboot", "nginx | id", "`id`", "$(id)", "../nginx", "nginx status", "\"nginx\""]) {
    assert.throws(() => validateLinuxServiceName(name));
  }
  const command = buildLinuxServiceStatusCommand("nginx");
  assert.match(command, /systemctl show nginx/);
  assert.match(command, /systemctl is-active nginx/);
  assert.match(command, /systemctl is-enabled nginx/);
  assert.match(command, /service nginx status/);
  assert.match(command, /pgrep -a nginx/);
  assert.doesNotMatch(command, /\$\{service\}/);
});

test("service status action keeps read result success semantics separate from SSH failure", () => {
  const source = readFileSync(new URL("../src/services/action-plan.service.ts", import.meta.url), "utf8");
  assert.match(source, /serviceStatusReadSucceeded/);
  assert.match(source, /ActionType\.linux_check_service_status/);
  assert.match(source, /\["active", "inactive", "failed", "not_found", "unknown"\]/);
  assert.match(source, /status: executionSucceeded \? ActionPlanStatus\.succeeded : ActionPlanStatus\.failed/);
});
