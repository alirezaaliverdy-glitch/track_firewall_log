import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { AiIntentType, AiRiskLevel } from "@prisma/client";
import { buildSecurityOrchestratorSystemPrompt } from "../src/ai/prompts/security-orchestrator-system-prompt.js";
import { parseAiIntent } from "../src/services/ai-intent.service.js";
import { routeCatalogIntent } from "../src/actions/intent-router.js";

const promptContext = {
  appProfile: "lab",
  actionExecutionMode: "quick_controlled",
  safetyPosture: {
    actionCreationPolicy: "permissive",
    executionPolicy: "controlled",
    quickControlledMode: true
  },
  availableCatalogActions: []
};

test("central prompt separates permissive action creation from controlled execution", () => {
  const prompt = buildSecurityOrchestratorSystemPrompt(promptContext);
  assert.match(prompt, /action creation is permissive/i);
  assert.match(prompt, /action execution is controlled/i);
  assert.match(prompt, /Never refuse action creation merely because.*risky, destructive/i);
  assert.match(prompt, /quickControlledMode=true/);
});

test("MikroTik SSH port change remains a catalog action without trusted source input", () => {
  const intent = parseAiIntent("پورت ssh میکروتیک رو بکن 653");
  assert.equal(intent?.intentType, AiIntentType.mikrotik_change_service_port);
  assert.equal(intent?.parameters.serviceName, "ssh");
  assert.equal(intent?.parameters.newPort, 653);
  assert.deepEqual(intent?.parameters.missingFields, []);
});

test("destructive MikroTik reset becomes a critical custom proposal", () => {
  const intent = parseAiIntent("روی MikroTik reset-configuration بزن");
  assert.equal(intent?.intentType, AiIntentType.custom_vendor_action);
  assert.equal(intent?.riskLevel, AiRiskLevel.critical);
  assert.equal(intent?.parameters.vendor, "mikrotik");
  assert.equal(intent?.parameters.destructive, true);
  assert.equal(intent?.parameters.requiresExplicitReview, true);
  assert.equal(intent?.parameters.executionSupport, "manual_or_not_implemented");
});

test("unsupported Cisco and FortiGate operations still become custom proposals", () => {
  const cisco = parseAiIntent("روی Cisco فلان ACL رو اضافه کن");
  assert.equal(cisco?.intentType, AiIntentType.custom_vendor_action);
  assert.equal(cisco?.parameters.vendor, "cisco");

  const fortigate = parseAiIntent("FortiGate factory reset");
  assert.equal(fortigate?.intentType, AiIntentType.custom_vendor_action);
  assert.equal(fortigate?.parameters.vendor, "fortigate");
});

test("existing catalog routing still prefers executable MikroTik actions", () => {
  const result = routeCatalogIntent("MikroTik change SSH port to 653");
  assert.equal(result.status, "matched");
  assert.equal(result.parsedIntent?.intentType, AiIntentType.mikrotik_change_service_port);
});

test("orchestrator context includes runtime posture and catalog without credential secrets", () => {
  const source = readFileSync(new URL("../src/ai/context/security-orchestrator-context.ts", import.meta.url), "utf8");
  assert.match(source, /actionExecutionMode/);
  assert.match(source, /actionAllowLabUnrestrictedManagement/);
  assert.match(source, /quickControlledMode/);
  assert.match(source, /availableCatalogActions/);
  assert.match(source, /customVendorActionSupported:\s*true/);
  assert.doesNotMatch(source, /secretEncrypted|privateKeyEncrypted|passphraseEncrypted|openaiApiKey/);
});

test("OpenAI-compatible provider uses the central prompt builder", () => {
  const source = readFileSync(new URL("../src/services/providers/openai-compatible.provider.ts", import.meta.url), "utf8");
  assert.match(source, /buildSecurityOrchestratorSystemPrompt\(input\.context\)/);
  assert.doesNotMatch(source, /Block reset|SSH port changes.*unknown/);
});
