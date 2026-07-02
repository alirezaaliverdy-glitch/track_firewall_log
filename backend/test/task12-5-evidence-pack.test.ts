import assert from "node:assert/strict";
import test from "node:test";
import { buildSecurityOrchestratorSystemPrompt } from "../src/ai/prompts/security-orchestrator-system-prompt.js";
import { composeEvidencePack, type EvidencePackLimits } from "../src/ai/context/evidence-pack.service.js";
import { parseAiIntent } from "../src/services/ai-intent.service.js";

const limits: EvidencePackLimits = { events: 2, incidents: 1, findings: 1, actionPlans: 1, evidenceLines: 3, rawMessageChars: 20, includeRawLogs: false };
const device = { id: "linux-1", name: "Linux edge", vendor: "linux", type: "linux", status: "online", managementPort: 22, protocol: "ssh" };

test("central prompt identifies the product, mission, and control boundary", () => {
  const prompt = buildSecurityOrchestratorSystemPrompt({ availableCatalogActions: [] });
  assert.match(prompt, /Firewall Log Analyzer \/ AI Security Orchestrator/);
  assert.match(prompt, /Mini-SOAR\/SOC assistant/);
  assert.match(prompt, /Main mission: analyze logs, telemetry, devices, incidents, findings/);
  assert.match(prompt, /action creation is permissive/i);
  assert.match(prompt, /action execution is controlled/i);
  assert.match(prompt, /Never execute commands or claim an action was executed/);
});

test("Evidence Pack excludes raw logs and secrets and respects every item limit", () => {
  const pack = composeEvidencePack({
    selectedDevice: device,
    snapshots: [{ deviceId: "linux-1", dataJson: { ssh: { password: "do-not-leak", passwordAuthentication: "yes", privateKey: "key" }, rawLogs: ["secret log"] } }],
    events: [1, 2, 3].map((n) => ({ id: String(n), deviceId: "linux-1", severity: "high", rawMessage: "raw", eventType: "auth" })),
    incidents: [1, 2].map((n) => ({ id: String(n), deviceId: "linux-1", title: `incident ${n}` })),
    findings: [1, 2].map((n) => ({ id: String(n), deviceId: "linux-1", title: `finding ${n}`, apiKey: "secret" })),
    actionPlans: [1, 2].map((n) => ({ id: String(n), deviceId: "linux-1", actionType: "generic_security_action", parametersJson: { token: "secret" } }))
  }, limits);
  const serialized = JSON.stringify(pack);
  assert.doesNotMatch(serialized, /do-not-leak|secret log|privateKey|apiKey|"token"|rawMessage/);
  assert.equal(pack.metadata.rawLogsIncluded, false);
  assert.equal(pack.metadata.contextTruncated, true);
  assert.equal(pack.metadata.includedEventsCount, 2);
  assert.equal(pack.metadata.includedIncidentsCount, 1);
  assert.equal(pack.metadata.includedFindingsCount, 1);
  assert.equal(pack.metadata.includedActionPlansCount, 1);
});

test("Evidence Pack is vendor-aware and includes relevant action hints", () => {
  const pack = composeEvidencePack({ selectedDevice: device, snapshots: [{ deviceId: "linux-1", dataJson: { ssh: { port: 22 }, firewall: { status: "active" }, routeros: { version: "7" }, services: { winbox: true } } }] }, limits);
  const serialized = JSON.stringify(pack);
  assert.match(serialized, /SSH posture/);
  assert.match(serialized, /linux\.disable_ssh_password_auth/);
  assert.doesNotMatch(serialized, /routeros|winbox|RouterOS\/package version/);
});

test("risky action becomes a critical proposal instead of a refusal", () => {
  const intent = parseAiIntent("FortiGate factory reset");
  assert.equal(intent?.riskLevel, "critical");
  assert.equal(intent?.parameters.requiresExplicitReview, true);
  assert.equal(intent?.parameters.executionSupport, "manual_or_not_implemented");
});
