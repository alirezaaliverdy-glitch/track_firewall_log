import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, root), "utf8");

test("Phase M local execution calls SSH only through LocalMobileRuntime-owned executor", () => {
  const runtime = read("src/mobile-local/LocalMobileRuntime.ts");
  const executor = read("src/mobile-local/execution/LocalSshExecutor.ts");
  const pluginContract = read("src/plugins/local-ssh/index.ts");

  assert.match(runtime, /NativeLocalSshExecutor/);
  assert.match(runtime, /this\.ssh\.startExecution/);
  assert.match(executor, /LocalSsh\.execute/);
  assert.match(pluginContract, /registerPlugin<LocalSshPlugin>/);
  assert.doesNotMatch(read("src/lib/actions.ts"), /LocalSsh|plugins\/local-ssh/);
  assert.doesNotMatch(read("src/lib/ai.ts"), /LocalSsh|plugins\/local-ssh/);
});

test("Phase M local execution enforces approval binding and PolicyGuard before SSH", () => {
  const runtime = read("src/mobile-local/LocalMobileRuntime.ts");
  assert.match(runtime, /approvalStillMatches/);
  assert.match(runtime, /LOCAL_APPROVAL_BINDING_INVALID/);
  assert.match(runtime, /evaluateLocalPolicyGuard/);
  assert.match(runtime, /LOCAL_POLICY_GUARD_BLOCKED/);
  assert.match(runtime, /repository\.saveExecutionResult/);
});

test("Phase M local execution persists duplicate guard, verification, and audit hash chain", () => {
  const runtime = read("src/mobile-local/LocalMobileRuntime.ts");
  assert.match(runtime, /idempotencyKey/);
  assert.match(runtime, /getExecutionResult\(input\.idempotencyKey\)/);
  assert.match(runtime, /verifyExecutionResult/);
  assert.match(runtime, /sanitizeTerminalOutput/);
  assert.match(runtime, /sha256Hex\(\{ previousHash/);
  assert.match(runtime, /local\.connector\.invoked/);
});

test("Phase S local execution persists native SSH events and terminal recovery state", () => {
  const runtime = read("src/mobile-local/LocalMobileRuntime.ts");
  const executor = read("src/mobile-local/execution/LocalSshExecutor.ts");
  assert.match(executor, /LocalSsh\.addListener/);
  assert.match(executor, /mapExecutionEvent/);
  assert.match(runtime, /recordNativeExecutionEvent/);
  assert.match(runtime, /repository\.appendExecutionEvent/);
  assert.match(runtime, /local\.execution\.completed/);
  assert.match(runtime, /this\.ssh\.cancel\(executionId\)/);
});
