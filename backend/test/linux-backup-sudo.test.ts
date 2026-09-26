import assert from "node:assert/strict";
import test from "node:test";
import type { Client } from "ssh2";
import { collectLinuxBackup, BackupError } from "../src/backups/backup-collector.js";

test("Linux backup retries only a permission failure using fixed noninteractive sudo", async () => {
  const calls: string[] = [];
  const read = async (_client: Client, command: string) => {
    calls.push(command);
    if (!command.startsWith("sudo -n ")) throw new BackupError("BACKUP_PERMISSION_DENIED");
    return Buffer.from("archive");
  };
  assert.deepEqual(await collectLinuxBackup({} as Client, false, read), Buffer.from("archive"));
  assert.deepEqual(calls, ["tar -czf - -C / etc", "sudo -n tar -czf - -C / etc"]);
  calls.length = 0;
  await collectLinuxBackup({} as Client, true, read);
  assert.deepEqual(calls, ["sudo -n tar -czf - -C / etc"]);
  let attempted = 0;
  await assert.rejects(collectLinuxBackup({} as Client, false, async () => {
    attempted++; throw new BackupError("BACKUP_SOURCE_CHANGED");
  }), /BACKUP_SOURCE_CHANGED/);
  assert.equal(attempted, 1);
  await assert.rejects(collectLinuxBackup({} as Client, true, async () => {
    throw new BackupError("BACKUP_SUDO_REQUIRED");
  }), /BACKUP_SUDO_REQUIRED/);
});
