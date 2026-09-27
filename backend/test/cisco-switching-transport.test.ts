import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { CiscoConnectorError, CiscoIosXeSshConnector, type CiscoCliCommandSpec } from "../src/connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.js";

function fixture() {
  const writes: string[] = [];
  const shell = new EventEmitter() as EventEmitter & { write: (value: string) => boolean; end: () => void };
  shell.write = value => { writes.push(value.trim()); queueMicrotask(() => shell.emit("data", Buffer.from(`${value}\r\nverified\r\nfixture#`))); return true; };
  shell.end = () => shell.emit("close");
  const client = new EventEmitter() as any;
  client.connect = () => queueMicrotask(() => client.emit("ready"));
  client.shell = (_options: unknown, done: (error: null, stream: unknown) => void) => { done(null, shell); setTimeout(() => shell.emit("data", Buffer.from("fixture#")), 0); };
  client.end = () => undefined;
  const connector = new CiscoIosXeSshConnector({ clientFactory: () => client, tcpConnect: async () => ({ destroyed: false, destroy() {} }) as never, credentialResolver: async () => ({ username: "fixture", password: "test-only", sudo: false }) });
  const device = { vendor: "cisco", protocol: "ssh", capabilities: {}, host: "192.0.2.10", managementPort: 22 } as never;
  return { writes, run: (specs: CiscoCliCommandSpec[]) => connector.runCliCommands(device, specs) };
}
test("failed precheck sends no write and is not automatically retried", async () => {
  const f = fixture();
  await assert.rejects(f.run([{ commandId: "precheck", command: "show vlan brief", verificationAttempts: 5, validateOutput() { throw new Error("missing VLAN"); } }, { commandId: "write", command: "configure terminal", write: true }]), (e: unknown) => e instanceof CiscoConnectorError && e.code === "CISCO_PRECHECK_FAILED" && e.retryable === false);
  assert.equal(f.writes.filter(c => c === "show vlan brief").length, 1);
  assert.ok(!f.writes.includes("configure terminal"));
});
test("LACP settling retries only verification reads, never configuration commands", async () => {
  const f = fixture(); let reads = 0;
  const result = await f.run([{ commandId: "write", command: "configure terminal", write: true }, { commandId: "end", command: "end", write: true }, { commandId: "verify", command: "show etherchannel summary", verificationAttempts: 5, validateOutput() { if (++reads < 2) throw new Error("settling"); } }]);
  assert.equal(result.connectorInvoked, true);
  assert.equal(f.writes.filter(c => c === "configure terminal").length, 1);
  assert.equal(f.writes.filter(c => c === "show etherchannel summary").length, 2);
});
test("read-back failure after a write is explicit and not safe to replay", async () => {
  const f = fixture();
  await assert.rejects(f.run([{ commandId: "write", command: "configure terminal", write: true }, { commandId: "verify", command: "show etherchannel summary", verificationAttempts: 2, validateOutput() { throw new Error("not bundled; review changes"); } }]), (e: unknown) => e instanceof CiscoConnectorError && e.code === "CISCO_VERIFICATION_FAILED" && e.retryable === false);
  assert.equal(f.writes.filter(c => c === "configure terminal").length, 1);
  assert.equal(f.writes.filter(c => c === "show etherchannel summary").length, 2);
});
