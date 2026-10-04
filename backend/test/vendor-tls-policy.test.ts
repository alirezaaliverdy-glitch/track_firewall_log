import assert from "node:assert/strict";
import test from "node:test";
import type { Device } from "@prisma/client";
import { assertMikroTikRestTlsPolicy } from "../src/connectors/mikrotik-rest.connector.js";
import { assertSophosTlsPolicy } from "../src/connectors/sophos-api.connector.js";

function device(capabilities: Record<string, unknown>): Device {
  return { capabilities } as Device;
}

test("RouterOS REST refuses an explicit certificate-verification bypass", () => {
  assert.throws(() => assertMikroTikRestTlsPolicy(device({ mikrotikTlsVerify: false })), { code: "MIKROTIK_REST_TLS_VERIFICATION_REQUIRED" });
  assert.doesNotThrow(() => assertMikroTikRestTlsPolicy(device({})));
  assert.doesNotThrow(() => assertMikroTikRestTlsPolicy(device({ mikrotikTlsVerify: true })));
});

test("Sophos refuses unverified TLS but permits trusted CA or certificate pin", () => {
  assert.throws(() => assertSophosTlsPolicy(device({ sophosTlsVerify: false })), { code: "SOPHOS_TLS_VERIFICATION_REQUIRED" });
  assert.doesNotThrow(() => assertSophosTlsPolicy(device({})));
  assert.doesNotThrow(() => assertSophosTlsPolicy(device({ sophosTlsVerify: false, sophosCaCertificate: "-----BEGIN CERTIFICATE-----" })));
  assert.doesNotThrow(() => assertSophosTlsPolicy(device({ sophosTlsVerify: false, sophosTlsFingerprint: "A".repeat(64) })));
});
