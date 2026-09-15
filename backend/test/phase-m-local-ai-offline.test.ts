import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, root), "utf8");

test("Phase M local AI providers are optional and secret references stay vault-only", () => {
  const source = read("src/mobile-local/ai/LocalAiProviders.ts");
  assert.match(source, /LocalAiProviderMode = "catalog-only" \| "byok-cloud" \| "lan-openai-compatible" \| "future-on-device"/);
  assert.match(source, /apiKeyVaultRef/);
  assert.match(source, /LOCAL_AI_API_KEY_VAULT_REF_REQUIRED/);
  assert.match(source, /LOCAL_AI_VAULT_REF_MUST_NOT_CONTAIN_SECRET/);
  assert.match(source, /redactAiPayload/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|IndexedDB|document\.cookie/);
});

test("Phase M local AI cannot execute or call SSH directly", () => {
  const ai = read("src/mobile-local/ai/LocalAiProviders.ts");
  const runtime = read("src/mobile-local/LocalMobileRuntime.ts");
  assert.doesNotMatch(ai, /LocalSsh|executePlan|startExecution|fetch\(|sendAiMessage|requestJson/);
  assert.match(ai, /CreatePlanInput/);
  assert.match(ai, /planInputForMonitoring/);
  assert.match(runtime, /evaluateLocalPolicyGuard/);
  assert.match(runtime, /this\.ssh\.startExecution/);
});

test("Phase M local AI offline fallback is catalog-first and VPS-independent", () => {
  const source = read("src/mobile-local/ai/LocalAiProviders.ts");
  assert.match(source, /createOfflineFallbackDraft/);
  assert.match(source, /providerMode: "catalog-only"/);
  assert.match(source, /destination: "none"/);
  assert.match(source, /LOCAL_AI_PROVIDER_TRANSPORT_NOT_BOUND_TO_EXECUTION/);
  assert.match(source, /LOCAL_VENDOR_TEMPLATES/);
  assert.match(source, /offlineFallbackUsed: true/);
});
