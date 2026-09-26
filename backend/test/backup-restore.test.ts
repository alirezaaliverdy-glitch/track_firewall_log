import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { gzipSync } from "node:zlib";
import Fastify from "fastify";
import { prisma } from "../src/db/prisma.js";
import { validateRestoreArtifact, assertCompatible, linuxServiceFiles, digest } from "../src/backups/restore-profiles.js";
import { sendScpFile, runRestoreCommand, writeSftpFile } from "../src/backups/restore-transfer.js";
import { readRestoreArtifact, uploadRestoreArtifact, listRestoreVault, UPLOADED_BACKUP_TYPE } from "../src/backups/restore-vault.service.js";
import { restoreTargetFingerprint, validateRestorePolicy } from "../src/backups/restore-policy.js";
import { executeRestorePlan, buildRestorePlan } from "../src/backups/restore-plan.service.js";
import { backupRestoreRoutes } from "../src/routes/backup-restores.js";
import { encryptSecret } from "../src/services/credential-crypto.service.js";
import { findMutationPermission } from "../src/security/authorization.js";
test.after(async () => { await prisma.$disconnect(); });
function replace(t: any, object: any, key: string, value: Function) { const old = object[key]; object[key] = value; t.after(() => { object[key] = old; }); }
export function archive(members: { path: string; type?: string; link?: string; text?: string }[]) {
  const chunks: Buffer[] = [];
  for (const member of members) {
    const data = Buffer.from(member.text || ""), header = Buffer.alloc(512);
    header.write(member.path, 0, 100); header.write("0000644", 100); header.write("0000000", 108); header.write("0000000", 116);
    header.write(data.length.toString(8).padStart(11, "0"), 124); header[156] = (member.type || "0").charCodeAt(0);
    if (member.link) header.write(member.link, 157, 100);
    header.fill(32, 148, 156); const sum = header.reduce((n, byte) => n + byte, 0);
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}
const config = Buffer.from("version 15.2\nhostname test-fixture\nend\n");
const device = { id: "d1", vendor: "cisco", name: "Fixture", host: "127.0.0.1", managementPort: 2222, protocol: "ssh", company: { name: "Fixture" }, capabilities: {}, connectionChannels: [] };
const actor = { id: "owner", username: "admin", displayName: "Fixture" };
test("restore validates complete native formats, exact versions/models and masked secrets", () => {
  validateRestoreArtifact("cisco", config);
  assertCompatible("cisco", config, config);
  assert.throws(() => assertCompatible("cisco", config, Buffer.from("version 16.0\nend\n")), /MISMATCH/);
  const router = Buffer.from("# date by RouterOS 7.20\n# model = R1\n# serial number = S1\n/ip address\n");
  validateRestoreArtifact("mikrotik", router); assertCompatible("mikrotik", router, router);
  assert.throws(() => assertCompatible("mikrotik", router, Buffer.from(router.toString().replace("S1", "S2"))), /MISMATCH/);
  assert.throws(() => validateRestoreArtifact("mikrotik", Buffer.from("/ip address\n")), /VERSION_MISSING/);
  assert.throws(() => validateRestoreArtifact("fortigate", Buffer.from("#config-version=FGT-7.6\nconfig system global\nset password FortinetPasswordMask\nend\n")), /MASKED/);
});
test("Linux review rejects traversal, duplicate paths, special nodes and symlink-parent attacks", () => {
  const root = { path: "etc/", type: "5" };
  const good = archive([root, { path: "etc/passwd", text: "fixture" }, { path: "etc/localtime", type: "2", link: "/usr/share/zoneinfo/UTC" }]);
  validateRestoreArtifact("linux", good);
  assert.equal(linuxServiceFiles(good, true).length, 3);
  for (const entries of [
    [{ path: "etc/../../escape", text: "secret" }],
    [{ path: "etc/a", text: "one" }, { path: "etc/a", text: "two" }],
    [{ path: "etc/evil", type: "3" }],
    [{ path: "etc/link", type: "2", link: "/tmp" }, { path: "etc/link/escape", text: "secret" }],
    [{ path: "etc/../x", text: "secret" }]
  ]) assert.throws(() => validateRestoreArtifact("linux", archive([root, ...entries])));
});
class Channel extends EventEmitter {
  stderr = new EventEmitter(); writes: Buffer[] = [];
  write(value: Buffer | string) { this.writes.push(Buffer.from(value)); return true; }
  end(value?: Buffer) { if (value) this.write(value); }
  close() { this.emit("close", 1); }
}
function client(ch: Channel, send: () => void) { return { exec(command: string, cb: Function) { assert.ok(!command.includes("secret")); cb(null, ch); queueMicrotask(send); } } as any; }
const filename = "soar-" + "a".repeat(32) + ".conf";
test("SCP upload requires all three acknowledgements and never treats an early close as success", async () => {
  const ch = new Channel();
  await sendScpFile(client(ch, () => { ch.emit("data", Buffer.from([0])); ch.emit("data", Buffer.from([0, 0])); }), "fgt-restore-config", config, filename);
  assert.equal(ch.writes[0].toString(), "C0600 " + config.length + " " + filename + "\n"); assert.deepEqual(ch.writes[1], config);
  for (const response of [Buffer.from([0]), Buffer.from([1])]) {
    const bad = new Channel();
    await assert.rejects(sendScpFile(client(bad, () => { bad.emit("data", response); bad.emit("close"); }), "fgt-restore-config", config, filename));
  }
  await assert.rejects(sendScpFile({} as any, "fgt-restore-config;evil", config, filename), /UNSAFE/);
  await assert.rejects(writeSftpFile({} as any, "../evil.rsc", config), /UNSAFE/);
  const sftp = new EventEmitter() as any;
  sftp.end = () => undefined;
  sftp.writeFile = (_path: string, _content: Buffer, options: any, callback: Function) => { assert.equal(options.flag, "wx"); callback(null); };
  await writeSftpFile({ sftp: (callback: Function) => callback(null, sftp) } as any, "soar-" + "a".repeat(32) + ".rsc", config);
  sftp.writeFile = () => { sftp.emit("error", new Error("private remote error")); };
  await assert.rejects(writeSftpFile({ sftp: (callback: Function) => callback(null, sftp) } as any, "soar-" + "a".repeat(32) + ".rsc", config), /TRANSFER_FAILED/);
});
test("restore command output errors and missing exit status cannot become success", async () => {
  const ch = new Channel();
  await assert.rejects(runRestoreCommand(client(ch, () => { ch.emit("data", Buffer.from("failure: fixture")); ch.emit("close", 0); }), "fixed"), /COMMAND_FAILED/);
  const closed = new Channel();
  await assert.rejects(runRestoreCommand(client(closed, () => closed.emit("close")), "fixed"), /COMMAND_FAILED/);
});
test("vault encrypts uploaded config, scopes ownership and hides ciphertext in lists", async t => {
  let saved: any;
  replace(t, prisma.device, "findFirst", async (q: any) => { assert.equal(q.where.company.ownerId, actor.id); return device; });
  replace(t, prisma.deviceSnapshot, "count", async () => 0);
  replace(t, prisma, "$transaction", async (fn: Function) => fn({
    deviceSnapshot: { create: async ({ data }: any) => saved = { ...data, id: "fixture", collectedAt: new Date() } },
    auditLog: { create: async ({ data }: any) => { assert.ok(!JSON.stringify(data).includes("hostname test-fixture")); return data; } }
  }));
  const uploaded = await uploadRestoreArtifact("d1", actor.id, actor.username, "../../bad.cfg", config);
  assert.equal(saved.snapshotType, UPLOADED_BACKUP_TYPE); assert.equal(uploaded.filename, "bad.cfg");
  assert.ok(!JSON.stringify(saved).includes("hostname test-fixture"));
  replace(t, prisma.deviceSnapshot, "findFirst", async (q: any) => { assert.equal(q.where.device.company.ownerId, actor.id); return saved; });
  assert.deepEqual((await readRestoreArtifact("fixture", actor.id)).content, config);
  replace(t, prisma.deviceSnapshot, "findMany", async (q: any) => { assert.equal(q.where.device.company.ownerId, actor.id); return [saved]; });
  assert.ok(!JSON.stringify(await listRestoreVault(actor.id)).includes("encrypted"));
  saved.dataJson.encrypted = encryptSecret("invalid");
  await assert.rejects(readRestoreArtifact("fixture", actor.id), /INTEGRITY_FAILED/);
  replace(t, prisma.deviceSnapshot, "findFirst", async () => null);
  await assert.rejects(readRestoreArtifact("foreign", actor.id), /NOT_FOUND/);
});
function savedArtifact() { return { id: "a1", deviceId: device.id, vendor: device.vendor, collectedAt: new Date(), dataJson: { filename: "fixture.cfg", bytes: config.length, sha256: digest(config), encrypted: encryptSecret(config.toString("base64")) } }; }
async function validPlan(t: any) {
  replace(t, prisma.deviceSnapshot, "findFirst", async () => savedArtifact());
  replace(t, prisma.device, "findFirst", async () => device);
  const fingerprint = await restoreTargetFingerprint(device.id, actor.id);
  return { id: "p1", requestedBy: actor.id, deviceId: device.id, actionType: "generic_security_action", createdAt: new Date(), status: "dry_run_ready",
    parametersJson: { source: "backup_restore", ownerId: actor.id, artifactId: "a1", sha256: digest(config), vendor: "cisco",
      templateId: "cisco_restore_configuration", targetFingerprint: fingerprint, expiresAt: new Date(Date.now() + 600000).toISOString() } } as any;
}
test("PolicyGuard checks registered template, current endpoint, hash, owner and expiry", async t => {
  const plan = await validPlan(t);
  assert.equal((await validateRestorePolicy(plan)).valid, true);
  for (const changed of [{ sha256: "f".repeat(64) }, { targetFingerprint: "changed" }, { templateId: "unregistered" }, { expiresAt: new Date(0).toISOString() }, { ownerId: "other" }]) {
    assert.equal((await validateRestorePolicy({ ...plan, parametersJson: { ...plan.parametersJson, ...changed } })).valid, false);
  }
  const old = plan.parametersJson.targetFingerprint;
  replace(t, prisma.device, "findFirst", async () => ({ ...device, capabilities: { cpu: 75 } }));
  assert.equal(await restoreTargetFingerprint(device.id, actor.id), old);
  replace(t, prisma.device, "findFirst", async () => ({ ...device, managementPort: 22022 }));
  assert.notEqual(await restoreTargetFingerprint(device.id, actor.id), old);
});
test("restore preview saves a real ActionPlan and performs no mutating connector call", async t => {
  await validPlan(t);
  let read = 0, preflight = 0, planData: any;
  replace(t, prisma, "$transaction", async (fn: Function) => fn({
    actionPlan: { create: async ({ data }: any) => { planData = data; return { ...data, id: "p1" }; } },
    actionAuditLog: { create: async () => ({}) }
  }));
  const preview = await buildRestorePlan("a1", actor, { collect: async () => { read++; return config; }, preflight: async () => { preflight++; } });
  assert.equal(read, 1); assert.equal(preflight, 1); assert.equal(preview.connectorInvoked, false);
  assert.equal(planData.status, "dry_run_ready"); assert.ok(!JSON.stringify(planData).includes("hostname test-fixture"));
});
test("restore execution rejects missing confirmation, Linux scope confirmation, replay and foreign plans", async t => {
  const plan = await validPlan(t);
  replace(t, prisma.actionPlan, "findFirst", async () => plan);
  const input = { intent: "execute", sha256: digest(config), confirmation: "RESTORE BACKUP" };
  await assert.rejects(executeRestorePlan("p1", actor, { ...input, intent: "preview" }), /CONFIRMATION_REQUIRED/);
  await assert.rejects(executeRestorePlan("p1", actor, { ...input, sha256: "b".repeat(64) }), /CONFIRMATION_REQUIRED/);
  plan.parametersJson.vendor = "linux";
  await assert.rejects(executeRestorePlan("p1", actor, input), /CONFIRMATION_REQUIRED/);
  plan.parametersJson.vendor = "cisco";
  replace(t, prisma, "$transaction", async (fn: Function) => fn({ $queryRawUnsafe: async () => [], actionPlan: { findMany: async () => [], updateMany: async () => ({ count: 0 }) } }));
  await assert.rejects(executeRestorePlan("p1", actor, input), /ALREADY_STARTED/);
  replace(t, prisma.actionPlan, "findFirst", async (q: any) => { assert.equal(q.where.requestedBy, actor.id); return null; });
  await assert.rejects(executeRestorePlan("foreign", actor, input), /NOT_FOUND/);
});
test("non-admin users cannot upload, preview, execute, verify or delete uploaded backups", async () => {
  for (const role of [null, "viewer", "operator"]) {
    const app = Fastify(); app.decorateRequest("authUser", null);
    app.addHook("preHandler", async req => { (req as any).authUser = role ? { ...actor, role } : null; });
    await backupRestoreRoutes(app);
    for (const [method, url, payload] of [
      ["POST", "/api/backups/vault?deviceId=d1", undefined],
      ["POST", "/api/backups/restores/preview", { artifactId: "a1" }],
      ["POST", "/api/backups/restores/p1/execute", { intent: "execute", sha256: digest(config), confirmation: "RESTORE BACKUP" }],
      ["POST", "/api/backups/restores/p1/verify", undefined],
      ["DELETE", "/api/backups/vault/a1", { confirmation: "DELETE UPLOADED BACKUP" }]
    ] as const) assert.equal((await app.inject({ method, url, payload })).statusCode, role ? 403 : 401);
    await app.close();
  }
  assert.equal(findMutationPermission("POST", "/api/backups/restores/p1/execute"), "actions.execute.high_risk");
});
