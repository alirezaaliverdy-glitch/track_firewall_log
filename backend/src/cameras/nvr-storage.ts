import { authenticatedCameraHttp, cameraUrl, CameraError } from "./camera-network.js";
import { nodes, parseCameraXml, type CameraConnection, type XmlNode } from "./camera-onvif.js";
import { readDvripStorage } from "./nvr-dvrip.js";

export type NvrDisk = { id: string; name: string; capacityBytes: number | null; usedBytes: number | null; freeBytes: number | null;
  health: "reported_ok" | "error" | "unknown"; reportedState: string; temperatureC: number | null; smart: "passed" | "failed" | "unknown" };
export type NvrStorage = { source: "hikvision" | "dahua" | "xiongmai" | "appweb" | null; status: "measured" | "unsupported" | "denied" | "unavailable";
  disks: NvrDisk[]; errorCode?: string; truncated: boolean };
const text = (root: XmlNode, key: string) => (nodes(root, key)[0]?.text.trim() ?? "").slice(0, 160);
function bytes(value: string, multiplier = 1) { if (!/^\d+(?:\.\d+)?$/.test(value)) return null; const result = Math.round(Number(value) * multiplier); return Number.isSafeInteger(result) && result >= 0 ? result : null; }
const cleanPair = (total: number | null, used: number | null) => total !== null && used !== null && used <= total ? used : null;

