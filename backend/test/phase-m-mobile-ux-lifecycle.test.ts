import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, root), "utf8");

test("Phase M local mobile route exposes the required operator screens", () => {
  const route = read("src/routes/appRoutes.tsx");
  const page = read("src/features/mobile-local/pages/LocalMobileRuntimePage.tsx");
  const productState = read("backend/src/product-state/product-state.registry.ts");
  assert.match(route, /path: "\/mobile-local"/);
  assert.match(route, /featureKey: "mobile\.local"/);
  assert.match(productState, /key: "mobile\.local"/);
  for (const token of ["Offline Inventory", "Vault And Trust", "Catalog Preview And Approval", "Assistant Mode", "Lifecycle", "Audit And Backup"]) {
    assert.match(page, new RegExp(token));
  }
  for (const token of ["Encrypted backup", "Restore", "Local network permission", "SSH fingerprint", "RuntimeFacade"]) {
    assert.match(page, new RegExp(token));
  }
});

test("Phase M mobile UX does not call SSH or AI execution paths from UI", () => {
  const page = read("src/features/mobile-local/pages/LocalMobileRuntimePage.tsx");
  assert.doesNotMatch(page, /LocalSsh|startExecution|executePlan|sendAiMessage|fetch\(|requestJson/);
  assert.match(page, /createOfflineFallbackDraft/);
  assert.match(page, /monitoringTemplatesFor/);
});

test("Phase M lifecycle handles resume, duplicate prevention, and platform limits", () => {
  const lifecycle = read("src/mobile-local/lifecycle/LocalExecutionLifecycle.ts");
  assert.match(lifecycle, /duplicateExecutionKey/);
  assert.match(lifecycle, /decideLocalExecutionResume/);
  assert.match(lifecycle, /foregroundNotificationFor/);
  assert.match(lifecycle, /iosBackgroundExecutionStatus/);
  assert.match(lifecycle, /LOCAL_IOS_LONG_RUNNING_SSH_REQUIRES_FOREGROUND_SESSION/);
  assert.match(lifecycle, /reconcileAuditContinuity/);
});
