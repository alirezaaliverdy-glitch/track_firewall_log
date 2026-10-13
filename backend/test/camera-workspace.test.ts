import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { cameraAuthorization, cameraSubnet, cameraUrl, privateCameraHost, CameraError } from "../src/cameras/camera-network.js";
import { inspectCamera, parseCameraProbeMatches, parseCameraProfiles, parseCameraXml, nodes, cameraEnvelope, rebootCamera } from "../src/cameras/camera-onvif.js";
import { cameraRevision, evaluateCameraPolicy } from "../src/cameras/camera-policy.js";
import { findMutationPermission } from "../src/security/authorization.js";
import { sectionForApiPath } from "../src/security/section-access.js";
import type { CameraActionPlan, CameraDevice } from "@prisma/client";

const response = (action: string, body = "") => `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:d="http://www.onvif.org/ver10/device/wsdl" xmlns:m="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema"><s:Body><d:${action}Response>${body}</d:${action}Response></s:Body></s:Envelope>`;
const fixtureProfiles = `<m:Profiles token="main-1"><tt:Name>Channel 1 main</tt:Name><tt:VideoSourceConfiguration token="source1"><tt:SourceToken>channel1</tt:SourceToken></tt:VideoSourceConfiguration><tt:VideoEncoderConfiguration><tt:Encoding>H264</tt:Encoding><tt:Resolution><tt:Width>1920</tt:Width><tt:Height>1080</tt:Height></tt:Resolution><tt:RateControl><tt:FrameRateLimit>25</tt:FrameRateLimit></tt:RateControl></tt:VideoEncoderConfiguration></m:Profiles><m:Profiles token="sub-1"><tt:Name>Channel 1 sub</tt:Name><tt:VideoSourceConfiguration token="source1"><tt:SourceToken>channel1</tt:SourceToken></tt:VideoSourceConfiguration></m:Profiles><m:Profiles token="main-2"><tt:Name>Channel 2</tt:Name><tt:VideoSourceConfiguration token="source2"><tt:SourceToken>channel2</tt:SourceToken></tt:VideoSourceConfiguration></m:Profiles>`;

test("camera targets stay in a bounded private IPv4 scope and returned URLs stay on the registered device", () => {
  assert.equal(privateCameraHost("192.168.18.50"), "192.168.18.50");
  for (const host of ["127.0.0.1", "169.254.169.254", "8.8.8.8", "localhost", "2130706433", "::1", "192.168.18.999"]) assert.throws(() => privateCameraHost(host), CameraError);
  const range = cameraSubnet("192.168.18.50/24");
  assert.equal(range.cidr, "192.168.18.0/24"); assert.equal(range.addresses.length, 254);
  assert.deepEqual(cameraSubnet("192.168.18.50/32").addresses, ["192.168.18.50"]);
  assert.throws(() => cameraSubnet("192.168.0.0/16"));
  for (const uri of ["http://127.0.0.1/admin", "http://192.168.18.51/snapshot", "http://user:secret@192.168.18.50/snapshot", "file:///etc/passwd", "http://example.com/snapshot"]) assert.throws(() => cameraUrl(uri, "192.168.18.50"));
  assert.equal(cameraUrl("rtsp://192.168.18.50:554/live", "192.168.18.50", ["rtsp:"]).protocol, "rtsp:");
});

test("ONVIF XML is bounded, rejects entities, and preserves NVR source-to-profile relationships", () => {
  assert.throws(() => parseCameraXml('<!DOCTYPE a [<!ENTITY secret SYSTEM "file:///etc/passwd">]><a>&secret;</a>'));
  assert.throws(() => parseCameraXml("<a>".repeat(50) + "</a>".repeat(50)));
  assert.throws(() => parseCameraXml("<broken>"));
  const profiles = parseCameraProfiles(parseCameraXml(response("GetProfiles", fixtureProfiles)));
  assert.equal(profiles.length, 3); assert.equal(new Set(profiles.map((profile) => profile.sourceToken)).size, 2);
  assert.equal(profiles[0].width, 1920); assert.equal(profiles[0].fps, 25);
  assert.equal(profiles[0].streamAvailable, false);
});

