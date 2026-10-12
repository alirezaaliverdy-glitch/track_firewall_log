import assert from "node:assert/strict";
import { test } from "node:test";
import { netflowExporterSettings, parseNetflowV5, parseNetflowV9, validExporterIp, type NetflowV9Template } from "../src/services/netflow-v5.service.js";

function packet() {
  const value = Buffer.alloc(72);
  value.writeUInt16BE(5, 0);
  value.writeUInt16BE(1, 2);
  value.writeUInt32BE(1234, 4);
  value.writeUInt32BE(99, 16);
  value.writeUInt16BE(1, 22);
  Buffer.from([192, 0, 2, 10]).copy(value, 24);
  Buffer.from([198, 51, 100, 20]).copy(value, 28);
  value.writeUInt16BE(2, 36);
  value.writeUInt16BE(4, 38);
  value.writeUInt32BE(1800, 44);
  value.writeUInt16BE(43210, 56);
  value.writeUInt16BE(443, 58);
  return value;
}

test("NetFlow v5 decodes exporter flow bytes, endpoints, ports and ifIndex", () => {
  const result = parseNetflowV5(packet());
  assert.equal(result?.sequence, 99);
  assert.equal(result?.samplingRate, 1);
  assert.deepEqual(result?.flows[0], { sourceIp: "192.0.2.10", destinationIp: "198.51.100.20", sourcePort: 43210, destinationPort: 443, inputIndex: 2, outputIndex: 4, bytes: 1800 });
});

test("unsupported or malformed flow datagrams fail closed", () => {
  const valid = packet();
  assert.equal(parseNetflowV5(valid.subarray(0, 70)), null);
  valid.writeUInt16BE(9, 0);
  assert.equal(parseNetflowV5(valid), null);
});

test("exporter configuration requires explicit enabled unicast IPv4", () => {
  assert.equal(validExporterIp("192.0.2.10"), true);
  assert.equal(validExporterIp("224.0.0.1"), false);
  assert.deepEqual(netflowExporterSettings({ netflowV5: { enabled: true, exporterIp: "192.0.2.10" } }), { enabled: true, exporterIp: "192.0.2.10" });
  assert.equal(netflowExporterSettings({}).enabled, false);
});

function v9Template() {
  const fields = [[8, 4], [12, 4], [1, 4], [7, 2], [11, 2], [10, 2], [14, 2]];
  const value = Buffer.alloc(20 + 4 + 4 + fields.length * 4);
  value.writeUInt16BE(9, 0);
  value.writeUInt16BE(1, 2);
  value.writeUInt32BE(10, 12);
  value.writeUInt32BE(7, 16);
  value.writeUInt16BE(0, 20);
  value.writeUInt16BE(value.length - 20, 22);
  value.writeUInt16BE(256, 24);
  value.writeUInt16BE(fields.length, 26);
  fields.forEach(([type, length], index) => { value.writeUInt16BE(type, 28 + index * 4); value.writeUInt16BE(length, 30 + index * 4); });
  return value;
}

function v9Data() {
  const value = Buffer.alloc(44);
  value.writeUInt16BE(9, 0);
  value.writeUInt16BE(1, 2);
  value.writeUInt32BE(11, 12);
  value.writeUInt32BE(7, 16);
  value.writeUInt16BE(256, 20);
  value.writeUInt16BE(24, 22);
  Buffer.from([192, 0, 2, 10, 198, 51, 100, 20]).copy(value, 24);
  value.writeUInt32BE(1800, 32);
  value.writeUInt16BE(43210, 36);
  value.writeUInt16BE(443, 38);
  value.writeUInt16BE(2, 40);
  value.writeUInt16BE(4, 42);
  return value;
}

test("NetFlow v9 requires a scoped template before decoding observed bytes", () => {
  const templates = new Map<string, NetflowV9Template>();
  assert.equal(parseNetflowV9(v9Data(), templates, "192.0.2.1")?.flows.length, 0);
  assert.equal(parseNetflowV9(v9Template(), templates, "192.0.2.1")?.templateCount, 1);
  assert.equal(parseNetflowV9(v9Data(), templates, "192.0.2.2")?.flows.length, 0);
  assert.deepEqual(parseNetflowV9(v9Data(), templates, "192.0.2.1")?.flows[0], { sourceIp: "192.0.2.10", destinationIp: "198.51.100.20", sourcePort: 43210, destinationPort: 443, inputIndex: 2, outputIndex: 4, bytes: 1800 });
});

test("NetFlow v9 rejects truncated sets and expires old templates", () => {
  const templates = new Map<string, NetflowV9Template>();
  const now = 1_700_000_000_000;
  parseNetflowV9(v9Template(), templates, "192.0.2.1", now);
  assert.equal(parseNetflowV9(v9Data().subarray(0, 43), templates, "192.0.2.1", now), null);
  assert.equal(parseNetflowV9(v9Data(), templates, "192.0.2.1", now + 31 * 60_000)?.flows.length, 0);
});
