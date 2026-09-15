import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { redactText } from "../src/security/redaction.js";
import { VENDOR_TELEMETRY_PROFILES } from "../src/telemetry/vendor-telemetry-profiles.js";

const root = join(process.cwd(), "..");
const evidenceService = readFileSync(join(process.cwd(), "src", "services", "finding-evidence.service.ts"), "utf8");
const linuxStream = readFileSync(join(process.cwd(), "src", "telemetry", "linux", "linux-log-stream.service.ts"), "utf8");
const findingEngine = readFileSync(join(process.cwd(), "src", "telemetry", "vendor-finding-engine.ts"), "utf8");
const routes = readFileSync(join(process.cwd(), "src", "routes", "security-platform.ts"), "utf8");
const listPage = readFileSync(join(root, "src", "features", "security", "pages", "FindingsPage.tsx"), "utf8");
const detailPage = readFileSync(join(root, "src", "features", "security", "pages", "FindingDetailPage.tsx"), "utf8");

test("implemented vendors own distinct event sources and finding rules", () => {
  for (const vendor of ["linux", "mikrotik", "fortigate", "pfsense"] as const) {
    const profile = VENDOR_TELEMETRY_PROFILES[vendor];
    assert.equal(profile.implemented, "implemented");
    assert.ok(profile.liveSources.length >= 4);
    assert.ok(profile.findingRules.length >= 7);
  }
  assert.notDeepEqual(VENDOR_TELEMETRY_PROFILES.linux.liveSources, VENDOR_TELEMETRY_PROFILES.mikrotik.liveSources);
  assert.match(VENDOR_TELEMETRY_PROFILES.linux.findingRules.map((rule) => rule.id).join(" "), /ssh-failure-burst/);
  assert.match(VENDOR_TELEMETRY_PROFILES.mikrotik.findingRules.map((rule) => rule.id).join(" "), /risky-dstnat/);
  assert.match(VENDOR_TELEMETRY_PROFILES.fortigate.findingRules.map((rule) => rule.id).join(" "), /utm-threat/);
});

test("Linux SSH and sudo patterns reject successful sudo sessions and stay separate", () => {
  const sshRule = VENDOR_TELEMETRY_PROFILES.linux.findingRules.find((rule) => rule.id === "ssh-failure-burst")!;
  const sudoRule = VENDOR_TELEMETRY_PROFILES.linux.findingRules.find((rule) => rule.id === "sudo-denied-burst")!;
  const sshFailure = "sshd[90]: Failed password for root from 203.0.113.9 port 5000 ssh2";
  const sudoFailure = "sudo[10]: pam_unix(sudo:auth): authentication failure; user=operator";
  const sudoSuccess = "sudo[11]: pam_unix(sudo:session): session opened for user root by operator";
  assert.equal(sshRule.eventPattern!.test(sshFailure), true);
  assert.equal(sshRule.eventPattern!.test(sudoFailure), false);
  assert.equal(sshRule.eventPattern!.test(sudoSuccess), false);
  assert.equal(sudoRule.eventPattern!.test(sudoFailure), true);
  assert.equal(sudoRule.eventPattern!.test(sudoSuccess), false);
});

test("finding evidence endpoint resolves only referenced events for the finding device", () => {
  assert.match(routes, /security\/findings\/:id\/evidence/);
  assert.match(evidenceService, /id: \{ in: referenceIds \}/);
  assert.match(evidenceService, /deviceId: finding\.deviceId/);
  assert.match(evidenceService, /boundedTelemetryStore\.readEvents\(finding\.deviceId/);
  assert.match(evidenceService, /unresolvedIds\.has\(event\.id\)/);
  assert.match(evidenceService, /telemetryReferenceForEvent\(event\)/);
  assert.match(evidenceService, /createHash\("sha256"\)/);
  assert.doesNotMatch(evidenceService, /findingEvidenceVariantsForEvent|evidenceMatchedEvents/);
  assert.doesNotMatch(evidenceService, /collectReferenceIds\(finding\.evidenceJson/);
  assert.match(evidenceService, /exactReferencesOnly: true/);
  assert.match(evidenceService, /uniqueRawEvents/);
  assert.match(evidenceService, /typeof item === "string"[\s\S]*message: redactText\(item\)/);
  assert.match(evidenceService, /const isSnapshot = finding\.source\.toLowerCase\(\)\.includes\("snapshot"\)/);
  assert.doesNotMatch(evidenceService, /receivedAt: \{ gte:/);
  assert.match(evidenceService, /availability.*raw_events/);
  assert.match(evidenceService, /availability.*snapshot/);
});

test("new Linux findings persist the same reference used by the telemetry store", () => {
  assert.match(linuxStream, /const storedEvent = toStoredEvent\(event\)/);
  assert.match(linuxStream, /events: \[\{ id: storedEvent\.id/);
  assert.doesNotMatch(linuxStream, /events: \[\{ id: crypto\.randomUUID\(\)/);
});

test("re-analysis does not increment a finding without a new exact event reference", () => {
  assert.match(findingEngine, /newRefs = finding\.rawRefs\.filter/);
  assert.match(findingEngine, /finding\.rawRefs\.length > 0 && newRefs\.length === 0/);
  assert.match(findingEngine, /snapshotAlreadyRecorded/);
  assert.match(findingEngine, /increment: Math\.max\(newRefs\.length, 1\)/);
});

test("raw evidence is redacted and the UI loads it only on demand", () => {
  const redacted = redactText("login failed password=topsecret Authorization: Bearer abc.def");
  assert.doesNotMatch(redacted, /topsecret|abc\.def/);
  assert.match(redacted, /\[REDACTED\]/);
  assert.match(detailPage, /getFindingEvidence\(finding\.id\)/);
  assert.match(detailPage, /security\.detail\.showLogs/);
  assert.match(detailPage, /event\.rawMessage/);
});

test("finding queue requires one selected vendor and exposes profile sources", () => {
  assert.match(listPage, /findingVendor\(finding\) === selectedVendor/);
  assert.doesNotMatch(listPage, /selectedVendor === "all"/);
  assert.match(listPage, /primaryVendorOrder = \["linux", "mikrotik", "fortigate", "pfsense", "cisco"\]/);
  assert.match(listPage, /return \[\.\.\.primaryVendorOrder, \.\.\.findingVendors/);
  assert.doesNotMatch(listPage, /availableVendors = useMemo\(\(\) => Object\.keys\(vendorCounts\)/);
  assert.match(listPage, /vendorCounts\[vendor\] \?\? 0/);
  assert.match(listPage, /security\.findings\.vendorEmptyTitle/);
  assert.match(listPage, /selectedDevice === "all" \|\| finding\.deviceId === selectedDevice/);
  assert.match(listPage, /security\.device\.selectorLabel/);
  assert.match(listPage, /listDevices\(\)/);
  assert.match(listPage, /selectedProfile\.liveSources/);
  assert.match(listPage, /selectedProfile\.snapshotSources/);
});
