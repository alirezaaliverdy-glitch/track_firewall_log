import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assetService = readFileSync(new URL("../src/assets/asset-intelligence.service.ts", import.meta.url), "utf8");
const deviceService = readFileSync(new URL("../src/services/device.service.ts", import.meta.url), "utf8");
const readiness = readFileSync(new URL("../src/db/prisma.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../prisma/migrations/20260712192000_task18_2a_vendor_linux_observability/migration.sql", import.meta.url));

test("Device writes and Asset projection sync share the same Prisma transaction", () => {
  assert.match(deviceService, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(deviceService, /syncDeviceRecordToAsset\(tx, created\)/);
  assert.match(deviceService, /syncDeviceRecordToAsset\(tx, updated\)/);
});

test("reconciliation is dry-run by default and refuses ambiguous matches", () => {
  assert.match(assetService, /repairDeviceAssetReconciliation\(apply = false\)/);
  assert.match(assetService, /Refusing reconciliation:/);
  assert.match(assetService, /Ambiguous Asset projection/);
  assert.doesNotMatch(assetService, /findFirst\(\{ where: \{ OR: \[\{ deviceId: device\.id/);
});

test("readiness covers the observability schema and model row-count smoke", () => {
  for (const table of ["DeviceCapabilityCache", "CollectionRun", "MetricSample", "MetricAggregate", "HealthSnapshot", "MonitorIncident"]) {
    assert.match(readiness, new RegExp(`to_regclass\\('public\\."${table}"'\\)`));
  }
  assert.match(readiness, /rowCountSmoke: \{ devices, assets \}/);
});

test("observability migration is UTF-8 without a BOM", () => {
  assert.notEqual(migration[0], 0xef);
  assert.equal(migration.toString("utf8", 0, 2), "--");
});
