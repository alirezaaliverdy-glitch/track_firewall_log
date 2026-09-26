import type { Client, ClientChannel } from "ssh2";
import { BackupError } from "./backup-collector.js";
// FortiOS exposes sys_config through legacy SCP, not SFTP. No config mutation.
export function readFortigateConfig(client: Client): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let channel: ClientChannel | undefined;
    let settled = false, phase: "header" | "data" | "status" | "done" = "header";
    let pending = Buffer.alloc(0), expected = 0, received = 0;
    const chunks: Buffer[] = [];
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) { channel?.close(); reject(error); } else resolve(Buffer.concat(chunks));
    };
    const fail = () => finish(new BackupError("BACKUP_FORTIGATE_SCP_REQUIRED", 502));
    const timer = setTimeout(() => finish(new BackupError("BACKUP_TIMEOUT", 504)), 60_000);
    client.exec("scp -f sys_config", (error, stream) => {
      if (error) return fail();
      channel = stream;
      if (settled) { stream.close(); return; }
      stream.stderr.on("data", fail);
      stream.on("error", fail);
      stream.on("close", (code: number | undefined) => {
        if (phase !== "done" || received !== expected || code !== 0) fail(); else finish();
      });
      stream.on("data", (chunk: Buffer) => {
        if (settled) return;
        pending = Buffer.concat([pending, Buffer.from(chunk)]);
        if (pending.length > 20 * 1024 * 1024 + 4096) return finish(new BackupError("BACKUP_TOO_LARGE", 413));
        while (pending.length && !settled) {
          if (phase === "header") {
            const newline = pending.indexOf(10);
            if (newline < 0) { if (pending.length > 4096) fail(); return; }
            const line = pending.subarray(0, newline).toString("utf8"); pending = pending.subarray(newline + 1);
            if (/^T\d+ 0 \d+ 0$/.test(line)) { stream.write(Buffer.from([0])); continue; }
            const match = /^C[0-7]{4} (\d+) [^\r\n]+$/.exec(line);
            if (!match) return fail();
            expected = Number(match[1]);
            if (!Number.isSafeInteger(expected) || expected <= 0) return fail();
            if (expected > 20 * 1024 * 1024) return finish(new BackupError("BACKUP_TOO_LARGE", 413));
            phase = "data"; stream.write(Buffer.from([0]));
          } else if (phase === "data") {
            const count = Math.min(expected - received, pending.length);
            chunks.push(Buffer.from(pending.subarray(0, count))); received += count; pending = pending.subarray(count);
            if (received === expected) phase = "status"; else return;
          } else if (phase === "status") {
            if (pending[0] !== 0) return fail();
            pending = pending.subarray(1); phase = "done"; stream.write(Buffer.from([0]));
          } else return fail(); // One exact artifact only; refuse trailing data.
        }
      });
      stream.write(Buffer.from([0]));
    });
  });
}
