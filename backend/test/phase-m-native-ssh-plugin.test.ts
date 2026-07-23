import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, root), "utf8");

test("Phase M LocalSsh TypeScript contract exposes only native-plugin SSH operations", () => {
  const contract = read("src/plugins/local-ssh/index.ts");
  assert.match(contract, /registerPlugin<LocalSshPlugin>\("LocalSsh"\)/);
  for (const method of ["getHostKey", "testConnection", "execute", "cancel", "addListener"]) assert.match(contract, new RegExp(method));
  assert.match(contract, /trustedHostKeySha256/);
  assert.match(contract, /credentialRef/);
  assert.doesNotMatch(contract, /password:|privateKey:|StrictHostKeyChecking|acceptAll/i);
});

test("Phase M Android SSH plugin pins host keys and avoids accept-all behavior", () => {
  const java = read("plugins/local-ssh/android/src/main/java/com/firewallsoar/localssh/LocalSshPlugin.java");
  const gradle = read("plugins/local-ssh/android/build.gradle");
  assert.match(gradle, /com\.hierynomus:sshj/);
  assert.match(java, /HostKeyVerifier/);
  assert.match(java, /sha256Fingerprint/);
  assert.match(java, /trustedSha256\.equals/);
  assert.match(java, /closeQuietly/);
  assert.match(java, /LOCAL_SSH_NATIVE_VAULT_HANDOFF_REQUIRED/);
  assert.doesNotMatch(java, /StrictHostKeyChecking\s*=\s*no|PromiscuousVerifier|return true;\s*}/i);
});

test("Phase M iOS SSH plugin source exists and reports honest Windows limitations", () => {
  const swift = read("plugins/local-ssh/ios/Sources/LocalSshPlugin/LocalSshPlugin.swift");
  const manifest = read("plugins/local-ssh/ios/Package.swift");
  assert.match(manifest, /Citadel/);
  assert.match(swift, /trustedHostKeySha256/);
  assert.match(swift, /LOCAL_SSH_IOS_HOST_KEY_PROBE_PENDING_CITADEL_WIRING/);
  assert.match(swift, /LOCAL_SSH_NATIVE_VAULT_HANDOFF_REQUIRED/);
  assert.doesNotMatch(swift, /acceptAll|StrictHostKeyChecking|return true/i);
});

test("Phase M SSH library decision is documented with rejected unsafe approaches", () => {
  const decision = read("docs/mobile-local/SSH_LIBRARY_DECISION.md");
  assert.match(decision, /SSHJ/);
  assert.match(decision, /Citadel/);
  assert.match(decision, /Apache-2\.0/);
  assert.match(decision, /MIT/);
  assert.match(decision, /accept-all/);
  assert.match(decision, /mismatch.*hard-fail/i);
});
