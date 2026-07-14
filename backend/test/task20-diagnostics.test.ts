import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { diagnosticInternalsForTest } from "../src/services/diagnostics.service.js";

test("Task 20 diagnostics target parser blocks private and unsafe external targets", () => {
  assert.equal(diagnosticInternalsForTest.classifyTarget("192.168.1.10").publicAllowed, false);
  assert.equal(diagnosticInternalsForTest.classifyTarget("http://127.0.0.1:8080").reason, "PRIVATE_OR_RESERVED_TARGET_BLOCKED");
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

test("Task 20 tools routes and Dashboard controls point to real tool destinations", () => {
  const routes = readFileSync(join(process.cwd(), "..", "src", "routes", "appRoutes.tsx"), "utf8");
  for (const path of ["/tools", "/tools/network-check", "/tools/domain-check", "/tools/ip-check", "/tools/nmap", "/tools/dns", "/tools/http", "/tools/ports", "/tools/traceroute", "/tools/ip-info", "/tools/subnet", "/tools/history", "/tools/monitors"]) {
    assert.match(routes, new RegExp(`path: "${path.replace("/", "\\/")}`));
  }
  const dashboard = readFileSync(join(process.cwd(), "..", "src", "features", "dashboard", "pages", "DashboardPage.tsx"), "utf8");
  for (const path of ["/tools/network-check", "/tools", "/tools/nmap", "/tools/monitors", "/assets/devices/new", "/assets/devices"]) {
    assert.match(dashboard, new RegExp(`href="${path.replace("/", "\\/")}`));
  }
});
