import { isIP, Socket } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";

export class CameraError extends Error {
  constructor(readonly code: string, readonly statusCode = 400) { super(code); this.name = "CameraError"; }
}

export function privateCameraHost(value: unknown) {
  const host = String(value ?? "").trim();
  if (isIP(host) !== 4) throw new CameraError("CAMERA_PRIVATE_IP_REQUIRED");
  const [a, b] = host.split(".").map(Number);
  if (!(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))) throw new CameraError("CAMERA_PRIVATE_IP_REQUIRED");
  return host;
}

export function cameraUrl(value: unknown, host: string, protocols = ["http:", "https:"]) {
  let url: URL;
  try { url = new URL(String(value)); } catch { throw new CameraError("CAMERA_URL_INVALID"); }
  if (!protocols.includes(url.protocol) || url.hostname !== privateCameraHost(host) || url.username || url.password || url.hash) throw new CameraError("CAMERA_URL_INVALID");
  if (url.href.length > 2048) throw new CameraError("CAMERA_URL_INVALID");
  return url;
}

export function cameraPort(value: unknown, fallback = 80) {
  const port = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CameraError("CAMERA_PORT_INVALID");
  return port;
}

export function cameraSubnet(raw: unknown) {
  const value = String(raw ?? "").trim();
  const [host, prefixText = "32", extra] = value.split("/");
  privateCameraHost(host);
  const prefix = Number(prefixText);
  if (extra !== undefined || !Number.isInteger(prefix) || prefix < 24 || prefix > 32) throw new CameraError("CAMERA_RANGE_INVALID");
  const number = host.split(".").reduce((n, part) => ((n << 8) | Number(part)) >>> 0, 0);
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  const network = (number & mask) >>> 0;
  const ip = (n: number) => [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join(".");
  const count = 2 ** (32 - prefix);
  const addresses = Array.from({ length: prefix <= 30 ? count - 2 : count }, (_, i) => ip((network + i + (prefix <= 30 ? 1 : 0)) >>> 0));
  addresses.forEach(privateCameraHost);
  return { cidr: `${ip(network)}/${prefix}`, addresses };
}

export async function boundedMap<T, R>(items: T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; results[index] = await work(items[index]); }
  }));
  return results;
}

export function openCameraPort(host: string, port: number, timeout = 450): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const finish = (open: boolean) => { socket.destroy(); resolve(open); };
    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
    socket.connect(port, host);
  });
}

export type CameraCredentials = { username?: string; password?: string };
type HttpResult = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

/** Never follows a redirect or resolves a hostname. Device-returned URLs remain pinned to its private IP. */
export function cameraHttp(url: URL, options: { method?: string; body?: string; headers?: Record<string, string>; timeout?: number; maxBytes?: number }): Promise<HttpResult> {
  privateCameraHost(url.hostname);
  return new Promise((resolve, reject) => {
    const body = options.body;
    const request = (url.protocol === "https:" ? https : http).request(url, {
      method: options.method ?? "GET", rejectUnauthorized: true,
      headers: { ...(body ? { "Content-Length": String(Buffer.byteLength(body)) } : {}), ...options.headers }
    }, (response) => {
      let length = 0;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > (options.maxBytes ?? 512 * 1024)) { response.destroy(); request.destroy(); reject(new CameraError("CAMERA_RESPONSE_TOO_LARGE", 502)); }
        else chunks.push(chunk);
      });
      response.once("end", () => resolve({ status: response.statusCode ?? 500, headers: response.headers, body: Buffer.concat(chunks) }));
      response.once("error", () => reject(new CameraError("CAMERA_CONNECTION_FAILED", 502)));
    });
    request.setTimeout(options.timeout ?? 4000, () => { request.destroy(); reject(new CameraError("CAMERA_TIMEOUT", 504)); });
    request.once("error", () => reject(new CameraError("CAMERA_CONNECTION_FAILED", 502)));
    request.end(body);
  });
}

export function cameraAuthorization(challenge: string, method: string, url: URL, credentials: CameraCredentials) {
  if (!credentials.username || !credentials.password) return undefined;
  if (/^Basic\s/i.test(challenge)) return `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`;
  if (!/^Digest\s/i.test(challenge)) return undefined;
  const parts: Record<string, string> = {};
  for (const match of challenge.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)) parts[match[1].toLowerCase()] = match[2] ?? match[3];
  const algorithm = (parts.algorithm ?? "MD5").toUpperCase();
  if (!["MD5", "MD5-SESS", "SHA-256", "SHA-256-SESS"].includes(algorithm) || !parts.nonce || !parts.realm) return undefined;
  const hash = (value: string) => createHash(algorithm.startsWith("SHA-256") ? "sha256" : "md5").update(value).digest("hex");
  const cnonce = randomBytes(12).toString("hex"), nc = "00000001", uri = `${url.pathname}${url.search}`;
  const qop = parts.qop?.split(",").map((v) => v.trim()).includes("auth") ? "auth" : undefined;
  if (parts.qop && !qop) return undefined;
  let ha1 = hash(`${credentials.username}:${parts.realm}:${credentials.password}`);
  if (algorithm.endsWith("-SESS")) ha1 = hash(`${ha1}:${parts.nonce}:${cnonce}`);
  const response = hash(qop ? `${ha1}:${parts.nonce}:${nc}:${cnonce}:${qop}:${hash(`${method}:${uri}`)}` : `${ha1}:${parts.nonce}:${hash(`${method}:${uri}`)}`);
  const quote = (v: string) => `"${v.replace(/["\\\r\n]/g, "")}"`;
  return `Digest username=${quote(credentials.username)}, realm=${quote(parts.realm)}, nonce=${quote(parts.nonce)}, uri=${quote(uri)}, response=${quote(response)}, algorithm=${algorithm}${parts.opaque ? `, opaque=${quote(parts.opaque)}` : ""}${qop ? `, qop=auth, nc=${nc}, cnonce=${quote(cnonce)}` : algorithm.endsWith("-SESS") ? `, cnonce=${quote(cnonce)}` : ""}`;
}

export async function authenticatedCameraHttp(url: URL, credentials: CameraCredentials, options: Parameters<typeof cameraHttp>[1]) {
  const first = await cameraHttp(url, options);
  if (first.status !== 401) return first;
  if (!credentials.username || !credentials.password) return first;
  const challenge = String(first.headers["www-authenticate"] ?? "");
  const authorization = cameraAuthorization(challenge, options.method ?? "GET", url, credentials);
  if (!authorization) throw new CameraError("CAMERA_AUTH_REQUIRED", 401);
  const next = await cameraHttp(url, { ...options, headers: { ...options.headers, Authorization: authorization } });
  if (next.status === 401 || next.status === 403) throw new CameraError("CAMERA_AUTH_FAILED", 401);
  return next;
}
