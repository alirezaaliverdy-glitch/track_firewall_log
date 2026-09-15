import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSecurityOrchestratorSystemPrompt } from "../src/ai/prompts/security-orchestrator-system-prompt.js";

test("chat prompt is conversational and cannot create an ActionPlan", () => {
  const prompt = buildSecurityOrchestratorSystemPrompt({
    assistantMode: "chat",
    selectedConversationContext: { vendor: "linux", deviceName: "linux-edge-1" },
    availableCatalogActions: [],
  });

  assert.match(prompt, /CHAT_ONLY MODE/);
  assert.match(prompt, /normal multi-turn conversation/);
  assert.match(prompt, /shouldCreateIntent=false and intent=null/);
  assert.match(prompt, /natural conversational prose/);
  assert.doesNotMatch(prompt, /put a JSON analysis object in assistantMessage/);
  assert.match(prompt, /Selected conversation context:.*linux-edge-1/);
  assert.doesNotMatch(prompt, /Always try to create an ActionPlan or ActionIntent/);
});

test("chat requires a live provider instead of returning a canned fallback", () => {
  const service = readFileSync(new URL("../src/ai/assistant/assistant-conversation.service.ts", import.meta.url), "utf8");
  const providerService = readFileSync(new URL("../src/services/ai-provider.service.ts", import.meta.url), "utf8");

  assert.match(service, /mode: "chat",[\s\S]*requireLiveResponse: true,[\s\S]*conversationHistory/);
  assert.match(service, /getAiProviderStatus\(providerResponse\.error, true\)/);
  assert.match(providerService, /if \(requireLiveResponse\) \{[\s\S]*throw new AiProviderFailedError/);
  assert.match(providerService, /کمی بعد دوباره تلاش کنید/);
  assert.match(providerService, /return deterministicProviderFallback\(input, keyConfigured, lastError\)/);
});

test("chat transport sends bounded history and UI follows the latest reply", () => {
  const service = readFileSync(new URL("../src/ai/assistant/assistant-conversation.service.ts", import.meta.url), "utf8");
  const provider = readFileSync(new URL("../src/services/providers/openai-compatible.provider.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/routes/ai.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../../src/components/ai/AiSecurityAssistantPanel.tsx", import.meta.url), "utf8");

  assert.match(service, /CHAT_HISTORY_LIMIT = 12/);
  assert.match(service, /recentMessages\.reverse\(\)\.map/);
  assert.match(service, /mode: "chat",[\s\S]*conversationHistory/);
  assert.match(provider, /\.\.\.conversationMessages/);
  assert.match(provider, /input\.mode === "chat" \? 0\.35 : 0\.1/);
  assert.match(provider, /return await requestThroughHttpProxy/);
  assert.match(provider, /return requestDirectly\(url, input\)/);
  assert.match(route, /selectedVendor: request\.body\?\.selectedVendor/);
  assert.match(ui, /chatViewportRef/);
  assert.match(ui, /viewport\.scrollTo\(\{ top: viewport\.scrollHeight, behavior: "smooth" \}\)/);
  assert.match(ui, /providerIsLive/);
  assert.match(ui, /providerStatus\?\.liveVerified/);
  assert.match(ui, /No canned fallback was shown/);
});
