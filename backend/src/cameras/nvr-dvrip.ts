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

export type NvrNative = { protocol?: "dvrip" | "appweb"; wireVersion: number; identity: Record<string, string>; configuredChannels: number | null; uptimeSeconds: number | null; deviceLocalTime: string | null;
  channels: Array<{ index: number; recording: boolean | null; signalPresent: boolean | null; bitrateBps: number | null }>; disks: NvrDisk[] | null; errors: Record<string, string> };
type ReadName = "StorageInfo" | "SystemInfo" | "WorkState" | "OPTimeQuery";
const commandFor = (name: ReadName) => name === "OPTimeQuery" ? 1452 : 1020;
const uint = (value: unknown) => { const n = typeof value === "number" ? value : typeof value === "string" && /^0x[0-9a-f]{1,12}$/i.test(value) ? Number(BigInt(value)) : NaN; return Number.isSafeInteger(n) && n >= 0 ? n : null; };
export function parseDvripNative(login: Record<string, unknown>, values: Partial<Record<ReadName, unknown>>, wireVersion: number, errors: Record<string, string>): NvrNative {
  const obj = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
  const info = obj(values.SystemInfo), work = obj(values.WorkState), alarm = obj(work.AlarmState);
  const counts = [login.ChannelNum, info.VideoInChannel, info.DigChannel].map(uint).filter((n): n is number => n !== null && n <= 128);
  const configuredChannels = counts.length ? Math.max(...counts) : null, run = uint(info.DeviceRunTime), loss = uint(alarm.VideoLoss);
  const states = Array.isArray(work.ChannelState) ? work.ChannelState.slice(0, configuredChannels ?? 128) : [];
  const identity: Record<string, string> = {};
  for (const [target, keys] of Object.entries({ Model: ["DeviceModel", "HardWare"], HardwareVersion: ["HardWareVersion"], FirmwareVersion: ["SoftWareVersion"], SerialNumber: ["SerialNo"], BuildTime: ["BuildTime"] })) {
    const value = keys.map(key => info[key]).find(v => typeof v === "string" && v.length > 0); if (typeof value === "string") identity[target] = value.slice(0, 160);
  }
  const chassis = login["DeviceType "]; if (typeof chassis === "string") identity.DeviceType = chassis.slice(0, 80);
  return { wireVersion, identity, configuredChannels, uptimeSeconds: run !== null && Number.isSafeInteger(run * 60) ? run * 60 : null,
    deviceLocalTime: typeof values.OPTimeQuery === "string" && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(values.OPTimeQuery) ? values.OPTimeQuery : null,
    disks: values.StorageInfo === undefined ? null : parseDvripDisks(values.StorageInfo), errors,
    channels: states.map((item, index) => { const state = obj(item), rate = uint(state.Bitrate); return { index,
      recording: typeof state.Record === "boolean" ? state.Record : null,
      signalPresent: loss !== null && index < 32 ? !(BigInt(loss) & (1n << BigInt(index))) : null,
      bitrateBps: rate !== null && Number.isSafeInteger(rate * 1024) ? rate * 1024 : null }; }) };
}

