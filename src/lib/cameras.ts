import { apiRequest, apiUrl } from "./apiTransport";

export type CameraProfile = { token: string; name: string; sourceToken: string; width: number | null; height: number | null; encoding: string | null; fps: number | null; ptz: boolean; streamAvailable: boolean; snapshotAvailable: boolean };
export type CameraDevice = {
  company?: { id: string; name: string; code: string } | null;
  id: string; name: string; location: string; host: string; companyId?: string | null; monitoringEnabled?: boolean; monitorIntervalSeconds?: number; monitorReportJson?: NvrReport | null; vpnConnectionId?: string | null; kind: "camera" | "nvr"; connectionMode: "onvif" | "rtsp" | "dvrip" | "appweb";
  onvifPort: number; onvifPath: string; onvifHttps: boolean; status: "verified" | "error" | "unverified"; lastSeenAt: string | null; lastErrorCode: string | null;
  infoJson: Record<string, string> | null; profiles: CameraProfile[]; credentialsConfigured: boolean; createdAt: string;
  storageSettings?: { adapter: "auto" | "hikvision" | "dahua" | "xiongmai"; port: number; https: boolean; separateCredentials: boolean };
};
export type CameraCandidate = { host: string; onvifPort: number; onvifPath: string; onvifHttps: boolean; name: string; evidence: "onvif" | "rtsp"; requiresCredentials: boolean; registered: boolean };
export type CameraDiscovery = { cidr: string; candidates: CameraCandidate[]; scannedAddresses: number; partial: boolean };
export type CameraInput = { storageSettings?: { adapter: "auto" | "hikvision" | "dahua" | "xiongmai"; port: number; https: boolean; useDeviceCredentials: boolean; username?: string; password?: string }; companyId?: string; monitoringEnabled?: boolean; monitorIntervalSeconds?: number; host: string; name: string; location: string; kind: "camera" | "nvr"; connectionMode: "onvif" | "rtsp" | "dvrip" | "appweb"; onvifPort: number; onvifPath: string; onvifHttps?: boolean; username?: string; password?: string; rtspUrl?: string; vpnConnectionId?: string };
export type CameraCompany = { id: string; name: string; code: string; description: string | null; cameraCount: number; nvrCount: number };
export type NvrReport = { checkedAt: string; reachable: boolean; durationMs: number; errorCode?: string; configuredChannels: number; clockDriftSeconds: number | null; storageConfigurations: number | null; recordingCount: number | null;
  native?: { protocol?: "dvrip" | "appweb"; wireVersion: number; identity: Record<string, string>; configuredChannels: number | null; uptimeSeconds: number | null; deviceLocalTime: string | null; channels: { index: number; recording: boolean | null; signalPresent: boolean | null; bitrateBps: number | null }[]; errors: Record<string, string> };
  jobs: { token: string; state: string; error: boolean }[]; interfaces: { name: string; enabled: boolean | null; addresses: string[] }[]; coverage: Record<string, string>; warnings: string[]; truncated: boolean; identity: Record<string, string>;
  storage?: { source: "hikvision" | "dahua" | "xiongmai" | "appweb" | null; status: string; errorCode?: string; truncated: boolean; disks: { id: string; name: string; capacityBytes: number | null; usedBytes: number | null; freeBytes: number | null; health: string; reportedState: string; smart: string; temperatureC: number | null }[] } };
export type NvrSensor = { id: string; labelFa: string; labelEn: string; group: "connection" | "storage" | "recording" | "hardware"; value: number | null; unit: string; status: "ok" | "warning" | "critical" | "unknown" | "stale"; source: string; observedAt: string | null; noteFa: string; noteEn: string };
export type NvrMonitor = { report: NvrReport | null; sensors?: NvrSensor[]; history: { checkedAt: string; reachable: boolean; warningCount: number; readings?: Record<string, number> }[]; monitoringEnabled: boolean; intervalSeconds: number };
export type CameraPreview = { id: string; status: string; expiresAt: string; preview: { titleFa: string; titleEn: string; cameraName: string; host: string; effectFa: string; effectEn: string; risk: string; connectorInvoked: false } };
export type CameraResult = { status: string; connectorInvoked: boolean; accepted?: boolean; code?: string; requiresReconnect?: boolean };
export type CameraHistory = { id: string; operation: string; status: string; createdAt: string; previewJson: CameraPreview["preview"]; resultJson: CameraResult | null };

