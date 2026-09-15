import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const conversationService = readFileSync(
  new URL("../src/ai/assistant/assistant-conversation.service.ts", import.meta.url),
  "utf8"
);
const intentService = readFileSync(
  new URL("../src/services/ai-intent.service.ts", import.meta.url),
  "utf8"
);
const route = readFileSync(new URL("../src/routes/ai.ts", import.meta.url), "utf8");

test("AI chat routes bind every session operation to the authenticated user", () => {
  assert.match(route, /userId: request\.authUser\?\.id \?\? null/);
  assert.match(route, /listAiChatSessions\(request\.authUser\?\.id \?\? null\)/);
  assert.match(route, /getAiChatSession\(request\.params\.id, request\.authUser\?\.id \?\? null\)/);
  assert.match(route, /clearAiChatSessionMessages\(request\.params\.id, request\.authUser\?\.id \?\? null\)/);
});

test("AI session reuse, reads, and deletion require matching ownership", () => {
  assert.match(conversationService, /findFirst\(\{ where: \{ id: sessionId, userId \} \}\)/);
  assert.match(conversationService, /data: \{[\s\S]*title: titleFromMessage\(message\),[\s\S]*userId/);
  assert.match(conversationService, /findMany\(\{[\s\S]*where: \{ userId \}/);
  assert.match(conversationService, /findFirst\(\{[\s\S]*where: \{ id, userId \}/);
});

test("AI intent reads and mutations inherit the owning chat session boundary", () => {
  assert.match(intentService, /where: \{ session: \{ userId \} \}/);
  assert.match(intentService, /where: \{ id, session: \{ userId \} \}/);
  assert.match(intentService, /const owned = await prisma\.aiActionIntent\.findFirst/);
  assert.match(route, /updateAiActionIntent\(request\.params\.id, request\.body \?\? \{\}, request\.authUser\?\.id \?\? null\)/);
  assert.match(route, /completeAiActionRequest\(request\.params\.id, request\.body \?\? \{\}, request\.authUser\?\.id \?\? null\)/);
});
