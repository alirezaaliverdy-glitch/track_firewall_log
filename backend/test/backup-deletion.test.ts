import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { prisma } from "../src/db/prisma.js";
import { backupRoutes } from "../src/routes/backups.js";
import { backupHistoryWhere, clearBackupHistory } from "../src/backups/backup-history.service.js";
import { deleteBackupFile, BACKUP_SNAPSHOT_TYPE } from "../src/backups/device-backup.service.js";
test.after(async () => { await prisma.$disconnect(); });
function replace(t: any, object: any, key: string, value: Function) {
  const original = object[key]; object[key] = value; t.after(() => { object[key] = original; });
}
async function appFor(role: string | null) {
  const app = Fastify(); app.decorateRequest("authUser", null);
  app.addHook("preHandler", async request => { (request as any).authUser = role ? { id: "owner", username: "admin", displayName: "Administrator", role } : null; });
  await backupRoutes(app); return app;
}
const before = "2026-09-26T09:00:00Z";
test("anonymous, viewer and operator cannot delete history or files", async () => {
  for (const role of [null, "viewer", "operator"]) {
    const app = await appFor(role);
    for (const [url, payload] of [
      ["/api/backups/activity", { confirmation: "DELETE BACKUP HISTORY", before }],
      ["/api/backups/file", { confirmation: "DELETE BACKUP FILE" }]
    ] as const) {
      assert.equal((await app.inject({ method: "DELETE", url, payload })).statusCode, role ? 403 : 401);
    }
    await app.close();
  }
});
test("history filter always scopes owner, backup actions, selected IDs and cutoff", () => {
  const where: any = backupHistoryWhere("owner", { companyId: "company", ids: ["event"], before });
  assert.equal(where.device.company.ownerId, "owner");
  assert.equal(where.device.companyId, "company");
  assert.deepEqual(where.id.in, ["event"]);
  assert.equal(where.createdAt.lte.toISOString(), new Date(before).toISOString());
  assert.ok(!where.action.in.includes("device.backup.history.clear"));
  assert.ok(!where.action.in.includes("credential.update"));
  assert.throws(() => backupHistoryWhere("owner", { action: "history.clear" }));
});
test("confirmed history deletion audits count and never removes snapshots", async t => {
  let audit: any;
  replace(t, prisma, "$transaction", async (callback: Function) => callback({
    auditLog: {
      deleteMany: async ({ where }: any) => { assert.equal(where.device.company.ownerId, "owner"); assert.deepEqual(where.id.in, ["event"]); return { count: 1 }; },
      create: async ({ data }: any) => { audit = data; return {}; }
    },
    deviceSnapshot: { deleteMany: async () => { throw new Error("Must preserve backups"); } }
  }));
  const app = await appFor("admin");
  const response = await app.inject({ method: "DELETE", url: "/api/backups/activity", payload: { confirmation: "DELETE BACKUP HISTORY", before, ids: ["event"] } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true, deletedCount: 1, filesDeleted: false });
  assert.equal(audit.action, "device.backup.history.clear");
  assert.equal(audit.actor, "admin");
  assert.equal(audit.metadata.deletedCount, 1);
  assert.equal((await app.inject({ method: "DELETE", url: "/api/backups/activity", payload: { before } })).statusCode, 400);
  assert.equal((await app.inject({ method: "DELETE", url: "/api/backups/activity", payload: { confirmation: "DELETE BACKUP HISTORY", before: "invalid" } })).statusCode, 400);
  await app.close();
  await assert.rejects(clearBackupHistory("owner", "admin", {}), /CONFIRMATION_REQUIRED/);
});
test("file deletion checks owner and type, audits safe metadata and preserves history", async t => {
  let audit: any;
  replace(t, prisma, "$transaction", async (callback: Function) => callback({
    deviceSnapshot: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.device.company.ownerId, "owner"); assert.equal(where.snapshotType, BACKUP_SNAPSHOT_TYPE);
        return { deviceId: "d1", dataJson: { filename: "file.cfg", encrypted: "private", actor: "creator" } };
      },
      deleteMany: async ({ where }: any) => { assert.equal(where.device.company.ownerId, "owner"); return { count: 1 }; }
    },
    auditLog: { create: async ({ data }: any) => { audit = data; return {}; } }
  }));
  const app = await appFor("admin");
  assert.equal((await app.inject({ method: "DELETE", url: "/api/backups/file", payload: { confirmation: "DELETE BACKUP FILE" } })).statusCode, 200);
  assert.equal(audit.action, "device.backup.delete");
  assert.equal(audit.metadata.actorName, "Administrator");
  assert.ok(!JSON.stringify(audit).includes("private"));
  assert.equal((await app.inject({ method: "DELETE", url: "/api/backups/file", payload: { confirmation: "wrong" } })).statusCode, 400);
  await app.close();
});
test("foreign or missing backup cannot be deleted", async t => {
  replace(t, prisma, "$transaction", async (callback: Function) => callback({
    deviceSnapshot: { findFirst: async ({ where }: any) => { assert.equal(where.device.company.ownerId, "other"); return null; },
      deleteMany: async () => { throw new Error("Unexpected deletion"); } }
  }));
  await assert.rejects(deleteBackupFile("file", "other", "admin"), /BACKUP_NOT_FOUND/);
});
