import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("assistant target context builder treats the selected device as single source of truth", () => {
  const source = read("../src/ai/context/assistant-target-context.ts");
  assert.match(source, /selectedDeviceIsSingleSourceOfTruth:\s*true/);
  assert.match(source, /staleIntentAllowed:\s*false/);
  assert.match(source, /staleGuidedActionAllowed:\s*false/);
  assert.match(source, /actionPlanCreationPath:\s*"backend_ai_chat_to_ActionPlan_to_ActionCenter"/);
  assert.match(source, /deviceOverview:\s*`\/devices\/\$\{encodeURIComponent\(device\.id\)\}`/);
  assert.match(source, /actionCenter:\s*`\/actions\?deviceId=\$\{encodeURIComponent\(device\.id\)\}`/);
});

test("assistant target context includes vendor, platform, capabilities, health, inventory and connection state", () => {
  const source = read("../src/ai/context/assistant-target-context.ts");
  for (const token of ["vendorForAssistantTarget", "pickCiscoPlatform", "inventorySummary", "healthSummary", "connectionState", "verificationStatus", "legacyCompatibility", "capabilities", "supportedActions"]) {
    assert.match(source, new RegExp(token));
  }
  assert.match(source, /device\?\.type === "linux_edge"\) return "linux"/);
  assert.match(source, /detection\.platform[\s\S]*system\.platform[\s\S]*capabilities\.platform/);
  assert.match(source, /system\.hostname[\s\S]*system\.model[\s\S]*system\.iosVersion[\s\S]*interfaces\.length/);
});

