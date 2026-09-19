import assert from "node:assert/strict";
import test from "node:test";
import { DeviceEnvironment, DeviceProtocol, DeviceStatus, DeviceType, type Device } from "@prisma/client";
import { mikrotikRestConnector } from "../src/connectors/mikrotik-rest.connector.js";
import { getConnectionProfile, listConnectionProfiles, onboardingMethodFor } from "../src/vendors/connection-method.registry.js";

test("connection catalog exposes an honest profile for every onboarded vendor", () => {
  const profiles = listConnectionProfiles();
  assert.deepEqual(profiles.map((profile) => profile.vendor).sort(), ["cisco", "fortigate", "linux", "mikrotik", "sophos"]);
  for (const profile of profiles) {
    assert.ok(profile.methods.some((method) => method.selectable && method.readiness === "ready"), `${profile.vendor} needs an executable onboarding method`);
    assert.ok(profile.methods.every((method) => method.prerequisites.length === method.prerequisitesFa.length));
  }
});

test("MikroTik exposes SSH control and RouterOS REST read-only onboarding", () => {
  const profile = getConnectionProfile("mikrotik");
  assert.ok(profile);
  assert.equal(onboardingMethodFor("mikrotik", "ssh")?.protocol, "ssh");
  assert.deepEqual(onboardingMethodFor("mikrotik", "rest_api"), { protocol: "api", port: 443 });
  assert.equal(onboardingMethodFor("mikrotik", "snmpv3"), null);
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
