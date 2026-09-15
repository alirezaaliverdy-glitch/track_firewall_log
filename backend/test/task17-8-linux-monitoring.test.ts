import assert from "node:assert/strict";
import test from "node:test";
import { appendFile, mkdtemp, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { BoundedTelemetryStore, boundedTelemetryStore } from "../src/telemetry/bounded-telemetry-store.js";
import { parseLinuxLiveLogLine, telemetryStorageWarning } from "../src/telemetry/linux/linux-log-stream.service.js";
import { evaluateVendorTelemetry, resetFindingEngineWindows } from "../src/telemetry/vendor-finding-engine.js";
import { buildLinuxServiceStatusCommand, parseLinuxServiceStatus, validateLinuxServiceName } from "../src/linux/service-status.js";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { parseLinuxServerOverview } from "../src/telemetry/linux/linux-telemetry.service.js";

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

test("bounded telemetry store retries Windows EPERM rename before succeeding", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "fla-telemetry-eperm-"));
  let attempts = 0;
  const store = new BoundedTelemetryStore(dir, { maxBytesPerDevice: 50_000, maxEventCountPerDevice: 20, maxAgeDays: 30 }, {
    writeFile,
    appendFile,
    unlink,
    rename: async (source, target) => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("EPERM: operation not permitted, rename") as NodeJS.ErrnoException;
        error.code = "EPERM";
        throw error;
      }
      return rename(source, target);
    }
  });
  try {
    await store.append(telemetryEvent(1));
    const events = await store.readEvents("linux-1");
    assert.equal(attempts, 3);
    assert.equal(events.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("bounded telemetry store appends safely when Windows rename remains locked", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "fla-telemetry-fallback-"));
  const store = new BoundedTelemetryStore(dir, { maxBytesPerDevice: 50_000, maxEventCountPerDevice: 20, maxAgeDays: 30 }, {
    writeFile,
    appendFile,
    unlink,
    rename: async () => {
      const error = new Error("EPERM: operation not permitted, rename") as NodeJS.ErrnoException;
      error.code = "EPERM";
      throw error;
    }
  });
  try {
    await store.append(telemetryEvent(1));
    const events = await store.readEvents("linux-1");
    const files = await readdir(dir);
    assert.equal(events.length, 1);
    assert.equal(events[0].id, "event-1");
    assert.equal(files.filter((file) => file.endsWith(".tmp")).length, 0);
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

test("Linux telemetry analyze endpoint rebuilds findings from stored events without AI", async (t) => {
  resetFindingEngineWindows();
  const app = await buildApp({ authRequired: false });
  t.after(() => app.close());
  const device = await prisma.device.create({ data: { id: "task17-8b-analyze", name: "Task 17.8B Linux", vendor: "Linux", type: "linux_edge", host: "192.0.2.178", managementPort: 22, protocol: "ssh", environment: "lab", status: "online" } });
  await rm(path.join(process.cwd(), "storage", "telemetry", `${device.id}.jsonl`), { force: true });
  t.after(async () => {
    await prisma.finding.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.deleteMany({ where: { id: device.id } });
    await rm(path.join(process.cwd(), "storage", "telemetry", `${device.id}.jsonl`), { force: true });
  });
  for (let index = 0; index < 5; index += 1) {
    await boundedTelemetryStore.append({ ...telemetryEvent(index), id: `stored-${index}`, deviceId: device.id, rawMessage: `Failed password for root from 203.0.113.88 port ${5000 + index}`, normalizedMessage: "Failed SSH authentication", parsedFields: { sourceIp: "203.0.113.88" } });
  }
  const response = await app.inject({ method: "POST", url: `/api/devices/${device.id}/telemetry/linux/analyze` });
  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.deterministic, true);
  assert.equal(payload.aiAvailable, false);
  assert.equal(payload.aiError, null);
  assert.equal(payload.counts.storedEvents, 5);
  assert.ok(payload.findings.some((finding: { title: string }) => finding.title === "Repeated SSH authentication failures"));
});

test("Device Telemetry UI exposes simple flow and hides technical evidence by default", () => {
  const source = readFileSync(new URL("../../src/components/telemetry/LinuxTelemetryPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /1\. Connection/);
  assert.match(source, /2\. Live Monitoring/);
  assert.match(source, /3\. Results/);
  assert.match(source, /Monitoring is running/);
  assert.match(source, /Logs? .* collected|Collecting logs from system, SSH, firewall, and selected services/);
  assert.match(source, /Show technical evidence/);
  assert.match(source, /<details/);
  assert.match(source, /Advanced diagnostics/);
  assert.match(source, /AI explanation is unavailable\. Local analysis is still working\./);
  assert.match(source, /Backend is not reachable\. Check API server\./);
  assert.match(source, /پایش در حال اجراست/);
  assert.doesNotMatch(source, /sendAiMessage/);
});

test("Linux server overview parser handles Ubuntu and Debian style command output", () => {
  const overview = parseLinuxServerOverview({ deviceId: "linux-1", host: "192.0.2.10", connectionPort: 22, output: [
    "__FLA_HOST__",
    "web-01",
    "Ubuntu 24.04.2 LTS",
    "6.8.0-63-generic",
    "up 12 days",
    "__FLA_CPU__",
    "4",
    "0.22 0.30 0.40 1/234 555",
    "%Cpu(s):  4.0 us,  2.0 sy, 94.0 id",
    "__FLA_MEMORY__",
    "Mem:  7984  3021  2300  120  2663  4500",
    "Swap: 2048  0  2048",
    "__FLA_DISK__",
    "Filesystem Type Size Used Avail Use% Mounted on",
    "/dev/sda1 ext4 100G 42G 58G 42% /",
    "__FLA_NET__",
    "2: eth0    inet 192.0.2.10/24 brd 192.0.2.255 scope global eth0",
    "__FLA_SERVICES__",
    "ssh=active",
    "nginx=active",
    "fail2ban=inactive",
    "__FLA_PORTS__",
    "tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:((\"sshd\",pid=1,fd=3))",
    "__FLA_SECURITY__",
    "sshd: Failed password for invalid user admin from 203.0.113.9"
  ].join("\n") });
  assert.equal(overview.host.hostname, "web-01");
  assert.equal(overview.cpu.coreCount, 4);
  assert.equal(overview.cpu.status, "normal");
  assert.equal(overview.memory.status, "normal");
  assert.equal(overview.disks[0].mount, "/");
  assert.equal(overview.services.find((service) => service.name === "nginx")?.state, "active");
  assert.equal(overview.listeningPorts[0].process, "sshd");
  assert.equal(overview.securitySignals.status, "warning");
});

test("Linux server overview parser handles RHEL-like output and partial command failure", () => {
  const overview = parseLinuxServerOverview({ deviceId: "linux-2", host: "192.0.2.11", connectionPort: 2222, warnings: ["iostat unavailable"], output: [
    "__FLA_HOST__",
    "rhel-app",
    "Red Hat Enterprise Linux 9.4",
    "5.14.0",
    "up 3 hours",
    "__FLA_CPU__",
    "2",
    "3.00 2.80 2.50 1/100 222",
    "__FLA_MEMORY__",
    "Mem:  3900  3600  100  0  200  120",
    "Swap: 1024  800  224",
    "__FLA_DISK__",
    "Filesystem Type Size Used Avail Use% Mounted on",
    "/dev/mapper/root xfs 50G 48G 2G 96% /",
    "__FLA_SERVICES__",
    "sshd=active",
    "httpd=inactive",
    "firewalld=active",
    "__FLA_PORTS__",
    "tcp LISTEN 0 128 0.0.0.0:80 0.0.0.0:* users:((\"httpd\",pid=10,fd=4))"
  ].join("\n") });
  assert.equal(overview.health.status, "critical");
  assert.equal(overview.memory.status, "critical");
  assert.equal(overview.disks[0].status, "critical");
  assert.equal(overview.services.find((service) => service.name === "httpd")?.state, "inactive");
  assert.deepEqual(overview.warnings, ["iostat unavailable"]);
});

test("Linux server overview parser returns partial data for missing command output", () => {
  const emptyOverview = parseLinuxServerOverview({ deviceId: "linux-empty", host: "192.0.2.12", connectionPort: 22 });
  assert.equal(emptyOverview.connection.status, "partial");
  assert.equal(emptyOverview.host.hostname, "unknown");
  assert.equal(emptyOverview.cpu.status, "unknown");
  assert.equal(emptyOverview.memory.status, "unknown");
  assert.deepEqual(emptyOverview.disks, []);
  assert.match(emptyOverview.warnings.join("\n"), /returned no output/);

  const partialOverview = parseLinuxServerOverview({ deviceId: "linux-partial", host: "192.0.2.13", connectionPort: 22, output: [
    "__FLA_HOST__",
    "debian-db",
    "Debian GNU/Linux 12 (bookworm)",
    "6.1.0-37-amd64",
    "__FLA_CPU__",
    "2",
    "0.10 0.12 0.14 1/90 111"
  ].join("\n") });
  assert.equal(partialOverview.connection.status, "online");
  assert.equal(partialOverview.host.os, "Debian GNU/Linux 12 (bookworm)");
  assert.equal(partialOverview.cpu.coreCount, 2);
  assert.equal(partialOverview.memory.status, "unknown");
  assert.deepEqual(partialOverview.disks, []);
  assert.deepEqual(partialOverview.diskIo.devices, []);
  assert.equal(partialOverview.securitySignals.status, "normal");
});

test("Linux overview endpoint and UI default Server Overview tab are wired", () => {
  const route = readFileSync(new URL("../src/routes/linux-telemetry.ts", import.meta.url), "utf8");
  const source = readFileSync(new URL("../../src/components/telemetry/LinuxTelemetryPanel.tsx", import.meta.url), "utf8");
  assert.match(route, /\/api\/devices\/:deviceId\/telemetry\/linux\/overview/);
  assert.match(route, /collectLinuxServerOverview/);
  assert.match(source, /useState<"overview" \| "monitoring" \| "results">\("overview"\)/);
  assert.match(source, /Server Overview/);
  assert.match(source, /Overall Health/);
  assert.match(source, /Server is online/);
  assert.match(source, /نمای کلی سرور/);
  assert.match(source, /AI explanation is unavailable\. Local analysis is still working\./);
  assert.doesNotMatch(source, /sendAiMessage/);
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
  const source = [
    "../src/services/action-plan.service.ts",
    "../src/actions/action-plan/action-plan-execution.service.ts",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
  assert.match(source, /serviceStatusReadSucceeded/);
  assert.match(source, /ActionType\.linux_check_service_status/);
  assert.match(source, /\["active", "inactive", "failed", "not_found", "unknown"\]/);
  assert.match(source, /status: verification\.ok \? ActionPlanStatus\.succeeded : ActionPlanStatus\.failed/);
});
