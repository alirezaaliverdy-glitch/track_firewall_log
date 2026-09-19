import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { bearerSessionToken, NATIVE_APP_ORIGINS } from "../src/security/session-transport.js";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("Android bearer transport accepts only generated session-token shape", () => {
  const token = "a".repeat(43);
  assert.equal(bearerSessionToken(`Bearer ${token}`), token);
  assert.equal(bearerSessionToken(`bearer ${token}`), undefined);
  assert.equal(bearerSessionToken("Bearer too-short"), undefined);
  assert.equal(bearerSessionToken([`Bearer ${token}`]), token);
  assert.deepEqual(NATIVE_APP_ORIGINS, ["https://localhost"]);
});

test("Android package uses secure native session and debug-only cleartext policy", () => {
  const session = read("src/mobile/nativeSession.ts");
  const transport = read("src/lib/csrfFetch.ts");
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const debugManifest = read("android/app/src/debug/AndroidManifest.xml");
  const build = read("android/app/build.gradle");
  assert.match(session, /SecureStoragePlugin\.set/);
  assert.doesNotMatch(session, /localStorage/);
  assert.match(transport, /Authorization.*Bearer/);
  assert.match(manifest, /usesCleartextTraffic="false"/);
  assert.match(debugManifest, /usesCleartextTraffic="true"/);
  assert.match(build, /versionName "1\.0\.2"/);
});
