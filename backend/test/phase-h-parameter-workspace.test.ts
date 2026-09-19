import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getActionParameterSchema, listActionParameterSchemas } from "../src/actions/parameter-schema-registry.js";

test("Phase H parameter schema registry covers initial vendor workflow families", () => {
  const schemas = listActionParameterSchemas();
  for (const vendor of ["cisco", "mikrotik", "fortigate", "linux"]) {
    assert.ok(schemas.some((schema) => schema.vendor === vendor), vendor);
  }

  const ciscoVlan = getActionParameterSchema({
    vendor: "Cisco",
    actionType: "custom_vendor_action",
    parametersJson: { customCommandPlan: { schema: "ai_custom_connector_plan_v1", typedParameters: { operation: "create_vlan" } } },
  });
  assert.equal(ciscoVlan.vendor, "cisco");
  assert.equal(ciscoVlan.actionType, "create_vlan");
  assert.deepEqual(ciscoVlan.fields.map((field) => field.key), ["vlanId", "name"]);

  const inferred = getActionParameterSchema({
    vendor: "MikroTik",
    actionType: "custom_vendor_action",
    parametersJson: { missingFields: ["identity"] },
  });
  assert.deepEqual(inferred.fields.map((field) => field.key), ["identity"]);

  const fortigateVpn = schemas.find((schema) => schema.vendor === "fortigate" && schema.actionType === "ipsec_vpn");
  assert.ok(fortigateVpn);
  assert.ok(fortigateVpn.secretFields.includes("pskRef"));
});

test("Phase H parameter workspace has backend route and dedicated frontend route", () => {
  const backendRoute = readFileSync(new URL("../src/routes/actions.ts", import.meta.url), "utf8");
  assert.match(backendRoute, /\/api\/actions\/:id\/parameter-schema/);
  assert.match(backendRoute, /getActionParameterSchema/);

  const routes = readFileSync(new URL("../../src/routes/appRoutes.tsx", import.meta.url), "utf8");
  assert.match(routes, /\/actions\/:actionId\/configure/);
  assert.match(routes, /ActionConfigurePage/);

  const page = readFileSync(new URL("../../src/features/actions/pages/ActionConfigurePage.tsx", import.meta.url), "utf8");
  assert.match(page, /getActionParameterSchema/);
  assert.match(page, /correctActionFields/);
  assert.match(page, /dryRunAction/);
  assert.match(page, /autoComplete=\{activeField\.secure/);
  assert.match(page, /مرحله \$\{step \+ 1\} از \$\{schema\.fields\.length\}/);
  assert.doesNotMatch(page, /localStorage|IndexedDB/);
});
