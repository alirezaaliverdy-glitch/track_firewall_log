import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { appWebPasswordResponse, parseAppWebDisks, probeAppWebNvr } from "../src/cameras/nvr-appweb.js";
import { nvrSensors } from "../src/cameras/nvr-sensors.js";
import { readNvrSettings, writeNvrSetting, nvrConfigChange } from "../src/cameras/nvr-config.js";
import { diagnoseNvrDisks } from "../src/cameras/nvr-diagnostics.js";

const host = Object.values(networkInterfaces()).flat().find(v => v?.family === "IPv4" && !v.internal)!.address;
async function fixture() {
  const secret = randomBytes(20).toString("hex"), salt = randomBytes(16).toString("hex"), session = randomBytes(16).toString("hex"), calls: string[] = [];
  let status = 200, invalidStorage = false, acknowledgeOnly = false;
  const general = { OverWrite: "OverWrite", MachineName: "preserved", TimeZone: 20, AutoLogout: 10 };
  const recording = { RecordConfig: { RecordMode: "ConfigRecord", PacketLength: 60, PreRecord: 5, Mask: [1, 2, 3], TimeSection: [{ start: "00:00" }] }, RecordConfigExt: { RecordMode: "ClosedRecord", PacketLength: 30 } };
  const server = createServer(async (req, res) => {
    const path = req.url!.split("?")[0]; calls.push(`${req.method} ${path}`);
    const send = (data: unknown) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); };
    if (path === "/CGI/Security/sessionLogin") { res.setHeader("Set-Cookie", "challenge=test; Path=/; HttpOnly"); return send({ statusValue: 200, salt, sessionID: session }); }
    if (path === "/CGI/Security/SelfExt/userCheck") {
      let body = ""; for await (const chunk of req) body += chunk;
      const data = JSON.parse(body), compact = (v: string) => { const bytes = createHash("md5").update(v).digest(), alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"; return Array.from({ length: 8 }, (_, i) => alphabet[(bytes[i * 2] + bytes[i * 2 + 1]) % 62]).join(""); };
      assert.equal(req.method, "POST"); assert.equal(data.Password, compact(compact(secret) + salt)); assert.equal(data.Sessionid, session); assert.equal(body.includes(secret), false);
      assert.match(req.headers.cookie!, /challenge=test/); return send({ statusValue: status, sessionID: session });
    }
    assert.match(req.headers.cookie!, new RegExp(`webSessionID=${session}`));
    if (path === "/CGI/Security/Lougout") { assert.equal(req.method, "POST"); return send({ statusValue: 200 }); }
    if (path === "/CGI/General/general" || path === "/CGI/Record/record/channels/0") {
      const source = path.includes("/General/") ? general : recording;
      if (req.method === "PUT") { let body = ""; for await (const chunk of req) body += chunk; if (!acknowledgeOnly) Object.assign(source, JSON.parse(body)); return send({ statusCode: 1, statusString: "OK" }); }
      assert.equal(req.method, "GET"); return send(source);
    }
    assert.equal(req.method, "GET", "no unexpected settings or clock writes");
    if (path === "/CGI/Custom/version") return send({ HardWareVersion: "Fixture AppWeb", Version: "fixture", SeriaNo: "fixture-serial", BulidDate: "2026-10-18", VideoInChannel: 0, DigChannel: 16, Password: secret, sessionID: session });
    if (path === "/CGI/Record/storageinfo") { if (invalidStorage) return send({ statusValue: 403 }); return send([{ Storage: "1", StorageSize: "1024 GB", StorageRemain: "512 GB", StorageState: "StateOK", Password: secret }]); }
    if (path === "/CGI/General/time") return send({ SystemTime: "2026-10-18 14:30:00" });
    assert.fail(`unexpected read ${path}`);
  });
  await new Promise<void>(resolve => server.listen(0, "0.0.0.0", resolve));
  return { port: (server.address() as { port: number }).port, credentials: { username: "fixture", password: secret }, salt, session, calls,
    general, recording, rejectReadBack: () => { acknowledgeOnly = true; }, deny: (value: number) => { status = value; }, partial: () => { invalidStorage = true; }, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

test("NVR config preserves unrelated fields, detects races and verifies actual read-back", async () => {
  const f = await fixture(), camera = { host, onvifPort: f.port, onvifHttps: false, kind: "nvr", connectionMode: "appweb" };
  let invoked = 0;
  try {
    const before = await readNvrSettings(camera, f.credentials, 0);
    assert.equal(before.overwrite, "OverWrite"); assert.equal(before.recordingMode, "ConfigRecord");
    assert.equal(f.calls.some(c => c.startsWith("PUT")), false, "read is never execution");
    const after = await writeNvrSetting(camera, f.credentials, { setting: "overwrite", value: "StopRecord" }, before.revision, () => invoked++);
    assert.equal(after.overwrite, "StopRecord"); assert.equal(invoked, 1); assert.equal(f.general.MachineName, "preserved"); assert.equal(f.general.TimeZone, 20);
    await assert.rejects(writeNvrSetting(camera, f.credentials, { setting: "overwrite", value: "OverWrite" }, before.revision, () => invoked++), /NVR_CONFIG_CHANGED/); assert.equal(invoked, 1);
    const changed = await writeNvrSetting(camera, f.credentials, { setting: "recordingMode", value: "ManualRecord", channel: 0 }, after.revision, () => invoked++);
    assert.equal(changed.recordingMode, "ManualRecord"); assert.deepEqual(f.recording.RecordConfig.Mask, [1, 2, 3]); assert.deepEqual(f.recording.RecordConfig.TimeSection, [{ start: "00:00" }]); assert.equal(f.recording.RecordConfigExt.RecordMode, "ClosedRecord");
    f.rejectReadBack(); await assert.rejects(writeNvrSetting(camera, f.credentials, { setting: "recordingMode", value: "ClosedRecord", channel: 0 }, changed.revision, () => invoked++), /NVR_CONFIG_VERIFY_FAILED/);
    await assert.rejects(readNvrSettings({ ...camera, connectionMode: "onvif" }, f.credentials, 0), /NVR_CONFIG_OPERATION_UNSUPPORTED/);
    assert.throws(() => nvrConfigChange({ setting: "format", value: "anything" }), /NVR_CONFIG_INVALID/); assert.throws(() => nvrConfigChange({ setting: "recordingMode", value: "ManualRecord", channel: 128 }), /NVR_CONFIG_INVALID/);
  } finally { await f.close(); }
});

test("disk diagnostics never turns missing SMART into healthy or starts a physical test", async () => {
  assert.equal(diagnoseNvrDisks(null).assessment, "incomplete");
  const f = await fixture();
  try { const report = await probeAppWebNvr(host, f.port, false, f.credentials), result = diagnoseNvrDisks(report); assert.equal(result.assessment, "incomplete"); assert.equal(result.selfTestStarted, false); assert.equal(result.smartSelfTestSupported, false); assert.equal(result.checks[0].capacityConsistent, true); assert.ok(result.missing.includes("smart")); report.storage!.disks[0].smart = "failed"; assert.equal(diagnoseNvrDisks(report).assessment, "critical"); }
  finally { await f.close(); }
});
test("AppWeb disk strings have explicit binary units and conservative health", () => {
  assert.equal(appWebPasswordResponse("fixture", "test-salt").length, 8, "panel's misleading hex_md5 function is not a 32-character hex digest");
  const disks = parseAppWebDisks([{ StorageSize: "1 TB", StorageRemain: "512 GB", StorageState: "StateOK" }, { StorageSize: 1024, StorageRemain: "2 TB", StorageState: "other" }, { StorageSize: "1 GB", StorageRemain: "2 GB", StorageState: "StateErr" }]);
  assert.equal(disks[0].capacityBytes, 1024 ** 4); assert.equal(disks[0].freeBytes, 512 * 1024 ** 3); assert.equal(disks[0].health, "reported_ok"); assert.equal(disks[0].smart, "unknown");
  assert.equal(disks[1].capacityBytes, null); assert.equal(disks[1].health, "unknown"); assert.equal(disks[2].freeBytes, null); assert.equal(disks[2].health, "error");
  assert.throws(() => parseAppWebDisks({ statusValue: 200 }), /RESPONSE_INVALID/);
});
test("AppWeb challenge/cookie login, fixed reads, logout and whitelisted telemetry", async () => {
  const f = await fixture();
  try {
    const report = await probeAppWebNvr(host, f.port, false, f.credentials);
    assert.equal(report.adapter, "appweb"); assert.equal(report.reachable, true); assert.equal(report.identity.Model, "Fixture AppWeb"); assert.equal(report.storage?.disks[0].capacityBytes, 1024 ** 4);
    assert.equal(report.native?.deviceLocalTime, "2026-10-18 14:30:00"); assert.equal(report.clockDriftSeconds, null);
    const sensors = nvrSensors(report); assert.equal(sensors.find(v => v.id === "channels")?.value, 16); assert.equal(sensors.find(v => v.id === "disk_health")?.value, 1); assert.equal(sensors.find(v => v.id === "connection")?.source, "AppWeb CGI");
    for (const value of [f.credentials.password, f.salt, f.session]) assert.equal(JSON.stringify(report).includes(value), false, "no credentials, hashes or sessions in report");
    assert.equal(f.calls.at(-1), "POST /CGI/Security/Lougout"); assert.equal(f.calls.length, 6);
    f.partial(); const partial = await probeAppWebNvr(host, f.port, false, f.credentials); assert.equal(partial.storage?.status, "denied"); assert.equal(partial.storage?.disks.length, 0); assert.equal(f.calls.at(-1), "POST /CGI/Security/Lougout");
  } finally { await f.close(); }
});
test("AppWeb bad password/lock stops immediately, no login fallback or automatic retries", async () => {
  for (const [status, code] of [[203, "NVR_APPWEB_AUTH_FAILED"], [206, "NVR_ACCOUNT_LOCKED"], [208, "NVR_APPWEB_SESSION_BUSY"]] as const) {
    const f = await fixture(); f.deny(status);
    try {
      await assert.rejects(probeAppWebNvr(host, f.port, false, f.credentials), new RegExp(code)); assert.equal(f.calls.length, 2);
      if (status !== 208) { await assert.rejects(probeAppWebNvr(host, f.port, false, f.credentials), /COOLDOWN/); assert.equal(f.calls.length, 2); }
    } finally { await f.close(); }
  }
});
test("AppWeb NVR registration and measured HDD history use the actual connector; no ONVIF controls", async () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const { prisma, shutdownDatabase } = await import("../src/db/prisma.js"), { buildApp } = await import("../src/app.js"), { createSession } = await import("../src/services/auth.service.js");
  const f = await fixture(), app = await buildApp(), tag = `appweb-nvr-${randomUUID()}`;
  const owner = await prisma.appUser.create({ data: { username: tag, displayName: "Fixture", passwordHash: "not-a-login", role: "admin", allowedSections: ["assets", "actions"] } });
  try {
    const company = await prisma.company.create({ data: { ownerId: owner.id, name: tag, code: tag } }), session = await createSession(owner.id, {}), cookie = `firewall_session=${session.token}`;
    const csrf = (await app.inject({ url: "/api/auth/csrf", headers: { cookie } })).json().csrfToken, headers = { cookie, "x-csrf-token": csrf };
    const r = await app.inject({ method: "POST", url: "/api/cameras", headers, payload: { companyId: company.id, name: "AppWeb recorder", kind: "nvr", connectionMode: "appweb", host, onvifPort: f.port, ...f.credentials } });
    assert.equal(r.statusCode, 201); assert.equal(r.json().camera.status, "verified"); assert.equal(r.json().camera.connectionMode, "appweb"); assert.equal(r.json().camera.profiles.length, 0); assert.equal(r.body.includes(f.credentials.password), false);
    const id = r.json().camera.id, check = await app.inject({ method: "POST", url: `/api/cameras/${id}/monitor/refresh`, headers });
    assert.equal(check.statusCode, 200); assert.equal(check.json().history.at(-1).readings.capacity, 1024 ** 4);
    assert.equal((await app.inject({ method: "POST", url: `/api/cameras/${id}/actions/preview`, headers, payload: { operation: "reboot" } })).statusCode, 422);
    const settings = await app.inject({ url: `/api/cameras/${id}/nvr/settings`, headers }); assert.equal(settings.statusCode, 200); assert.equal(settings.json().overwrite, "OverWrite");
    const plan = await app.inject({ method: "POST", url: `/api/cameras/${id}/actions/preview`, headers, payload: { operation: "nvr_overwrite", value: "StopRecord" } }); assert.equal(plan.statusCode, 200); assert.equal(f.general.OverWrite, "OverWrite");
    const planId = plan.json().id;
    const execute = (payload: object) => app.inject({ method: "POST", url: `/api/cameras/${id}/actions/${planId}/execute`, headers, payload });
    assert.equal((await execute({ intent: "preview", confirmed: true })).statusCode, 400);
    const result = await execute({ intent: "execute", confirmed: true }); assert.equal(result.statusCode, 200); assert.equal(result.json().status, "succeeded"); assert.equal(result.json().connectorInvoked, true); assert.equal(result.json().verified, true); assert.equal(f.general.OverWrite, "StopRecord");
    assert.equal((await execute({ intent: "execute", confirmed: true })).statusCode, 409);
    await app.inject({ method: "PATCH", url: `/api/cameras/${id}`, headers, payload: { monitoringEnabled: true } }); f.deny(203);
    const failed = await app.inject({ method: "POST", url: `/api/cameras/${id}/monitor/refresh`, headers }); assert.equal(failed.json().report.errorCode, "NVR_APPWEB_AUTH_FAILED"); assert.equal(failed.json().monitoringEnabled, false);
  } finally { await app.close(); await f.close(); await prisma.auditLog.deleteMany({ where: { actor: tag } }); await prisma.appUser.delete({ where: { id: owner.id } }); await shutdownDatabase(); }
});
