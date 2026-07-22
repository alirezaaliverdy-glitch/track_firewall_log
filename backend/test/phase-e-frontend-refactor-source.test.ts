import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
const size = (relative: string) => statSync(new URL(`../../${relative}`, import.meta.url)).size;

test("Phase E decomposes Assistant UI behind the existing compatibility component", () => {
  const facade = read("src/components/ai/AiSecurityAssistantPanel.tsx");
  const helpers = read("src/features/assistant/assistantUiHelpers.ts");
  const types = read("src/features/assistant/types.ts");
  const intentCard = read("src/features/assistant/components/AssistantIntentCard.tsx");
  const planningContext = read("src/features/assistant/components/AssistantPlanningContext.tsx");
  const messages = read("src/features/assistant/components/AssistantMessageList.tsx");

  assert.ok(size("src/components/ai/AiSecurityAssistantPanel.tsx") < 50_000);
  assert.match(facade, /from "@\/features\/assistant\/components\/AssistantIntentCard"/);
  assert.match(facade, /from "@\/features\/assistant\/components\/AssistantPlanningContext"/);
  assert.match(facade, /from "@\/features\/assistant\/components\/AssistantMessageList"/);
  assert.match(types, /"conversation" \| "device_question" \| "action_request"/);
  assert.match(helpers, /canSurfaceActionPlan\(mode: string \| null\).*mode === "action_request"/s);
  assert.match(facade, /const canSurfacePlan = canSurfaceActionPlan\(response\.mode\)/);
  assert.match(facade, /setCreatedPlanId\(canSurfacePlan \? response\.actionPlan\?\.id \?\? null : null\)/);
  assert.match(facade, /if \(canSurfacePlan && response\.actionPlan\?\.id\)/);
  assert.match(facade, /intentModeOverride/);
  assert.match(facade, /previousTargetDeviceId/);
  assert.match(intentCard, /completeAiActionRequest/);
  assert.match(planningContext, /No automatic execution or navigation/);
  assert.match(messages, /ChatMessageBubble/);
});

test("Phase E decomposes Action Center review UI and keeps controlled execution gates", () => {
  const panel = read("src/components/actions/ActionCenterPanel.tsx");
  const panelModel = read("src/features/actions/actionCenterModel.tsx");
  const workspace = read("src/components/actions/ActionCenterWorkspace.tsx");
  const workspaceModel = read("src/features/actions/actionCenterWorkspaceModel.tsx");
  const reviewSheet = read("src/features/actions/components/ActionReviewSheet.tsx");
  const permissions = read("src/lib/frontendPermissions.ts");

  assert.ok(size("src/components/actions/ActionCenterPanel.tsx") < 50_000);
  assert.ok(size("src/components/actions/ActionCenterWorkspace.tsx") < 50_000);
  assert.match(panel, /from "@\/features\/actions\/actionCenterModel"/);
  assert.match(workspace, /from "@\/features\/actions\/components\/ActionReviewSheet"/);
  assert.match(workspace, /actionExecutionPermission\(user, selected\.riskLevel, isFa\)/);
  assert.match(reviewSheet, /InlineActionReviewPanel/);
  assert.match(reviewSheet, /PolicyGuard/);
  assert.match(reviewSheet, /registered connector/);
  assert.match(panelModel, /quick_controlled/);
  assert.match(workspaceModel, /connector completed the operation successfully/i);
  assert.match(permissions, /viewer: new Set\(\["actions\.read"\]\)/);
  assert.match(permissions, /High-risk execution is admin-only/);
  assert.match(panel, /quickExecuteLatestAction/);
  assert.match(workspace, /quickExecuteAction\(actionPlanId, \{ intent: "execute"/);
});
