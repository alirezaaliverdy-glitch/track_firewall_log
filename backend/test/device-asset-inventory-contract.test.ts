import assert from "node:assert/strict";
import test from "node:test";
import {
  CONNECTION_STATUSES,
  DEVICE_ASSET_INVENTORY_CONTRACT,
  INVENTORY_STATUSES,
  MANAGEMENT_STATUSES,
  VERIFICATION_STATUSES,
  isInventoryStatus
} from "../src/inventory/device-asset-inventory.contract.js";

test("Device is authoritative and Asset is its equipment projection", () => {
  assert.equal(DEVICE_ASSET_INVENTORY_CONTRACT.controlEntity, "Device");
  assert.equal(DEVICE_ASSET_INVENTORY_CONTRACT.projectionEntity, "Asset");
  assert.match(DEVICE_ASSET_INVENTORY_CONTRACT.removalRule, /remove or archive/);
  assert.equal(isInventoryStatus("active"), true);
  assert.equal(isInventoryStatus("deleted"), false);
});

test("canonical inventory dimensions remain independent", () => {
  assert.deepEqual(INVENTORY_STATUSES, ["active", "archived"]);
  assert.deepEqual(CONNECTION_STATUSES, ["unknown", "online", "offline", "error"]);
  assert.deepEqual(VERIFICATION_STATUSES, ["pending", "verified", "failed"]);
  assert.deepEqual(MANAGEMENT_STATUSES, ["managed", "unmanaged"]);
});
