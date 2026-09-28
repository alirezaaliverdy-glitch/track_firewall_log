import assert from "node:assert/strict";
import test from "node:test";
import type { Device } from "@prisma/client";
import { parseSophosDiscovery, createSophosVpn, assertSophosResponse, assertSophosLogin, discoverSophos, normalizeSophosFingerprint, SophosApiError } from "../src/connectors/sophos-api.connector.js";
import { buildSophosVpnXml, normalizeSophosVpn, preflightSophosVpn, resolveSophosVpnSecret } from "../src/connectors/sophos-vpn.js";
import { createEphemeralSecretRef } from "../src/services/ephemeral-secret.service.js";
import { sophosVpnBlueprint } from "../src/guided-actions/vendors/sophos-vpn-blueprint.js";
import { sophosPlanner } from "../src/connectors/vendors/sophos.planner.js";
import { findCatalogItem } from "../src/commands/catalog/index.js";
import { getExecutionTemplate } from "../src/commands/execution/execution-template-registry.js";
import { validateFortiGateGuidedVpnParameters } from "../src/services/fortigate-guided-vpn.schema.js";
import { compileFortiGateGuidedVpnSetup } from "../src/fortigate/command-compiler/guided-vpn.js";
import { assertFortiVpnCreateOnly, fortiEntry, redactFortiVpnOutput } from "../src/fortigate/vpn-safety.js";
import { fortigateSiteToSiteBlueprint } from "../src/guided-actions/vendors/fortigate/fortigate-site-to-site-blueprint.js";
import { activeGuidedFields, validateGuidedValues } from "../src/guided-actions/validators.js";
import { startGuidedActionSession, getGuidedActionSession, cancelGuidedActionSession, buildGuidedActionPlan } from "../src/guided-actions/session-service.js";

const testSecret = "test-only-psk-long-enough";
const input = { vpnName: "Branch_IPsec", wanInterface: "Port2", remoteGateway: "198.51.100.2", localHost: "LocalLAN", remoteHost: "RemoteLAN", profileName: "StrongProfile", localId: "192.0.2.2", remoteId: "198.51.100.2", startupMode: "RespondOnly", enableAfterCreate: false, profileIkev2Confirmed: true };
function parameters() { return { ...input, pskSecretRef: createEphemeralSecretRef(testSecret, "sophos_ipsec_psk") }; }
function response(body: string) { return `<Response APIVersion="2100.1">${body}</Response>`; }
const profileXml = `<VPNProfile><Name>StrongProfile</Name><KeyingMethod>Automatic</KeyingMethod><IKEVersion>IKEv2</IKEVersion><Phase1><EncryptionAlgorithm1>AES256</EncryptionAlgorithm1><AuthenticationAlgorithm1>SHA256</AuthenticationAlgorithm1><SupportedDHGroups><DHGroup>14(DH2048)</DHGroup></SupportedDHGroups></Phase1><Phase2><EncryptionAlgorithm1>AES256</EncryptionAlgorithm1><AuthenticationAlgorithm1>SHA256</AuthenticationAlgorithm1></Phase2></VPNProfile>`;
const inventoryXml = response(`<Interface><Name>WAN</Name><Hardware>Port2</Hardware><NetworkZone>WAN</NetworkZone><Status>Connected</Status><InterfaceStatus>ON</InterfaceStatus></Interface><IPHost><Name>LocalLAN</Name><HostType>Network</HostType><IPFamily>IPv4</IPFamily><IPAddress>10.1.0.0</IPAddress><Subnet>/24(255.255.255.0)</Subnet></IPHost><IPHost><Name>RemoteLAN</Name><HostType>Network</HostType><IPFamily>IPv4</IPFamily><IPAddress>10.2.0.0</IPAddress><Subnet>255.255.255.0</Subnet></IPHost>${profileXml}`);
function configuration(p = parameters()) { return response(buildSophosVpnXml(p, testSecret).replace(/^<Set[^>]*>|<\/Set>$/g, "")); }
function modularReply(request: string, source = inventoryXml) {
  const entity = request.match(/^<Get><([A-Za-z]+)/)?.[1];
  assert.ok(entity);
  const contents = source.replace(/^<Response[^>]*>/, "").replace(/<\/Response>$/, "");
  return response(`<${entity} transactionid="test">${contents}</${entity}>`);
}
const device = { id: "test-sophos", vendor: "sophos", protocol: "api", capabilities: {} } as Device;