export function parseHikvisionDisks(xml: string): NvrDisk[] {
  const root = parseCameraXml(xml);
  if (!nodes(root, "hddList").length && !nodes(root, "storage").length) throw new CameraError("NVR_STORAGE_RESPONSE_INVALID", 502);
  return nodes(root, "hdd").slice(0, 32).map<NvrDisk>((hdd, index) => {
    // ISAPI HDD capacity/freeSpace are reported in MB, not raw bytes.
    const capacityBytes = bytes(text(hdd, "capacity"), 1000000), rawFree = bytes(text(hdd, "freeSpace"), 1000000);
    const freeBytes = cleanPair(capacityBytes, rawFree), state = text(hdd, "status").toLowerCase();
    return { id: text(hdd, "id") || String(index + 1), name: text(hdd, "hddName") || `HDD ${index + 1}`, capacityBytes,
      freeBytes, usedBytes: capacityBytes !== null && freeBytes !== null ? capacityBytes - freeBytes : null,
      health: ["error", "unformatted", "notexist", "abnormal"].includes(state) ? "error" : ["ok", "normal"].includes(state) ? "reported_ok" : "unknown",
      reportedState: state || "unknown", temperatureC: null, smart: "unknown" };
  });
}
export function parseDahuaDisks(body: string): NvrDisk[] {
  const entries = new Map<string, string>();
  for (const line of body.split(/\r?\n/).slice(0, 4000)) { const match = /^(list\[\d+\](?:\.Detail\[\d+\])?\.[A-Za-z]+)=(.*)$/.exec(line.trim()); if (match) entries.set(match[1], match[2].replace(/^"|"$/g, "").slice(0, 160)); }
  const ids = [...new Set([...entries.keys()].map(key => /^list\[(\d+)\]/.exec(key)![1]))].slice(0, 32);
  if (!ids.length) throw new CameraError("NVR_STORAGE_RESPONSE_INVALID", 502);
  return ids.map<NvrDisk>(id => {
    const prefix = `list[${id}]`, partitions = [...new Set([...entries.keys()].flatMap(key => key.startsWith(prefix + ".Detail[") ? [key.slice(0, key.indexOf("].", prefix.length) + 1)] : []))].slice(0, 32);
    const read = (key: string) => entries.get(key) ?? "";
    const totals = partitions.map(p => bytes(read(`${p}.TotalBytes`))), used = partitions.map(p => bytes(read(`${p}.UsedBytes`)));
    const sum = (values: (number | null)[]) => values.length && values.every(v => v !== null) && Number.isSafeInteger(values.reduce<number>((s, v) => s + (v ?? 0), 0)) ? values.reduce<number>((s, v) => s + (v ?? 0), 0) : null;
    const capacityBytes = sum(totals), usedBytes = cleanPair(capacityBytes, sum(used));
    const errors = partitions.map(p => read(`${p}.IsError`).toLowerCase());
    return { id, name: read(`${prefix}.Name`) || `HDD ${Number(id) + 1}`, capacityBytes, usedBytes,
      freeBytes: capacityBytes !== null && usedBytes !== null ? capacityBytes - usedBytes : null,
      // State=Success confirms the API call, NOT the physical health of the disk.
      health: errors.includes("true") ? "error" : errors.length && errors.every(e => e === "false") ? "reported_ok" : "unknown",
      reportedState: errors.includes("true") ? "partition_error" : read(`${prefix}.State`) || "unknown", temperatureC: null, smart: "unknown" };
  });
}
/** Only fixed, read-only vendor endpoints; no arbitrary URL, format, reset or SMART-test start. */
export async function probeNvrStorage(host: string, connection: CameraConnection, manufacturer: string, defaultPort: number, defaultHttps: boolean): Promise<NvrStorage> {
  const settings = connection.storage, brand = manufacturer.toLowerCase();
  const source = settings?.adapter && settings.adapter !== "auto" ? settings.adapter : /hikvision|hiwatch|hilook/.test(brand) ? "hikvision" : /dahua|amcrest|intelbras/.test(brand) ? "dahua" : /xiongmai|xmeye|hangzhou xiongmai/.test(brand) ? "xiongmai" : null;
  if (!source) return { source: null, status: "unsupported", disks: [], truncated: false, errorCode: "NVR_STORAGE_ADAPTER_REQUIRED" };
  const report: NvrStorage = { source, status: "unavailable", disks: [], truncated: false };
  const credentials = settings?.username ? { username: settings.username, password: settings.password } : connection;
  if (source === "xiongmai") {
    try { report.disks = await readDvripStorage(host, settings?.adapter === "xiongmai" ? settings.port ?? 34567 : 34567, credentials); report.status = "measured"; }
    catch (e) { report.errorCode = e instanceof CameraError ? e.code : "NVR_STORAGE_UNAVAILABLE"; report.status = report.errorCode.includes("AUTH") || report.errorCode === "NVR_ACCOUNT_LOCKED" ? "denied" : report.errorCode === "NVR_STORAGE_UNSUPPORTED" ? "unsupported" : "unavailable"; }
    return report;
  }
  const origin = `${settings?.https ?? defaultHttps ? "https" : "http"}://${host}:${settings?.port ?? defaultPort}`;
  const get = async (path: string) => {
    const response = await authenticatedCameraHttp(cameraUrl(origin + path, host), credentials, { method: "GET", timeout: 3000, maxBytes: 512 * 1024 });
    if ([401, 403].includes(response.status)) throw new CameraError("CAMERA_AUTH_FAILED", 401);
    if ([404, 405, 501].includes(response.status)) throw new CameraError("NVR_STORAGE_UNSUPPORTED", 422);
    if (response.status !== 200) throw new CameraError("NVR_STORAGE_UNAVAILABLE", 502);
    return response.body.toString("utf8");
  };
  try {
    report.disks = source === "hikvision" ? parseHikvisionDisks(await get("/ISAPI/ContentMgmt/Storage/hdd")) : parseDahuaDisks(await get("/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo"));
    report.status = "measured";
    if (source === "hikvision") for (const disk of report.disks.slice(0, 4)) {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(disk.id)) continue;
      try {
        const root = parseCameraXml(await get(`/ISAPI/ContentMgmt/Storage/hdd/${encodeURIComponent(disk.id)}/SMARTTest/status`));
        if (!nodes(root, "SmartTestStatus").length) continue;
        const temperature = Number(text(root, "temprature"));
        if (text(root, "temprature") && Number.isFinite(temperature) && temperature >= -20 && temperature <= 150) disk.temperatureC = temperature;
        const self = text(root, "selfEvaluaingStatus"), overall = text(root, "allEvaluaingStatus");
        if (self === "error" || ["badsectors", "fault"].includes(overall)) { disk.smart = "failed"; disk.health = "error"; }
        else if (self === "ok" && overall === "functional") disk.smart = "passed";
      } catch { /* SMART is optional; never infer a pass from missing/denied data. */ }
    }
    report.truncated = report.disks.length >= 32 || source === "hikvision" && report.disks.length > 4;
  } catch (e) { report.errorCode = e instanceof CameraError ? e.code : "NVR_STORAGE_UNAVAILABLE"; report.status = report.errorCode.includes("AUTH") ? "denied" : report.errorCode === "NVR_STORAGE_UNSUPPORTED" ? "unsupported" : "unavailable"; }
  return report;
}
