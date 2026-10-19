import { cameraSoap, nodes, escapeCameraXml, type CameraConnection, type XmlNode } from "./camera-onvif.js";
import { boundedMap, cameraUrl, CameraError } from "./camera-network.js";

const DEVICE = "http://www.onvif.org/ver10/device/wsdl";
const RECORDING = "http://www.onvif.org/ver10/recording/wsdl";
const SEARCH = "http://www.onvif.org/ver10/search/wsdl";
const REPLAY = "http://www.onvif.org/ver10/replay/wsdl";
const value = (node: XmlNode, name: string) => nodes(node, name)[0]?.text.trim() ?? "";
const date = (input: string) => /^20\d\d-\d\d-\d\dT/.test(input) && Number.isFinite(Date.parse(input)) ? new Date(input).toISOString() : null;
export type CameraRecording = { token: string; name: string; source: string; from: string | null; until: string | null; tracks: string[] };
type Device = { host: string; onvifPort: number; onvifPath: string; onvifHttps: boolean; connectionMode: string };

export async function replayServices(camera: Device, connection: CameraConnection) {
  if (!["onvif", "appweb"].includes(camera.connectionMode)) throw new CameraError("CAMERA_REPLAY_UNSUPPORTED", 422);
  const url = cameraUrl(`${camera.onvifHttps ? "https" : "http"}://${camera.host}:${camera.onvifPort}${camera.onvifPath}`, camera.host);
  const root = await cameraSoap(url, DEVICE, "GetServices", `<d:GetServices xmlns:d="${DEVICE}"><d:IncludeCapability>false</d:IncludeCapability></d:GetServices>`, connection);
  const services = new Map(nodes(root, "Service").map(node => [value(node, "Namespace"), value(node, "XAddr")]));
  const recording = services.get(RECORDING), replay = services.get(REPLAY), search = services.get(SEARCH);
  if (!recording || !replay || !search) throw new CameraError("CAMERA_REPLAY_UNSUPPORTED", 422);
  return { recording: cameraUrl(recording, camera.host), replay: cameraUrl(replay, camera.host), search: cameraUrl(search, camera.host) };
}

/** Actual recording handles and their actual coverage, not synthetic day-long timeline blocks. */
export async function recordingInventory(camera: Device, connection: CameraConnection) {
  const services = await replayServices(camera, connection);
  const root = await cameraSoap(services.recording, RECORDING, "GetRecordings", `<r:GetRecordings xmlns:r="${RECORDING}"/>`, connection);
  const entries = nodes(root, "RecordingItem"), bounded = entries.slice(0, 32);
  const recordings = await boundedMap(bounded, 3, async node => {
    const token = value(node, "RecordingToken");
    if (!token || token.length > 256) return null;
    const source = nodes(node, "Source")[0];
    const item: CameraRecording = { token, name: source ? value(source, "Name").slice(0, 160) : token, source: source ? value(source, "SourceId").slice(0, 256) : "", from: null, until: null,
      tracks: nodes(node, "Track").map(track => value(track, "TrackToken")).filter(Boolean).slice(0, 16) };
    try {
      const info = await cameraSoap(services.search, SEARCH, "GetRecordingInformation", `<s:GetRecordingInformation xmlns:s="${SEARCH}"><s:RecordingToken>${escapeCameraXml(token)}</s:RecordingToken></s:GetRecordingInformation>`, connection);
      item.from = date(value(info, "EarliestRecording")); item.until = date(value(info, "LatestRecording"));
    } catch (error) {
      if (error instanceof CameraError && ["CAMERA_AUTH_FAILED", "CAMERA_AUTH_REQUIRED"].includes(error.code)) throw error;
      // Missing range remains unknown; the recorder must still validate the requested RTSP clock range.
    }
    return item;
  });
  return { recordings: recordings.filter((item): item is CameraRecording => Boolean(item)), truncated: entries.length > 32, services };
}

export function replayWindow(input: Record<string, unknown>) {
  const start = typeof input.start === "string" ? date(input.start) : null;
  const duration = input.duration === undefined ? 30 : Number(input.duration);
  if (!start || !Number.isInteger(duration) || duration < 5 || duration > 60 || Date.parse(start) > Date.now()) throw new CameraError("CAMERA_REPLAY_WINDOW_INVALID");
  return { start, end: new Date(Date.parse(start) + duration * 1000).toISOString(), duration };
}

export async function prepareReplay(camera: Device, connection: CameraConnection, input: Record<string, unknown>) {
  const window = replayWindow(input), inventory = await recordingInventory(camera, connection);
  const recording = inventory.recordings.find(item => item.token === input.recordingToken);
  if (!recording) throw new CameraError("CAMERA_RECORDING_NOT_FOUND", 404);
  if (recording.from && Date.parse(window.end) <= Date.parse(recording.from) || recording.until && Date.parse(window.start) >= Date.parse(recording.until)) throw new CameraError("CAMERA_RECORDING_OUTSIDE_RANGE", 422);
  const root = await cameraSoap(inventory.services.replay, REPLAY, "GetReplayUri", `<r:GetReplayUri xmlns:r="${REPLAY}"><r:StreamSetup><tt:Stream>RTP-Unicast</tt:Stream><tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport></r:StreamSetup><r:RecordingToken>${escapeCameraXml(recording.token)}</r:RecordingToken></r:GetReplayUri>`, connection);
  return { ...window, recording, uri: cameraUrl(value(root, "Uri"), camera.host, ["rtsp:"]) };
}
