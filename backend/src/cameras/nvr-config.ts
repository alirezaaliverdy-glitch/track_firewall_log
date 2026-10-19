import { createHash } from "node:crypto";
import { withAppWebSession, type AppWebRequest } from "./nvr-appweb.js";
import { CameraError, type CameraCredentials } from "./camera-network.js";

export const NVR_RECORD_MODES = ["ConfigRecord", "ManualRecord", "ClosedRecord"] as const;
export type NvrSettings = { overwrite: "OverWrite" | "StopRecord" | null; channel: number; recordingMode: string | null; packetMinutes: number | null; preRecordSeconds: number | null; revision: string; supported: { overwrite: boolean; recordingMode: boolean }; };
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const valid = (n: unknown, min: number, max: number) => typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
export function nvrChannel(input: unknown) { const channel = Number(input ?? 0); if (!Number.isInteger(channel) || channel < 0 || channel > 127) throw new CameraError("NVR_CONFIG_INVALID"); return channel; }
export function nvrConfigChange(input: Record<string, unknown>) {
  if (input.setting === "overwrite" && ["OverWrite", "StopRecord"].includes(String(input.value))) return { setting: "overwrite" as const, value: String(input.value), channel: 0 };
  if (input.setting === "recordingMode" && NVR_RECORD_MODES.includes(input.value as typeof NVR_RECORD_MODES[number])) return { setting: "recordingMode" as const, value: String(input.value), channel: nvrChannel(input.channel) };
  throw new CameraError("NVR_CONFIG_INVALID");
}
type Device = { host: string; onvifPort: number; onvifHttps: boolean; connectionMode: string; kind: string };
const supported = (camera: Device) => { if (camera.kind !== "nvr" || camera.connectionMode !== "appweb") throw new CameraError("NVR_CONFIG_OPERATION_UNSUPPORTED", 422); };
async function read(request: AppWebRequest, channel: number) {
  const general = object((await request("/CGI/General/general")).data);
  let recording: Record<string, unknown> | undefined;
  try { recording = object((await request(`/CGI/Record/record/channels/${channel}`)).data); }
  catch (error) { if (error instanceof CameraError && ["NVR_APPWEB_AUTH_FAILED", "NVR_ACCOUNT_LOCKED", "NVR_ACCESS_DENIED"].includes(error.code)) throw error; }
  const config = object(recording?.RecordConfig);
  const overwrite = ["OverWrite", "StopRecord"].includes(String(general.OverWrite)) ? general.OverWrite as "OverWrite" | "StopRecord" : null;
  const recordingMode = NVR_RECORD_MODES.includes(config.RecordMode as typeof NVR_RECORD_MODES[number]) ? String(config.RecordMode) : null;
  const revision = createHash("sha256").update(JSON.stringify([general, recording, channel])).digest("hex");
  const settings: NvrSettings = { channel, overwrite, recordingMode, packetMinutes: valid(config.PacketLength, 1, 120) ? Number(config.PacketLength) : null, preRecordSeconds: valid(config.PreRecord, 0, 30) ? Number(config.PreRecord) : null, revision, supported: { overwrite: overwrite !== null, recordingMode: recordingMode !== null } };
  return { general, recording, settings };
}
export async function readNvrSettings(camera: Device, credentials: CameraCredentials, channel: number) {
  supported(camera); channel = nvrChannel(channel);
  return withAppWebSession(camera.host, camera.onvifPort, camera.onvifHttps, credentials, async request => (await read(request, channel)).settings);
}
export async function writeNvrSetting(camera: Device, credentials: CameraCredentials, input: Record<string, unknown>, expectedRevision: string, onInvoke: () => void) {
  supported(camera); const change = nvrConfigChange(input);
  return withAppWebSession(camera.host, camera.onvifPort, camera.onvifHttps, credentials, async request => {
    const current = await read(request, change.channel);
    if (current.settings.revision !== expectedRevision) throw new CameraError("NVR_CONFIG_CHANGED", 409);
    if (!current.settings.supported[change.setting]) throw new CameraError("NVR_CONFIG_OPERATION_UNSUPPORTED", 422);
    const path = change.setting === "overwrite" ? "/CGI/General/general" : `/CGI/Record/record/channels/${change.channel}`;
    const body = structuredClone(change.setting === "overwrite" ? current.general : current.recording!);
    if (change.setting === "overwrite") body.OverWrite = change.value;
    else object(body.RecordConfig).RecordMode = change.value;
    // Read-modify-write changes exactly one validated field. No reset, format, clock,
    // account or network mutation, and no caller-provided CGI path/payload.
    onInvoke();
    const result = object((await request(path, "PUT", JSON.stringify(body))).data);
    if (result.statusCode !== 1 || result.statusString !== "OK") throw new CameraError("NVR_CONFIG_WRITE_REJECTED", 502);
    const actual = (await read(request, change.channel)).settings;
    const value = change.setting === "overwrite" ? actual.overwrite : actual.recordingMode;
    if (value !== change.value) throw new CameraError("NVR_CONFIG_VERIFY_FAILED", 502);
    return actual;
  });
}
