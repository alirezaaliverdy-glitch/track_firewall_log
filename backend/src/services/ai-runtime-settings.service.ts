import { readFileSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { decryptSecret, encryptSecret } from "./credential-crypto.service.js";

const settingsPath = () => resolve(process.env.AI_SETTINGS_FILE || resolve(env.uploadDir, "..", "settings", "openrouter.json"));
type StoredSettings = { version: number; enabled: boolean; model: string; keyEncrypted: string; updatedAt: string };
function stored(): StoredSettings | null {
  try {
    if (statSync(settingsPath()).size > 16_384) throw new Error();
    const value = JSON.parse(readFileSync(settingsPath(), "utf8")) as StoredSettings;
    if (value.version !== 1 || typeof value.enabled !== "boolean" || typeof value.keyEncrypted !== "string" || !/^[a-zA-Z0-9_./:-]{1,180}$/.test(value.model)) throw new Error();
    return value;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw new Error("AI_SETTINGS_UNAVAILABLE");
  }
}
export function getAiRuntimeSettings() {
  const value = stored();
  return value ? { provider: value.enabled ? "openai_compatible" : "mock", apiKey: decryptSecret(value.keyEncrypted), model: value.model, baseUrl: "https://openrouter.ai/api/v1", fallbackModels: [], source: "settings", enabled: value.enabled } : {
    provider: env.aiProvider, apiKey: env.openaiApiKey, model: env.openaiModel, baseUrl: env.openaiBaseUrl, fallbackModels: env.openaiFallbackModels, source: "environment", enabled: env.aiProvider !== "mock",
  };
}
export function publicAiRuntimeSettings() {
  const value = getAiRuntimeSettings();
  return { enabled: value.enabled, model: value.model, keyConfigured: Boolean(value.apiKey), source: value.source, destination: "openrouter.ai", executionAllowed: false };
}
export async function saveAiRuntimeSettings(input: Record<string, unknown>) {
  const previous = stored();
  if (typeof input.enabled !== "boolean" || typeof input.model !== "string" || !/^[a-zA-Z0-9_./:-]{1,180}$/.test(input.model)) throw new Error("AI_SETTINGS_INVALID");
  if (input.enabled && input.externalDataConsent !== true) throw new Error("AI_DATA_CONSENT_REQUIRED");
  const key = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (key && (!/^sk-or-v1-[a-zA-Z0-9_-]{20,200}$/.test(key))) throw new Error("AI_KEY_INVALID");
  const keyEncrypted = key ? encryptSecret(key) : previous?.keyEncrypted || (env.openaiApiKey ? encryptSecret(env.openaiApiKey) : "");
  if (input.enabled && !keyEncrypted) throw new Error("AI_KEY_REQUIRED");
  const value: StoredSettings = { version: 1, enabled: input.enabled, model: input.model, keyEncrypted, updatedAt: new Date().toISOString() };
  const path = settingsPath(), temporary = `${path}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
  await rename(temporary, path);
  return publicAiRuntimeSettings();
}
