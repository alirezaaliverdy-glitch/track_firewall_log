import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("fleet health omits unsupported storage and localizes real datastore metrics", () => {
  const source = readFileSync("/src/features/dashboard/pages/FleetHealthPanel.tsx", "utf8");
  assert.match(source, /storage\.metricKey==="datastore\.usage_percent"\?t\("فضای داده","Datastore"\)/);
  assert.match(source, /\.\.\.\(storage\?\[/);
  assert.match(source, /rows\.length\.toLocaleString\(locale\)/);
  assert.match(source, /این تجهیز سنسور ذخیره‌سازی گزارش نمی‌کند/);
  assert.doesNotMatch(source, /\?"Datastore"/);
  assert.doesNotMatch(source, /of 3 sensors current/);
});

test("finding details show the real remediation path before raw evidence", () => {
  const source = readFileSync("/src/features/security/pages/FindingDetailPage.tsx", "utf8");
  assert.ok(source.indexOf("security-resolution-guide") < source.indexOf("security-evidence-workspace"));
  assert.match(source, /remediation\.verification/);
  assert.match(source, /createPlan/);
});

test("rolling detection counts cannot be inflated by evaluating old events again", () => {
  const source = readFileSync("/backend/src/assets/asset-intelligence.service.ts", "utf8");
  assert.match(source, /count: group\.length/);
  assert.doesNotMatch(source, /existing\.count \+ newEvents\.length/);
  assert.match(source, /observedAt > existing\.lastSeen/);
});
