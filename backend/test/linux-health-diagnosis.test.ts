import assert from "node:assert/strict";
import test from "node:test";
import { diagnoseLinuxHealth } from "../src/monitoring/linux/linux-health-diagnosis.js";

test("turns an online warning into a Persian diagnosis with a safe next step", () => {
  const diagnosis = diagnoseLinuxHealth({
    state: "warning",
    summary: "Server is online with warnings",
    warnings: [],
    score: 100,
    observedAt: "2026-10-04T18:35:29.176Z",
  });
  assert.equal(diagnosis?.kind, "collection");
  assert.match(diagnosis?.titleFa ?? "", /دادهٔ سلامت/);
  assert.match(diagnosis?.nextStepFa ?? "", /جزئیات تجهیز/);
  assert.equal(diagnosis?.observedAt, "2026-10-04T18:35:29.176Z");
});

test("does not claim an intrusion for a security signal", () => {
  const diagnosis = diagnoseLinuxHealth({
    state: "warning",
    summary: "Server is online with warnings",
    warnings: ["Recent security warnings found"],
    observedAt: "2026-10-04T18:35:29.176Z",
  });
  assert.equal(diagnosis?.kind, "security");
  assert.match(diagnosis?.causeFa ?? "", /ثابت نمی‌کند/);
  assert.match(diagnosis?.nextStepFa ?? "", /برنامهٔ رفع/);
});

test("keeps an offline diagnosis focused on connection repair", () => {
  const diagnosis = diagnoseLinuxHealth({ state: "offline", observedAt: "2026-10-04T18:35:29.176Z" });
  assert.equal(diagnosis?.kind, "connection");
  assert.match(diagnosis?.nextStepFa ?? "", /اعتبارنامه/);
});
