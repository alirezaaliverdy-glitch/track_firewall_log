import assert from "node:assert/strict";
import test from "node:test";
import { DeviceProtocol, DeviceType } from "@prisma/client";
import { readFileSync } from "node:fs";
import { buildApp } from "../src/app.js";
import { detectLinuxPrivilege, isLinuxSshCapable, LINUX_TELEMETRY_COMMANDS, resolveLinuxConnectionPort, runLinuxTelemetryCommands } from "../src/connectors/linux-ssh.connector.js";
import { analyzeLinuxSecuritySnapshot } from "../src/telemetry/linux/linux-security-analyzer.service.js";
import { parseLinuxLiveLogLine, stopLinuxLogStream } from "../src/telemetry/linux/linux-log-stream.service.js";
import { buildLinuxTelemetryOptions, redactLinuxTelemetry } from "../src/telemetry/linux/linux-telemetry.service.js";
import type { LinuxSecuritySnapshot } from "../src/telemetry/linux/linux-telemetry.types.js";
import { proposeActionPlan } from "../src/services/action-plan.service.js";
import { prisma } from "../src/db/prisma.js";
import { buildFixActionProposal, buildLiveFindings, sourcesForPreset } from "../../src/lib/linuxTelemetryFindings.js";

test("Linux privilege detection supports root, sudo, and limited users", () => {
  assert.equal(detectLinuxPrivilege("root", "1000", 1), "root");
  assert.equal(detectLinuxPrivilege("ops", "1000", 0), "sudo");
  assert.equal(detectLinuxPrivilege("ops", "1000", 1), "limited");
});

test("Linux telemetry uses configured management port and defaults only as a final fallback", () => {
  assert.equal(resolveLinuxConnectionPort({ managementPort: 22022 } as never), 22022);
  assert.equal(resolveLinuxConnectionPort({ port: 2222 } as never), 2222);
  assert.equal(resolveLinuxConnectionPort({ capabilities: { connection: { port: 2022 } } } as never), 2022);
  assert.equal(resolveLinuxConnectionPort({} as never), 22);
  assert.equal(isLinuxSshCapable({ vendor: "Linux", type: DeviceType.generic_firewall, protocol: DeviceProtocol.ssh, capabilities: {} }), true);
});

test("Linux telemetry rejects command IDs outside the fixed allowlist", async () => {
  assert.ok(Object.keys(LINUX_TELEMETRY_COMMANDS).length > 5);
  await assert.rejects(() => runLinuxTelemetryCommands({ type: DeviceType.linux_edge, protocol: DeviceProtocol.ssh } as never, ["rm" as never]), /not allowlisted/i);
});

test("Linux telemetry redacts common secret forms", () => {
  const output = redactLinuxTelemetry("password=hunter2 token: abc123 Authorization: Bearer xyz");
  assert.doesNotMatch(output, /hunter2|abc123|Bearer xyz/);
  assert.match(output, /REDACTED/);
});

function snapshot(): LinuxSecuritySnapshot {
  return { deviceId: "linux-1", collectedAt: new Date().toISOString(), privilegeLevel: "sudo", sudoAvailable: true, connection: { host: "185.89.22.116", connectionPort: 22022 }, host: { hostname: "srv", os: "Linux", kernel: "6", uptime: "up", timezone: "UTC", architecture: "x86_64", virtualization: "none" }, network: { interfaces: [], routes: [], listeningPorts: ["LISTEN 0 128 0.0.0.0:22"], exposedPorts: [22], publicExposureSummary: "SSH exposed" }, ssh: { port: 22, detectedSshServicePort: 22, permitRootLogin: "yes", passwordAuthentication: "yes", pubkeyAuthentication: "yes", recentFailures: 20, recentSuccesses: 1, failureIps: { "203.0.113.5": 20 }, successfulAfterFailureIps: [], findings: [] }, users: { shellUsers: [], sudoUsers: [], recentLogins: [], failedLoginsSummary: [], findings: [] }, firewall: { ufw: "", iptables: "", nftables: "", firewalld: "", effectiveStatus: "inactive", findings: [] }, securityTools: { fail2ban: "inactive", auditd: "inactive", unattendedUpgrades: "not_detected", findings: [] }, containers: { dockerDetected: false, runningContainers: [], exposedPorts: [], privilegedContainers: [], findings: [] }, services: { importantServices: {}, enabledWebSites: [], findings: [] }, recentLogs: { warnings: [], authSignals: [], systemSignals: [] }, riskSummary: { score: 0, severity: "info", topFindings: [] }, findings: [], rawCommandResultsMetadata: [{ commandId: "warnings", ok: false, skipped: true, outputLines: 0, warning: "permission denied" }] };
}

test("analyzer detects SSH, firewall, fail2ban, and repeated login risks from partial snapshots", () => {
  const result = analyzeLinuxSecuritySnapshot(snapshot());
  const ids = new Set(result.findings.map((item) => item.id));
  for (const id of ["ssh-password-auth", "ssh-root-login", "ssh-public", "ssh-failure-burst", "firewall-inactive", "fail2ban-inactive"]) assert.ok(ids.has(id));
  assert.ok(result.riskSummary.score > 0);
});

