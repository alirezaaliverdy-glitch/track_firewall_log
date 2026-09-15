import assert from "node:assert/strict";
import test from "node:test";
import { ActionType } from "@prisma/client";
import { normalizeVendor } from "../src/services/ai-normalization.js";
import { parseAiIntent } from "../src/services/ai-intent.service.js";
import { getVendorDailyCheckProfile } from "../src/daily-check/vendor-daily-check-profiles.js";
import { buildDailyCheckResult } from "../src/daily-check/daily-check-engine.js";
import { COMMAND_CATALOG } from "../src/commands/catalog/index.js";
import { actionExecutionFingerprint } from "../src/services/action-plan.service.js";

test("global vendor aliases normalize before planning", () => {
  for (const [alias, vendor] of [["linux_edge","linux"],["linux-server","linux"],["routeros","mikrotik"],["fortios","fortigate"],["ios-xe","cisco"],["junos","juniper"],["pan-os","paloalto"],["windows-server","windows"]]) assert.equal(normalizeVendor(alias), vendor);
});
test("Persian AI requests select controlled Linux intents", () => {
  const open = parseAiIntent("پورت 55000 رو باز کن"); assert.equal(open?.intentType, "open_port"); assert.equal(open?.parameters.port, 55000);
  const service = parseAiIntent("وضعیت nginx رو ببینم"); assert.equal(service?.intentType, "linux_check_service_status"); assert.equal(service?.parameters.serviceName, "nginx");
  assert.ok(COMMAND_CATALOG.some((x) => x.actionType === "linux_open_port" && x.implementationState === "implemented"));
});
test("daily check selects vendor profile, groups output, and labels unsupported honestly", () => {
  assert.equal(getVendorDailyCheckProfile("routeros")?.vendor, "mikrotik"); assert.equal(getVendorDailyCheckProfile("linux_edge")?.vendor, "linux");
  const result = buildDailyCheckResult({ deviceId: "linux-1", vendor: "linux", outputs: [{ template: "linux daily check", stdout: "uptime ok\nservices active", exitCode: 0 }] });
  assert.ok(result.sections.length >= 5); assert.equal(result.executedTemplates.length, 1);
  const fortigate = buildDailyCheckResult({ deviceId: "forti-1", vendor: "fortigate" }); assert.equal(fortigate.overallStatus, "needs_review"); assert.ok(fortigate.sections.every((section) => section.status === "not_checked"));
});
test("preview fingerprint ignores generated metadata and output", () => {
  const base = { actionType: ActionType.linux_daily_check, deviceId: "d1", parametersJson: { vendor: "linux", metadata: { catalogCommandId: "linux.daily-check", executionTemplateRef: "linux_daily_check", normalizedParams: {} } } };
  const changed = { ...base, parametersJson: { ...base.parametersJson, metadata: { ...base.parametersJson.metadata, status: "preview", translatedLabel: "x", generatedRemoteCommand: "ignored" } } };
  assert.equal(actionExecutionFingerprint(base as never), actionExecutionFingerprint(changed as never));
});
