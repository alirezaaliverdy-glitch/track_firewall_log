import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyAssistantIntent, stripExplicitActionMarker } from "../src/ai/assistant-intent-classifier.js";

const chatService = readFileSync(new URL("../src/services/ai-chat.service.ts", import.meta.url), "utf8");
const aiRoute = readFileSync(new URL("../src/routes/ai.ts", import.meta.url), "utf8");
const assistantUi = readFileSync(new URL("../../src/components/ai/AiSecurityAssistantPanel.tsx", import.meta.url), "utf8");

test("normal chat with a selected Cisco device remains conversation", () => {
  const result = classifyAssistantIntent({ message: "What do you think about VLAN segmentation on this Cisco?", hasSelectedDevice: true });
  assert.equal(result.mode, "conversation");
  assert.equal(result.requiresClarification, false);
});

test("unrelated general question with a selected device remains conversation", () => {
  const result = classifyAssistantIntent({ message: "Explain how BGP path selection works in general", hasSelectedDevice: true });
  assert.equal(result.mode, "conversation");
  assert.equal(result.requiresClarification, false);
});

test("advice request with a selected MikroTik device remains conversation", () => {
  const result = classifyAssistantIntent({ message: "Should we enable Winbox from the internet, or is that unsafe?", hasSelectedDevice: true });
  assert.equal(result.mode, "conversation");
  assert.equal(result.requiresClarification, false);
});

test("selected-device status question is a read-only device_question", () => {
  const result = classifyAssistantIntent({ message: "What is the memory and interface status on this device?", hasSelectedDevice: true });
  assert.equal(result.mode, "device_question");
  assert.equal(result.requiresClarification, false);
});

test("selected-device technical question remains read-only device_question", () => {
  const result = classifyAssistantIntent({ message: "Which interfaces look risky on this selected device?", hasSelectedDevice: true });
  assert.equal(result.mode, "device_question");
  assert.equal(result.requiresClarification, false);
});

test("explicit catalog-backed operation is action_request", () => {
  const result = classifyAssistantIntent({ message: "Block 203.0.113.10 for 30 minutes", hasSelectedDevice: true });
  assert.equal(result.mode, "action_request");
});

test("vendor-prefixed MikroTik catalog operation is action_request", () => {
  const result = classifyAssistantIntent({ message: "MikroTik: change SSH port to 22022 trusted source 192.168.1.0/24", hasSelectedDevice: true });
  assert.equal(result.mode, "action_request");
});

test("vendor-prefixed FortiGate operation is action_request", () => {
  const result = classifyAssistantIntent({ message: "FortiGate: create address object for 192.168.8.2", hasSelectedDevice: true });
  assert.equal(result.mode, "action_request");
});

test("explicit custom vendor-specific operation is action_request", () => {
  const result = classifyAssistantIntent({ message: "Configure a custom storm-control profile for access ports", hasSelectedDevice: true });
  assert.equal(result.mode, "action_request");
});

test("explicit action markers force action_request before heuristics", () => {
  const command = classifyAssistantIntent({ message: "command: restart nginx", hasSelectedDevice: true });
  assert.equal(command.mode, "action_request");
  assert.equal(command.reasonCode, "explicit_action_marker");
  assert.equal(command.explicitOverride, true);

  const persian = classifyAssistantIntent({ message: "\u062f\u0633\u062a\u0648\u0631: \u067e\u0648\u0631\u062a SSH \u0631\u0627 \u0628\u0647 22022 \u062a\u063a\u06cc\u06cc\u0631 \u0628\u062f\u0647", hasSelectedDevice: true });
  assert.equal(persian.mode, "action_request");
  assert.equal(stripExplicitActionMarker("prompt: restart nginx"), "restart nginx");
});

test("quoted or meta command questions do not become actions without prefix marker", () => {
  const result = classifyAssistantIntent({ message: "\u0627\u06cc\u0646 \u062f\u0633\u062a\u0648\u0631 \u0686\u0647 \u06a9\u0627\u0631\u06cc \u0645\u06cc\u200c\u06a9\u0646\u062f\u061f", hasSelectedDevice: true });
  assert.notEqual(result.mode, "action_request");
});

