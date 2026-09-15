import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync(new URL("../../src/components/layout/AppShell.tsx", import.meta.url), "utf8");
const motionComponent = new URL("../../src/components/layout/SectionMotion.tsx", import.meta.url);
const motionStyles = new URL("../../src/components/layout/SectionMotion.css", import.meta.url);

test("the global decorative motion rail is absent from every shell-backed page", () => {
  assert.doesNotMatch(shell, /SectionMotion|section-motion|data-motion-scene/);
  assert.equal(existsSync(motionComponent), false);
  assert.equal(existsSync(motionStyles), false);
});

test("the shell keeps a single content region without a decorative spacer", () => {
  assert.match(shell, /<main className="platform-content">\s*\{children\}\s*<\/main>/);
});
