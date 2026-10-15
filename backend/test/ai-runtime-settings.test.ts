import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAiRuntimeSettings, publicAiRuntimeSettings, saveAiRuntimeSettings } from "../src/services/ai-runtime-settings.service.js";
import { findMutationPermission } from "../src/security/authorization.js";

test("OpenRouter settings require consent and encrypt keys; status never returns credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eosnet-ai-settings-"));
  const previous = process.env.AI_SETTINGS_FILE;
  process.env.AI_SETTINGS_FILE = join(directory, "openrouter.json");
  const syntheticKey = "sk-or-v1-" + "synthetic_test_not_a_valid_provider_key";
  try {
    await assert.rejects(saveAiRuntimeSettings({ enabled: true, model: "openrouter/free", apiKey: syntheticKey }), /AI_DATA_CONSENT_REQUIRED/);
    await assert.rejects(saveAiRuntimeSettings({ enabled: true, model: "bad model", externalDataConsent: true }), /AI_SETTINGS_INVALID/);
    await saveAiRuntimeSettings({ enabled: true, model: "openrouter/free", apiKey: syntheticKey, externalDataConsent: true });
    const file = await readFile(process.env.AI_SETTINGS_FILE, "utf8");
    assert.equal(file.includes(syntheticKey), false);
    assert.equal(getAiRuntimeSettings().apiKey, syntheticKey);
    assert.deepEqual(Object.keys(publicAiRuntimeSettings()).sort(), ["destination", "enabled", "executionAllowed", "keyConfigured", "model", "source"]);
    if (process.platform !== "win32") assert.equal((await stat(process.env.AI_SETTINGS_FILE)).mode & 0o777, 0o600);
    await saveAiRuntimeSettings({ enabled: false, model: "openrouter/free" });
    assert.equal(getAiRuntimeSettings().provider, "mock");
    assert.equal(getAiRuntimeSettings().apiKey, syntheticKey);
    assert.equal(findMutationPermission("PUT", "/api/ai/provider/config"), "security.policy.manage");
  } finally { if (previous === undefined) delete process.env.AI_SETTINGS_FILE; else process.env.AI_SETTINGS_FILE = previous; await rm(directory, { recursive: true, force: true }); }
});
