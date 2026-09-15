import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeCiscoWorkspaceInterfaces, projectCiscoWorkspaceDetails } from "../src/services/device-workspace-cisco.js";

test("Cisco interface projection merges abbreviated and expanded interface identities", () => {
  const merged = mergeCiscoWorkspaceInterfaces(
    [{ name: "GigabitEthernet1/0/1", ipAddress: "192.0.2.10", operationalStatus: "up" }],
    [{ name: "Gi1/0/1", status: "connected", vlan: "20", speed: "1000", duplex: "full" }]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.vlan, "20");
  assert.equal(merged[0]?.ipAddress, "192.0.2.10");
});

test("Cisco workspace projection exposes structured operational data without raw CLI or secrets", () => {
  const details = projectCiscoWorkspaceDetails({
    collectedAt: "2026-09-11T10:00:00.000Z",
    platform: "cisco-ios-classic",
    inventoryStatus: "collected",
    capabilityStatus: "available",
    system: {
      hostname: "floor2",
      model: "WS-C2960X",
      inventory: [{ name: "Switch 1", model: "WS-C2960X", serialNumber: "SERIAL", raw: "sensitive raw inventory" }]
    },
    interfaces: {
      state: "collected",
      summary: [{ name: "Gi1/0/1", operationalStatus: "up", raw: "raw interface line" }],
      switchports: [{ name: "Gi1/0/1", vlan: "10", status: "connected", raw: "raw switchport line" }],
      errors: ["raw error line"]
    },
    network: {
      vlans: { state: "collected", entries: [{ vlanId: 10, name: "users", status: "active", raw: "raw vlan line" }] },
      routingTable: { state: "collected", entries: [{ raw: "C 192.168.7.0/24 is directly connected" }] }
    },
    configuration: { runningConfigMetadata: { state: "collected", entries: [{ key: "Last configuration change", value: "today", raw: "raw" }] } },
    securityServices: {
      localUsers: { state: "collected", entries: [{ username: "admin", secretStored: true, password: "never-return" }] },
      ssh: { state: "collected", entries: [{ key: "SSH Enabled", value: "version 2", raw: "raw" }] }
    },
    outputs: { platform: "must not escape" },
    commandEvidence: [{ command: "show running-config", evidence: ["must not escape"] }]
  });

  assert.ok(details);
  assert.equal(details?.inventoryStatus, "collected");
  assert.equal((details?.network as Record<string, { count: number }>).vlans.count, 1);
  assert.equal((details?.security as Record<string, { count: number }>).localUsers.count, 1);
  const serialized = JSON.stringify(details);
  assert.doesNotMatch(serialized, /sensitive raw|raw interface|raw switchport|raw vlan|never-return|show running-config|must not escape/);
  assert.match(serialized, /Gi1\/0\/1/);
  assert.match(serialized, /WS-C2960X/);
});

test("asset detail uses the graphical Cisco operational dashboard", () => {
  const page = readFileSync(new URL("../../src/features/assets/pages/AssetDetailPage.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../../src/features/assets/components/CiscoAssetDashboard.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../src/features/assets/components/CiscoAssetDashboard.css", import.meta.url), "utf8");
  assert.match(page, /<CiscoAssetDashboard/);
  assert.match(page, /currentWorkspace\.vendorDetails/);
  assert.match(dashboard, /cisco-port-dots/);
  assert.match(dashboard, /serviceDomains/);
  assert.match(dashboard, /تازه‌سازی داده زنده/);
  assert.match(styles, /\.cisco-dashboard-grid/);
  assert.match(styles, /@media\(max-width:760px\)/);
});