test("supported actions are filtered to Cisco, FortiGate, MikroTik or Linux selected targets only", () => {
  const source = read("../src/ai/context/assistant-target-context.ts");
  assert.match(source, /const vendor = vendorForAssistantTarget\(device\)/);
  assert.match(source, /action\.vendor === vendor && action\.supportState === "verified"/);
  assert.match(source, /executionTemplateRef: action\.executionTemplateRef/);
  assert.match(source, /requiredParams: action\.requiredParams\.map\(\(field\) => field\.key\)/);

  const catalog = read("../src/commands/catalog/index.ts");
  assert.match(catalog, /item\("linux", "open-ports"/);
  assert.match(catalog, /item\("mikrotik", "failed-logins"/);
  assert.match(catalog, /item\("fortigate", "system-status"/);
  const ciscoRegistry = read("../src/cisco/cisco-operation-registry.ts");
  assert.match(catalog, /CISCO_OPERATION_REGISTRY\.map/);
  assert.match(ciscoRegistry, /implemented\("show-version"/);
});

test("AI resolver source prevents stale cross-vendor catalog fallback", () => {
  const source = read("../src/ai/ai-template-resolver.ts");
  assert.match(source, /normalizeAiVendor\(input\.selectedDevice\?\.type\)[\s\S]*normalizeAiVendor\(input\.selectedDevice\?\.vendor\)/);
  assert.match(source, /routePersianIntent\(\{[\s\S]*selectedDeviceId: input\.selectedDevice\?\.id[\s\S]*selectedVendor,/);
  assert.match(source, /vendor === "generic" \? COMMAND_CATALOG\.find\(\(entry\) => entry\.actionType === actionType\) : null/);
  assert.doesNotMatch(source, /\?\? COMMAND_CATALOG\.find\(\(entry\) => entry\.actionType === actionType\)\s+\?\? null/);
});

test("AI chat rebuilds context from the current selected device on every prompt", () => {
  const source = read("../src/services/ai-chat.service.ts");
  assert.match(source, /buildSecurityOrchestratorContext\(\{ selectedDeviceId: input\.deviceId \}\)/);
  assert.match(source, /deviceId: input\.deviceId,\s+parsedIntent/);
  assert.match(source, /const selectedDeviceId = input\.deviceId;/);
  assert.doesNotMatch(source, /const selectedDeviceId = input\.deviceId \?\? actionIntent\?\.deviceId/);
  assert.match(source, /targetDeviceContext: context\.targetDeviceContext/);
  assert.match(source, /suggestSupportedActionsForAssistantTarget\(input\.selectedDevice\)/);
});

test("central prompt teaches selected-target context, app routes, workflow state and catalog scope", () => {
  const source = read("../src/ai/prompts/security-orchestrator-system-prompt.ts");
  assert.match(source, /targetDeviceContext\?: Record<string, unknown> \| null/);
  assert.match(source, /single source of truth/);
  assert.match(source, /ignore stale device context, previous intent, previous guided action/);
  assert.match(source, /Generate actions only for targetDeviceContext\.device\.id/);
  assert.match(source, /ActionPlan and Action Center pipeline/);
  assert.match(source, /Selected target device context:/);
  assert.match(source, /Target-scoped catalog actions:/);
});

test("frontend assistant clears previous intent and guided action state when target or prompt changes", () => {
  const source = read("../../src/components/ai/AiSecurityAssistantPanel.tsx");
  assert.match(source, /previousTargetDeviceId/);
  assert.match(source, /setSessionId\(null\);[\s\S]*setMessages\(\[\]\);[\s\S]*setLastIntent\(null\);[\s\S]*setGuidedStart\(null\);/);
  assert.match(source, /setCreatedPlanId\(null\);\s+setGuidedStart\(null\);\s+setLastIntent\(null\);\s+setActionDebug\(null\);\s+setExecutionState\(null\);\s+setStructuredResponse\(null\);/);
  assert.match(source, /sendAiMessage\(sessionId, trimmed, selectedDeviceId \|\| undefined/);
});

test("memory and status requests stay inside Assistant without guided workflow or ActionPlan handoff", () => {
  const source = read("../src/ai/ai-template-resolver.ts");
  assert.match(source, /rawActionType[\s\S]*generic_security_action/);
  assert.match(source, /canUseCatalogActionType\(resolvedActionType\) \? findCatalogItemByIntent/);

  const chat = read("../src/services/ai-chat.service.ts");
  assert.match(chat, /responseMode = guidedBlueprintId \? "guided_workflow" : resolution\.mode === "guided_workflow" \? "manual_or_not_supported" : resolution\.mode/);
  assert.match(chat, /actionSessionId: null/);
  assert.match(chat, /guidedActionUrl: null/);
});

test("unsupported selected-device requests stay reviewable in Assistant", () => {
  const source = read("../src/ai/ai-template-resolver.ts");
  assert.match(source, /canUseCatalogActionType\(actionType: string\)/);
  assert.match(source, /actionType !== "generic_security_action" && actionType !== "custom_vendor_action"/);
  assert.doesNotMatch(source, /findCatalogItemByIntent\(canonicalVendor, resolvedActionType\);/);

  const chat = read("../src/services/ai-chat.service.ts");
  assert.match(chat, /selectedDeviceUnsupportedMessage/);
  assert.match(chat, /suggestSupportedActionsForAssistantTarget\(input\.selectedDevice\)/);
});

test("custom proposals do not create or redirect to a Guided Action session", () => {
  const chat = read("../src/services/ai-chat.service.ts");
  assert.doesNotMatch(chat, /import \{ startGuidedActionSession \}/);
  assert.doesNotMatch(chat, /startGuidedActionSession\(\{[\s\S]*initialRequest: message/);
  assert.match(chat, /actionSession: null/);

  const assistant = read("../../src/components/ai/AiSecurityAssistantPanel.tsx");
  assert.doesNotMatch(assistant, /response\.actionSessionId[\s\S]*navigate/);
  assert.doesNotMatch(assistant, /startGuidedSession\(guided\)[\s\S]*\.then\(\(session\)[\s\S]*navigate/);
});

test("executable multi-step action exposes an explicit start button only", () => {
  const chat = read("../src/services/ai-chat.service.ts");
  assert.match(chat, /canStartParameterizedGuidedAction/);
  assert.match(chat, /resolution\.catalogItem\?\.supportState === "verified"/);
  assert.match(chat, /resolution\.implementationState === "implemented"/);
  assert.match(chat, /resolution\.executionSupport === "connector"/);
  assert.match(chat, /resolutionMissing\.length > 0/);

  const assistant = read("../../src/components/ai/AiSecurityAssistantPanel.tsx");
  assert.match(assistant, /canOfferGuidedStart/);
  assert.match(assistant, /response\.missingFields\.length > 0/);
  assert.match(assistant, /guidedStart && <button[^>]*onClick=\{startGuidedWorkflow\}/);
});

test("Guided Action navigation happens only after explicit confirmation", () => {
  const assistant = read("../../src/components/ai/AiSecurityAssistantPanel.tsx");
  const submitBlock = assistant.slice(assistant.indexOf("const submit ="), assistant.indexOf("const startGuidedWorkflow ="));
  assert.doesNotMatch(submitBlock, /navigate\(/);
  assert.doesNotMatch(submitBlock, /startGuidedSession\(/);
  const startBlock = assistant.slice(assistant.indexOf("const startGuidedWorkflow ="));
  assert.match(startBlock, /startGuidedSession\(guidedStart\)/);
  assert.match(startBlock, /navigate\(`\/guided-actions\/\$\{encodeURIComponent\(session\.sessionId\)\}`\)/);
});

test("switching target devices clears old intent, ActionPlan and guided-session context", () => {
  const assistant = read("../../src/components/ai/AiSecurityAssistantPanel.tsx");
  assert.match(assistant, /previousTargetDeviceId\.current === selectedDeviceId/);
  assert.match(assistant, /viewGeneration\.current \+= 1/);
  assert.match(assistant, /setSessionId\(null\);[\s\S]*setMessages\(\[\]\);[\s\S]*setLastIntent\(null\);[\s\S]*setExecutionState\(null\);[\s\S]*setStructuredResponse\(null\);[\s\S]*setActionDebug\(null\);[\s\S]*setCreatedPlanId\(null\);[\s\S]*setGuidedStart\(null\);/);
});
