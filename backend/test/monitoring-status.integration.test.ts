import { randomUUID } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { prisma, shutdownDatabase } from "../src/db/prisma.js";
import { getSecurityMonitorStatus } from "../src/services/security-monitor.service.js";
import { selectCollector } from "../src/collectors/collector-registry.service.js";
test("monitoring coverage and collector identities are workspace scoped and exclude deleted devices", async () => {
  const tag = `coverage-${randomUUID()}`, ids: string[] = [];
  try {
    for (const suffix of ["own", "foreign"]) {
      const owner = await prisma.appUser.create({ data: { username: `${tag}-${suffix}`, displayName: "Fixture", passwordHash: "no-login", role: "admin" } }); ids.push(owner.id);
      const company = await prisma.company.create({ data: { name: `${tag}-${suffix}`, code: `${tag}-${suffix}`, ownerId: owner.id } });
      const device = await prisma.device.create({ data: { companyId: company.id, name: `${tag}-${suffix}`, vendor: "linux", type: "linux_edge", host: "192.0.2.1", managementPort: 22, protocol: "ssh", environment: "lab" } });
      await prisma.eventCollectorState.create({ data: { deviceId: device.id, sourceType: selectCollector(device)!.stateSourceType, lastSuccessAt: new Date() } });
      if (suffix === "own") await prisma.device.create({ data: { companyId: company.id, name: `${tag}-deleted`, vendor: "linux", type: "linux_edge", host: "192.0.2.2", managementPort: 22, protocol: "ssh", environment: "lab", deletedAt: new Date() } });
    }
    const result = await getSecurityMonitorStatus(ids[0]);
    assert.equal(result.coverage.summary.total, 1); assert.equal(result.coverage.summary.fresh, 1);
    assert.equal(result.collectors.devices.length, 1); assert.equal(result.collectors.devices[0].deviceName, `${tag}-own`);
    assert.equal(JSON.stringify(result.coverage).includes(`${tag}-foreign`), false); assert.equal(JSON.stringify(result.coverage).includes(`${tag}-deleted`), false);
  } finally { await prisma.appUser.deleteMany({ where: { id: { in: ids } } }); await shutdownDatabase(); }
});
