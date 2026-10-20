import { createHash } from "node:crypto";
import { cameraHttp, cameraUrl, CameraError, type CameraCredentials } from "./camera-network.js";
import type { NvrDisk } from "./nvr-storage.js";
import type { NvrReport } from "./nvr-monitor.js";
import { dvripPasswordHash } from "./nvr-dvrip.js";

const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === "string" ? v.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 160) : "";
/** AppWeb Storage.js renders these strings directly and converts GB to MB with 1024. Bare numbers have no verified unit. */
function capacity(v: unknown) {
  const match = typeof v === "string" ? /^\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)\s*$/i.exec(v) : null;
  if (!match) return null;
  const n = Math.round(Number(match[1]) * 1024 ** ["B", "KB", "MB", "GB", "TB"].indexOf(match[2].toUpperCase()));
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
export function parseAppWebDisks(input: unknown): NvrDisk[] {
  if (!Array.isArray(input) || input.some(v => !v || typeof v !== "object" || Array.isArray(v))) throw new CameraError("NVR_STORAGE_RESPONSE_INVALID", 502);
  return input.slice(0, 32).map((v, i) => {
    const d = object(v), total = capacity(d.StorageSize), free = capacity(d.StorageRemain), state = text(d.StorageState);
    const validFree = total !== null && free !== null && free <= total ? free : null;
    return { id: String(i + 1), name: `HDD ${text(String(d.Storage ?? i + 1))}`, capacityBytes: total, freeBytes: validFree,
      usedBytes: total !== null && validFree !== null ? total - validFree : null,
      health: state === "StateOK" ? "reported_ok" : state === "StateErr" ? "error" : "unknown", reportedState: state || "unknown",
      temperatureC: null, smart: "unknown" };
  });
}
const active = new Set<string>(), cooldown = new Map<string, number>();
// Despite its hex_md5 name, AppWeb MD5.js compresses MD5 bytes to eight base62 characters.
// Both the password and password+salt stages use that exact transform, not hexadecimal MD5.
export const appWebPasswordResponse = (password: string, salt: string) => dvripPasswordHash(dvripPasswordHash(password) + salt);
function checkStatus(raw: unknown) {
  const status = object(raw).statusValue;
  if (status === undefined || String(status) === "200") return;
  const code = String(status);
  throw new CameraError(code === "203" ? "NVR_APPWEB_AUTH_FAILED" : ["206", "207"].includes(code) ? "NVR_ACCOUNT_LOCKED" : code === "208" ? "NVR_APPWEB_SESSION_BUSY" : "NVR_ACCESS_DENIED", 401);
}
/** Fixed AppWeb2.0 reads only. Never execute the panel's JS/plugin, clock-sync, storageopt or arbitrary CGI. */
export type AppWebRequest = (path: string, method?: string, body?: string) => Promise<{ data: unknown; headers: import("node:http").IncomingHttpHeaders }>;
export async function withAppWebSession<T>(host: string, port: number, https: boolean, credentials: CameraCredentials, work: (request: AppWebRequest) => Promise<T>): Promise<T> {
  const origin = `${https ? "https" : "http"}://${host}:${port}`, started = Date.now(), deadline = started + 22000;
  cameraUrl(origin, host);
  if (!credentials.username || credentials.password === undefined) throw new CameraError("CAMERA_AUTH_REQUIRED", 401);
  // A changed saved account can be tested immediately; repeated failed credentials cannot lock the recorder through UI polling.
  const key = createHash("sha256").update(`${origin}\0${credentials.username}\0${credentials.password}`).digest("hex");
  for (const [k, until] of cooldown) if (until <= started) cooldown.delete(k);
  if (cooldown.has(key)) throw new CameraError("NVR_APPWEB_AUTH_COOLDOWN", 429);
  if (active.has(origin) || active.size >= 8) throw new CameraError("CAMERA_MONITOR_BUSY", 409);
  active.add(origin);
  let cookie = "", loggedIn = false;
  const request = async (path: string, method = "GET", body?: string) => {
    const read = /^\/CGI\/(?:Custom\/version|Record\/storageinfo|General\/(?:time|general)|Network\/netcommon|NetService\/rtsp|NetService\/decorder\/channels\/-1|Record\/record\/channels\/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-7]))$/.test(path);
    // playback.js uses PUT for searches; these two endpoints do not change recording settings.
    const search = method === "PUT" && ["/CGI/Record/filelist", "/CGI/Record/filemonth"].includes(path);
    const write = path === "/CGI/General/general" || /^\/CGI\/Record\/record\/channels\/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-7])$/.test(path);
    const authentication = method === "GET" && /^\/CGI\/Security\/sessionLogin\?timestamp:\d+$/.test(path) || method === "POST" && path === "/CGI/Security/SelfExt/userCheck";
    if (!(method === "GET" && read || method === "PUT" && write || search || authentication)) throw new CameraError("NVR_CONFIG_OPERATION_UNSUPPORTED", 422);
    const remaining = deadline - Date.now(); if (remaining <= 0) throw new CameraError("CAMERA_TIMEOUT", 504);
    const response = await cameraHttp(cameraUrl(origin + path, host), { method, body, timeout: Math.min(4000, remaining), maxBytes: 512 * 1024,
      headers: { "If-Modified-Since": "0", ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) } });
    if ([401, 403].includes(response.status)) throw new CameraError("NVR_ACCESS_DENIED", 401);
    if ([404, 405, 501].includes(response.status)) throw new CameraError("NVR_APPWEB_UNSUPPORTED", 422);
    if (response.status !== 200) throw new CameraError("NVR_STORAGE_UNAVAILABLE", 502);
    let data: unknown;
    try { data = JSON.parse(response.body.toString("utf8")); } catch { throw new CameraError("NVR_APPWEB_RESPONSE_INVALID", 502); }
    checkStatus(data);
    return { data, headers: response.headers };
  };
  try {
    const challenge = await request(`/CGI/Security/sessionLogin?timestamp:${Date.now()}`), a = object(challenge.data);
    if (String(a.statusValue) !== "200" || typeof a.salt !== "string" || a.salt.length > 256 || typeof a.sessionID !== "string" || !/^[\w.-]{1,256}$/.test(a.sessionID)) throw new CameraError("NVR_APPWEB_RESPONSE_INVALID", 502);
    cookie = (challenge.headers["set-cookie"] ?? []).slice(0, 8).map(s => s.split(";")[0]).filter(s => /^[\w.-]+=[\x21-\x3a\x3c-\x7e]*$/.test(s)).join("; ").slice(0, 2048);
    const login = object((await request("/CGI/Security/SelfExt/userCheck", "POST", JSON.stringify({ Username: credentials.username, Password: appWebPasswordResponse(credentials.password, a.salt), Sessionid: a.sessionID }))).data);
    if (String(login.statusValue) !== "200" || typeof login.sessionID !== "string" || !/^[\w.-]{1,256}$/.test(login.sessionID)) throw new CameraError("NVR_APPWEB_RESPONSE_INVALID", 502);
    cookie = [...cookie.split("; ").filter(s => s && !s.startsWith("webSessionID=")), `webSessionID=${login.sessionID}`].join("; "); loggedIn = true;
    return await work(request);
  } catch (error) {
    if (error instanceof CameraError && ["NVR_APPWEB_AUTH_FAILED", "NVR_ACCOUNT_LOCKED", "NVR_ACCESS_DENIED"].includes(error.code)) {
      if (cooldown.size >= 256) cooldown.delete(cooldown.keys().next().value!);
      cooldown.set(key, Date.now() + 60000);
    }
    throw error;
  } finally {
    if (loggedIn) await cameraHttp(cameraUrl(origin + "/CGI/Security/Lougout", host), { method: "POST", headers: { Cookie: cookie }, timeout: 1500, maxBytes: 4096 }).catch(() => undefined);
    active.delete(origin);
  }
}


