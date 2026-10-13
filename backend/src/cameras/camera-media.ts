import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { authenticatedCameraHttp, cameraUrl, CameraError } from "./camera-network.js";
import type { CameraConnection } from "./camera-onvif.js";

const active = new Map<string, { ownerId: string; cameraId: string; child: ChildProcessWithoutNullStreams; stop: () => void }>();
let sequence = 0;

function rtspInput(host: string, profile: string, connection: CameraConnection) {
  const uri = connection.profiles?.[profile]?.rtspUrl ?? connection.rtspUrl;
  if (!uri) throw new CameraError("CAMERA_STREAM_UNAVAILABLE", 422);
  const url = cameraUrl(uri, host, ["rtsp:"]);
  if (connection.username && connection.password) { url.username = connection.username; url.password = connection.password; }
  return url.href;
}

export function cameraMediaCapacity(ownerId: string) {
  if (active.size >= 8 || [...active.values()].filter((job) => job.ownerId === ownerId).length >= 4) throw new CameraError("CAMERA_VIEW_LIMIT", 429);
}

export async function startCameraMedia(input: { ownerId: string; cameraId: string; host: string; profile: string; connection: CameraConnection; snapshot?: boolean }) {
  cameraMediaCapacity(input.ownerId);
  const uri = rtspInput(input.host, input.profile, input.connection);
  const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1", "-protocol_whitelist", "rtsp,tcp,rtp,udp", "-rtsp_transport", "tcp", "-timeout", "10000000", "-i", uri,
    "-map", "0:v:0", "-an", "-sn", "-dn", "-vf", input.snapshot ? "scale=960:-2:force_original_aspect_ratio=decrease" : "fps=4,scale=960:-2:force_original_aspect_ratio=decrease",
    "-c:v", "mjpeg", "-threads", "1", "-q:v", "6", ...(input.snapshot ? ["-frames:v", "1", "-f", "image2pipe"] : ["-f", "mpjpeg", "-boundary_tag", "firewall-camera"]), "pipe:1"],
  { shell: false, windowsHide: true });
  // Camera URLs can contain secrets. Child stderr/arguments must never enter application logs or API responses.
  child.stderr.resume();
  const key = `${input.cameraId}:${++sequence}`;
  let stopped = false;
  let runtime: NodeJS.Timeout;
  const stop = () => {
    if (stopped) return; stopped = true; clearTimeout(runtime); active.delete(key);
    child.kill("SIGTERM");
    const force = setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 1500); force.unref();
  };
  runtime = setTimeout(stop, input.snapshot ? 15_000 : 180_000); runtime.unref();
  active.set(key, { ownerId: input.ownerId, cameraId: input.cameraId, child, stop });
  child.once("close", () => { clearTimeout(runtime); active.delete(key); });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => done(new CameraError("CAMERA_VIDEO_TIMEOUT", 504)), 12_000);
      const ready = () => done(child.stdout.readableLength ? undefined : new CameraError("CAMERA_VIDEO_FAILED", 502));
      const error = () => done(new CameraError("CAMERA_VIDEO_FAILED", 502));
      const done = (failure?: CameraError) => {
        clearTimeout(timer); child.stdout.off("readable", ready); child.off("error", error); child.off("close", error);
        if (failure) reject(failure); else resolve();
      };
      child.stdout.once("readable", ready); child.once("error", error); child.once("close", error);
    });
  } catch (error) { stop(); throw error; }
  // Subsequent spawn errors are handled without an unhandled EventEmitter error.
  child.on("error", stop);
  return { stream: child.stdout, stop };
}

export async function cameraSnapshot(input: Parameters<typeof startCameraMedia>[0]) {
  const snapshot = input.connection.profiles?.[input.profile]?.snapshotUrl;
  if (snapshot) {
    try {
      const response = await authenticatedCameraHttp(cameraUrl(snapshot, input.host), input.connection, { maxBytes: 2 * 1024 * 1024, timeout: 6000 });
      if (response.status === 200 && response.body[0] === 0xff && response.body[1] === 0xd8) return response.body;
    } catch { /* Fall back to the actual RTSP image when the optional HTTP snapshot is unavailable. */ }
  }
  const job = await startCameraMedia({ ...input, snapshot: true });
  try {
    const chunks: Buffer[] = []; let length = 0;
    for await (const chunk of job.stream) {
      const bytes = Buffer.from(chunk); length += bytes.length;
      if (length > 2 * 1024 * 1024) throw new CameraError("CAMERA_RESPONSE_TOO_LARGE", 502);
      chunks.push(bytes);
    }
    const buffer = Buffer.concat(chunks);
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer.at(-2) !== 0xff || buffer.at(-1) !== 0xd9) throw new CameraError("CAMERA_VIDEO_FAILED", 502);
    return buffer;
  } finally { job.stop(); }
}

export function stopCameraStreams(cameraId?: string) {
  for (const job of active.values()) if (!cameraId || job.cameraId === cameraId) job.stop();
}
