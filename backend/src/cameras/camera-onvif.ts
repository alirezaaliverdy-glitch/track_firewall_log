import { createHash, randomBytes, randomUUID } from "node:crypto";
import dgram from "node:dgram";
import { SaxesParser } from "saxes";
import { authenticatedCameraHttp, boundedMap, cameraSubnet, cameraUrl, CameraError, openCameraPort, type CameraCredentials } from "./camera-network.js";

export type XmlNode = { name: string; namespace: string; attributes: Record<string, string>; text: string; children: XmlNode[] };
export type CameraProfile = { token: string; name: string; sourceToken: string; width: number | null; height: number | null; encoding: string | null; fps: number | null; ptz: boolean; streamAvailable: boolean; snapshotAvailable: boolean };
export type CameraConnection = CameraCredentials & { storage?: { adapter: "auto" | "hikvision" | "dahua" | "xiongmai"; port?: number; https?: boolean; username?: string; password?: string }; rtspUrl?: string; mediaUrl?: string; media2?: boolean; ptzUrl?: string; timeOffsetMs?: number; profiles?: Record<string, { rtspUrl?: string; snapshotUrl?: string }> };
const DEVICE = "http://www.onvif.org/ver10/device/wsdl";
const MEDIA = "http://www.onvif.org/ver10/media/wsdl";
const MEDIA2 = "http://www.onvif.org/ver20/media/wsdl";
const PTZ = "http://www.onvif.org/ver20/ptz/wsdl";
const TT = "http://www.onvif.org/ver10/schema";

export function parseCameraXml(xml: string): XmlNode {
  if (Buffer.byteLength(xml) > 512 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new CameraError("CAMERA_XML_INVALID", 502);
  const root: XmlNode = { name: "root", namespace: "", attributes: {}, text: "", children: [] };
  const stack = [root];
  const parser = new SaxesParser({ xmlns: true });
  let count = 0;
  parser.on("opentag", (tag) => {
    if (++count > 8000 || stack.length > 48) throw new CameraError("CAMERA_XML_INVALID", 502);
    const node: XmlNode = { name: tag.local, namespace: tag.uri, attributes: {}, text: "", children: [] };
    for (const attr of Object.values(tag.attributes)) node.attributes[attr.local] = attr.value;
    stack.at(-1)!.children.push(node); stack.push(node);
  });
  parser.on("text", (value) => { stack.at(-1)!.text += value; });
  parser.on("cdata", (value) => { stack.at(-1)!.text += value; });
  parser.on("closetag", () => { stack.pop(); });
  parser.on("error", () => { throw new CameraError("CAMERA_XML_INVALID", 502); });
  try { parser.write(xml).close(); } catch { throw new CameraError("CAMERA_XML_INVALID", 502); }
  return root;
}

export function nodes(root: XmlNode, name: string): XmlNode[] {
  return [...(root.name === name ? [root] : []), ...root.children.flatMap((child) => nodes(child, name))];
}
const text = (root: XmlNode, name: string) => nodes(root, name)[0]?.text.trim() ?? "";
export const escapeCameraXml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]!));

export function cameraEnvelope(body: string, credentials: CameraCredentials, timeOffsetMs = 0) {
  let header = "";
  if (credentials.username && credentials.password) {
    const nonce = randomBytes(16), created = new Date(Date.now() + timeOffsetMs).toISOString();
    const digest = createHash("sha1").update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(credentials.password)])).digest("base64");
    header = `<s:Header><wsse:Security s:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"><wsse:UsernameToken><wsse:Username>${escapeCameraXml(credentials.username)}</wsse:Username><wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password><wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce.toString("base64")}</wsse:Nonce><wsu:Created>${created}</wsu:Created></wsse:UsernameToken></wsse:Security></s:Header>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tt="${TT}">${header}<s:Body>${body}</s:Body></s:Envelope>`;
}

