import { Socket } from "node:net";
import { createHash } from "node:crypto";
import { CameraError, privateCameraHost } from "./camera-network.js";
import type { CameraCredentials } from "./camera-network.js";
import type { NvrDisk } from "./nvr-storage.js";

export function dvripPasswordHash(password: string) {
  const digest = createHash("md5").update(password, "utf8").digest(), alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  return Array.from({ length: 8 }, (_, i) => alphabet[(digest[i * 2] + digest[i * 2 + 1]) % 62]).join("");
}
export function parseDvripDisks(input: unknown): NvrDisk[] {
  if (!Array.isArray(input) || input.length > 32) throw new CameraError("NVR_STORAGE_RESPONSE_INVALID", 502);
  const mb = (raw: unknown) => {
    const value = typeof raw === "string" && /^0x[0-9a-f]{1,12}$/i.test(raw) ? parseInt(raw.slice(2), 16) : typeof raw === "number" && Number.isInteger(raw) ? raw : NaN;
    const bytes = value * 1048576; return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
  };
  return input.map((raw, index) => {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.Partition) || raw.Partition.length > 32) throw new CameraError("NVR_STORAGE_RESPONSE_INVALID", 502);
    const partitions = raw.Partition as Record<string, unknown>[];
    const sum = (key: string) => { const numbers = partitions.map(p => mb(p[key])); const result = numbers.reduce<number>((s, n) => s + (n ?? 0), 0); return numbers.length && numbers.every(n => n !== null) && Number.isSafeInteger(result) ? result : null; };
    const capacityBytes = sum("TotalSpace"), rawFree = sum("RemainSpace"), freeBytes = rawFree !== null && capacityBytes !== null && rawFree <= capacityBytes ? rawFree : null;
    const id = typeof raw.PlysicalNo === "number" && Number.isSafeInteger(raw.PlysicalNo) ? String(raw.PlysicalNo) : String(index);
    // Partition.Status is firmware-dependent. Never label zero or a successful API call as a SMART pass.
    const statuses = partitions.map(p => Number.isSafeInteger(p.Status) ? String(p.Status) : "?").join(",").slice(0, 120);
    return { id, name: `HDD ${index + 1}`, capacityBytes, freeBytes, usedBytes: capacityBytes !== null && freeBytes !== null ? capacityBytes - freeBytes : null,
      health: "unknown", reportedState: `partition_status:${statuses}`, temperatureC: null, smart: "unknown" };
  });
}