/** Existing read-only monitor shares bounded login/cooldown with registered configuration operations. */
export async function probeAppWebNvr(host: string, port: number, https: boolean, credentials: CameraCredentials): Promise<NvrReport> {
  const probeStarted = Date.now();
  return withAppWebSession(host, port, https, credentials, async request => {
    const report: NvrReport = { checkedAt: new Date().toISOString(), adapter: "appweb", reachable: true, durationMs: 0, identity: {}, configuredChannels: 0,
      clockDriftSeconds: null, storageConfigurations: null, recordingCount: null, jobs: [], interfaces: [], warnings: [], truncated: false,
      coverage: { identity: "unavailable", configuredChannels: "unsupported", clock: "unsupported", network: "unsupported", recordings: "unsupported", recordingJobs: "unsupported", cpu: "unsupported", memory: "unsupported", channelOnline: "unsupported", diskCapacity: "unavailable", diskHealth: "unavailable" },
      storage: { source: "appweb", status: "unavailable", disks: [], truncated: false },
      native: { protocol: "appweb", wireVersion: 0, identity: {}, configuredChannels: null, uptimeSeconds: null, deviceLocalTime: null, channels: [], disks: null, errors: {} } };
    const optional = async (section: string, work: () => Promise<void>) => { try { await work(); } catch (e) { report.native!.errors[section] = e instanceof CameraError ? e.code : "CAMERA_CONNECTION_FAILED"; } };
    await optional("identity", async () => {
      const v = object((await request("/CGI/Custom/version")).data);
      const fields = { Model: "HardWareVersion", FirmwareVersion: "Version", SerialNumber: "SeriaNo", BuildTime: "BulidDate" };
      report.identity = Object.fromEntries(Object.entries(fields).flatMap(([k, source]) => text(v[source]) ? [[k, text(v[source])]] : []));
      report.native!.identity = report.identity; report.coverage.identity = Object.keys(report.identity).length ? "measured" : "unavailable";
      const counts = [v.VideoInChannel, v.DigChannel].filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 128);
      if (counts.length) { report.configuredChannels = Math.max(...counts); report.native!.configuredChannels = report.configuredChannels; report.coverage.configuredChannels = "measured"; }
    });
    await optional("storage", async () => {
      const v = (await request("/CGI/Record/storageinfo")).data, disks = parseAppWebDisks(v);
      report.storage = { source: "appweb", status: "measured", disks, truncated: Array.isArray(v) && v.length > 32 }; report.native!.disks = disks;
      report.coverage.diskCapacity = disks.some(d => d.capacityBytes !== null) ? "measured" : "unavailable";
      report.coverage.diskHealth = disks.some(d => d.health !== "unknown") ? "measured" : "unsupported";
      if (!disks.length) report.warnings.push("no_disks_reported");
      if (disks.some(d => d.health === "error")) report.warnings.push("disk_error");
    });
    await optional("clock", async () => {
      const v = object((await request("/CGI/General/time")).data);
      if (typeof v.SystemTime === "string" && /^\d{4}-\s?\d{1,2}-\s?\d{1,2}\s+\d{1,2}:\d{2}:\d{2}$/.test(v.SystemTime)) report.native!.deviceLocalTime = v.SystemTime;
    });
    if (report.native!.errors.storage) { report.storage!.errorCode = report.native!.errors.storage; report.storage!.status = report.storage!.errorCode === "NVR_ACCESS_DENIED" ? "denied" : "unavailable"; }
    if (Object.keys(report.native!.errors).length) report.warnings.push("native_partial_coverage");
    report.durationMs = Date.now() - probeStarted; return report;
  });
}
