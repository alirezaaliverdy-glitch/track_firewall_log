import { createServer, connect, type Socket } from "node:net";
import { randomBytes } from "node:crypto";
import { cameraUrl, cameraAuthorization, CameraError, type CameraCredentials } from "./camera-network.js";

type Message = { line: string; headers: Map<string, string>; body: Buffer };
export const replayClock = (date: string) => new Date(date).toISOString().replace(/[-:]/g, "");
function serialize(message: Message) {
  message.headers.set("content-length", String(message.body.length));
  return Buffer.concat([Buffer.from(`${message.line}\r\n${[...message.headers].map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n\r\n`), message.body]);
}

/** RTSP and interleaved RTP framing is bounded on each chunk, never accumulates video. */
export function rtspParser(message: (message: Message) => void, frame: (frame: Buffer) => void) {
  let pending = Buffer.alloc(0);
  return (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length) {
      if (pending[0] === 36) {
        if (pending.length < 4) return;
        const length = pending.readUInt16BE(2) + 4;
        if (pending.length < length) return;
        frame(pending.subarray(0, length)); pending = pending.subarray(length); continue;
      }
      const end = pending.indexOf("\r\n\r\n");
      if (end < 0) { if (pending.length > 16384) throw new CameraError("CAMERA_REPLAY_PROTOCOL_INVALID", 502); return; }
      if (end > 16384) throw new CameraError("CAMERA_REPLAY_PROTOCOL_INVALID", 502);
      const [line, ...lines] = pending.subarray(0, end).toString("utf8").split("\r\n"), headers = new Map<string, string>();
      for (const item of lines) { const split = item.indexOf(":"); if (split < 1) throw new CameraError("CAMERA_REPLAY_PROTOCOL_INVALID", 502); const key = item.slice(0, split).toLowerCase(); if (headers.has(key)) throw new CameraError("CAMERA_REPLAY_PROTOCOL_INVALID", 502); headers.set(key, item.slice(split + 1).trim()); }
      const length = Number(headers.get("content-length") ?? 0);
      if (!Number.isInteger(length) || length < 0 || length > 512 * 1024) throw new CameraError("CAMERA_REPLAY_PROTOCOL_INVALID", 502);
      if (pending.length < end + 4 + length) return;
      const body = pending.subarray(end + 4, end + 4 + length); pending = pending.subarray(end + 4 + length);
      message({ line, headers, body });
    }
  };
}

/** One-use loopback bridge: only the trusted recorder and its validated SDP tracks.
 * Server-side authentication and clock Range prevent browsers receiving credentials,
 * arbitrary ffmpeg requests/redirects, or a live stream masquerading as playback. */
