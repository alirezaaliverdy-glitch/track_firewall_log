import assert from "node:assert/strict";
import test from "node:test";
import { liveVendorProjection, resolveWorkspaceConnectionState } from "../src/services/device-workspace.service.js";

test("a newer verified Cisco collection overrides an older failed SSH status", () => {
  const state = resolveWorkspaceConnectionState(
    { status: "error", checkedAt: "2026-09-08T07:21:30.000Z" },
    "online",
    ["2026-09-08T09:38:24.000Z"]
  );
  assert.equal(state.availability, "online");
  assert.equal(state.verificationStatus, "verified");
  assert.equal(new Date(state.lastContact!).toISOString(), "2026-09-08T09:38:24.000Z");
});

test("a newer connection failure remains visible instead of being hidden by old inventory", () => {
  const state = resolveWorkspaceConnectionState(
    { status: "error", checkedAt: "2026-09-08T10:00:00.000Z" },
    "online",
    ["2026-09-08T09:38:24.000Z"]
  );
  assert.equal(state.availability, "error");
  assert.equal(state.verificationStatus, "needs_review");
});

test("MikroTik workspace is derived only from a successful live connector result", () => {
  assert.equal(liveVendorProjection("mikrotik", { mikrotikStatus: { connected: false, mikrotik: { identity: "stale" } } }, null), null);

  const projection = liveVendorProjection("mikrotik", {
    mikrotikStatus: {
      connected: true,
      collectedAt: "2026-09-08T10:00:00.000Z",
      capabilities: { canReadSystem: true, canReadInterfaces: true, canReadFirewall: false },
      warnings: [],
      mikrotik: {
        identity: "edge-router",
        routerosVersion: "7.20",
        uptime: "1d2h",
        interfaces: ["name=ether1 running=true"],
        routes: [],
        firewallFilterRules: ["chain=input action=accept"],
        services: []
      }
    }
  }, null);

  assert.equal(projection?.facts.hostname, "edge-router");
  assert.equal(projection?.facts.version, "7.20");
  assert.deepEqual(projection?.sections.map((item) => item.key), ["system", "interfaces", "firewall"]);
  assert.deepEqual(projection?.capabilities.map((item) => item.key), ["canReadSystem", "canReadInterfaces"]);
});

test("FortiGate workspace omits empty feature panels", () => {
  const projection = liveVendorProjection("fortigate", {
    fortigateStatus: {
      connected: true,
      capabilities: { canReadSystem: true },
      warnings: [],
      fortigate: { hostname: "fg-edge", model: "FG-60F", version: "7.4", interfaces: [], policies: [] }
    }
  }, "2026-09-08T10:00:00.000Z");

  assert.equal(projection?.facts.model, "FG-60F");
  assert.deepEqual(projection?.sections.map((item) => item.key), ["system"]);
});
