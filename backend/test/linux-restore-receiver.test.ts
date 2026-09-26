import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LINUX_ETC_RECEIVER } from "../src/backups/linux-restore-script.js";
import { digest } from "../src/backups/restore-profiles.js";
function fixture(t: any) {
  const directory = mkdtempSync(join(tmpdir(), "soar-restore-receiver-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, "etc"); mkdirSync(root);
  // The exact fixed root is replaced only in this disposable test, never in HTTP input.
  const script = LINUX_ETC_RECEIVER.replace('os.open("/etc",', "os.open(" + JSON.stringify(root) + ",");
  assert.ok(!script.includes('os.open("/etc",'));
  const run = (intent: string, entries: unknown[]) => spawnSync("python3", ["-c", script], { input: JSON.stringify({ intent, entries }), encoding: "utf8" });
  return { root, directory, run };
}
const file = (path: string, content: string) => ({ path, kind: "file", mode: 0o600, uid: 0, gid: 0, link: "", data: Buffer.from(content).toString("base64"), sha256: digest(Buffer.from(content)) });
test("Linux receiver performs read-only preflight, atomic overlay, hash verification and preserves extra files", t => {
  const { root, run } = fixture(t);
  writeFileSync(join(root, "config"), "old"); writeFileSync(join(root, "preserved"), "keep");
  const entries = [file("etc/config", "new"), file("etc/newdir/newconfig", "fixture"),
    { path: "etc/localtime", kind: "symlink", link: "/usr/share/zoneinfo/UTC", uid: 0, gid: 0, mode: 0o777, data: "", sha256: digest(Buffer.alloc(0)) }];
  const preview = run("preflight", entries);
  assert.equal(preview.status, 0, "Python3 root test receiver required");
  assert.equal(readFileSync(join(root, "config"), "utf8"), "old");
  assert.equal(run("apply", entries).status, 0);
  assert.equal(readFileSync(join(root, "config"), "utf8"), "new");
  assert.equal(readFileSync(join(root, "preserved"), "utf8"), "keep");
  assert.equal(readlinkSync(join(root, "localtime")), "/usr/share/zoneinfo/UTC");
  assert.equal(run("verify", entries).status, 0);
  writeFileSync(join(root, "config"), "tampered");
  assert.notEqual(run("verify", entries).status, 0);
});
test("Linux receiver refuses traversal, destination symlinks and hash mismatch before the first write", t => {
  const { root, directory, run } = fixture(t);
  const outside = join(directory, "outside"); mkdirSync(outside); writeFileSync(join(outside, "secret"), "untouched");
  writeFileSync(join(root, "config"), "old"); symlinkSync(outside, join(root, "jump"));
  for (const invalid of [
    file("etc/jump/secret", "changed"), file("etc/../../secret", "changed"),
    { ...file("etc/config", "changed"), sha256: "f".repeat(64) }
  ]) {
    assert.notEqual(run("apply", [file("etc/config", "new"), invalid]).status, 0);
    assert.equal(readFileSync(join(root, "config"), "utf8"), "old");
    assert.equal(readFileSync(join(outside, "secret"), "utf8"), "untouched");
  }
});
