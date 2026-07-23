import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, root), "utf8");

test("Phase M starts from completed Phase H acceptance at HEAD", () => {
  const handoff = read("CODEX_HANDOFF.md");
  const acceptance = read("10_ACCEPTANCE_MATRIX.md");

  assert.match(handoff, /Phase H intelligent execution and mobile-ready actions/);
  assert.match(handoff, /18cd516|H8 stabilized final acceptance/);
  assert.match(acceptance, /Phase H final status/);
  assert.match(acceptance, /Full isolated backend TAP: 403 tests, 403 pass/);
});

test("current web runtime is server-backed through the API transport boundary", () => {
  const apiTransport = read("src/lib/apiTransport.ts");
  const actions = read("src/lib/actions.ts");
  const routes = read("src/routes/appRoutes.tsx");

  assert.match(apiTransport, /export type ApiTransport/);
  assert.match(apiTransport, /webCookieTransport/);
  assert.match(apiTransport, /\/firewall-api/);
  assert.match(actions, /apiRequest\(path/);
  assert.match(actions, /withMobileActionRequest\(path, init\)/);
  assert.match(routes, /actions\.configure/);
});

test("server execution remains isolated behind Prisma, PolicyGuard, and registered connectors", () => {
  const execution = read("backend/src/actions/action-plan/action-plan-execution.service.ts");
  const policy = read("backend/src/services/policy-guard.service.ts");
  const registry = read("backend/src/connectors/connector-registry.service.ts");

  assert.match(execution, /validateActionPlan/);
  assert.match(execution, /resolveExecutionPipeline/);
  assert.match(execution, /connector\.execute/);
  assert.match(policy, /Free-form shell, command, script, or exec parameters are not allowed/);
  assert.match(registry, /getDeviceConnectors/);
  assert.match(registry, /ciscoIosXeConnector/);
});

test("Phase M boundary is not yet implemented before extraction", () => {
  assert.equal(existsSync(new URL("packages/runtime-contracts/src/index.ts", root)), false);
  assert.equal(existsSync(new URL("src/runtime/RuntimeFacade.ts", root)), false);
  assert.equal(existsSync(new URL("src/mobile-local/LocalMobileRuntime.ts", root)), false);
  assert.equal(existsSync(new URL("src/plugins/local-ssh/index.ts", root)), false);
});
