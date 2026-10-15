import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { authenticatedCameraHttp, cameraUrl, CameraError } from "./camera-network.js";
import type { CameraConnection } from "./camera-onvif.js";

const active = new Map<string, { ownerId: string; cameraId: string; child: ChildProcessWithoutNullStreams; stop: () => void }>();
type FrameSession = { cameraId: string; latest: Buffer | null; lastRequest: number; stopped: boolean; stop: () => void; waiters: Set<(frame: Buffer | null) => void> };
const frameSessions = new Map<string, Promise<FrameSession>>();
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
  for (const [key, pending] of frameSessions) void pending.then(session => { if (!cameraId || session.cameraId === cameraId) { session.stop(); frameSessions.delete(key); } }).catch(() => undefined);
  for (const job of active.values()) if (!cameraId || job.cameraId === cameraId) job.stop();
}

/** Bounded JPEG requests for Safari/native transports that cannot consume an
 * endless multipart fetch. Requests reuse one decoder, not one process/frame. */
export async function cameraFrame(input: Parameters<typeof startCameraMedia>[0]) {
  const key = JSON.stringify([input.ownerId, input.cameraId, input.profile]);
  let pending = frameSessions.get(key);
  if (!pending) {
    pending = (async () => {
      const job = await startCameraMedia(input);
      const session: FrameSession = { cameraId: input.cameraId, latest: null, lastRequest: Date.now(), stopped: false, stop: () => undefined, waiters: new Set() };
      const idle = setInterval(() => { if (Date.now() - session.lastRequest > 12_000) session.stop(); }, 3000); idle.unref();
      session.stop = () => { if (session.stopped) return; session.stopped = true; clearInterval(idle); job.stop(); if (frameSessions.get(key) === pending) frameSessions.delete(key); for (const resolve of session.waiters) resolve(null); session.waiters.clear(); };
      void (async () => {
        let buffer = Buffer.alloc(0);
        try {
          for await (const chunk of job.stream) {
            buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
            if (buffer.length > 3 * 1024 * 1024) throw new CameraError("CAMERA_VIDEO_FAILED", 502);
            for (;;) {
              const start = buffer.indexOf(Buffer.from([0xff, 0xd8]));
              const end = start < 0 ? -1 : buffer.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
              if (start < 0 || end < 0) break;
              session.latest = Buffer.from(buffer.subarray(start, end + 2)); buffer = buffer.subarray(end + 2);
              for (const resolve of session.waiters) resolve(session.latest);
              session.waiters.clear();
            }
          }
        } catch { /* Never expose decoder arguments or camera credentials. */ }
        finally { session.stop(); }
      })();
      return session;
    })();
    frameSessions.set(key, pending);
    void pending.catch(() => { if (frameSessions.get(key) === pending) frameSessions.delete(key); });
  }
  const session = await pending;
  session.lastRequest = Date.now();
  if (session.stopped) throw new CameraError("CAMERA_VIDEO_FAILED", 502);
  if (session.latest) return session.latest;
  const frame = await new Promise<Buffer | null>(resolve => {
    const done = (value: Buffer | null) => { clearTimeout(timeout); session.waiters.delete(done); resolve(value); };
    const timeout = setTimeout(() => done(null), 12_000); timeout.unref(); session.waiters.add(done);
  });
  if (!frame) throw new CameraError("CAMERA_VIDEO_TIMEOUT", 504);
  return frame;
}
