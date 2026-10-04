import assert from "node:assert/strict";
import test from "node:test";
import { DeviceEnvironment, DeviceProtocol, DeviceStatus, DeviceType, type Device } from "@prisma/client";
import { mikrotikRestConnector } from "../src/connectors/mikrotik-rest.connector.js";
import { getConnectionProfile, listConnectionProfiles, onboardingMethodFor } from "../src/vendors/connection-method.registry.js";

test("connection catalog exposes an honest profile for every onboarded vendor", () => {
  const profiles = listConnectionProfiles();
  assert.deepEqual(profiles.map((profile) => profile.vendor).sort(), ["cisco", "esxi", "fortigate", "linux", "mikrotik", "sophos"]);
  for (const profile of profiles) {
    assert.ok(profile.methods.some((method) => method.selectable && method.readiness === "ready"), `${profile.vendor} needs an executable onboarding method`);
    assert.ok(profile.methods.every((method) => method.prerequisites.length === method.prerequisitesFa.length));
    const secondary = profile.methods.find((method) => method.key === profile.recommendedSecondary);
    assert.ok(secondary, `${profile.vendor} needs a documented secondary channel`);
    assert.ok(secondary.purposes.some((purpose) => ["inventory", "telemetry", "events"].includes(purpose)), `${profile.vendor} secondary channel must add data value`);
  }
});

test("unshipped receivers are not advertised as usable, while SNMPv3 requires device setup", () => {
  for (const profile of listConnectionProfiles()) {
    for (const method of profile.methods) {
      if (["syslog", "agent", "restconf", "netconf", "gnmi"].includes(method.key)) {
        assert.equal(method.readiness, "planned", `${profile.vendor}/${method.key} has no executable collector`);
        assert.equal(method.selectable, false);
      }
      if (method.key === "snmpv3") {
        assert.equal(method.readiness, "setup_required");
        assert.equal(method.selectable, false, "SNMPv3 is configured after onboarding, not a management replacement");
      }
    }
  }
  for (const vendor of ["cisco", "fortigate", "mikrotik", "sophos"]) {
    assert.equal(getConnectionProfile(vendor)?.recommendedSecondary, "snmpv3");
  }
});

test("MikroTik exposes SSH control and RouterOS REST read-only onboarding", () => {
  const profile = getConnectionProfile("mikrotik");
  assert.ok(profile);
  assert.equal(onboardingMethodFor("mikrotik", "ssh")?.protocol, "ssh");
  assert.deepEqual(onboardingMethodFor("mikrotik", "rest_api"), { protocol: "api", port: 443 });
  assert.equal(onboardingMethodFor("mikrotik", "snmpv3"), null);
});

test("ESXi exposes separate SSH and standalone SOAP onboarding ports", () => {
  assert.deepEqual(onboardingMethodFor("esxi", "ssh"), {protocol:"ssh",port:22});
  assert.deepEqual(onboardingMethodFor("esxi", "soap_api"), {protocol:"api",port:443});
  assert.deepEqual(getConnectionProfile("esxi")?.methods.find(v=>v.key==="ssh")?.purposes, ["inventory"]);
});

test("RouterOS REST connector is selected only for MikroTik API devices", () => {
  const base: Device = {
    id: "device-1",
    companyId: null,
    deletedAt: null,
    name: "router",
    vendor: "mikrotik",
    type: DeviceType.mikrotik,
    host: "192.0.2.1",
    managementPort: 443,
    protocol: DeviceProtocol.api,
    credentialId: null,
    credentialRef: null,
    environment: DeviceEnvironment.lab,
    tags: [],
    status: DeviceStatus.unknown,
    capabilities: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  assert.equal(mikrotikRestConnector.supports(base), true);
  assert.equal(mikrotikRestConnector.supports({ ...base, protocol: DeviceProtocol.ssh }), false);
  assert.equal(mikrotikRestConnector.supports({ ...base, vendor: "cisco", type: DeviceType.generic_firewall }), false);
});