export async function openReplayBridge(uri: URL, host: string, credentials: CameraCredentials, start: string, end: string) {
  cameraUrl(uri.href, host, ["rtsp:"]);
  const secret = randomBytes(24).toString("hex"), targets = new Map<string, URL>(), sockets = new Set<Socket>();
  let localBase = "", accepted = false, verified = false, failure: CameraError | undefined, closed = false;
  const register = (target: URL) => { cameraUrl(target.href, host, ["rtsp:"]); if ((target.port || "554") !== (uri.port || "554")) throw new CameraError("CAMERA_REPLAY_PROTOCOL_INVALID", 502); const key = `/${secret}/${targets.size}`; targets.set(key, target); return `${localBase}${key}`; };
  const stop = () => { if (closed) return; closed = true; clearTimeout(deadline); for (const socket of sockets) socket.destroy(); server.close(); };
  const fail = (error?: unknown) => { if (closed) return; failure = error instanceof CameraError ? error : new CameraError("CAMERA_REPLAY_FAILED", 502); stop(); };
  const server = createServer(client => {
    if (accepted || closed) { client.destroy(); return; } accepted = true; sockets.add(client);
    const upstream = connect(Number(uri.port || 554), host); sockets.add(upstream);
    let teardown = false;
    for (const socket of [client, upstream]) { socket.setTimeout(15000, () => fail(new CameraError("CAMERA_REPLAY_TIMEOUT", 504))); socket.on("error", () => { if (verified && teardown) stop(); else fail(); }); socket.on("close", stop); }
    let challenge = "", sequence = 0, pending: { message: Message; target: URL | null; method: string; clientSequence: string; retried: boolean } | undefined;
    const forward = () => {
      if (!pending) return;
      const { message, method, target } = pending;
      const headers = new Map(message.headers); headers.delete("authorization"); headers.delete("proxy-authorization"); headers.delete("range"); headers.delete("scale"); headers.delete("rate-control"); headers.delete("require"); headers.delete("host");
      headers.set("cseq", String(++sequence));
      if (["SETUP", "PLAY"].includes(method)) headers.set("require", "onvif-replay");
      if (method === "PLAY") { headers.set("range", `clock=${replayClock(start)}-${replayClock(end)}`); headers.set("rate-control", "no"); headers.set("scale", "1.0"); }
      if (method === "SETUP" && !/RTP\/AVP\/TCP.*interleaved=\d+-\d+/i.test(headers.get("transport") ?? "")) return fail(new CameraError("CAMERA_REPLAY_PROTOCOL_INVALID", 502));
      if (challenge && target) {
        const auth = cameraAuthorization(challenge, method, target, credentials, target.href);
        if (!auth) return fail(new CameraError("CAMERA_AUTH_FAILED", 401)); headers.set("authorization", auth);
      }
      upstream.write(serialize({ line: `${method} ${target?.href ?? "*"} RTSP/1.0`, headers, body: message.body }));
    };
    const clientData = rtspParser(message => {
      if (pending) throw new CameraError("CAMERA_REPLAY_PROTOCOL_INVALID", 502);
      const match = /^(OPTIONS|DESCRIBE|SETUP|PLAY|PAUSE|GET_PARAMETER|TEARDOWN) (\S+) RTSP\/1\.0$/.exec(message.line);
      if (!match || !/^\d{1,10}$/.test(message.headers.get("cseq") ?? "")) throw new CameraError("CAMERA_REPLAY_PROTOCOL_INVALID", 502);
      let target: URL | null = null;
      if (match[2] !== "*") { const local = new URL(match[2]), expected = new URL(localBase); if (local.protocol !== "rtsp:" || local.hostname !== expected.hostname || local.port !== expected.port || local.username || local.password || local.search || local.hash || !targets.has(local.pathname)) throw new CameraError("CAMERA_REPLAY_PROTOCOL_INVALID", 502); target = targets.get(local.pathname)!; }
      else if (match[1] !== "OPTIONS") throw new CameraError("CAMERA_REPLAY_PROTOCOL_INVALID", 502);
      teardown = match[1] === "TEARDOWN";
      pending = { message, target, method: match[1], clientSequence: message.headers.get("cseq")!, retried: false }; forward();
    }, frame => upstream.write(frame));
    const serverData = rtspParser(message => {
      if (!pending || message.headers.get("cseq") !== String(sequence)) throw new CameraError("CAMERA_REPLAY_PROTOCOL_INVALID", 502);
      const status = Number(/^RTSP\/1\.0 (\d{3})/.exec(message.line)?.[1]);
      if (status === 401 && !pending.retried && message.headers.has("www-authenticate")) { challenge = message.headers.get("www-authenticate")!; pending.retried = true; forward(); return; }
      if (status < 200 || status >= 300) throw new CameraError(status === 401 || status === 403 ? "CAMERA_AUTH_FAILED" : "CAMERA_REPLAY_FAILED", status === 401 || status === 403 ? 401 : 502);
      if (pending.method === "PLAY") {
        const actual = /^clock=(\d{8}T\d{6}(?:\.\d+)?Z)-/.exec(message.headers.get("range") ?? "");
        if (!actual) throw new CameraError("CAMERA_REPLAY_RANGE_UNVERIFIED", 502);
        const stamp = actual[1].replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6");
        if (!Number.isFinite(Date.parse(stamp)) || Math.abs(Date.parse(stamp) - Date.parse(start)) > 10000) throw new CameraError("CAMERA_REPLAY_RANGE_UNVERIFIED", 502);
        verified = true;
      }
      const responseBase = message.headers.get("content-base") ?? pending.target?.href ?? uri.href;
      const base = cameraUrl(new URL(responseBase, uri).href, host, ["rtsp:"]);
      if (pending.method === "DESCRIBE") {
        let body = message.body.toString("utf8");
        body = body.replace(/^a=control:(.+)\r?$/gm, (_line, raw: string) => raw.trim() === "*" ? "a=control:*" : `a=control:${register(cameraUrl(new URL(raw.trim(), base).href, host, ["rtsp:"]))}`);
        // Absolute media URLs may only appear in whitelisted control lines, not elsewhere in SDP.
        if (body.split(/\r?\n/).some(line => !line.startsWith("a=control:") && /(?:rtsp|https?|file):\/\//i.test(line))) throw new CameraError("CAMERA_REPLAY_PROTOCOL_INVALID", 502);
        message.body = Buffer.from(body);
        message.headers.set("content-base", register(base));
      }
      message.headers.delete("content-location"); message.headers.delete("www-authenticate"); message.headers.set("cseq", pending.clientSequence);
      pending = undefined; client.write(serialize(message));
    }, frame => { if (!verified) throw new CameraError("CAMERA_REPLAY_RANGE_UNVERIFIED", 502); if (!client.write(frame)) upstream.pause(); });
    client.on("drain", () => upstream.resume()); upstream.on("drain", () => client.resume());
    client.on("data", chunk => { try { clientData(Buffer.from(chunk)); } catch (error) { fail(error); } });
    upstream.on("data", chunk => { try { serverData(Buffer.from(chunk)); } catch (error) { fail(error); } });
  });
  const deadline = setTimeout(() => fail(new CameraError("CAMERA_REPLAY_TIMEOUT", 504)), 90000); deadline.unref();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") { stop(); throw new CameraError("CAMERA_REPLAY_FAILED", 502); }
  localBase = `rtsp://127.0.0.1:${address.port}`;
  return { url: register(uri), stop, check: () => { if (failure) throw failure; if (!verified) throw new CameraError("CAMERA_REPLAY_RANGE_UNVERIFIED", 502); } };
}