export async function cameraSoap(url: URL, namespace: string, action: string, body: string, connection: CameraConnection = {}, timeout = 4000) {
  const response = await authenticatedCameraHttp(url, connection, {
    method: "POST", timeout, body: cameraEnvelope(body, connection, connection.timeOffsetMs),
    headers: { "Content-Type": `application/soap+xml; charset=utf-8; action="${namespace}/${action}"`, SOAPAction: `"${namespace}/${action}"` }
  });
  if (response.status === 401 || response.status === 403) {
    const content = response.body.toString("utf8");
    // A generic HTTP login page does not establish that the endpoint supports ONVIF.
    if (!/onvif\.org|NotAuthorized|FailedAuthentication|InvalidSecurity/i.test(content)) throw new CameraError("CAMERA_ONVIF_UNAVAILABLE", 502);
    throw new CameraError(connection.username ? "CAMERA_AUTH_FAILED" : "CAMERA_AUTH_REQUIRED", 401);
  }
  const root = parseCameraXml(response.body.toString("utf8"));
  if (nodes(root, "Fault").length) {
    if (/NotAuthorized|FailedAuthentication|InvalidSecurity|MessageExpired/i.test(response.body.toString("utf8"))) throw new CameraError(connection.username ? "CAMERA_AUTH_FAILED" : "CAMERA_AUTH_REQUIRED", 401);
    throw new CameraError("CAMERA_OPERATION_UNSUPPORTED", 422);
  }
  if (response.status < 200 || response.status >= 300 || !nodes(root, `${action}Response`).length) throw new CameraError("CAMERA_ONVIF_UNAVAILABLE", 502);
  return root;
}

export function parseCameraProfiles(root: XmlNode): CameraProfile[] {
  const entries = nodes(root, "Profiles").filter((node) => node.attributes.token).slice(0, 32);
  const number = (value: string) => { const n = Number(value); return value && Number.isFinite(n) && n >= 0 ? n : null; };
  return entries.map((node) => {
    const video = nodes(node, "VideoSourceConfiguration")[0] ?? nodes(node, "VideoSource")[0];
    const encoder = nodes(node, "VideoEncoderConfiguration")[0] ?? nodes(node, "VideoEncoder")[0];
    const token = node.attributes.token.slice(0, 256);
    return { token, name: (text(node, "Name") || token).slice(0, 160), sourceToken: video ? (text(video, "SourceToken") || video.attributes.token || token).slice(0, 256) : token,
      width: encoder ? number(text(encoder, "Width")) : null, height: encoder ? number(text(encoder, "Height")) : null,
      encoding: encoder ? text(encoder, "Encoding").slice(0, 32) || null : null, fps: encoder ? number(text(encoder, "FrameRateLimit")) : null,
      ptz: Boolean(nodes(node, "PTZConfiguration").length || nodes(node, "PTZ").length), streamAvailable: false, snapshotAvailable: false };
  });
}

function pinReturnedUrl(raw: string, host: string, protocols: string[]) {
  // Some devices return a credential-bearing URI. Credentials stay in the encrypted connection, never in public metadata.
  const url = new URL(raw); url.username = ""; url.password = "";
  return cameraUrl(url.href, host, protocols).href;
}

