import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { randomBytes } from "node:crypto";
import { dvripPasswordHash, parseDvripDisks, readDvripStorage } from "../src/cameras/nvr-dvrip.js";

test("DVRIP capacity parses protocol MiB/hex correctly, preserving undocumented health as unknown", () => {
  const disks = parseDvripDisks([{ PlysicalNo: 0, Partition: [{ TotalSpace: "0x00100000", RemainSpace: "0x00040000", Status: 0 }] }]);
  assert.equal(disks[0].capacityBytes, 1099511627776); assert.equal(disks[0].freeBytes, 274877906944); assert.equal(disks[0].health, "unknown"); assert.equal(disks[0].smart, "unknown");
  assert.equal(parseDvripDisks([{ Partition: [{ TotalSpace: "bad", RemainSpace: "0x00" }] }])[0].capacityBytes, null);
  assert.throws(() => parseDvripDisks({}), /RESPONSE_INVALID/);
  assert.equal(dvripPasswordHash("").length, 8);
});
test("read-only DVRIP TCP fixture authenticates once, handles partial frames, rejects oversized and locked responses", async () => {
  const host = Object.values(networkInterfaces()).flat().find(item => item?.family === "IPv4" && !item.internal)!.address;
  const secret = randomBytes(20).toString("hex"); let mode = "normal", logins = 0; const commands: number[] = [];
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer(socket => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => undefined);
    let pending = Buffer.alloc(0);
    socket.on("data", chunk => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 20 && pending.length >= 20 + pending.readUInt32LE(16)) {
        const length = pending.readUInt32LE(16), request = pending.subarray(0, 20 + length); pending = pending.subarray(20 + length);
        const command = request.readUInt16LE(14), seq = request.readUInt32LE(8); commands.push(command);
        const payload = JSON.parse(request.subarray(20).toString().replace(/[\x00\n]+$/g, ""));
        if (command === 1002) { socket.end(); continue; }
        if (command === 1000) { logins++; assert.equal(payload.PassWord, dvripPasswordHash(secret)); assert.equal(request.includes(Buffer.from(secret)), false); }
        else { assert.equal(command, 1020); assert.equal(payload.Name, "StorageInfo"); }
        const body = Buffer.from(JSON.stringify(command === 1000 ? { Ret: mode === "locked" ? 205 : 100, SessionID: "0x00000002" } : { Ret: 100, Name: "StorageInfo", SessionID: "0x00000002", StorageInfo: [{ PlysicalNo: 1, Partition: [{ TotalSpace: "0x100", RemainSpace: "0x80", Status: 0 }] }] }) + "\n\0");
        const header = Buffer.alloc(20); header[0] = 255; header.writeUInt32LE(2, 4); header.writeUInt32LE(seq, 8); header.writeUInt16LE(command + 1, 14); header.writeUInt32LE(mode === "oversized" ? 99999999 : body.length, 16);
        socket.write(header.subarray(0, 7)); setTimeout(() => { if (!socket.destroyed) socket.write(Buffer.concat([header.subarray(7), body])); }, 3);
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "0.0.0.0", resolve)); const port = (server.address() as { port: number }).port;
  try {
    const disks = await readDvripStorage(host, port, { username: "fixture", password: secret }); assert.equal(disks[0].capacityBytes, 268435456); assert.equal(logins, 1);
    mode = "locked"; await assert.rejects(readDvripStorage(host, port, { username: "fixture", password: secret }), /ACCOUNT_LOCKED/); assert.equal(logins, 2, 'no credential fallback retries');
    mode = "oversized"; await assert.rejects(readDvripStorage(host, port, { username: "fixture", password: secret }), /RESPONSE_INVALID/);
    assert.ok(commands.every(command => [1000, 1002, 1020].includes(command)), 'no configuration or storage mutations');
  } finally { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