test("discovery rejects advertisements outside the requested range or without ONVIF identity", () => {
  const match = (address: string, type = "dn:NetworkVideoTransmitter") => `<ProbeMatches><ProbeMatch><Types>${type}</Types><Scopes>onvif://www.onvif.org/name/Front%20Door</Scopes><XAddrs>${address}</XAddrs></ProbeMatch></ProbeMatches>`;
  const allowed = new Set(["192.168.18.4"]);
  assert.equal(parseCameraProbeMatches(match("http://192.168.18.4/onvif/device_service"), allowed)[0].name, "Front Door");
  assert.equal(parseCameraProbeMatches(match("http://192.168.18.5/onvif/device_service"), allowed).length, 0);
  assert.equal(parseCameraProbeMatches(match("http://192.168.18.4/onvif/device_service").replace("onvif://www.onvif.org/name/Front%20Door", "other").replace("dn:NetworkVideoTransmitter", "printer"), allowed).length, 0);
});

test("WS-Security does not send plaintext passwords and HTTP Digest respects the URI and supported algorithm", () => {
  const secret = randomBytes(20).toString("hex"), username = "fixture-user";
  const envelope = cameraEnvelope('<d:Read xmlns:d="http://www.onvif.org/ver10/device/wsdl"/>', { username, password: secret });
  assert.equal(envelope.includes(secret), false);
  assert.match(envelope, /PasswordDigest/);
  const authorization = cameraAuthorization('Digest realm="camera", nonce="fixture-nonce", qop="auth", algorithm=SHA-256', "GET", new URL("http://192.168.18.4/snapshot?channel=1"), { username, password: secret })!;
  assert.match(authorization, /algorithm=SHA-256/); assert.match(authorization, /uri="\/snapshot\?channel=1"/);
  assert.equal(authorization.includes(secret), false);
  assert.equal(cameraAuthorization('Digest realm="camera", nonce="fixture", qop="auth-int", algorithm=MD5', "GET", new URL("http://192.168.18.4/"), { username, password: secret }), undefined);
  const parsed = parseCameraXml(envelope), token = nodes(parsed, "UsernameToken")[0];
  const digest = createHash("sha1").update(Buffer.concat([Buffer.from(nodes(token, "Nonce")[0].text, "base64"), Buffer.from(nodes(token, "Created")[0].text), Buffer.from(secret)])).digest("base64");
  assert.equal(nodes(token, "Password")[0].text, digest);
});

test("camera PolicyGuard requires a fresh registered preview, explicit execution, workspace scope and role", () => {
  const camera = { id: "fixture-camera", ownerId: "workspace", host: "192.168.18.4", onvifPort: 80, onvifPath: "/onvif/device_service", connectionEncrypted: "encrypted-fixture", connectionMode: "onvif", status: "verified" } as CameraDevice;
  const plan = { id: "fixture-plan", cameraId: camera.id, ownerId: "workspace", operation: "reboot", cameraRevision: cameraRevision(camera), status: "preview_ready", expiresAt: new Date(Date.now() + 60_000) } as CameraActionPlan;
  const input = { camera, plan, ownerId: "workspace", role: "admin", intent: "execute", confirmed: true };
  assert.equal(evaluateCameraPolicy(input).template, "onvif.device.reboot");
  for (const override of [{ intent: "preview" }, { confirmed: false }, { ownerId: "other" }, { role: "viewer" }, { role: "operator" }, { plan: { ...plan, status: "succeeded" } }, { plan: { ...plan, expiresAt: new Date(0) } }, { camera: { ...camera, connectionEncrypted: "new-credential" } }, { plan: { ...plan, operation: "shell" } }]) assert.throws(() => evaluateCameraPolicy({ ...input, ...override }));
  assert.equal(findMutationPermission("POST", "/api/cameras/fixture/actions/fixture-plan/execute"), "actions.execute.write");
  assert.equal(sectionForApiPath("/api/cameras/fixture/live"), "assets");
});

