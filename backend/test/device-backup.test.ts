import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import Fastify from "fastify";
import type { Client } from "ssh2";
import { backupProfile, validateBackup, backupFilename } from "../src/backups/backup-profiles.js";
import { readBackupCommand } from "../src/backups/backup-collector.js";
import { readFortigateConfig } from "../src/backups/fortigate-scp.js";
import { backupRoutes } from "../src/routes/backups.js";
import { backupMetadata, createBackup, downloadBackup, BACKUP_SNAPSHOT_TYPE } from "../src/backups/device-backup.service.js";
import { prisma } from "../src/db/prisma.js";
import { encryptSecret } from "../src/services/credential-crypto.service.js";
import { getProductNavigation } from "../src/product-state/product-state.registry.js";
import { sectionForApiPath } from "../src/security/section-access.js";
import { SharedSshConnectionError } from "../src/services/shared-ssh-session.service.js";

test.after(async () => { await prisma.$disconnect(); });
function replace(t: any, object: any, key: string, value: Function) {
  const original = object[key]; object[key] = value;
  t.after(() => { object[key] = original; });
}
const config = Buffer.from("version 15.2\nhostname sw1\ninterface Gi1/0/1\nend\n");
test("vendor profiles expose correct formats and honest scope", () => {
  for (const [vendor, ext] of [["cisco","cfg"],["mikrotik","rsc"],["fortinet","conf"],["pfsense","xml"],["linux","tar.gz"]]) assert.equal(backupProfile(vendor).extension, ext);
  assert.equal(backupProfile("sophos").supported, false);
  assert.equal(backupProfile("unknown").supported, false);
});
test("complete configs pass, truncated and CLI error output fail", () => {
  validateBackup(backupProfile("cisco"), config);
  validateBackup(backupProfile("mikrotik"), Buffer.from("# RouterOS\n/ip address add address=10.0.0.1/24\n"));
  validateBackup(backupProfile("fortigate"), Buffer.from("#config-version=FGT\nconfig system global\nend\n"));
  validateBackup(backupProfile("pfsense"), Buffer.from('<?xml version="1.0"?><pfsense><system/></pfsense>'));
  for (const output of ["", "hostname sw1", "% Invalid input\nend", "hostname sw1\n--More--\nend"]) assert.throws(() => validateBackup(backupProfile("cisco"), Buffer.from(output)));
  assert.throws(() => validateBackup(backupProfile("fortigate"), Buffer.from("config system global\nend")));
  assert.throws(() => validateBackup(backupProfile("pfsense"), Buffer.from("<pfsense>")));
  assert.throws(() => validateBackup(backupProfile("mikrotik"), Buffer.from("/ip address\n#error exporting")));
});
test("Linux archive must be valid gzip and have complete tar ending", () => {
  validateBackup(backupProfile("linux"), gzipSync(Buffer.alloc(1024)));
  assert.throws(() => validateBackup(backupProfile("linux"), Buffer.from([31,139,0])));
  assert.throws(() => validateBackup(backupProfile("linux"), gzipSync(Buffer.from("incomplete"))));
});
test("safe filenames and metadata never expose ciphertext", () => {
  assert.match(backupFilename('../../sw1"\r\n', "cfg"), /^[a-zA-Z0-9_.-]+$/);
  assert.ok(!("encrypted" in backupMetadata({ encrypted: "secret", filename: "a.cfg" })));
});
class Channel extends EventEmitter {
  stderr = new EventEmitter();
  writes: Buffer[] = [];
  write(value: Buffer) { this.writes.push(value); return true; }
  close() { this.emit("close", 1); }
}
function client(channel: Channel, send: () => void) {
  return { exec(_command: string, callback: Function) { callback(null, channel); queueMicrotask(send); } } as unknown as Client;
}
test("SSH collector preserves binary data and rejects partial/error results", async () => {
  const ch = new Channel();
  assert.deepEqual(await readBackupCommand(client(ch, () => { ch.emit("data", Buffer.from([0,255,10])); ch.emit("close", 0); }), "fixed"), Buffer.from([0,255,10]));
  const bad = new Channel();
  await assert.rejects(readBackupCommand(client(bad, () => { bad.emit("data", config); bad.stderr.emit("data", "secret error"); bad.emit("close", 1); }), "fixed"), /BACKUP_COMMAND_FAILED/);
});
test("FortiGate SCP handles fragmented headers and exact file content", async () => {
  const ch = new Channel(), data = Buffer.from("#config-version=FGT\nconfig system global\nend\n");
  const result = await readFortigateConfig(client(ch, () => {
    ch.emit("data", Buffer.from(`C0644 ${data.length} sys_`));
    ch.emit("data", Buffer.concat([Buffer.from("config\n"), data.subarray(0, 10)]));
    ch.emit("data", Buffer.concat([data.subarray(10), Buffer.from([0])]));
    ch.emit("close", 0);
  }));
  assert.deepEqual(result, data);
  assert.equal(ch.writes.length, 3);
});
test("FortiGate SCP rejects truncated files and remote error messages", async () => {
  for (const payload of ["C0644 100 sys_config\nabc", "\x01permission denied\n", "C0644 999999999 sys_config\n"]) {
    const ch = new Channel();
    await assert.rejects(readFortigateConfig(client(ch, () => { ch.emit("data", Buffer.from(payload)); ch.emit("close", 0); })));
  }
});
test("anonymous and viewer users cannot list, create or download backups", async () => {
  for (const role of [null, "viewer"]) {
    const app = Fastify();
    if (role) app.addHook("preHandler", async request => { request.authUser = { id: "owner", username: "viewer", displayName: "Viewer", role: "viewer", allowedSections: ["assets"] } as any; });
    await app.register(backupRoutes);
    for (const [method,url,payload] of [["GET","/api/backups",undefined],["POST","/api/backups",{deviceId:"d1"}],["GET","/api/backups/b1/download",undefined]] as const) {
      const response = await app.inject({ method, url, payload });
      assert.equal(response.statusCode, role ? 403 : 401);
    }
    await app.close();
  }
});
test("backup navigation belongs to assets access", () => {
  assert.ok(getProductNavigation(["assets"]).some(g => g.key === "backups"));
  assert.ok(!getProductNavigation(["actions"]).some(g => g.key === "backups"));
  assert.equal(sectionForApiPath("/api/backups/b1/download"), "assets");
});
test("creation encrypts artifact and download verifies ownership and integrity", async t => {
  let stored: any;
  const device = { id:"d1", name:"sw1", vendor:"cisco", type:"generic_firewall", protocol:"ssh" };
  replace(t, prisma.device, "findFirst", async (query: any) => {
    assert.equal(query.where.company.ownerId, "owner");
    return device;
  });
  const audit: any[] = [];
  replace(t, prisma, "$transaction", async (callback: Function) => callback({
    deviceSnapshot: { create: async ({data}: any) => { stored = { ...data, id:"b1", collectedAt:new Date() }; return stored; } },
    auditLog: { create: async ({data}: any) => { audit.push(data); return data; } }
  }));
  const record = await createBackup("d1", "owner", "admin", async () => config);
  assert.equal(record.sha256, createHash("sha256").update(config).digest("hex"));
  assert.equal(stored.snapshotType, BACKUP_SNAPSHOT_TYPE);
  assert.ok(!JSON.stringify(stored).includes("hostname sw1"));
  assert.ok(!JSON.stringify(audit).includes("encrypted"));
  replace(t, prisma.deviceSnapshot, "findFirst", async (query: any) => { assert.equal(query.where.device.company.ownerId, "owner"); return stored; });
  replace(t, prisma.auditLog, "create", async () => ({}));
  assert.deepEqual((await downloadBackup("b1","owner","admin")).content, config);
  stored.dataJson.encrypted = encryptSecret("wrong");
  await assert.rejects(downloadBackup("b1","owner","admin"), /BACKUP_INTEGRITY_FAILED/);
});
test("unknown device never invokes collector", async t => {
  replace(t, prisma.device, "findFirst", async () => null);
  let invoked = false;
  await assert.rejects(createBackup("missing", "other-owner", "admin", async () => { invoked = true; return config; }), /BACKUP_DEVICE_NOT_FOUND/);
  assert.equal(invoked, false);
});
test("failed collection keeps diagnosis, audits no secrets and saves no artifact", async t => {
  replace(t, prisma.device, "findFirst", async () => ({ id:"d1", vendor:"linux", type:"linux" }));
  let audit: any;
  replace(t, prisma.auditLog, "create", async ({data}: any) => { audit=data; return {}; });
  replace(t, prisma, "$transaction", async () => { throw new Error("Must not persist failed output"); });
  await assert.rejects(createBackup("d1","owner","admin", async () => { throw new SharedSshConnectionError("SSH_HANDSHAKE_TIMEOUT","secret device diagnostic"); }), /SSH_HANDSHAKE_TIMEOUT/);
  assert.equal(audit.action, "device.backup.failed");
  assert.deepEqual(audit.metadata, {code:"SSH_HANDSHAKE_TIMEOUT"});
  assert.ok(!JSON.stringify(audit).includes("secret"));
});
test("duplicate backup jobs are rejected and lock is released after failure", async t => {
  replace(t, prisma.device, "findFirst", async () => ({ id:"d1", vendor:"cisco", type:"generic_firewall" }));
  replace(t, prisma.auditLog, "create", async () => ({}));
  let finish!: () => void;
  const first = createBackup("d1","owner","admin", () => new Promise((_resolve,reject) => { finish=()=>reject(new Error("BACKUP_TIMEOUT")); }));
  const rejected = assert.rejects(first, /BACKUP_TIMEOUT/);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(createBackup("d1","owner","admin",async()=>config), /BACKUP_BUSY/);
  finish(); await rejected;
  await assert.rejects(createBackup("d1","owner","admin",async()=>{throw new Error("BACKUP_TIMEOUT");}), /BACKUP_TIMEOUT/);
});
test("non-owned backup returns not found before decrypting", async t => {
  replace(t, prisma.deviceSnapshot,"findFirst",async(query:any)=>{assert.equal(query.where.device.company.ownerId,"other-owner");return null;});
  await assert.rejects(downloadBackup("b1","other-owner","operator"), /BACKUP_NOT_FOUND/);
});