test("live parser recognizes authentication and firewall signals", () => {
  assert.equal(parseLinuxLiveLogLine("auth", "sshd: Failed password for root from 203.0.113.5 port 4444").suspicious, true);
  assert.match(parseLinuxLiveLogLine("auth", "sshd: Invalid user demo from 203.0.113.6").summary, /Invalid/);
  assert.equal(parseLinuxLiveLogLine("auth", "sshd: Accepted publickey for ops from 10.0.0.2").suspicious, false);
  assert.match(parseLinuxLiveLogLine("firewall", "[UFW BLOCK] SRC=203.0.113.7 DPT=22").summary, /Firewall/);
  assert.equal(parseLinuxLiveLogLine("nginx", "GET /admin HTTP/1.1 403", { repeated: 12 }).suspicious, true);
  assert.equal(stopLinuxLogStream("missing"), null);
});

test("Linux telemetry endpoints require authentication", async (t) => {
  const app = await buildApp(); t.after(() => app.close());
  for (const input of [
    { method: "POST", url: "/api/devices/linux-1/telemetry/linux/snapshot" },
    { method: "POST", url: "/api/devices/linux-1/telemetry/linux/stream/start" },
    { method: "GET", url: "/api/devices/linux-1/telemetry/linux/options" }
  ]) assert.equal((await app.inject(input)).statusCode, 401);
});

test("telemetry options use the selected device ID and configured endpoint", async (t) => {
  const device = { id: "selected-linux-device", host: "185.89.22.116", managementPort: 22022, status: "online", capabilities: {} } as never;
  const options = buildLinuxTelemetryOptions(device, { id: "snapshot-1", collectedAt: new Date(), snapshot: { ...snapshot(), deviceId: device.id, privilegeLevel: "limited", sudoAvailable: false } });
  assert.equal(options.deviceId, device.id);
  assert.equal(options.connectionPort, 22022);
  assert.equal(options.detectedSshServicePort, 22);
  assert.equal(options.privilegeLevel, "limited");
  assert.match(options.warnings[0], /limited privilege.*NOPASSWD/i);
  const app = await buildApp({ authRequired: false });
  t.after(() => app.close());
  const missing = await app.inject({ method: "POST", url: "/api/devices/missing-linux-device/telemetry/linux/snapshot" });
  assert.equal(missing.statusCode, 404);
  assert.match(missing.json().detail, /does not exist/i);
});

test("Linux telemetry UI accepts vendor aliases and displays separate connection/service ports", () => {
  const source = readFileSync(new URL("../../src/components/telemetry/LinuxTelemetryPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /vendor === "linux"/);
  assert.match(source, /status === "online"/);
  assert.match(source, /connectionHost.*connectionPort/);
  assert.match(source, /Detected SSH service/);
  assert.doesNotMatch(source, /Linux SSH device not found/);
});

test("live findings update from active SSE events and smart presets remain bounded", () => {
  assert.deepEqual(sourcesForPreset("essential", ["auth", "system", "firewall", "kernel", "docker"]), ["auth", "system", "firewall", "kernel"]);
  assert.deepEqual(sourcesForPreset("web", ["auth", "firewall", "nginx"]), ["nginx", "auth", "firewall"]);
  const events = Array.from({ length: 10 }, (_, index) => ({ streamId: "stream-1", deviceId: "linux-1", source: "auth", timestamp: new Date(Date.now() + index).toISOString(), raw: "sshd failed", parsed: { sourceIp: "203.0.113.9", repeated: index + 1 }, severity: "high", tags: ["auth", "auth_failure", "repeated"], suspicious: true, summary: "Failed SSH authentication" })) as never;
  const findings = buildLiveFindings(events, null);
  assert.equal(findings[0].count, 10);
  assert.equal(findings[0].sourceIp, "203.0.113.9");
  assert.equal(buildFixActionProposal(findings[0], "linux-1").actionType, "block_source_ip_temporary");
});

test("Create Fix Action produces a proposed ActionPlan and never executes it", async () => {
  const plan = await proposeActionPlan({ source: "user", actionType: "custom_vendor_action", riskLevel: "high", parametersJson: { vendor: "linux", requestedOperation: "Review and restrict exposure", executionSupport: "manual_or_not_implemented", expectedImpact: "Reduce exposure", findingId: "test-finding" } });
  try {
    assert.equal(plan.status, "proposed");
    assert.equal(plan.resultJson, null);
    assert.equal(plan.approvalJson, null);
  } finally {
    await prisma.actionPlan.delete({ where: { id: plan.id } });
  }
});

test("SSE disconnect keeps server stream alive and source failures stay isolated", () => {
  const route = readFileSync(new URL("../src/routes/linux-telemetry.ts", import.meta.url), "utf8");
  const stream = readFileSync(new URL("../src/telemetry/linux/linux-log-stream.service.ts", import.meta.url), "utf8");
  assert.match(route, /request\.raw\.on\("close"[^}]+unsubscribe/);
  assert.doesNotMatch(route.match(/request\.raw\.on\("close"[^\n]+/)?.[0] ?? "", /stopLinuxLogStream/);
  assert.match(stream, /for \(const source of sources\)[\s\S]+try[\s\S]+catch/);
  assert.match(stream, /session\.warnings\.push/);
});
