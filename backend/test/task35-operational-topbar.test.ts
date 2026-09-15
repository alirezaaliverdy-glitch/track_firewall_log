import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("Task 35 top bar contains useful operational controls and no disabled placeholders", () => {
  const shell = readFileSync(join(process.cwd(), "..", "src", "components", "layout", "AppShell.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "..", "src", "components", "layout", "AppShellTopbar.css"), "utf8");
  assert.doesNotMatch(shell, /platform-search/);
  assert.doesNotMatch(shell, /notificationsUnavailable/);
  assert.match(shell, /className="topbar-current"/);
  assert.match(shell, /className="topbar-device"/);
  assert.match(shell, /to="\/actions" className="topbar-create"/);
  assert.match(shell, /className="topbar-account"/);
  assert.match(css, /@media\(max-width:680px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