const errors: Record<string, [string, string]> = {
  NVR_APPWEB_AUTH_FAILED: ["پنل NVR اطلاعات ذخیره‌شده را رد کرد (کد ۲۰۳). نام کاربری و رمز همین دستگاه را در ویرایش اتصال دوباره ذخیره کن؛ تلاش خودکار متوقف شد.", "NVR web login rejected the saved account (203). Update this device's credentials. Automatic retries stopped."],
  NVR_APPWEB_AUTH_COOLDOWN: ["برای جلوگیری از قفل حساب، یک دقیقه صبر کن یا اطلاعات ورود اصلاح‌شده را ذخیره کن.", "Wait one minute before retrying failed credentials, or save corrected credentials."],
  NVR_APPWEB_SESSION_BUSY: ["NVR این حساب را در حال استفاده می‌داند؛ از پنل یا نرم‌افزار دیگر خارج شو و دوباره بررسی کن.", "NVR reports this account is already in use. Log out of other clients first."],
  NVR_APPWEB_UNSUPPORTED: ["این آدرس، رابط AppWeb را ارائه نمی‌کند؛ روش اتصال و پورت وب را بررسی کن.", "AppWeb CGI is unavailable. Check the protocol and web port."],
  NVR_APPWEB_RESPONSE_INVALID: ["پاسخ رابط AppWeb با این نسخه سازگار نبود؛ اطلاعات نامعتبر نمایش داده نشد.", "Invalid or incompatible AppWeb response. Unverified data was not displayed."],
  NVR_DVRIP_CONNECT_TIMEOUT: ["اتصال TCP به NVR برقرار نشد؛ پورت، مسیر و VPN را بررسی کن.", "TCP connection timed out. Check the port and route."],
  NVR_DVRIP_LOGIN_TIMEOUT: ["پورت NVR باز است اما به ورود DVRIP پاسخ نداد؛ سرویس TCP، محدودیت اتصال و سازگاری پروتکل را بررسی کن.", "The port is open but DVRIP login got no reply. Check the service, connection limit and protocol compatibility."],
  NVR_DVRIP_READ_TIMEOUT: ["ورود انجام شد ولی پاسخ اطلاعات NVR نرسید؛ پایش را بعداً تکرار کن.", "Login succeeded but the NVR information request timed out."],
  NVR_ACCESS_DENIED: ["حساب دستگاه مجوز خواندن این اطلاعات را ندارد؛ حساب مجاز انتخاب کن.", "The device account cannot read this information."],
  NVR_DVRIP_VERSION_UNSUPPORTED: ["نسخهٔ DVRIP این دستگاه سازگار نیست.", "Unsupported DVRIP framing version."],
  CAMERA_XML_INVALID: ["پاسخ دستگاه XML معتبر ONVIF نبود؛ سرویس و پورت ONVIF را بررسی کن یا مسیر DVRIP را انتخاب کن.", "Device response was not valid ONVIF XML. Check the ONVIF endpoint or select DVRIP."],
  CAMERA_TRANSFER_SAME_COMPANY: ["شرکت مقصد باید با شرکت فعلی دستگاه متفاوت باشد.", "Choose a different destination company."],
  CAMERA_SELECTION_INVALID: ["یک تا ۲۵۶ دستگاه را انتخاب کن.", "Select between 1 and 256 devices."],
  NVR_ASSET_IP_CONFLICT: ["در شرکت مقصد یک دارایی دیگر با همین IP وجود دارد؛ انتقال یا ثبت انجام نشد.", "Another destination asset already uses this IP. Nothing was moved or registered."],
  CAMERA_TRANSFER_CONFLICT: ["دستگاه هم‌آدرس در مقصد وجود دارد؛ هیچ‌کدام منتقل نشدند.", "A matching device exists at the destination. No devices were moved."],
  CAMERA_COMPANY_REQUIRED: ["ابتدا شرکت دستگاه را انتخاب کن.", "Select the device company first."],
  CAMERA_COMPANY_NOT_FOUND: ["شرکت انتخاب‌شده در دسترس نیست.", "This company is not available."],
  CAMERA_MONITOR_BUSY: ["پایش در حال اجراست؛ کمی بعد تلاش کن.", "Monitoring is busy. Try again shortly."],
  CAMERA_MONITOR_UNAVAILABLE: ["پایش ساخت‌یافته به NVR با ONVIF نیاز دارد.", "Structured monitoring requires an ONVIF NVR."],
  NVR_STORAGE_ADAPTER_REQUIRED: ["مسیر هارد را در تنظیمات زیر انتخاب کن؛ برای مدل‌های دیگر API یا SDK سازنده لازم است.", "Select a disk adapter below. Other models require their manufacturer's API or SDK."],
  NVR_STORAGE_UNSUPPORTED: ["این دستگاه مسیر هارد انتخاب‌شده را پشتیبانی نمی‌کند یا API غیرفعال است.", "This disk API is unsupported or disabled on the device."],
  NVR_STORAGE_RESPONSE_INVALID: ["پاسخ هارد با پروتکل انتخاب‌شده سازگار نبود؛ برند و پورت وب را بررسی کن.", "Disk response did not match the selected protocol. Check the vendor and web port."],
  NVR_STORAGE_UNAVAILABLE: ["اطلاعات هارد دریافت نشد؛ مسیر و مجوز حساب را بررسی کن.", "Disk data unavailable. Check the route and account permissions."],
  NVR_ACCOUNT_LOCKED: ["دستگاه حساب یا IP را قفل کرده؛ پایش خودکار متوقف شد. ابتدا قفل و اطلاعات ورود را بررسی کن.", "Device locked the account or IP. Scheduled checks stopped; review credentials and unlock first."],
  NVR_DVRIP_ENCRYPTION_REQUIRED: ["این نسخهٔ DVRIP به رمزنگاری اختصاصی نیاز دارد؛ این مسیر فعلاً پشتیبانی نمی‌شود.", "This DVRIP firmware requires vendor encryption that is not currently supported."],
  VPN_NOT_FOUND: ["این VPN در فضای کاری شما پیدا نشد.", "This VPN was not found in your workspace."],
  VPN_TARGET_OUTSIDE_ROUTES: ["IP دوربین در بازهٔ VPN انتخاب‌شده نیست.", "The camera IP is outside the selected VPN ranges."],
  VPN_CONNECT_FIRST: ["ابتدا VPN این دوربین را وصل کن، سپس دوباره تلاش کن.", "Connect this camera's VPN and try again."],
  VPN_AGENT_UNAVAILABLE: ["سرویس VPN آماده نیست؛ اتصال را بررسی کن.", "The VPN service is unavailable."],
  VPN_TARGET_USES_TUNNEL: ["این IP اکنون از VPN عبور می‌کند؛ VPN مربوط را انتخاب کن.", "This IP currently uses a VPN; select that connection."],
  VPN_ROUTE_MISMATCH: ["مسیر این IP متعلق به VPN دیگری است.", "This IP routes through another VPN."],
  VPN_ROUTE_NOT_ACTIVE: ["مسیر VPN این دوربین هنوز فعال نیست.", "The camera VPN route is not active."],
  CAMERA_PRIVATE_IP_REQUIRED: ["IP خصوصی دوربین یا NVR را وارد کن.", "Enter a private IPv4 address."],
  CAMERA_RANGE_INVALID: ["بازه باید خصوصی و حداکثر ۲۵۶ آدرس باشد؛ مثل 192.168.18.0/24.", "Use a private range with at most 256 addresses, such as 192.168.18.0/24."],
  CAMERA_URL_INVALID: ["آدرس تصویر باید بدون نام کاربری و رمز، روی IP همین دستگاه باشد.", "Use a stream URL on this device's IP, without embedded credentials."],
  CAMERA_PORT_INVALID: ["پورت باید بین ۱ و ۶۵۵۳۵ باشد.", "Port must be between 1 and 65535."],
  CAMERA_PATH_INVALID: ["مسیر سرویس ONVIF معتبر نیست.", "Invalid ONVIF service path."],
  CAMERA_ALREADY_REGISTERED: ["این دستگاه قبلاً اضافه شده است.", "This device is already registered."],
  CAMERA_AUTH_REQUIRED: ["نام کاربری و رمز ONVIF دستگاه را وارد کن.", "Enter the device's ONVIF username and password."],
  CAMERA_AUTH_FAILED: ["دستگاه ورود را رد کرد؛ کاربر ONVIF و رمز را بررسی کن.", "Device rejected authentication. Check its ONVIF account and password."],
  CAMERA_TIMEOUT: ["دستگاه پاسخ نداد؛ مسیر شبکه و پورت را بررسی کن.", "Device did not respond. Check its network route and port."],
  CAMERA_CONNECTION_FAILED: ["سرور برنامه به دستگاه متصل نشد؛ IP، پورت و مسیر شبکه را بررسی کن.", "The app server could not connect. Check the IP, port, and network route."],
  CAMERA_ONVIF_UNAVAILABLE: ["ONVIF در این آدرس پاسخ نمی‌دهد؛ آن را روی دستگاه فعال کن یا از RTSP استفاده کن.", "ONVIF is unavailable here. Enable it on the device or use RTSP."],
  CAMERA_MEDIA_UNAVAILABLE: ["دستگاه سرویس تصویر ONVIF را ارائه نکرد.", "The device did not expose an ONVIF media service."],
  CAMERA_PROFILES_UNAVAILABLE: ["کانال تصویری دریافت نشد؛ دسترسی کاربر و تنظیمات ONVIF را بررسی کن.", "No video profiles received. Check the account's access and ONVIF settings."],
  CAMERA_DISCOVERY_BUSY: ["کشف شبکه در حال اجراست.", "Discovery is already running."],
  CAMERA_VIEW_LIMIT: ["حداکثر چهار تصویر را هم‌زمان باز کن.", "Open at most four live views at once."],
  CAMERA_STREAM_UNAVAILABLE: ["این کانال آدرس پخش ارائه نکرد؛ اتصال را دوباره بررسی کن.", "This profile has no stream URL. Refresh the connection."],
  CAMERA_VIDEO_TIMEOUT: ["تصویر نرسید؛ RTSP، دسترسی کاربر و کیفیت انتخاب‌شده را بررسی کن.", "No video received. Check RTSP, account access, and selected quality."],
  CAMERA_VIDEO_FAILED: ["پخش تصویر قطع شد؛ اتصال را دوباره بررسی کن.", "Video stopped. Check the connection and try again."],
  CAMERA_PTZ_UNAVAILABLE: ["این کانال کنترل حرکت را پشتیبانی نمی‌کند.", "This profile does not support PTZ."],
  CAMERA_OPERATION_UNSUPPORTED: ["این عملیات توسط دستگاه پشتیبانی نمی‌شود.", "The device does not support this operation."],
  CAMERA_PREVIEW_EXPIRED: ["پیش‌نمایش منقضی شده؛ عملیات را دوباره انتخاب کن.", "Preview expired. Select the operation again."],
  CAMERA_PLAN_ALREADY_USED: ["این عملیات قبلاً ثبت شده؛ نتیجه را بررسی کن.", "This plan has already been used. Check its result."],
  CAMERA_NOT_FOUND: ["دستگاه در دسترس نیست.", "Device not found."],
  CAMERA_CONTROL_FORBIDDEN: ["حساب تو اجازهٔ این عملیات را ندارد.", "Your account cannot perform this operation."],
};
export function cameraErrorMessage(error: unknown, isFa = true) {
  const code = error instanceof Error ? error.message : String(error);
  return errors[code]?.[isFa ? 0 : 1] ?? (isFa ? "درخواست انجام نشد؛ دوباره تلاش کن." : "Request failed. Please try again.");
}
export async function cameraJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiRequest(`/cameras${path}`, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error?.code === "string" ? data.error.code : "CAMERA_REQUEST_FAILED");
  return data as T;
}
export const listCameras = (companyId?: string) => cameraJson<{ cameras: CameraDevice[] }>(companyId ? `?companyId=${encodeURIComponent(companyId)}` : "");
export const listCameraCompanies = () => cameraJson<{ companies: CameraCompany[]; unassigned: { cameraCount: number; nvrCount: number } }>("/companies");
export const getCamera = (id: string) => cameraJson<{ camera: CameraDevice }>(`/${encodeURIComponent(id)}`);
export const transferCameras = (ids: string[], companyId: string) => cameraJson<{ transferred: number; companyId: string }>("/transfer", { method: "POST", body: JSON.stringify({ ids, companyId }) });
export const createCamera = (input: CameraInput) => cameraJson<{ camera: CameraDevice }>("", { method: "POST", body: JSON.stringify(input) });
export const updateCamera = (id: string, input: Partial<CameraInput>) => cameraJson<{ camera: CameraDevice }>(`/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
export const removeCamera = (id: string) => cameraJson(`/${encodeURIComponent(id)}`, { method: "DELETE" });
export const refreshCamera = (id: string) => cameraJson<{ camera: CameraDevice }>(`/${encodeURIComponent(id)}/refresh`, { method: "POST" });
export const discoverCameras = (cidr: string, ports?: number[], vpnConnectionId?: string, companyId?: string) => cameraJson<CameraDiscovery>("/discover", { method: "POST", body: JSON.stringify({ cidr, ports, vpnConnectionId, companyId }) });
export const previewCameraAction = (id: string, operation: string, parameters?: Record<string, string>) => cameraJson<CameraPreview>(`/${encodeURIComponent(id)}/actions/preview`, { method: "POST", body: JSON.stringify({ operation, ...parameters }) });
export const executeCameraAction = (id: string, planId: string) => cameraJson<CameraResult>(`/${encodeURIComponent(id)}/actions/${encodeURIComponent(planId)}/execute`, { method: "POST", body: JSON.stringify({ intent: "execute", confirmed: true }) });
export const cameraImageUrl = (id: string, profile: string, mode: "live" | "snapshot" | "frame") => apiUrl(`/cameras/${encodeURIComponent(id)}/${mode}?profile=${encodeURIComponent(profile)}`);

export async function cameraImageResponse(id: string, profile: string, mode: "live" | "snapshot" | "frame", signal?: AbortSignal) {
  const response = await fetch(cameraImageUrl(id, profile, mode), { credentials: "include", signal, cache: "no-store" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.code ?? (response.status === 401 ? "AUTH_REQUIRED" : response.status === 403 ? "CAMERA_CONTROL_FORBIDDEN" : "CAMERA_VIDEO_FAILED"));
  }
  return response;
}
