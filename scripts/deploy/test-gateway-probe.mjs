import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("./probe-production-gateway.cjs", import.meta.url), "utf8");
async function probe(responses) {
  const calls = [], result = { stdout: "", stderr: "", exitCode: 0 };
  const https = { get(options, callback) {
    calls.push(options);
    const req = new EventEmitter(); req.setTimeout = () => req;
    req.destroy = error => req.emit("error", error);
    queueMicrotask(() => {
      const fixture = responses[calls.length - 1];
      const response = new EventEmitter(); response.statusCode = fixture.status;
      response.setEncoding = () => {};
      callback(response); response.emit("data", fixture.body); response.emit("end");
    });
    return req;
  } };
  const process = { stdout: { write: text => result.stdout += text }, stderr: { write: text => result.stderr += text }, set exitCode(code) { result.exitCode = code; } };
  await vm.runInNewContext(source, { require: name => { assert.equal(name, "node:https"); return https; }, process });
  return { calls, ...result };
}
test("gateway probe keeps local destination and verified public TLS/Host", async () => {
  const result = await probe([{ status: 200, body: '{"ready":true}' }, { status: 200, body: '<!doctype html><html lang="fa"></html>' }]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /gateway_tls=verified/);
  assert.deepEqual(result.calls.map(call => call.path), ["/firewall-api/health/ready", "/dashboard"]);
  for (const call of result.calls) {
    assert.equal(call.hostname, "gateway"); assert.equal(call.servername, "eosnet.ir");
    assert.equal(call.headers.Host, "eosnet.ir"); assert.equal(call.rejectUnauthorized, true);
  }
});
test("unready API fails closed without exposing response content", async () => {
  const result = await probe([{ status: 200, body: '{"ready":false,"secret":"do-not-print"}' }]);
  assert.equal(result.exitCode, 1); assert.equal(result.calls.length, 1);
  assert.doesNotMatch(result.stderr + result.stdout, /do-not-print/);
});
test("missing dashboard fails instead of accepting redirects/error pages", async () => {
  const result = await probe([{ status: 200, body: '{"ready":true}' }, { status: 302, body: "" }]);
  assert.equal(result.exitCode, 1);
});
