import assert from "node:assert/strict";
import test from "node:test";
import { DeviceEnvironment, DeviceProtocol, DeviceType } from "@prisma/client";
import { prisma } from "../src/db/prisma.js";
import { createCompany, permanentlyDeleteCompany, restoreCompany, softDeleteCompany } from "../src/services/company.service.js";
import { createDevice, getDeviceById, listDevices } from "../src/services/device.service.js";
import { getAssetTopology } from "../src/assets/asset-intelligence.service.js";

const passwordHash = "$2b$12$companyAssetTenancyTestOnly000000000000000000000000000";

async function createUser(username: string, role: "admin" | "operator" = "operator") {
  return prisma.appUser.create({ data: { username, displayName: username, passwordHash, role } });
}

function deviceInput(companyId: string, name: string, host: string) {
  return {
    companyId,
    name,
    vendor: "linux",
    type: DeviceType.linux_edge,
    host,
    managementPort: 22,
    protocol: DeviceProtocol.ssh,
    environment: DeviceEnvironment.lab,
    tags: [],
    capabilities: {}
  };
}

test("company tenancy, recovery, and database cascades", async () => {
  await prisma.appUser.deleteMany({ where: { username: { startsWith: "company-test-" } } });
  const owner = await createUser("company-test-owner", "admin");
  const other = await createUser("company-test-other");
  const actor = { id: owner.id, role: owner.role, username: owner.username };

  try {
    const company = await createCompany(actor, { name: "Alpha Network", code: "ALPHA" });
    const device = await createDevice(deviceInput(company.id, "alpha-edge", "198.51.100.10"), owner.id);
    const asset = await prisma.asset.findUniqueOrThrow({ where: { deviceId: device.id } });
    assert.equal(asset.companyId, company.id);

    const otherCompany = await createCompany(
      { id: other.id, role: other.role, username: other.username },
      { name: "Other Network", code: "OTHER" }
    );
    const otherDevice = await createDevice(deviceInput(otherCompany.id, "other-edge", "198.51.100.10"), other.id);
    const otherAsset = await prisma.asset.findUniqueOrThrow({ where: { deviceId: otherDevice.id } });
    assert.equal(otherAsset.companyId, otherCompany.id);
    assert.notEqual(otherAsset.id, asset.id);
    await prisma.assetRelationship.create({ data: { fromAssetId: asset.id, toAssetId: otherAsset.id, type: "test-cross-company" } });
    const ownerTopology = await getAssetTopology(asset.id, owner.id);
    assert.deepEqual(ownerTopology?.nodes.map((node) => node.id), [asset.id]);

    assert.equal((await listDevices(owner.id)).length, 1);
    assert.equal((await listDevices(other.id)).length, 1);
    assert.equal(await getDeviceById(device.id, other.id), null);

    const previouslyArchivedDevice = await createDevice(deviceInput(company.id, "old-edge", "198.51.100.12"), owner.id);
    const previouslyArchivedAt = new Date(Date.now() - 60_000);
    await prisma.$transaction([
      prisma.device.update({ where: { id: previouslyArchivedDevice.id }, data: { deletedAt: previouslyArchivedAt } }),
      prisma.asset.update({ where: { deviceId: previouslyArchivedDevice.id }, data: { deletedAt: previouslyArchivedAt } })
    ]);

    await assert.rejects(() => softDeleteCompany(actor, company.id, "wrong"), /COMPANY_CONFIRMATION_MISMATCH/);
    await softDeleteCompany(actor, company.id, company.name);
    assert.equal((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).deletedAt instanceof Date, true);
    assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: device.id } })).deletedAt instanceof Date, true);
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).deletedAt instanceof Date, true);
    assert.equal((await listDevices(owner.id)).length, 0);

    await restoreCompany(actor, company.id);
    assert.equal((await listDevices(owner.id)).length, 1);
    assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: previouslyArchivedDevice.id } })).deletedAt?.getTime(), previouslyArchivedAt.getTime());

    await softDeleteCompany(actor, company.id, company.name);
    await permanentlyDeleteCompany(actor, company.id, `DELETE ${company.code}`);
    assert.equal(await prisma.company.count({ where: { id: company.id } }), 0);
    assert.equal(await prisma.device.count({ where: { id: device.id } }), 0);
    assert.equal(await prisma.asset.count({ where: { id: asset.id } }), 0);

    const cascadeUser = await createUser("company-test-cascade");
    const cascadeCompany = await createCompany({ id: cascadeUser.id, role: cascadeUser.role }, { name: "Cascade Co", code: "CASCADE" });
    const cascadeDevice = await createDevice(deviceInput(cascadeCompany.id, "cascade-edge", "198.51.100.11"), cascadeUser.id);
    const cascadeAsset = await prisma.asset.findUniqueOrThrow({ where: { deviceId: cascadeDevice.id } });
    await prisma.appUser.delete({ where: { id: cascadeUser.id } });
    assert.equal(await prisma.company.count({ where: { id: cascadeCompany.id } }), 0);
    assert.equal(await prisma.device.count({ where: { id: cascadeDevice.id } }), 0);
    assert.equal(await prisma.asset.count({ where: { id: cascadeAsset.id } }), 0);
  } finally {
    await prisma.appUser.deleteMany({ where: { username: { startsWith: "company-test-" } } });
    await prisma.$disconnect();
  }
});
