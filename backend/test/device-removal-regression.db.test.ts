import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { assertSafeTestDatabaseEnvironment } from "../src/testing/test-database-safety.js";

assertSafeTestDatabaseEnvironment();

test("DELETE succeeds while the linked Asset remains visible in equipment inventory", async () => {
  const [{ buildApp }, { prisma, shutdownDatabase }] = await Promise.all([
    import("../src/app.js"),
    import("../src/db/prisma.js")
  ]);
  const app = await buildApp({ authRequired: false });
  const suffix = randomUUID();
  let deviceId: string | undefined;
  let assetId: string | undefined;

  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/devices",
      payload: {
        name: `phase-a-removal-${suffix}`,
        vendor: "regression-test",
        type: "generic_firewall",
        host: `phase-a-${suffix}.invalid`,
        managementPort: 22,
        protocol: "ssh",
        environment: "lab"
      }
    });
    assert.equal(created.statusCode, 201);
    deviceId = created.json<{ id: string }>().id;

    const linkedAsset = await prisma.asset.findUnique({ where: { deviceId } });
    assert.ok(linkedAsset);
    assetId = linkedAsset.id;

    const removed = await app.inject({ method: "DELETE", url: `/api/devices/${deviceId}` });
    assert.equal(removed.statusCode, 204);

    const equipment = await app.inject({ method: "GET", url: "/api/assets" });
    assert.equal(equipment.statusCode, 200);
    const visible = equipment.json<{ assets: Array<{ id: string; deviceId: string | null }> }>().assets
      .find((asset) => asset.id === assetId);
    assert.ok(visible, "orphan Asset remains visible after successful Device deletion");
    assert.equal(visible.deviceId, null, "onDelete: SetNull detached the Asset from the deleted Device");
  } finally {
    if (deviceId) await prisma.device.deleteMany({ where: { id: deviceId } });
    if (assetId) await prisma.asset.deleteMany({ where: { id: assetId } });
    await app.close();
    await shutdownDatabase();
  }
});