test("Sophos discovery uses official nested VPNIPSecConnection, exposes configuration not fake SA and no PSK", () => {
  const snapshot = parseSophosDiscovery(configuration());
  assert.equal(snapshot.vpnConnections[0].name, input.vpnName);
  assert.equal(snapshot.vpnConnections[0].runtimeState, "unknown");
  assert.deepEqual(snapshot.vpnConnections[0].remoteNetworks, [input.remoteHost]);
  assert.ok(!JSON.stringify(snapshot).includes(testSecret));
  assert.equal(parseSophosDiscovery(inventoryXml).vpnProfiles?.[0].phase1Authentication[0], "SHA256");
});
test("XML validation blocks entities, malformed documents and non-API pages", () => {
  assert.throws(() => assertSophosResponse("<html><Response/></html>"));
  for (const xml of ["<html>login</html>", "<Response><broken></Response>", '<!DOCTYPE Response [<!ENTITY x SYSTEM "file:///etc/passwd">]><Response>&x;</Response>']) assert.throws(() => assertSophosResponse(xml));
  assert.doesNotThrow(() => parseSophosDiscovery(response("<VPNIPSecConnection/>")));
});
test("Sophos login must be positively confirmed before any module counts as reachable", () => {
  assert.doesNotThrow(() => assertSophosLogin(response("<Login><status>Authentication Successful</status></Login>")));
  for (const xml of [response("<Login><status>Authentication Failed</status></Login>"), response("<Interface/>"), "<html>login</html>"]) {
    assert.throws(() => assertSophosLogin(xml));
  }
});
test("Sophos certificate pin accepts only a complete SHA-256 fingerprint", () => {
  const hex = "4F2AE929D0FCED2A1684BCCD951C029600D6CA0AA4ACFE57BA872C6FA2962E90";
  assert.equal(normalizeSophosFingerprint(hex.toLowerCase()), hex);
  assert.equal(normalizeSophosFingerprint(hex.match(/../g)!.join(":")), hex);
  for (const value of ["", "AA:BB", "SHA256:abc", "G".repeat(64)]) assert.throws(() => normalizeSophosFingerprint(value), (error: unknown) => error instanceof SophosApiError && error.code === "SOPHOS_INVALID_FINGERPRINT");
});
test("Sophos isolates SFOS 529 per module and never mistakes unread modules for empty inventory", async () => {
  const requests: string[] = [];
  const snapshot = await discoverSophos(device, async (_device, request) => {
    requests.push(request);
    if (request.includes("<Services>")) throw new SophosApiError("SOPHOS_OPERATION_FAILED", "Sophos rejected the operation (API status 529).", 409);
    return modularReply(request);
  });
  assert.equal(requests.length, 8);
  assert.equal(snapshot.interfaces.length, 1);
  assert.ok(snapshot.collectedModules?.includes("Interface"));
  assert.ok(!snapshot.collectedModules?.includes("Services"));
  assert.ok(snapshot.collectionWarnings?.some(value => value.includes("Services") && value.includes("529")));
  assert.ok(requests.every(value => (value.match(/<Get><[A-Za-z]+>/g) ?? []).length === 1));
  await assert.rejects(discoverSophos(device, async (_device, request) => request.includes("<Interface>") || request.includes("<FirewallRule>") || request.includes("<IPHost>") ? Promise.reject(new SophosApiError("SOPHOS_OPERATION_FAILED", "API status 529")) : modularReply(request)), (error: unknown) => error instanceof SophosApiError && error.code === "SOPHOS_DISCOVERY_UNAVAILABLE");
  await assert.rejects(discoverSophos(device, async () => { throw new SophosApiError("SOPHOS_AUTH_FAILED", "Authentication failed"); }), /Authentication failed/);
});
test("Guided build registers executable template, validates parameters and never persists plaintext", () => {
  const result = sophosVpnBlueprint.buildActionPlan({ blueprintId: sophosVpnBlueprint.id, deviceId: device.id, vendor: "sophos", values: { ...input, psk: testSecret } });
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.ok(!JSON.stringify(result).includes(testSecret));
  assert.equal(resolveSophosVpnSecret(result.actionPlanInput.parametersJson), testSecret);
  for (const id of ["sophos.create-ipsec-tunnel", "fortigate.guided-ipsec-site-to-site"]) {
    const item = findCatalogItem(id)!;
    assert.equal(item.supportState, "verified", id);
    assert.ok(getExecutionTemplate(item.executionTemplateRef));
  }
  assert.throws(() => normalizeSophosVpn({ ...parameters(), vpnName: 'bad"<Name>' }));
  assert.throws(() => normalizeSophosVpn({ ...parameters(), profileIkev2Confirmed: false }));
  assert.equal(sophosPlanner.plan({ device, parameters: { metadata: { catalogCommandId: "sophos.unregistered" } }, actionType: "generic_security_action", riskLevel: "high" } as any).status, "unsupported");
});
test("Wizard responses mask the PSK and cancelled sessions cannot build a plan", async () => {
  const start = startGuidedActionSession({ blueprintId: sophosVpnBlueprint.id, deviceId: device.id, vendor: "sophos", initialValues: { ...input, psk: testSecret } });
  assert.ok(start.ok); if (!start.ok) return;
  assert.ok(!JSON.stringify(getGuidedActionSession(start.value.sessionId)).includes(testSecret));
  cancelGuidedActionSession(start.value.sessionId);
  const built = await buildGuidedActionPlan(start.value.sessionId);
  assert.equal(built.ok, false); if (!built.ok) assert.equal(built.error, "SESSION_CLOSED");
});
test("Preflight rejects overlaps, missing WAN, existing tunnel, weak or non-IKEv2 profile", () => {
  const snapshot = parseSophosDiscovery(inventoryXml), p = parameters();
  assert.equal(preflightSophosVpn(p, snapshot).parameters.vpnName, input.vpnName);
  assert.throws(() => preflightSophosVpn(p, { ...snapshot, interfaces: [] }));
  assert.throws(() => preflightSophosVpn(p, { ...snapshot, vpnConnections: [{ name: input.vpnName }] }));
  assert.throws(() => preflightSophosVpn(p, { ...snapshot, ipHosts: snapshot.ipHosts.map(row => ({ ...row, address: "10.1.0.0" })) }));
  for (const xml of [inventoryXml.replace(/SHA256/g, "MD5"), inventoryXml.replace("IKEv2", "IKEv1"), inventoryXml.replace("14(DH2048)", "5(DH1536)")]) assert.throws(() => preflightSophosVpn(p, parseSophosDiscovery(xml)));
  assert.throws(() => resolveSophosVpnSecret({ ...p, pskSecretRef: createEphemeralSecretRef(testSecret, "other_purpose") }));
});
test("Mock transport creates only after fresh checks, re-reads and verifies actual configuration", async () => {
  const p = parameters(); let calls = 0, wrote = false;
  const result = await createSophosVpn(device, p, async (_device, xml) => {
    calls++;
    if (xml.startsWith("<Get")) return wrote ? configuration(p) : modularReply(xml);
    if (xml.startsWith("<Set")) { assert.match(xml, /^<Set operation="add"><VPNIPSecConnection>/); assert.ok(xml.includes(testSecret)); wrote = true; return response('<Status code="200">OK</Status>'); }
    return configuration(p);
  });
  assert.equal(calls, 10); assert.equal(result.verified, true); assert.equal(result.runtimeState, "unknown");
  assert.ok(!JSON.stringify(result).includes(testSecret));
  let writes = 0;
  await assert.rejects(createSophosVpn(device, p, async (_device, xml) => { if (xml.startsWith("<Set")) writes++; return modularReply(xml, configuration(p)); }), /ALREADY_EXISTS/);
  assert.equal(writes, 0);
  await assert.rejects(createSophosVpn({ ...device, capabilities: { sophosTlsVerify: false } }, p, async () => inventoryXml), /Verified HTTPS/);
});
test("Write rejection, unacknowledged response and mismatched readback never report success", async () => {
  for (const bad of [response('<Status code="500">failed</Status>'), response("<Login>OK</Login>")]) {
    let calls = 0;
    await assert.rejects(createSophosVpn(device, parameters(), async (_device, xml) => { calls++; return xml.startsWith("<Get") ? modularReply(xml) : bad; }));
    assert.equal(calls, 9);
  }
  let calls = 0, wrote = false;
  await assert.rejects(createSophosVpn(device, parameters(), async (_device, xml) => { calls++; if (xml.startsWith("<Set")) { wrote = true; return response('<Status code="200">OK</Status>'); } return wrote ? configuration().replace("RespondOnly", "Initiate") : modularReply(xml); }), /POST_VERIFY_FAILED/);
  assert.equal(calls, 10);
});
test("XML payload escapes text and PSK; an injected XML tag cannot become an object", () => {
  const xml = buildSophosVpnXml({ ...parameters(), profileName: "AES & Strong" }, "test-secret-<x>&long");
  assert.ok(xml.includes("AES &amp; Strong")); assert.ok(xml.includes("&lt;x&gt;&amp;")); assert.ok(!xml.includes("<x>"));
});
const forti = { vpnName: "BranchVPN", wanInterface: "wan1", lanInterface: "lan1", remoteGateway: "198.51.100.2", localSubnet: "10.1.0.0/24", remoteSubnet: "10.2.0.0/24", pskSecretRef: "safe-reference", createFirewallPolicy: true, enableAfterCreate: false };
test("VPN forms accept valid names and networks even when they match example text", () => {
  for (const blueprint of [sophosVpnBlueprint, fortigateSiteToSiteBlueprint]) {
    for (const field of blueprint.steps.flatMap(step => step.fields).filter(field => field.placeholderFa)) {
      const active = activeGuidedFields([{ id: "test", titleFa: "test", fields: [field] }], { vpnType: "ipsec_site_to_site", authMethod: "psk" });
      assert.deepEqual(validateGuidedValues(active, { [field.key]: field.placeholderFa }), [], field.key);
    }
  }
  assert.equal(sophosVpnBlueprint.buildActionPlan({ blueprintId: sophosVpnBlueprint.id, deviceId: device.id, vendor: "sophos", values: { ...input, psk: ` ${testSecret}` } }).ok, false);
});
test("Forti parameters reject host bits, overlaps, noncontiguous mask, invalid names and weak groups", () => {
  assert.equal(validateFortiGateGuidedVpnParameters(forti).issues.length, 0);
  for (const change of [{ vpnName: "more-than-fifteen-chars" }, { localSubnet: "10.1.0.5/24" }, { remoteSubnet: "10.1.0.0/25" }, { localSubnet: "10.1.0.0 255.0.255.0" }, { dhGroup: "5" }, { ikeVersion: "1" }, { routeDistance: "NaN" }]) assert.ok(validateFortiGateGuidedVpnParameters({ ...forti, ...change }).issues.length > 0);
  assert.ok(validateFortiGateGuidedVpnParameters(forti, new Set()).issues.length > 0);
});
test("Forti compiler uses IKEv2, PFS/DH, DPD and correct administrative disable, not invalid phase status", () => {
  const plan = compileFortiGateGuidedVpnSetup({ parameters: forti, riskLevel: "high" });
  const phase2 = plan.commandSpecs.find(row => row.template.startsWith("config vpn ipsec phase2"))!.command;
  assert.match(phase2, /set pfs enable/); assert.match(phase2, /set dhgrp 14/); assert.doesNotMatch(phase2, /set status/);
  assert.ok(plan.commandSpecs.some(row => row.template.includes("administrative") && row.command.includes("set status down")));
  assert.match(plan.commandSpecs[0].command, /set dpd on-idle/);
  const policy = plan.commandSpecs.find(row => row.template.startsWith("config firewall policy"))!.command;
  assert.match(policy, /set name "BranchVPN-lan-to-vpn"/);
  assert.match(policy, /set name "BranchVPN-vpn-to-lan"/);
});
test("Forti safety scopes entries, blocks collisions and scrubs echoed and encrypted PSKs", () => {
  const entry = 'edit "BranchVPN"\nset psksecret ENC test-secret\nnext';
  assert.equal(fortiEntry(entry, "Branch"), ""); assert.ok(fortiEntry(entry, "BranchVPN"));
  assert.ok(!redactFortiVpnOutput(entry).includes("test-secret")); assert.equal(redactFortiVpnOutput(testSecret, testSecret), "[secret]");
  assert.throws(() => assertFortiVpnCreateOnly({ ...forti, phase1Name: "BranchVPN", phase2Name: "BranchVPN-p2" }, { phase1: entry, phase2: "", interfaces: "", addresses: "", policies: "" }, []), /ALREADY_EXISTS/);
});