test("a real HTTP ONVIF fixture yields channel profiles and authenticated URI reads; mutations require a real SOAP acknowledgment", async () => {
  const privateIp = Object.values(networkInterfaces()).flat().find((item) => item?.family === "IPv4" && !item.internal)?.address;
  if (!privateIp) throw new Error("Private test interface required");
  privateCameraHost(privateIp);
  const secret = randomBytes(20).toString("hex"), username = "onvif-fixture", writes: string[] = [];
  let port = 0;
  const server = createServer(async (request, reply) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const action = /action="[^\"]*\/([^\/"]+)"/.exec(String(request.headers["content-type"]))?.[1] ?? "";
    const root = parseCameraXml(body), auth = nodes(root, "UsernameToken")[0];
    const valid = auth && nodes(auth, "Username")[0]?.text === username && nodes(auth, "Password")[0]?.text === createHash("sha1").update(Buffer.concat([Buffer.from(nodes(auth, "Nonce")[0].text, "base64"), Buffer.from(nodes(auth, "Created")[0].text), Buffer.from(secret)])).digest("base64");
    reply.setHeader("Content-Type", "application/soap+xml");
    if (action !== "GetSystemDateAndTime" && !valid) { reply.end(response("Fault", '<s:Fault><s:Code><s:Subcode><s:Value>ter:NotAuthorized</s:Value></s:Subcode></s:Code></s:Fault>')); return; }
    const endpoint = `http://${privateIp}:${port}`;
    if (action === "GetDeviceInformation") reply.end(response(action, "<d:Manufacturer>Fixture</d:Manufacturer><d:Model>Recorder</d:Model><d:FirmwareVersion>test</d:FirmwareVersion>"));
    else if (action === "GetSystemDateAndTime") reply.end(response(action));
    else if (action === "GetServices") reply.end(response(action, `<d:Service><d:Namespace>http://www.onvif.org/ver10/media/wsdl</d:Namespace><d:XAddr>${endpoint}/media</d:XAddr></d:Service>`));
    else if (action === "GetProfiles") reply.end(response(action, fixtureProfiles));
    else if (action === "GetStreamUri") reply.end(response(action, `<m:MediaUri><tt:Uri>rtsp://${privateIp}:554/live</tt:Uri></m:MediaUri>`));
    else if (action === "GetSnapshotUri") reply.end(response(action, `<m:MediaUri><tt:Uri>${endpoint}/snapshot</tt:Uri></m:MediaUri>`));
    else if (action === "SystemReboot") { writes.push(action); reply.end(response(action)); }
    else reply.end(response(action));
  });
  await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
  port = (server.address() as { port: number }).port;
  try {
    await assert.rejects(inspectCamera(privateIp, port, "/onvif/device_service", {}), (error: unknown) => error instanceof CameraError && error.code === "CAMERA_AUTH_REQUIRED");
    const result = await inspectCamera(privateIp, port, "/onvif/device_service", { username, password: secret });
    assert.equal(result.infoJson.Model, "Recorder"); assert.equal(result.profiles.length, 3);
    assert.equal(result.profiles.every((profile) => profile.streamAvailable && profile.snapshotAvailable), true);
    assert.equal(result.connection.profiles?.["sub-1"].rtspUrl, `rtsp://${privateIp}:554/live`);
    assert.equal(writes.length, 0);
    await assert.rejects(rebootCamera(privateIp, port, "/onvif/device_service", { username, password: "invalid-fixture" }));
    assert.equal(writes.length, 0);
    await rebootCamera(privateIp, port, "/onvif/device_service", result.connection);
    assert.deepEqual(writes, ["SystemReboot"]);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
