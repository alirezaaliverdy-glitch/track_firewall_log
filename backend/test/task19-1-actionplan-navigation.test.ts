import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildApp } from "../src/app.js";

const frontendSource = (path: string) => readFileSync(join(process.cwd(), "..", path), "utf8");

test("Task 19.1 ActionPlan direct routes preserve the exact plan identity", () => {
  const handoff = frontendSource("src/lib/actionPlanHandoff.ts");
  const page = frontendSource("src/features/actions/pages/ActionsPage.tsx");
  const center = frontendSource("src/components/actions/ActionCenterPanel.tsx");
  const assistant = frontendSource("src/components/ai/AiSecurityAssistantPanel.tsx");
  const app = frontendSource("src/App.tsx");
  const routes = frontendSource("src/routes/appRoutes.tsx");
  assert.match(handoff, /encodeURIComponent\(id\)/);
  assert.match(handoff, /pathname\.match/);
  assert.match(page, /initialActionPlanId=\{params\.actionId\}/);
  assert.match(center, /actionPlanIdFromLocation\(\)/);
  assert.match(routes, /path:\s*"\/actions\/:actionId"/);
  assert.match(app, /appRoutes\.map/);
  assert.match(app, /path="\/actions\/:actionId\/result"/);
  assert.match(center, /useNavigate/);
  assert.doesNotMatch(center, /window\.history\.pushState|window\.addEventListener\("popstate"/);
  assert.match(center, /action-row-\$\{plan\.id\}/);
  assert.match(center, /ACTION_PLAN_NOT_FOUND/);
  assert.match(assistant, /reviewInActionCenter\(createdPlanId\)/);
});

test("Task 19.1 missing ActionPlan API returns a structured non-retryable error", async () => {
  const app = await buildApp({ authRequired: false });
  try {
    const response = await app.inject({ method: "GET", url: "/api/actions/task19-1-not-real" });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: {
        code: "ACTION_PLAN_NOT_FOUND",
        message: "The requested ActionPlan does not exist.",
        actionPlanId: "task19-1-not-real",
        retryable: false,
      },
    });
  } finally {
    await app.close();
  }
});
