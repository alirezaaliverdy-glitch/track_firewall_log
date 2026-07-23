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

test("Phase M portable package boundary excludes server and native dependencies", () => {
  for (const relative of [
    "packages/contracts/src/index.ts",
    "packages/action-core/src/index.ts",
    "packages/policy-core/src/index.ts",
    "packages/vendor-schemas/src/index.ts",
    "packages/verification-core/src/index.ts",
    "packages/runtime-contracts/src/index.ts"
  ]) {
    assert.equal(existsSync(new URL(relative, root)), true, `${relative} should exist`);
    const source = read(relative);
    assert.doesNotMatch(source, /@prisma\/client|fastify|node:|ssh2|@capacitor/i, `${relative} must stay portable`);
  }
});

test("Phase M RuntimeFacade separates server and local mobile adapters", () => {
  const facade = read("src/runtime/RuntimeFacade.ts");
  const server = read("src/runtime/ServerRuntimeClient.ts");
  const local = read("src/mobile-local/LocalMobileRuntime.ts");

  assert.match(facade, /class RuntimeFacade/);
  assert.match(facade, /ServerRuntimeClient/);
  assert.match(facade, /LocalMobileRuntime/);
  assert.match(server, /readonly kind = "server"/);
  assert.match(server, /api|proposeAction|executeAction/);
  assert.match(local, /readonly kind = "local-mobile"/);
  assert.match(local, /LOCAL_SSH_PLUGIN_NOT_CONFIGURED/);
  assert.doesNotMatch(local, /@prisma\/client|fastify|node:|ssh2/);
  assert.doesNotMatch(server, /LocalSsh|@capacitor/);
});
