import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, root), "utf8");

test("Phase M local monitoring catalog covers required read-only domains", () => {
  const schemas = read("packages/vendor-schemas/src/index.ts");
  for (const token of ["interfaces", "CPU memory storage", "routes and neighbors", "VLANs", "sessions", "config and VPN", "ports logs"]) {
    assert.match(schemas, new RegExp(token, "i"));
  }
  assert.doesNotMatch(schemas, /readOnly:\s*false/);
});

test("Phase M guided workflows are deterministic and offline available", () => {
  const workflows = read("src/mobile-local/workflows/LocalGuidedWorkflows.ts");
  assert.match(workflows, /LOCAL_GUIDED_WORKFLOWS/);
  assert.match(workflows, /offlineAvailable: true/);
  assert.match(workflows, /local\.monitoring\.snapshot/);
  assert.match(workflows, /local\.host-key-readiness/);
  assert.match(workflows, /ensureMonitoringBatchIsReadOnly/);
  assert.match(workflows, /LOCAL_MONITORING_MUTATION_REJECTED/);
  assert.doesNotMatch(workflows, /sendAiMessage|OpenAI|fetch\(|LocalSsh/);
});
