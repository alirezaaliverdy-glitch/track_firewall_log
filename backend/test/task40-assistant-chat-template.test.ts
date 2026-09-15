import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

const messages = read("src/features/assistant/components/AssistantMessageList.tsx");
const styles = read("src/features/assistant/components/AssistantMessageList.css");
const panel = read("src/components/ai/AiSecurityAssistantPanel.tsx");

test("Assistant chat uses the quiet alternating bubble template", () => {
  assert.match(panel, /className="assistant-chat-thread"/);
  assert.match(messages, /assistant-chat-message--\$\{isUser \? "user" : "assistant"\}/);
  assert.match(messages, /aria-label=\{`\$\{sender\} · \$\{sentAt\}`\}/);
  assert.doesNotMatch(messages, /UserRound|<Bot|<time/);
  assert.match(styles, /\.assistant-chat-message--user/);
  assert.match(styles, /\.assistant-chat-message--assistant/);
  assert.match(styles, /margin-inline-start: auto/);
  assert.match(styles, /margin-inline-end: auto/);
});

test("Assistant chat stays readable on narrow screens", () => {
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /width: min\(92%, 34rem\)/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(styles, /white-space: pre-wrap/);
});
