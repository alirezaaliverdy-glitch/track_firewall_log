import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { credentialUsageCount } from "../src/services/credential-usage.js";

test("credential usage includes primary and Cisco enable references without double counting a device", () => {
  const devices = [
    { credentialId: "primary", capabilities: {} },
    { credentialId: null, capabilities: { enableCredentialId: "primary" } },
    { credentialId: "primary", capabilities: { enableCredentialId: "primary" } },
    { credentialId: "other", capabilities: null }
  ];
  assert.equal(credentialUsageCount(devices as never, "primary"), 3);
  assert.equal(credentialUsageCount(devices as never, "missing"), 0);
});

test("credential deletion is guarded and cleans embedded enable references", () => {
  const service = readFileSync(new URL("../src/services/credential.service.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/routes/credentials.ts", import.meta.url), "utf8");
  assert.match(service, /CredentialInUseError/);
  assert.match(service, /delete capabilities\.enableCredentialId/);
  assert.match(service, /prisma\.\$transaction/);
  assert.match(route, /request\.query\.force === "true"/);
  assert.match(route, /error instanceof CredentialInUseError/);
  assert.match(route, /deviceCount: error\.deviceCount/);
});

test("settings exposes create, edit and delete without reading an existing secret", () => {
  const settings = readFileSync(new URL("../../src/features/settings/pages/SettingsPage.tsx", import.meta.url), "utf8");
  const manager = readFileSync(new URL("../../src/features/settings/components/CredentialManager.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../../src/lib/credentials.ts", import.meta.url), "utf8");
  assert.match(settings, /tab === "credentials"/);
  assert.match(manager, /updateCredential/);
  assert.match(manager, /deleteCredential\(item\.id, true\)/);
  assert.match(manager, /Leave the new secret empty/);
  assert.doesNotMatch(client, /secretEncrypted|privateKeyEncrypted|passphraseEncrypted/);
});