/** Fixed read-only DVRIP subset. Never exposes a generic protocol/send-command endpoint. */
export async function readDvripStorage(host: string, port: number, credentials: CameraCredentials): Promise<NvrDisk[]> {
  privateCameraHost(host);
  if (!credentials.username || credentials.password === undefined) throw new CameraError("CAMERA_AUTH_REQUIRED", 401);
  const socket = new Socket(); let session = 0, sequence = 0;
  const lifetime = setTimeout(() => socket.destroy(new CameraError("CAMERA_TIMEOUT", 504)), 12000); lifetime.unref();
  // An idle socket error must never become an uncaught EventEmitter exception.
  socket.on("error", () => undefined);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new CameraError("CAMERA_TIMEOUT", 504)); }, 3000);
      const cleanup = () => { clearTimeout(timer); socket.off("connect", connected); socket.off("error", failed); };
      const connected = () => { cleanup(); resolve(); }, failed = () => { cleanup(); reject(new CameraError("CAMERA_CONNECTION_FAILED", 502)); };
      socket.once("connect", connected); socket.once("error", failed); socket.connect(port, host);
    });
    const request = async (command: 1000 | 1020, payload: Record<string, unknown>) => {
      const seq = sequence++, body = Buffer.from(JSON.stringify(payload) + "\n\0", "utf8"), header = Buffer.alloc(20);
      header[0] = 255; header.writeUInt32LE(session, 4); header.writeUInt32LE(seq, 8); header.writeUInt16LE(command, 14); header.writeUInt32LE(body.length, 16);
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        let data = Buffer.alloc(0);
        const finish = (error?: CameraError, result?: Record<string, unknown>) => { clearTimeout(timer); socket.off("data", received); socket.off("error", failed); socket.off("close", failed); error ? reject(error) : resolve(result!); };
        const timer = setTimeout(() => finish(new CameraError("CAMERA_TIMEOUT", 504)), 3500);
        const failed = () => finish(new CameraError("CAMERA_CONNECTION_FAILED", 502));
        const received = (chunk: Buffer) => {
          if (data.length + chunk.length > 524308) { finish(new CameraError("CAMERA_RESPONSE_TOO_LARGE", 502)); return; }
          data = Buffer.concat([data, chunk]); if (data.length < 20) return;
          const length = data.readUInt32LE(16);
          if (data[0] !== 255 || data.readUInt16LE(14) !== command + 1 || data.readUInt32LE(8) !== seq || length > 524288 || data[12] > 1 || data[13] !== 0 || (command !== 1000 && data.readUInt32LE(4) !== session)) { finish(new CameraError("NVR_STORAGE_RESPONSE_INVALID", 502)); return; }
          if (data.length < 20 + length) return;
          if (data.length !== 20 + length) { finish(new CameraError("NVR_STORAGE_RESPONSE_INVALID", 502)); return; }
          try {
            const json = JSON.parse(data.subarray(20).toString("utf8").replace(/[\x00\r\n]+$/g, ""));
            if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error();
            if ([205, 206, 207].includes(json.Ret)) { finish(new CameraError("NVR_ACCOUNT_LOCKED", 401)); return; }
            if ([103, 105, 106, 107, 202, 203, 204].includes(json.Ret)) { finish(new CameraError("CAMERA_AUTH_FAILED", 401)); return; }
            if (json.Ret !== 100) { finish(new CameraError("NVR_STORAGE_UNSUPPORTED", 422)); return; }
            if (command === 1000) {
              if (json.DataUseAES === true) { finish(new CameraError("NVR_DVRIP_ENCRYPTION_REQUIRED", 422)); return; }
              if (typeof json.SessionID !== "string" || !/^0x[0-9a-f]{1,8}$/i.test(json.SessionID)) throw new Error();
              session = parseInt(json.SessionID.slice(2), 16); if (!session || data.readUInt32LE(4) !== session) throw new Error();
            }
            finish(undefined, json);
          } catch { finish(new CameraError("NVR_STORAGE_RESPONSE_INVALID", 502)); }
        };
        socket.on("data", received); socket.once("error", failed); socket.once("close", failed); socket.write(Buffer.concat([header, body]));
      });
    };
    await request(1000, { UserName: credentials.username, PassWord: dvripPasswordHash(credentials.password), EncryptType: "MD5", LoginType: "DVRIP-Web" });
    const response = await request(1020, { Name: "StorageInfo", SessionID: `0x${session.toString(16).padStart(8, "0")}` });
    if (response.Name !== "StorageInfo") throw new CameraError("NVR_STORAGE_RESPONSE_INVALID", 502);
    return parseDvripDisks(response.StorageInfo);
  } finally {
    clearTimeout(lifetime);
    if (session && !socket.destroyed) {
      const body = Buffer.from(JSON.stringify({ Name: "", SessionID: `0x${session.toString(16).padStart(8, "0")}` }) + "\n\0"), header = Buffer.alloc(20);
      header[0] = 255; header.writeUInt32LE(session, 4); header.writeUInt32LE(sequence, 8); header.writeUInt16LE(1002, 14); header.writeUInt32LE(body.length, 16);
      socket.end(Buffer.concat([header, body])); const cleanup = setTimeout(() => socket.destroy(), 1000); cleanup.unref(); socket.once("close", () => clearTimeout(cleanup));
    } else socket.destroy();
  }
}
