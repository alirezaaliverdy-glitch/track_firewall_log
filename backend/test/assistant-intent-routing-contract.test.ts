import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyAssistantIntent } from "../src/ai/assistant-intent-classifier.js";

const chatService = readFileSync(new URL("../src/services/ai-chat.service.ts", import.meta.url), "utf8");
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
  assert.match(chatService, /classifyAssistantIntent\(\{ message, hasSelectedDevice: Boolean\(earlySelectedDevice\?\.id\) \}\)/);
  assert.match(chatService, /if \(classification\.mode !== "action_request"\)/);
  assert.match(chatService, /actionPlan: null/);
  assert.match(chatService, /mode: classification\.mode/);
  assert.match(chatService, /requiresClarification: classification\.requiresClarification/);
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
  assert.match(assistantUi, /response\.mode === "action_request" \? \{ support: response\.actionContract\.executionSupport/);
  assert.match(assistantUi, /setCreatedPlanId\(response\.actionPlan\?\.id \?\? null\)/);
  assert.match(assistantUi, /const canOfferGuidedStart = response\.mode === "action_request"/);
  assert.match(assistantUi, /previousTargetDeviceId/);
  assert.match(assistantUi, /setSessionId\(null\);[\s\S]*setMessages\(\[\]\);[\s\S]*setLastIntent\(null\);[\s\S]*setCreatedPlanId\(null\);/);
});
