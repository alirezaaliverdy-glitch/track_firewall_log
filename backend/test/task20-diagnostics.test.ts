import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { diagnosticInternalsForTest } from "../src/services/diagnostics.service.js";
import { nmapInternalsForTest } from "../src/services/nmap-worker.service.js";

test("Task 20 diagnostics target parser blocks private and unsafe external targets", () => {
  assert.equal(diagnosticInternalsForTest.classifyTarget("192.168.1.10").publicAllowed, false);
  assert.equal(diagnosticInternalsForTest.classifyTarget("http://127.0.0.1:8080").reason, "PRIVATE_OR_RESERVED_TARGET_BLOCKED");
  assert.equal(diagnosticInternalsForTest.classifyTarget("http://[::ffff:127.0.0.1]").reason, "PRIVATE_OR_RESERVED_TARGET_BLOCKED");
  assert.equal(diagnosticInternalsForTest.classifyTarget("198.51.100.8").publicAllowed, false);
  assert.equal(diagnosticInternalsForTest.classifyTarget("file:///etc/passwd").reason, "URL_SCHEME_BLOCKED");
  assert.equal(diagnosticInternalsForTest.classifyTarget("example.com").publicAllowed, true);
  assert.equal(diagnosticInternalsForTest.classifyTarget("https://example.com").targetKind, "url");
  assert.equal(diagnosticInternalsForTest.classifyTarget("example.com:443").targetKind, "host_port");
});

test("Task 20 diagnostics rejects unauthorized private targets and persists worker/provider evidence", async (t) => {
  const app = await buildApp({ authRequired: false });
  const createdIds: string[] = [];
  t.after(async () => {
    if (createdIds.length) await prisma.auditLog.deleteMany({ where: { id: { in: createdIds } } });
  });
  try {
    const response = await app.inject({ method: "POST", url: "/api/diagnostics/sessions", payload: { target: "192.168.1.10" } });
    assert.equal(response.statusCode, 422);
    const session = response.json().session;
    createdIds.push(session.id);
    assert.equal(session.state, "failed");
    assert.equal(session.providerInvoked, false);
    assert.equal(session.summary.reason, "PRIVATE_OR_RESERVED_TARGET_BLOCKED");

    const persisted = await prisma.auditLog.findUnique({ where: { id: session.id } });
    assert.equal(persisted?.action, "diagnostic_session");
    assert.equal((persisted?.metadata as { providerInvoked?: boolean })?.providerInvoked, false);

    const history = await app.inject({ method: "GET", url: "/api/diagnostics/sessions" });
    assert.equal(history.statusCode, 200);
    assert.ok(history.json().sessions.some((item: { id: string }) => item.id === session.id));
  } finally {
    await app.close();
  }
});

test("Task 20 tools routes and current Dashboard controls point to real destinations", () => {
  const routes = readFileSync(join(process.cwd(), "..", "src", "routes", "appRoutes.tsx"), "utf8");
  for (const path of ["/tools", "/tools/network-check", "/tools/domain-check", "/tools/ip-check", "/tools/nmap", "/tools/dns", "/tools/http", "/tools/ports", "/tools/traceroute", "/tools/ip-info", "/tools/subnet", "/tools/history", "/tools/monitors"]) {
    assert.match(routes, new RegExp(`path: "${path.replace("/", "\\/")}`));
  }
  const dashboard = readFileSync(join(process.cwd(), "..", "src", "features", "dashboard", "pages", "DashboardPage.tsx"), "utf8");
  for (const path of ["/actions", "/assets/devices/new", "/security/findings", "/monitoring/linux"]) {
    assert.match(dashboard, new RegExp(path.replace("/", "\\/")));
  }
});

test("Task 20 Nmap worker allows only fixed safe profiles and parses XML", () => {
  assert.deepEqual(nmapInternalsForTest.profileArgs("host_discovery", "scanme.nmap.org"), ["-sn", "-oX", "-", "scanme.nmap.org"]);
  assert.deepEqual(nmapInternalsForTest.profileArgs("quick_tcp", "scanme.nmap.org"), ["-Pn", "-sT", "--top-ports", "20", "-T3", "-oX", "-", "scanme.nmap.org"]);
  assert.equal(nmapInternalsForTest.classifyNmapTarget("192.168.1.1").allowed, false);
  assert.equal(nmapInternalsForTest.classifyNmapTarget("scanme.nmap.org").allowed, true);
  const parsed = nmapInternalsForTest.parseXml(`<?xml version="1.0"?><nmaprun><host><status state="up"/><address addr="45.33.32.156" addrtype="ipv4"/><hostnames><hostname name="scanme.nmap.org"/></hostnames><ports><port protocol="tcp" portid="80"><state state="open"/><service name="http"/></port></ports></host><runstats><finished elapsed="1.2"/></runstats></nmaprun>`);
  assert.equal(parsed.hosts[0].state, "up");
  assert.equal(parsed.hosts[0].addresses[0].address, "45.33.32.156");
  assert.equal(parsed.hosts[0].ports[0].port, 80);
  assert.equal(parsed.hosts[0].ports[0].state, "open");
});

test("Task 20 Nmap pins a public DNS result and rejects private or mixed DNS answers", async () => {
  const policy = nmapInternalsForTest.classifyNmapTarget("scan.example.com");
  const publicResult = await nmapInternalsForTest.resolveNmapScanAddress(policy, async () => [{ address: "8.8.8.8", family: 4 }]);
  assert.equal(publicResult.allowed, true);
  assert.equal(publicResult.scanHost, "8.8.8.8");

  const privateResult = await nmapInternalsForTest.resolveNmapScanAddress(policy, async () => [{ address: "127.0.0.1", family: 4 }]);
  assert.equal(privateResult.allowed, false);
  assert.equal(privateResult.reason, "DNS_PRIVATE_OR_RESERVED_TARGET_BLOCKED");

  const mixedResult = await nmapInternalsForTest.resolveNmapScanAddress(policy, async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "10.0.0.5", family: 4 }
  ]);
  assert.equal(mixedResult.allowed, false);
});

test("Task 20 Nmap rejects unauthorized private targets without worker invocation", async (t) => {
  const app = await buildApp({ authRequired: false });
  const createdIds: string[] = [];
  t.after(async () => {
    if (createdIds.length) await prisma.auditLog.deleteMany({ where: { id: { in: createdIds } } });
  });
  try {
    const response = await app.inject({ method: "POST", url: "/api/diagnostics/nmap", payload: { target: "10.0.0.1", profile: "quick_tcp" } });
    assert.equal(response.statusCode, 422);
    const scan = response.json().scan;
    createdIds.push(scan.id);
    assert.equal(scan.state, "rejected");
    assert.equal(scan.workerInvoked, false);
    assert.equal(scan.policyDecision, "rejected");
  } finally {
    await app.close();
  }
});
