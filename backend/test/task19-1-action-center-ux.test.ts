import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("Task 19.1 R-E localizes primary Assistant and Action Center controls", async () => {
  const [assistant, actionCenterPanel, actionCenterModel, actionUi] = await Promise.all([
    readFile(new URL("src/components/ai/AiSecurityAssistantPanel.tsx", root), "utf8"),
    readFile(new URL("src/components/actions/ActionCenterPanel.tsx", root), "utf8"),
    readFile(new URL("src/features/actions/actionCenterModel.tsx", root), "utf8"),
    readFile(new URL("src/components/actions/ActionCenterUi.tsx", root), "utf8"),
  ]);
  const actionCenter = `${actionCenterPanel}\n${actionCenterModel}`;

  for (const label of ["تازه‌سازی خلاصه", "پاک‌کردن گفت‌وگو", "درخواست جدید", "مرز ایمنی", "ارائه‌دهنده هوش مصنوعی"]) assert.match(assistant, new RegExp(label));
  for (const label of ["مرکز اقدام", "برنامه‌های اقدام", "در انتظار بازبینی", "تأییدشده بدون تغییر", "کانکتور", "راستی‌آزمایی"]) assert.match(actionCenter, new RegExp(label));
  assert.match(actionUi, /نحوه اجرای امن/);
});

test("Task 19.1 R-E keeps structured API recovery and raw URLs out of user errors", async () => {
  const [actionsApi, actionCenter] = await Promise.all([
    readFile(new URL("src/lib/actions.ts", root), "utf8"),
    readFile(new URL("src/components/actions/ActionCenterPanel.tsx", root), "utf8"),
  ]);

  assert.doesNotMatch(actionsApi, /Action API error[^\n]*\[\$\{url\}\]/);
  assert.doesNotMatch(actionsApi, /Action API network error[^\n]*\[\$\{url\}\]/);
  for (const field of ["retryable", "recovery", "currentRevision", "approvedRevision", "changedFields"]) {
    assert.match(actionsApi, new RegExp(`error\\.${field}`));
    assert.match(actionCenter, new RegExp(`actionError\\.${field}`));
  }
  assert.match(actionCenter, /setSelectedAction\(plan\)/);
  assert.match(actionCenter, /getActionAudit\(plan\.id\)/);
});

test("Task 19.1 Execute and Assistant share the newest revision and one action contract", async () => {
  const [serviceFacade, serviceExecution, actionsApi, assistantApi, assistantUi, actionCenter] = await Promise.all([
    readFile(new URL("backend/src/services/action-plan.service.ts", root), "utf8"),
    readFile(new URL("backend/src/actions/action-plan/action-plan-execution.service.ts", root), "utf8"),
    readFile(new URL("src/lib/actions.ts", root), "utf8"),
    readFile(new URL("src/lib/ai.ts", root), "utf8"),
    readFile(new URL("src/components/ai/AiSecurityAssistantPanel.tsx", root), "utf8"),
    readFile(new URL("src/components/actions/ActionCenterPanel.tsx", root), "utf8"),
  ]);
  const service = [serviceFacade, serviceExecution].join("\n");

  assert.match(service, /regenerateLatestRevisionForExecution/);
  assert.match(service, /action_revision_regenerated/);
  assert.doesNotMatch(service, /throw new ActionExecutionError\("COMMAND_PLAN_STALE"/);
  assert.match(actionsApi, /quickExecuteLatestAction/);
  assert.match(actionsApi, /actionPlanRevision: actionPlanRevision\(latest\)/);
  assert.match(actionCenter, /quickExecuteLatestAction/);
  for (const field of ["canCreateActionPlan", "manualOnly", "executable", "executionSupport", "implementationState", "executionMode", "lifecycle"]) {
    assert.match(assistantApi, new RegExp(field));
    assert.match(assistantUi, new RegExp(`actionContract\\.${field}`));
  }
});
