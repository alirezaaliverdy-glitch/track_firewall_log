import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Cisco create VLAN resolves to a supported catalog ActionPlan candidate", () => {
  const resolver = read("../src/ai/ai-template-resolver.ts");
  const catalog = read("../src/commands/catalog/index.ts");
  const ciscoRegistry = read("../src/cisco/cisco-operation-registry.ts");
  const executionRegistry = read("../src/commands/execution/execution-template-registry.ts");

  assert.match(resolver, /if \(vendor === "cisco"\) return "cisco-ios-xe-ssh"/);
  assert.match(resolver, /resolveSelectedDeviceCatalogItem\(userText: string, vendor: string\)/);
  assert.match(resolver, /vendor === "cisco"[\s\S]*includesAny\(text, \["vlan"\]\)[\s\S]*findCatalogItemById\("cisco\.create-vlan"\)/);
  assert.match(resolver, /selectedDeviceCatalogItem\?\.supportState === "verified"[\s\S]*mode: missingFields\.length \? "needs_input" : "executable_action_plan"/);
  assert.match(ciscoRegistry, /implementedCli\("create-vlan"/);
  assert.match(ciscoRegistry, /executionTemplateRef: `cisco_\$\{slug\.replace/);
  assert.match(catalog, /CISCO_OPERATION_REGISTRY\.map/);
  assert.match(executionRegistry, /executableCiscoOperations\(\)\.map/);
  assert.match(executionRegistry, /connectorType: "cisco-ios-xe-ssh"/);
});

test("FortiGate create policy resolves to a supported catalog ActionPlan candidate before guided fallback", () => {
  const resolver = read("../src/ai/ai-template-resolver.ts");
  const router = read("../src/ai/persian-intent-router.ts");
  const catalog = read("../src/commands/catalog/index.ts");
  const routedIndex = resolver.indexOf("const routed = routePersianIntent");
  const guidedIndex = resolver.indexOf("const guidedVendor = selectedVendor");

  assert.ok(routedIndex > 0);
  assert.ok(guidedIndex > routedIndex);
  assert.match(router, /actionType: "fortigate_create_policy"/);
  assert.match(router, /executionTemplateRef: "fortigate_create_policy"/);
  assert.match(router, /requiredParams: \["srcintf", "dstintf", "srcaddr", "dstaddr", "services"\]/);
  assert.match(catalog, /fullControlFortiGateItems/);
  assert.match(catalog, /entry\.actionType\.replace/);
});

test("unsupported custom Cisco request stays in Assistant without a vendor catalog match", () => {
  const resolver = read("../src/ai/ai-template-resolver.ts");

  assert.match(resolver, /canUseCatalogActionType\(actionType: string\)/);
  assert.match(resolver, /actionType !== "generic_security_action" && actionType !== "custom_vendor_action"/);
  assert.match(resolver, /vendor === "cisco"[\s\S]*includesAny\(text, \["vlan"\]\)/);
  assert.match(resolver, /catalogCommandId: null,[\s\S]*executionTemplateRef: null,[\s\S]*catalogItem: null/);
  assert.doesNotMatch(resolver, /findCatalogItemByIntent\(canonicalVendor, resolvedActionType\);/);
});

test("normal informational question stays chat-only", () => {
  const resolver = read("../src/ai/ai-template-resolver.ts");
  const chat = read("../src/services/ai-chat.service.ts");

  assert.match(resolver, /rawActionType[\s\S]*generic_security_action/);
  assert.match(resolver, /const item = canUseCatalogActionType\(resolvedActionType\) \? findCatalogItemByIntent\(canonicalVendor, resolvedActionType\) : null/);
  assert.match(chat, /unsupportedForSelectedDeviceMessageFa/);
  assert.match(chat, /selectedDeviceUnsupportedMessage \?\? providerResponse\.assistantMessage/);
});

test("AI chat creates ActionPlans only for verified supported catalog matches", () => {
  const chat = read("../src/services/ai-chat.service.ts");

  assert.match(chat, /const canCreateSupportedActionPlan = Boolean\(/);
  assert.match(chat, /resolution\.catalogItem\?\.supportState === "verified"/);
  assert.match(chat, /selectedDeviceSupportsConnector\(selectedDevice, resolution\.connectorType\)/);
  assert.match(chat, /resolution\.mode === "executable_action_plan" \|\| resolution\.mode === "needs_input"/);
  assert.match(chat, /requiredParamsSatisfied: resolutionMissing\.length === 0/);
  assert.match(chat, /missingFields: resolutionMissing/);
  assert.match(chat, /actionSessionId: null/);
  assert.match(chat, /guidedActionUrl: null/);
});

test("AI propose route also creates a plan before offering guided parameters", () => {
  const route = read("../src/routes/command-catalog.ts");

  assert.match(route, /const createMappedPlan = \(\) => proposeActionPlan/);
  assert.match(route, /const actionPlan = await createMappedPlan\(\);[\s\S]*mode: "guided_workflow"/);
  assert.match(route, /actionPlanId: actionPlan\.id/);
  assert.match(route, /actionPlan,/);
  assert.match(route, /selectedDeviceSupportsConnector\(device, resolution\.connectorType\)/);
});
