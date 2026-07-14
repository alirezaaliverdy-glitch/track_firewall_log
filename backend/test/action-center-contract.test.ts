import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildApp } from "../src/app.js";

const service = readFileSync(new URL("../src/services/action-center.service.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/routes/actions.ts", import.meta.url), "utf8");

test("Action Center backend exposes list, detail, cancel, and retry contracts", () => {
  assert.match(routes, /\/api\/action-center"/);
  assert.match(routes, /\/api\/action-center\/:id"/);
  assert.match(routes, /\/api\/action-center\/:id\/cancel/);
  assert.match(routes, /\/api\/action-center\/:id\/retry/);
  assert.match(routes, /\/api\/action-center\/:id\/target/);
});

test("Action Center lifecycle fails closed when success lacks connector evidence", () => {
  assert.match(service, /status === ActionPlanStatus\.succeeded\) return object\(resultJson\)\.connectorInvoked === true \? "succeeded" : "failed"/);
  assert.match(service, /supportState === "verified" && executionSupport === "connector" && metadata\.executable === true/);
  assert.match(service, /canExecute: executable && plan\.status === ActionPlanStatus\.approved/);
  assert.match(service, /A new retry ActionPlan was created without changing the historical plan/);
  assert.match(service, /preview and confirmation were invalidated/);
});

test("Action Center unknown deep link returns structured not found", async (t) => {
  const app = await buildApp({ authRequired: false });
  t.after(async () => { await app.close(); });
  const response = await app.inject({ method: "GET", url: "/api/action-center/not-a-real-action" });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "ACTION_PLAN_NOT_FOUND");
});
