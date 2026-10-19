import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const installer = fileURLToPath(new URL("../../backend/docker-install-tools.sh", import.meta.url));
function simulate(mode) {
  const directory = mkdtempSync(join(tmpdir(), "runtime-tools-"));
  try {
    const calls = join(directory, "calls");
    writeFileSync(join(directory, "apk"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$APK_FIXTURE_CALLS"\ncase "$APK_FIXTURE_MODE:$*" in primary:*) exit 0 ;; fallback:*dl-4.alpinelinux.org*) exit 0 ;; *) exit 17 ;; esac\n', { mode: 0o755 });
    writeFileSync(join(directory, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const result = spawnSync("sh", [installer], { encoding: "utf8", env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, APK_FIXTURE_CALLS: calls, APK_FIXTURE_MODE: mode } });
    return { ...result, calls: readFileSync(calls, "utf8").trim().split("\n") };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
test("working primary repository requires one installation attempt", () => {
  const result = simulate("primary");
  assert.equal(result.status, 0);
  assert.equal(result.calls.length, 1);
});
test("TLS/index failures retry and use signed HTTPS Alpine alternate repositories", () => {
  const result = simulate("fallback");
  assert.equal(result.status, 0);
  assert.equal(result.calls.length, 3);
  assert.ok(result.calls[2].includes("--repositories-file /dev/null"));
  assert.ok(result.calls[2].includes("https://dl-4.alpinelinux.org/"));
  for (const call of result.calls) {
    assert.ok(!/allow-untrusted|no-check-certificate|http:\/\//.test(call));
    assert.ok(call.includes("chromium") && call.includes("ffmpeg") && call.includes("wireguard-tools") && call.includes("xl2tpd") && call.includes("openvpn"));
  }
});
test("unavailable repositories fail without producing an incomplete runtime", () => {
  const result = simulate("failure");
  assert.equal(result.status, 1);
  assert.equal(result.calls.length, 4);
});