export async function inspectCamera(host: string, port: number, path: string, input: CameraConnection, useHttps = false) {
  const deviceUrl = cameraUrl(`${useHttps ? "https" : "http"}://${host}:${port}${path}`, host);
  const connection: CameraConnection = { ...input, profiles: {} };
  try {
    const clock = await cameraSoap(deviceUrl, DEVICE, "GetSystemDateAndTime", `<d:GetSystemDateAndTime xmlns:d="${DEVICE}"/>`, {}, 2500);
    const utc = nodes(clock, "UTCDateTime")[0];
    if (utc) {
      const values = ["Year", "Month", "Day", "Hour", "Minute", "Second"].map((key) => Number(text(utc, key)));
      const time = Date.UTC(values[0], values[1] - 1, values[2], values[3], values[4], values[5]);
      if (Number.isFinite(time) && values[0] >= 2000 && values[0] <= 2100) connection.timeOffsetMs = time - Date.now();
    }
  } catch { /* Unauthenticated clock reading is optional; actual information/profile reads must still succeed. */ }
  const info = await cameraSoap(deviceUrl, DEVICE, "GetDeviceInformation", `<d:GetDeviceInformation xmlns:d="${DEVICE}"/>`, connection);
  const infoJson = Object.fromEntries(["Manufacturer", "Model", "FirmwareVersion", "SerialNumber", "HardwareId"].map((key) => [key, text(info, key).slice(0, 256)]));
  let mediaUrl = "", ptzUrl = "", media2 = false;
  try {
    const services = await cameraSoap(deviceUrl, DEVICE, "GetServices", `<d:GetServices xmlns:d="${DEVICE}"><d:IncludeCapability>false</d:IncludeCapability></d:GetServices>`, connection);
    const list = nodes(services, "Service");
    const media = list.find((node) => text(node, "Namespace") === MEDIA) ?? list.find((node) => text(node, "Namespace") === MEDIA2);
    if (media) { mediaUrl = text(media, "XAddr"); media2 = text(media, "Namespace") === MEDIA2; }
    ptzUrl = text(list.find((node) => text(node, "Namespace") === PTZ) ?? services, "XAddr");
    if (!list.find((node) => text(node, "Namespace") === PTZ)) ptzUrl = "";
  } catch (error) { if (error instanceof CameraError && error.code === "CAMERA_AUTH_FAILED") throw error; }
  if (!mediaUrl) {
    const capabilities = await cameraSoap(deviceUrl, DEVICE, "GetCapabilities", `<d:GetCapabilities xmlns:d="${DEVICE}"><d:Category>All</d:Category></d:GetCapabilities>`, connection);
    const media = nodes(capabilities, "Media")[0]; mediaUrl = media ? text(media, "XAddr") : "";
    const ptz = nodes(capabilities, "PTZ")[0]; ptzUrl = ptz ? text(ptz, "XAddr") : "";
  }
  if (!mediaUrl) throw new CameraError("CAMERA_MEDIA_UNAVAILABLE", 422);
  connection.mediaUrl = pinReturnedUrl(mediaUrl, host, ["http:", "https:"]); connection.media2 = media2;
  connection.ptzUrl = ptzUrl ? pinReturnedUrl(ptzUrl, host, ["http:", "https:"]) : undefined;
  const namespace = media2 ? MEDIA2 : MEDIA, media = cameraUrl(connection.mediaUrl, host);
  const profiles = parseCameraProfiles(await cameraSoap(media, namespace, "GetProfiles", `<m:GetProfiles xmlns:m="${namespace}">${media2 ? "<m:Type>All</m:Type>" : ""}</m:GetProfiles>`, connection));
  if (!profiles.length) throw new CameraError("CAMERA_PROFILES_UNAVAILABLE", 422);
  await boundedMap(profiles, 4, async (profile) => {
    const profileXml = `<m:ProfileToken>${escapeCameraXml(profile.token)}</m:ProfileToken>`;
    const uris: { rtspUrl?: string; snapshotUrl?: string } = {};
    try {
      const body = media2 ? `<m:Protocol>RTSP</m:Protocol>${profileXml}` : `<m:StreamSetup><tt:Stream>RTP-Unicast</tt:Stream><tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport></m:StreamSetup>${profileXml}`;
      const result = await cameraSoap(media, namespace, "GetStreamUri", `<m:GetStreamUri xmlns:m="${namespace}">${body}</m:GetStreamUri>`, connection);
      uris.rtspUrl = pinReturnedUrl(text(result, "Uri"), host, ["rtsp:"]); profile.streamAvailable = true;
    } catch { /* Each unsupported profile remains visible, with no fabricated video capability. */ }
    try {
      const result = await cameraSoap(media, namespace, "GetSnapshotUri", `<m:GetSnapshotUri xmlns:m="${namespace}">${profileXml}</m:GetSnapshotUri>`, connection);
      uris.snapshotUrl = pinReturnedUrl(text(result, "Uri"), host, ["http:", "https:"]); profile.snapshotAvailable = true;
    } catch { /* RTSP can still provide a snapshot if this optional ONVIF operation is absent. */ }
    profile.ptz = profile.ptz && Boolean(connection.ptzUrl);
    connection.profiles![profile.token] = uris;
  });
  return { infoJson, profiles, connection };
}

export type CameraCandidate = { host: string; onvifPort: number; onvifPath: string; onvifHttps: boolean; name: string; evidence: "onvif" | "rtsp"; requiresCredentials: boolean };

export function parseCameraProbeMatches(xml: string, allowed: Set<string>): CameraCandidate[] {
  const root = parseCameraXml(xml);
  return nodes(root, "ProbeMatch").filter((match) => /NetworkVideoTransmitter|onvif\.org/i.test([text(match, "Types"), text(match, "Scopes")].join(" "))).flatMap((match) => text(match, "XAddrs").split(/\s+/).flatMap((raw) => {
    try {
      const url = new URL(raw);
      if (!allowed.has(url.hostname)) return [];
      cameraUrl(raw, url.hostname);
      const nameScope = text(match, "Scopes").split(/\s+/).find((scope) => /\/name\//.test(scope));
      let name = url.hostname;
      try { if (nameScope) name = decodeURIComponent(nameScope.split("/name/")[1]).slice(0, 160); } catch { /* malformed scopes are ignored */ }
      return [{ host: url.hostname, onvifPort: Number(url.port || (url.protocol === "https:" ? 443 : 80)), onvifPath: url.pathname, onvifHttps: url.protocol === "https:", name, evidence: "onvif" as const, requiresCredentials: true }];
    } catch { return []; }
  }));
}

async function multicastCandidates(allowed: Set<string>): Promise<CameraCandidate[]> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4"), candidates: CameraCandidate[] = [];
    let closed = false;
    const finish = () => { if (closed) return; closed = true; clearTimeout(timer); try { socket.close(); } catch { /* bind may have failed */ } resolve(candidates); };
    const timer = setTimeout(finish, 1800);
    socket.on("error", finish);
    socket.on("message", (packet) => { if (packet.length > 32_768 || candidates.length >= 128) return; try { candidates.push(...parseCameraProbeMatches(packet.toString(), allowed)); } catch { /* reject malformed advertisements */ } });
    socket.bind(0, () => {
      const xml = `<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl"><s:Header><a:MessageID>urn:uuid:${randomUUID()}</a:MessageID><a:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To><a:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action></s:Header><s:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></s:Body></s:Envelope>`;
      socket.send(Buffer.from(xml), 3702, "239.255.255.250", (error) => { if (error) finish(); });
    });
  });
}

