import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, root), "utf8");

test("Phase S Android build keeps local SSH plus secure vault wired", () => {
  const rootGradle = read("android/build.gradle");
  const settings = read("android/capacitor.settings.gradle");
  const capacitorBuild = read("android/app/capacitor.build.gradle");
  assert.match(rootGradle, /com\.android\.tools\.build:gradle:8\./);
  assert.match(settings, /:local-ssh/);
  assert.match(settings, /:capacitor-secure-storage-plugin/);
  assert.match(capacitorBuild, /project\(':local-ssh'\)/);
  assert.match(capacitorBuild, /project\(':capacitor-secure-storage-plugin'\)/);
});

test("Phase S native SSH fixture coverage documents success and failure cases", () => {
  const testSource = read("plugins/local-ssh/android/src/test/java/com/firewallsoar/localssh/LocalSshNativeCoreTest.java");
  for (const token of [
    "successEmitsStepAndCompletionEvents",
    "authenticationFailureIsClassifiedAndClosesTransport",
    "hostKeyMismatchIsClassifiedBeforeCommandsRun",
    "timeoutIsClassifiedAndEmitsTerminalEvent",
    "cancellationReturnsCancelledSummaryAndClosesTransport",
    "recoveryCanResumeObservationFromPersistedExecutingState"
  ]) {
    assert.match(testSource, new RegExp(token));
  }
});

test("Phase S plaintext credentials are excluded from local persistent and logged surfaces", () => {
  const migrations = read("src/mobile-local/persistence/migrations.ts");
  const runtime = read("src/mobile-local/LocalMobileRuntime.ts");
  const core = read("plugins/local-ssh/android/src/main/java/com/firewallsoar/localssh/LocalSshNativeCore.java");
  const plugin = read("plugins/local-ssh/android/src/main/java/com/firewallsoar/localssh/LocalSshPlugin.java");
  assert.doesNotMatch(migrations, /password_value|private_key_value|secret_value|plaintext/i);
  assert.doesNotMatch(runtime, /password|privateKey|secretValue|console\.log/);
  assert.doesNotMatch(plugin, /Log\.(?:d|i|w|e)|System\.out|System\.err/);
  assert.match(core, /\\[redacted\\]/);
});

test("Phase S Android release signing is optional and secret driven", () => {
  const appGradle = read("android/app/build.gradle");
  const gitignore = read(".gitignore");
  assert.match(appGradle, /FIREWALL_RELEASE_STORE_FILE/);
  assert.match(appGradle, /FIREWALL_RELEASE_STORE_PASSWORD/);
  assert.match(appGradle, /FIREWALL_RELEASE_KEY_ALIAS/);
  assert.match(appGradle, /FIREWALL_RELEASE_KEY_PASSWORD/);
  assert.match(appGradle, /releaseSigningReady/);
  assert.match(gitignore, /\*\.jks/);
  assert.match(gitignore, /\*\.aab/);
  assert.match(gitignore, /android\/key\.properties/);
});

test("Phase S GitHub Actions uploads debug APK and secret-gated release AAB artifacts", () => {
  const workflow = read(".github/workflows/android-debug-apk.yml");
  assert.match(workflow, /testDebugUnitTest/);
  assert.match(workflow, /assembleDebug/);
  assert.match(workflow, /bundleRelease/);
  assert.match(workflow, /ANDROID_RELEASE_KEYSTORE_BASE64/);
  assert.match(workflow, /firewall-soar-debug-apk/);
  assert.match(workflow, /firewall-soar-release-aab/);
  assert.match(workflow, /android-test-reports/);
});

test("Phase S M10 acceptance document defines alpha beta gates and iOS macOS work", () => {
  const doc = read("docs/mobile-local/PHASE_S_M10_RELEASE_CANDIDATE.md");
  assert.match(doc, /M10 Acceptance Gates/);
  assert.match(doc, /Internal Alpha Gate/);
  assert.match(doc, /Closed Beta Gate/);
  assert.match(doc, /Remaining iOS Work/);
  assert.match(doc, /macOS and Xcode/);
  assert.match(doc, /android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
  assert.match(doc, /android\/app\/build\/outputs\/bundle\/release\/app-release\.aab/);
});