/** Only fixed reads and session lifecycle. No config, reboot, PTZ, format or arbitrary command. */
async function sessionRead<T>(host: string, port: number, credentials: CameraCredentials, version: 0 | 1,
  work: (read: (name: ReadName) => Promise<unknown>, login: Record<string, unknown>, wireVersion: number) => Promise<T>): Promise<T> {
  privateCameraHost(host);
  if (!credentials.username || credentials.password === undefined) throw new CameraError("CAMERA_AUTH_REQUIRED", 401);
  const socket = new Socket(); let session = 0, sequence = version ? 2 : 0, authenticated = false;
  const lifetime = setTimeout(() => socket.destroy(new CameraError("CAMERA_TIMEOUT", 504)), 30000); lifetime.unref();
  socket.on("error", () => undefined);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new CameraError("NVR_DVRIP_CONNECT_TIMEOUT", 504)); }, 3000);
      const cleanup = () => { clearTimeout(timer); socket.off("connect", connected); socket.off("error", failed); };
      const connected = () => { cleanup(); resolve(); }, failed = () => { cleanup(); reject(new CameraError("CAMERA_CONNECTION_FAILED", 502)); };
      socket.once("connect", connected); socket.once("error", failed); socket.connect(port, host);
    });
    const packet = (command: number, payload: Record<string, unknown>, seq: number) => {
      const body = Buffer.from(JSON.stringify(payload) + (version ? "" : "\n\0"), "utf8"), header = Buffer.alloc(20);
      header[0] = 255; header[1] = version; header.writeUInt32LE(session, 4); header.writeUInt32LE(seq, 8); header.writeUInt16LE(command, 14); header.writeUInt32LE(body.length, 16);
      return Buffer.concat([header, body]);
    };
    const request = async (command: number, payload: Record<string, unknown>) => {
      const seq = sequence; sequence += version ? 2 : 1;
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        let data = Buffer.alloc(0), settled = false, total = 0, count = 0, limit = 0; const parts = new Map<number, Buffer>();
        const finish = (error?: CameraError, result?: Record<string, unknown>) => { if (settled) return; settled = true; clearTimeout(timer); socket.off("data", received); socket.off("error", failed); socket.off("close", failed); error ? reject(error) : resolve(result!); };
        const timer = setTimeout(() => finish(new CameraError(command === 1000 ? "NVR_DVRIP_LOGIN_TIMEOUT" : "NVR_DVRIP_READ_TIMEOUT", 504)), 4500);
        const failed = () => finish(new CameraError("CAMERA_CONNECTION_FAILED", 502));
        const received = (chunk: Buffer) => {
          if (data.length + chunk.length + total > 524608) { finish(new CameraError("CAMERA_RESPONSE_TOO_LARGE", 502)); return; }
          data = Buffer.concat([data, chunk]);
          while (!settled && data.length >= 20) {
            const length = data.readUInt32LE(16), fragments = Math.max(data[12], 1), fragment = data[13], responseSeq = data.readUInt32LE(8);
            if (data[0] !== 255 || ![0, 1].includes(data[1]) || data.readUInt16LE(14) !== command + 1 || !(responseSeq === seq || version === 1 && responseSeq === seq + 1) ||
              length > 524288 || fragments > 16 || fragment >= fragments || limit && limit !== fragments || parts.has(fragment) || command !== 1000 && data.readUInt32LE(4) !== session) {
              finish(new CameraError("NVR_STORAGE_RESPONSE_INVALID", 502)); return;
            }
            if (data.length < 20 + length) return;
            limit = fragments; const headerSession = data.readUInt32LE(4); parts.set(fragment, data.subarray(20, 20 + length)); total += length; count++;
            data = data.subarray(20 + length);
            if (count < limit) continue;
            if (data.length) { finish(new CameraError("NVR_STORAGE_RESPONSE_INVALID", 502)); return; }
            try {
              const result = JSON.parse(Buffer.concat(Array.from({ length: limit }, (_, i) => parts.get(i)!)).toString("utf8").replace(/[\x00\r\n]+$/g, ""));
              if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error();
              if ([205, 206, 207, 212].includes(result.Ret)) { finish(new CameraError("NVR_ACCOUNT_LOCKED", 401)); return; }
              if ([105, 106, 202, 203, 204].includes(result.Ret)) { finish(new CameraError("CAMERA_AUTH_FAILED", 401)); return; }
              if ([103, 107, 213].includes(result.Ret)) { finish(new CameraError("NVR_ACCESS_DENIED", 403)); return; }
              if (result.Ret === 102 && command === 1000) { finish(new CameraError("NVR_DVRIP_VERSION_UNSUPPORTED", 422)); return; }
              if (result.Ret !== 100) { finish(new CameraError("NVR_STORAGE_UNSUPPORTED", 422)); return; }
              if (command === 1000) {
                if (result.DataUseAES === true) { finish(new CameraError("NVR_DVRIP_ENCRYPTION_REQUIRED", 422)); return; }
                const sid = typeof result.SessionID === "string" && /^0x[0-9a-f]{1,12}$/i.test(result.SessionID) ? uint(result.SessionID) : null;
                if (!sid || sid > 0xffffffff || headerSession !== sid) throw new Error(); session = sid; authenticated = true;
              }
              finish(undefined, result);
            } catch { finish(new CameraError("NVR_STORAGE_RESPONSE_INVALID", 502)); }
          }
        };
        socket.on("data", received); socket.once("error", failed); socket.once("close", failed); socket.write(packet(command, payload, seq));
      });
    };
    const login = await request(1000, { EncryptType: "MD5", LoginType: "DVRIP-Web", PassWord: dvripPasswordHash(credentials.password), UserName: credentials.username });
    const read = async (name: ReadName) => { const result = await request(commandFor(name), { Name: name, SessionID: `0x${session.toString(16).padStart(8, "0")}` });
      if (result.Name !== undefined && result.Name !== name || !Object.hasOwn(result, name)) throw new CameraError("NVR_STORAGE_RESPONSE_INVALID", 502); return result[name]; };
    return await work(read, login, version);
  } finally {
    clearTimeout(lifetime);
    if (authenticated && !socket.destroyed) {
      const body = Buffer.from(JSON.stringify({ Name: "", SessionID: `0x${session.toString(16).padStart(8, "0")}` }) + (version ? "" : "\n\0")), header = Buffer.alloc(20);
      header[0] = 255; header[1] = version; header.writeUInt32LE(session, 4); header.writeUInt32LE(sequence, 8); header.writeUInt16LE(1002, 14); header.writeUInt32LE(body.length, 16);
      socket.end(Buffer.concat([header, body])); const cleanup = setTimeout(() => socket.destroy(), 1000); cleanup.unref(); socket.once("close", () => clearTimeout(cleanup));
    } else socket.destroy();
  }
}
async function negotiate<T>(host: string, port: number, credentials: CameraCredentials, work: Parameters<typeof sessionRead<T>>[4]) {
  try { return await sessionRead(host, port, credentials, 0, work); }
  catch (e) { if (!(e instanceof CameraError) || !["NVR_DVRIP_LOGIN_TIMEOUT", "NVR_DVRIP_VERSION_UNSUPPORTED"].includes(e.code)) throw e; }
  // Same credentials, one alternative framing only after no login reply/version mismatch.
  // Authentication/permission/lock failures are never retried.
  return sessionRead(host, port, credentials, 1, work);
}
export async function readDvripStorage(host: string, port: number, credentials: CameraCredentials): Promise<NvrDisk[]> {
  return negotiate(host, port, credentials, async read => parseDvripDisks(await read("StorageInfo")));
}
export async function readDvripNative(host: string, port: number, credentials: CameraCredentials): Promise<NvrNative> {
  return negotiate(host, port, credentials, async (read, login, wireVersion) => {
    const values: Partial<Record<ReadName, unknown>> = {}, errors: Record<string, string> = {};
    for (const name of ["SystemInfo", "StorageInfo", "WorkState", "OPTimeQuery"] as const) {
      try { values[name] = await read(name); }
      catch (e) { if (!(e instanceof CameraError) || !["NVR_STORAGE_UNSUPPORTED", "NVR_ACCESS_DENIED"].includes(e.code)) throw e; errors[name] = e.code; }
    }
    // The negotiated response version is diagnostic metadata, not a remote command.
    return parseDvripNative(login, values, wireVersion, errors);
  });
}
