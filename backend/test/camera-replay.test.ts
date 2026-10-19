import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as tcpServer, connect } from "node:net";
import { networkInterfaces } from "node:os";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { recordingInventory, prepareReplay, replayWindow } from "../src/cameras/camera-replay.js";
import { rtspParser, openReplayBridge, replayClock } from "../src/cameras/replay-rtsp.js";
import { cameraPtzStep, checkCameraPtzStep, runCameraPtzStep, stopCameraPtz } from "../src/cameras/camera-onvif.js";
import { requireVpnManager } from "../src/vpn/vpn.service.js";
import { hasPermission } from "../src/security/permissions.js";
import { findMutationPermission } from "../src/security/authorization.js";

const host = Object.values(networkInterfaces()).flat().find(item => item?.family === "IPv4" && !item.internal)!.address;
const soap = (action: string, body = "") => `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><r:${action}Response xmlns:r="http://www.onvif.org/ver10/recording/wsdl">${body}</r:${action}Response></s:Body></s:Envelope>`;
test("VPN management is role AND page scoped, without granting general policy control", () => {
  requireVpnManager({ id: "test", username: "test", role: "operator", allowedSections: ["page:tools.vpn"] });
  for (const user of [{ role: "viewer", allowedSections: ["page:tools.vpn"] }, { role: "operator", allowedSections: ["page:assets.cameras"] }]) assert.throws(() => requireVpnManager({ id: "test", username: "test", ...user }), /VPN_MANAGE_FORBIDDEN/);
  assert.equal(hasPermission("operator", "vpn.manage"), true); assert.equal(hasPermission("operator", "security.policy.manage"), false);
  assert.equal(findMutationPermission("POST", "/api/vpn/fixture/connect"), "vpn.manage");
  assert.equal(findMutationPermission("POST", "/api/cameras/fixture/playback/export"), "devices.manage");
});
test("replay windows and RTSP framing reject hostile or unbounded requests", () => {
  const window = replayWindow({ start: "2026-01-01T01:02:03.000Z", duration: 30 }); assert.equal(window.end, "2026-01-01T01:02:33.000Z");
  for (const input of [{ start: "file:///etc/passwd" }, { start: "2099-01-01T00:00:00Z" }, { start: window.start, duration: 86400 }, { start: window.start, duration: -1 }]) assert.throws(() => replayWindow(input));
  const messages: unknown[] = [], frames: Buffer[] = [], parse = rtspParser(message => messages.push(message.line), frame => frames.push(frame));
  const bytes = Buffer.from("RTSP/1.0 200 OK\r\nCSeq: 1\r\nContent-Length: 3\r\n\r\nabc"); for (const byte of bytes) parse(Buffer.from([byte]));
  parse(Buffer.from([36, 0, 0, 2, 1, 2])); assert.deepEqual(messages, ["RTSP/1.0 200 OK"]); assert.equal(frames.length, 1);
  assert.throws(() => rtspParser(() => {}, () => {})(Buffer.from("x".repeat(20000))));
});
test("real SOAP fixture exposes only actual recordings, pinned replay URI and bounded registered PTZ", async t => {
  let port = 0, foreign = false; const actions: string[] = [];
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const action = /action="[^\"]*\/([^\/\"]+)"/.exec(String(req.headers["content-type"]))?.[1] ?? ""; actions.push(action);
    const service = (name: string) => `<Service><Namespace>http://www.onvif.org/ver10/${name}/wsdl</Namespace><XAddr>http://${foreign ? "169.254.169.254" : host}:${port}/${name}</XAddr></Service>`;
    const contents = action === "GetServices" ? ["recording", "search", "replay"].map(service).join("")
      : action === "GetRecordings" ? '<RecordingItem><RecordingToken>record-one</RecordingToken><Configuration><Source><Name>Entrance</Name><SourceId>channel1</SourceId></Source></Configuration></RecordingItem>'
      : action === "GetRecordingInformation" ? '<RecordingInformation><EarliestRecording>2026-01-01T00:00:00Z</EarliestRecording><LatestRecording>2026-01-02T00:00:00Z</LatestRecording></RecordingInformation>'
      : action === "GetReplayUri" ? `<Uri>rtsp://${host}:554/record-one</Uri>`
      : action === "GetNode" ? '<PTZNode><SupportedPTZSpaces><RelativePanTiltTranslationSpace><URI>http://www.onvif.org/ver10/tptz/PanTiltSpaces/TranslationGenericSpace</URI><XRange><Min>-1</Min><Max>1</Max></XRange><YRange><Min>-1</Min><Max>1</Max></YRange></RelativePanTiltTranslationSpace></SupportedPTZSpaces></PTZNode>' : "";
    res.setHeader("Content-Type", "application/soap+xml"); res.end(soap(action, contents));
  });
  await new Promise<void>(resolve => server.listen(0, "0.0.0.0", resolve)); port = (server.address() as { port: number }).port; t.after(() => server.close());
  const camera = { host, onvifPort: port, onvifPath: "/onvif/device_service", onvifHttps: false, connectionMode: "onvif" };
  const inventory = await recordingInventory(camera, {}); assert.equal(inventory.recordings[0].name, "Entrance"); assert.equal(inventory.recordings[0].from, "2026-01-01T00:00:00.000Z");
  const prepared = await prepareReplay(camera, {}, { start: "2026-01-01T01:00:00Z", duration: 15, recordingToken: "record-one" }); assert.equal(prepared.uri.hostname, host);
  await assert.rejects(prepareReplay(camera, {}, { start: "2026-01-01T01:00:00Z", duration: 15, recordingToken: "injected" }), /CAMERA_RECORDING_NOT_FOUND/);
  await assert.rejects(prepareReplay(camera, {}, { start: "2026-01-03T01:00:00Z", duration: 15, recordingToken: "record-one" }), /CAMERA_RECORDING_OUTSIDE_RANGE/);
  const profile = { token: "profile", name: "PTZ", sourceToken: "one", width: null, height: null, fps: null, encoding: null, ptz: true, ptzNodeToken: "node", streamAvailable: true, snapshotAvailable: false }, connection = { ptzUrl: `http://${host}:${port}/ptz` };
  assert.throws(() => cameraPtzStep("shell")); await checkCameraPtzStep(host, profile, "left", connection); await runCameraPtzStep(host, profile, "right", connection); await stopCameraPtz(host, profile.token, connection);
  assert.ok(actions.includes("RelativeMove")); assert.ok(actions.includes("Stop")); await assert.rejects(checkCameraPtzStep(host, profile, "zoom_in", connection), /CAMERA_PTZ_STEP_UNAVAILABLE/);
  foreign = true; await assert.rejects(recordingInventory(camera, {}), /CAMERA_URL_INVALID/);
});
test("real RTSP bridge authenticates server-side, injects clock Range and refuses live-as-replay", async t => {
  let verifiedRange = "", live = false; const username = "fixture", password = randomBytes(12).toString("hex");
  const upstream = tcpServer(socket => { const parse = rtspParser(message => {
    const sequence = message.headers.get("cseq"), authenticated = message.headers.get("authorization")?.startsWith("Basic ");
    if (!authenticated) { socket.write(`RTSP/1.0 401 Unauthorized\r\nCSeq: ${sequence}\r\nWWW-Authenticate: Basic realm="fixture"\r\n\r\n`); return; }
    assert.equal(message.headers.get("authorization"), `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`);
    verifiedRange = message.headers.get("range") ?? ""; assert.equal(message.headers.get("require"), "onvif-replay"); assert.equal(message.headers.get("rate-control"), "no");
    socket.write(`RTSP/1.0 200 OK\r\nCSeq: ${sequence}\r\nRange: ${live ? "npt=0-" : verifiedRange}\r\n\r\n`);
  }, () => {}); socket.on("data", chunk => parse(Buffer.from(chunk))); });
  await new Promise<void>(resolve => upstream.listen(0, "0.0.0.0", resolve)); t.after(() => upstream.close());
  const port = (upstream.address() as { port: number }).port, start = "2026-01-01T01:00:00Z", end = "2026-01-01T01:00:15Z";
  for (const bad of [false, true]) {
    live = bad; const bridge = await openReplayBridge(new URL(`rtsp://${host}:${port}/record`), host, { username, password }, start, end), url = new URL(bridge.url);
    const client = connect(Number(url.port), "127.0.0.1");
    try {
      const response = await new Promise<string>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("fixture timeout")), 3000); client.once("connect", () => client.write(`PLAY ${bridge.url} RTSP/1.0\r\nCSeq: 7\r\nRange: npt=0-\r\n\r\n`)); client.on("data", chunk => { clearTimeout(timer); resolve(chunk.toString()); }); client.on("close", () => { clearTimeout(timer); resolve(""); }); client.on("error", reject); });
      assert.equal(verifiedRange, `clock=${replayClock(start)}-${replayClock(end)}`);
      if (bad) assert.throws(bridge.check, /CAMERA_REPLAY_RANGE_UNVERIFIED/); else { assert.match(response, /cseq: 7/); assert.equal(response.includes(password), false); bridge.check(); }
    } finally { client.destroy(); bridge.stop(); }
  }
});