test("UI mode override can force chat or action planning", () => {
  const chat = classifyAssistantIntent({ message: "command: restart nginx", hasSelectedDevice: true, intentModeOverride: "Chat" });
  assert.equal(chat.mode, "conversation");
  assert.equal(chat.reasonCode, "ui_chat_override");
  assert.equal(chat.explicitOverride, true);

  const action = classifyAssistantIntent({ message: "hello", hasSelectedDevice: true, intentModeOverride: "Action" });
  assert.equal(action.mode, "action_request");
  assert.equal(action.reasonCode, "ui_action_override");
  assert.equal(action.explicitOverride, true);
});

test("change advice remains conversation even with a selected vendor device", () => {
  const result = classifyAssistantIntent({ message: "Cisco change management best practices?", hasSelectedDevice: true });
  assert.equal(result.mode, "conversation");
});

test("ambiguous operation text defaults to clarification, not execution", () => {
  const result = classifyAssistantIntent({ message: "block?", hasSelectedDevice: true });
  assert.equal(result.mode, "conversation");
  assert.equal(result.requiresClarification, true);
});

test("chat service gates planning behind classifier and returns explicit response contract", () => {
  assert.match(aiRoute, /intentModeOverride/);
  assert.match(chatService, /classifyAssistantIntent\(\{ message, hasSelectedDevice: Boolean\(earlySelectedDevice\?\.id\), intentModeOverride: input\.intentModeOverride \}\)/);
  assert.match(chatService, /stripExplicitActionMarker\(message\)/);
  assert.match(chatService, /if \(classification\.mode !== "action_request"\)/);
  assert.match(chatService, /actionPlan: null/);
  assert.match(chatService, /mode: classification\.mode/);
  assert.match(chatService, /requiresClarification: classification\.requiresClarification/);
  assert.match(chatService, /providerClassificationRequested/);
  assert.match(chatService, /responseContract: \{[\s\S]*mode: "action_request"/);
  assert.match(chatService, /const responseMode = "action_request"/);
});

test("chat service supports connector-backed custom AI ActionPlans", () => {
  assert.match(chatService, /buildCustomCommandPlan/);
  assert.match(chatService, /canCreateCustomConnectorActionPlan/);
  assert.match(chatService, /source: "ai_custom_connector_plan"/);
  assert.match(chatService, /executionSupport: "connector"/);
  assert.match(chatService, /rawCommandExecution: false/);
});

test("non-action branch does not call ActionPlan or execution backend", () => {
  const nonActionBlock = chatService.slice(chatService.indexOf('if (classification.mode !== "action_request")'), chatService.indexOf("const earlyResolution = resolveAiTemplate"));
  assert.doesNotMatch(nonActionBlock, /resolveAiTemplate\(/);
  assert.doesNotMatch(nonActionBlock, /createAiActionIntent\(/);
  assert.doesNotMatch(nonActionBlock, /proposeActionPlan\(/);
  assert.doesNotMatch(nonActionBlock, /quickExecuteActionPlan|executeActionPlan|selectDeviceConnector/);
  assert.match(nonActionBlock, /runAiProvider\(\{ message, context \}\)/);
});

test("frontend treats chat and device_question as assistant-only and clears stale plans when switching devices", () => {
  assert.match(assistantUi, /INTENT_MODE_OPTIONS/);
  assert.match(assistantUi, /intentModeOverride/);
  assert.match(assistantUi, /sendAiMessage\(sessionId, trimmed, selectedDeviceId \|\| undefined, \{[\s\S]*intentModeOverride/);
  assert.match(assistantUi, /response\.mode === "action_request" \? \{ support: response\.actionContract\.executionSupport/);
  assert.match(assistantUi, /setCreatedPlanId\(response\.actionPlan\?\.id \?\? null\)/);
  assert.match(assistantUi, /const canOfferGuidedStart = response\.mode === "action_request"/);
  assert.match(assistantUi, /previousTargetDeviceId/);
  assert.match(assistantUi, /setSessionId\(null\);[\s\S]*setMessages\(\[\]\);[\s\S]*setLastIntent\(null\);[\s\S]*setCreatedPlanId\(null\);/);
});
