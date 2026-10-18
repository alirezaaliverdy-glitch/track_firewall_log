import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { networkInterfaces } from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { readDvripNative, dvripPasswordHash } from "../src/cameras/nvr-dvrip.js";
import { probeNativeNvr } from "../src/cameras/nvr-native-monitor.js";
import { nvrSensors } from "../src/cameras/nvr-sensors.js";
import { cameraSoap } from "../src/cameras/camera-onvif.js";

const host = Object.values(networkInterfaces()).flat().find(v => v?.family === "IPv4" && !v.internal)!.address;
async function fixture() {
  const secret = randomBytes(20).toString("hex"), sockets = new Set<import("node:net").Socket>(), commands: number[] = [];
  let mode = "modern", logins = 0;
  const server = createServer(socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => undefined); let pending = Buffer.alloc(0);
    socket.on("data", chunk => { pending = Buffer.concat([pending, chunk]); while (pending.length >= 20 && pending.length >= 20 + pending.readUInt32LE(16)) {
      const packet = pending.subarray(0, 20 + pending.readUInt32LE(16)); pending = pending.subarray(packet.length);
      const command = packet.readUInt16LE(14), version = packet[1], seq = packet.readUInt32LE(8), payload = JSON.parse(packet.subarray(20).toString().replace(/[\x00\r\n]+$/g, "")); commands.push(command);
      if (command === 1002) { socket.end(); continue; }
      if (command === 1000) { logins++; assert.equal(payload.PassWord, dvripPasswordHash(secret)); assert.equal(packet.includes(Buffer.from(secret)), false); }
      const response: Record<string, unknown> = { Ret: mode === "locked" ? 205 : mode === "denied" ? 203 : mode === "permission" ? 107 : version === 0 && mode === "modern" ? 102 : 100, SessionID: "0x0000000002" };
      if (command === 1000) Object.assign(response, { ChannelNum: 2, "DeviceType ": "NVR" });
      else {
        assert.ok([1020, 1452].includes(command)); const name = payload.Name; response.Name = name;
        response[name] = name === "SystemInfo" ? { HardWare: "Fixture 16", SoftWareVersion: "fixture", DeviceRunTime: "0x0000000A", DigChannel: 2 } :
          name === "StorageInfo" ? [{ PlysicalNo: 0, Partition: [{ TotalSpace: "0x100000", RemainSpace: "0x80000", Status: 0 }] }] :
          name === "WorkState" ? { AlarmState: { VideoLoss: "0x2" }, ChannelState: [{ Record: true, Bitrate: 100 }, { Record: false, Bitrate: 0 }] } : "2026-10-18 13:30:00";
      }
      const body = Buffer.from(JSON.stringify(response) + "\n\0"), half = Math.ceil(body.length / 2), parts = version === 1 && command !== 1000 ? [body.subarray(0, half), body.subarray(half)] : [body];
      const frames = parts.map((part, index) => { const h = Buffer.alloc(20); h[0] = 255; h[1] = version; h[12] = parts.length; h[13] = index; h.writeUInt32LE(2, 4); h.writeUInt32LE(version ? seq + 1 : seq, 8); h.writeUInt16LE(command + 1, 14); h.writeUInt32LE(part.length, 16); return Buffer.concat([h, part]); });
      const bytes = Buffer.concat(frames); socket.write(bytes.subarray(0, 7)); setTimeout(() => { if (!socket.destroyed) socket.write(bytes.subarray(7)); }, 2);
    }});
  });
  await new Promise<void>(resolve => server.listen(0, "0.0.0.0", resolve));
  return { port: (server.address() as { port: number }).port, credentials: { username: "fixture", password: secret }, commands, getLogins: () => logins, setMode: (next: string) => { mode = next; }, close: async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
test("native DVRIP negotiates framing, padded session IDs and split/coalesced fragments; only fixed reads", async () => {
  const f = await fixture();
  try {
    const native = await readDvripNative(host, f.port, f.credentials);
    assert.equal(native.wireVersion, 1); assert.equal(native.identity.Model, "Fixture 16"); assert.equal(native.uptimeSeconds, 600); assert.equal(native.configuredChannels, 2);
    assert.equal(native.channels[0].bitrateBps, 102400); assert.equal(native.channels[0].signalPresent, true); assert.equal(native.channels[1].signalPresent, false); assert.equal(native.disks?.[0].capacityBytes, 1099511627776);
    const report = await probeNativeNvr(host, f.port, f.credentials), sensors = nvrSensors(report);
    assert.equal(sensors.length, 17); assert.equal(sensors.find(s => s.id === "recording_channels")?.value, 1); assert.equal(sensors.find(s => s.id === "signal_channels")?.value, 1);
    assert.equal(sensors.find(s => s.id === "cpu")?.value, null); assert.equal(report.clockDriftSeconds, null, "local time is not guessed as UTC");
    for (const [mode, expected] of [["denied", "AUTH_FAILED"], ["locked", "ACCOUNT_LOCKED"], ["permission", "ACCESS_DENIED"]]) { f.setMode(mode); const before = f.getLogins(); await assert.rejects(readDvripNative(host, f.port, f.credentials), new RegExp(expected)); assert.equal(f.getLogins(), before + 1, "no auth/permission retries"); }
    assert.ok(f.commands.every(c => [1000, 1002, 1020, 1452].includes(c)), "no configuration or device-control writes");
  } finally { await f.close(); }
});
test("HTML 404 is an unavailable ONVIF service, not a misleading XML error", async () => {
  const server = createHttpServer((_req, res) => { res.writeHead(404); res.end("<!DOCTYPE html><html>Not found</html>"); }); await new Promise<void>(resolve => server.listen(0, "0.0.0.0", resolve));
  try { await assert.rejects(cameraSoap(new URL(`http://${host}:${(server.address() as { port: number }).port}/onvif`), "http://www.onvif.org", "GetDeviceInformation", "<GetDeviceInformation/>"), /CAMERA_ONVIF_UNAVAILABLE/); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
test("native NVR registration and polling persist real sensors and cannot authorize ONVIF execution", async () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const { prisma, shutdownDatabase } = await import("../src/db/prisma.js"), { buildApp } = await import("../src/app.js"), { createSession } = await import("../src/services/auth.service.js");
  const f = await fixture(), app = await buildApp(), tag = `native-nvr-${randomUUID()}`;
  const owner = await prisma.appUser.create({ data: { username: tag, displayName: "Fixture", passwordHash: "not-a-login", role: "admin", allowedSections: ["assets", "actions"] } });
  try {
    const company = await prisma.company.create({ data: { ownerId: owner.id, name: tag, code: tag } }), session = await createSession(owner.id, {}), cookie = `firewall_session=${session.token}`;
    const csrf = (await app.inject({ url: "/api/auth/csrf", headers: { cookie } })).json().csrfToken, headers = { cookie, "x-csrf-token": csrf };
    const response = await app.inject({ method: "POST", url: "/api/cameras", headers, payload: { companyId: company.id, name: "Native recorder", kind: "nvr", connectionMode: "dvrip", host, onvifPort: f.port, username: f.credentials.username, password: f.credentials.password } });
    assert.equal(response.statusCode, 201); assert.equal(response.json().camera.status, "verified"); assert.equal(response.json().camera.profiles.length, 0, "no guessed video URLs"); assert.equal(response.body.includes(f.credentials.password), false);
    const id = response.json().camera.id, result = await app.inject({ method: "POST", url: `/api/cameras/${id}/monitor/refresh`, headers });
    assert.equal(result.statusCode, 200); assert.equal(result.json().sensors.length, 17); assert.equal(result.json().history.at(-1).readings.uptime, 600);
    assert.equal((await app.inject({ method: "POST", url: `/api/cameras/${id}/actions/preview`, headers, payload: { operation: "reboot" } })).statusCode, 422);
    await app.inject({ method: "PATCH", url: `/api/cameras/${id}`, headers, payload: { monitoringEnabled: true } }); f.setMode("denied");
    const denied = await app.inject({ method: "POST", url: `/api/cameras/${id}/monitor/refresh`, headers }); assert.equal(denied.json().monitoringEnabled, false); assert.equal(denied.json().report.adapter, "dvrip"); assert.equal(denied.json().report.errorCode, "CAMERA_AUTH_FAILED");
    assert.equal((await prisma.cameraDevice.findUniqueOrThrow({ where: { id } })).status, "error");
  } finally { await app.close(); await f.close(); await prisma.auditLog.deleteMany({ where: { actor: tag } }); await prisma.appUser.delete({ where: { id: owner.id } }); await shutdownDatabase(); }
});
