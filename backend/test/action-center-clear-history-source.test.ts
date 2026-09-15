import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(new URL("../src/services/action-center.service.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../../src/lib/actionCenter.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../../src/components/actions/ActionCenterWorkspace.tsx", import.meta.url), "utf8");

test("history clearing archives every non-executing ActionPlan and preserves audit evidence", () => {
  assert.match(service, /where: \{ status: \{ not: ActionPlanStatus\.executing \} \}/);
  assert.match(service, /status: ActionPlanStatus\.executing/);
  assert.doesNotMatch(service, /terminalStatuses/);
  assert.match(service, /action_center_history_archived/);
  assert.match(client, /archived: number/);
  assert.match(workspace, /response\.archived/);
  assert.match(workspace, /actionPlanCount === 0/);
  assert.match(workspace, /Clear all history/);
});
