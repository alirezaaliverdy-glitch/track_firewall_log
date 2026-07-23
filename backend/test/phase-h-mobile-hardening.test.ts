import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guards = readFileSync(new URL("../../src/lib/mobileActionGuards.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../../src/lib/actions.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../../src/lib/mobileStorage.ts", import.meta.url), "utf8");
const pwa = readFileSync(new URL("../../src/lib/pwa.ts", import.meta.url), "utf8");

test("Phase H mobile action guard blocks offline approval and execution", () => {
  assert.match(guards, /OFFLINE_ACTION_APPROVAL_EXECUTION_BLOCKED/);
  assert.match(guards, /navigator\.onLine/);
  assert.match(guards, /ACTION_APPROVAL_EXECUTION_PATTERN/);
  for (const path of ["approve", "execute", "quick-execute"]) assert.match(guards, new RegExp(path));
  assert.match(actions, /withMobileActionRequest\(path, init\)/);
  assert.match(actions, /apiRequest\(path/);
});

test("Phase H mobile actions attach idempotency keys and notification deep links", () => {
  assert.match(guards, /idempotencyKey/);
  assert.match(guards, /X-Idempotency-Key/);
  assert.match(guards, /app:action-notification/);
  for (const event of ["approval_requested", "execution_started", "step_failed", "verification_failed", "execution_completed", "device_disconnected"]) {
    assert.match(guards, new RegExp(event));
  }
  assert.match(guards, /\/actions\/\$\{encoded\}\/configure/);
  assert.match(guards, /\/actions\/\$\{encoded\}\/result/);
  assert.match(actions, /dispatchMobileActionNotification/);
});

test("Phase H mobile storage and PWA keep execution data out of offline persistence", () => {
  for (const sensitive of ["password", "privatekey", "token", "secret", "credential", "rawcommand", "commandpreview", "connectorresult"]) {
    assert.match(storage, new RegExp(sensitive));
  }
  assert.match(pwa, /offlineShell/);
  assert.doesNotMatch(pwa, /\/actions\/[^"']*execute|\/actions\/[^"']*approve|quick-execute/);
});