export async function discoverCameras(raw: unknown, ports: number[] = [80, 8000, 8080, 8899, 2020]) {
  const { cidr, addresses } = cameraSubnet(raw);
  const candidates = await multicastCandidates(new Set(addresses));
  const known = new Set(candidates.map((candidate) => candidate.host));
  const deadline = Date.now() + 40_000;
  await boundedMap(addresses, 24, async (host) => {
    if (known.has(host) || Date.now() > deadline) return;
    for (const port of ports) {
      if (Date.now() > deadline) return;
      if (!await openCameraPort(host, port)) continue;
      try {
        await cameraSoap(new URL(`http://${host}:${port}/onvif/device_service`), DEVICE, "GetSystemDateAndTime", `<d:GetSystemDateAndTime xmlns:d="${DEVICE}"/>`, {}, 1200);
        candidates.push({ host, onvifPort: port, onvifPath: "/onvif/device_service", onvifHttps: false, name: host, evidence: "onvif", requiresCredentials: true }); return;
      } catch (error) {
        if (error instanceof CameraError && error.code === "CAMERA_AUTH_REQUIRED") {
          candidates.push({ host, onvifPort: port, onvifPath: "/onvif/device_service", onvifHttps: false, name: host, evidence: "onvif", requiresCredentials: true }); return;
        }
      }
    }
    if (Date.now() < deadline && await openCameraPort(host, 554)) candidates.push({ host, onvifPort: 80, onvifPath: "/onvif/device_service", onvifHttps: false, name: host, evidence: "rtsp", requiresCredentials: true });
  });
  const unique = [...new Map(candidates.map((candidate) => [`${candidate.host}:${candidate.onvifPort}`, candidate])).values()];
  return { cidr, candidates: unique.sort((a, b) => a.host.localeCompare(b.host, "en", { numeric: true })), scannedAddresses: addresses.length, partial: Date.now() > deadline };
}

export async function cameraPresets(host: string, profileToken: string, connection: CameraConnection) {
  if (!connection.ptzUrl) throw new CameraError("CAMERA_PTZ_UNAVAILABLE", 422);
  const result = await cameraSoap(cameraUrl(connection.ptzUrl, host), PTZ, "GetPresets", `<p:GetPresets xmlns:p="${PTZ}"><p:ProfileToken>${escapeCameraXml(profileToken)}</p:ProfileToken></p:GetPresets>`, connection);
  return nodes(result, "Preset").slice(0, 64).map((node) => ({ token: node.attributes.token, name: text(node, "Name") || node.attributes.token })).filter((preset) => preset.token);
}

export async function runCameraPreset(host: string, profileToken: string, presetToken: string, connection: CameraConnection) {
  if (!connection.ptzUrl) throw new CameraError("CAMERA_PTZ_UNAVAILABLE", 422);
  await cameraSoap(cameraUrl(connection.ptzUrl, host), PTZ, "GotoPreset", `<p:GotoPreset xmlns:p="${PTZ}"><p:ProfileToken>${escapeCameraXml(profileToken)}</p:ProfileToken><p:PresetToken>${escapeCameraXml(presetToken)}</p:PresetToken></p:GotoPreset>`, connection);
}

export async function rebootCamera(host: string, port: number, path: string, connection: CameraConnection, useHttps = false) {
  await cameraSoap(cameraUrl(`${useHttps ? "https" : "http"}://${host}:${port}${path}`, host), DEVICE, "SystemReboot", `<d:SystemReboot xmlns:d="${DEVICE}"/>`, connection);
}
