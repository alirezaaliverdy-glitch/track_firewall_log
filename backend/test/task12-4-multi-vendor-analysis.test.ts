import assert from "node:assert/strict";
import test from "node:test";
import { ActionPlanStatus } from "@prisma/client";
import { analyzeVendorDevice, buildCompactVendorAiContext, VENDOR_ANALYSIS_PROFILES } from "../src/assessments/vendor-analysis-profiles.js";
import { buildAssessmentDraft, buildHardeningRecommendationDrafts } from "../src/services/security-assessment.service.js";

const device = (vendor: string) => ({ id: `${vendor}-1`, name: `${vendor} edge`, vendor, type: vendor, status: "online", managementPort: 22, protocol: "ssh", capabilities: {} });

test("Linux analysis uses Linux sections and never MikroTik-only sections", () => {
  const result = analyzeVendorDevice(device("linux"), [{ snapshotType: "linux_security", dataJson: { ssh: { passwordAuthentication: "yes" }, securityTools: { fail2ban: "inactive" } } }]);
  const sectionNames = result.sections.map((item) => item.name).join(" ");
  assert.match(sectionNames, /SSH posture|Listening ports|Fail2ban/);
  assert.doesNotMatch(sectionNames, /RouterOS|Winbox|mangle|address lists/i);
  assert.ok(result.findings.some((item) => item.actionHint === "linux.disable_ssh_password_auth"));
  assert.ok(result.findings.some((item) => item.actionHint === "linux.fail2ban_jail"));
});

test("MikroTik analysis retains its full management and firewall coverage", () => {
  const result = analyzeVendorDevice(device("mikrotik"));
  const sections = result.sections.map((item) => item.name).join(" ");
  assert.match(sections, /RouterOS/);
  assert.match(sections, /Winbox/);
  assert.match(sections, /filter\/NAT\/raw\/mangle/);
});

test("FortiGate, pfSense and Cisco profiles expose relevant sections", () => {
  assert.match(VENDOR_ANALYSIS_PROFILES.fortigate.analysisSections.join(" "), /Local-in|Security profiles/);
  assert.match(VENDOR_ANALYSIS_PROFILES.pfsense.analysisSections.join(" "), /WAN|port forwards|Aliases/);
  assert.match(VENDOR_ANALYSIS_PROFILES.cisco.analysisSections.join(" "), /AAA|Telnet|SNMP/);
});

test("vendor findings and hardening suggestions are vendor-specific", () => {
  const analyses = [
    analyzeVendorDevice(device("fortigate"), [{ dataJson: { vip: { service: "https management", source: "0.0.0.0" } } }]),
    analyzeVendorDevice(device("pfsense"), [{ dataJson: { wan: { service: "webgui 443", action: "pass" } } }]),
    analyzeVendorDevice(device("cisco"), [{ dataJson: { vty: "transport input telnet ssh", telnet: "enabled" } }])
  ];
  assert.match(analyses[0].findings[0]?.title ?? "", /VIP/);
  assert.match(analyses[1].findings[0]?.title ?? "", /WAN/);
  assert.match(analyses[2].findings[0]?.title ?? "", /Telnet/);
  const context = { generatedAt: "", recentWindowMinutes: 1440, safety: {}, incidents: { recent: [], countBySeverity: [], countByStatus: [] }, events: { recentCount: 0, topSourceIps: [], sensitivePorts: [] }, detections: { recentRules: [] }, devices: analyses.map((item) => device(item.vendor)), eventBatches: [], actionPlans: { recent: [], pendingApprovalCount: 0 }, linuxTelemetry: [] };
  const assessment = buildAssessmentDraft(context as never, 3, analyses.map((item) => ({ deviceId: item.deviceId, snapshotType: "test", dataJson: {} })));
  const suggestions = buildHardeningRecommendationDrafts({ findingsJson: assessment }, context.devices);
  assert.ok(suggestions.some((item) => item.vendor === "pfsense" && item.actionType === null && !item.executable));
  assert.ok(suggestions.some((item) => item.vendor === "cisco" && item.actionType === null && !item.executable));
  assert.ok(!suggestions.some((item) => item.actionType === "custom_vendor_action" && item.executable));
});

test("compact AI context omits snapshots and raw logs", () => {
  const compact = buildCompactVendorAiContext([analyzeVendorDevice(device("generic"))]);
  assert.deepEqual(Object.keys(compact[0]).sort(), ["collectedSections", "device", "missingTelemetry", "recommendedActions", "topFindings", "vendor"].sort());
  assert.doesNotMatch(JSON.stringify(compact), /rawLogs|dataJson|snapshot/i);
});

test("fix-action contract creates a proposed plan and does not execute", () => {
  assert.equal(ActionPlanStatus.proposed, "proposed");
  const source = buildHardeningRecommendationDrafts.toString();
  assert.doesNotMatch(source, /executeAction|connector\.execute|PolicyGuard/);
});
