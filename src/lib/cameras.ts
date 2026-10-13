import { apiRequest, apiUrl } from "./apiTransport";

export type CameraProfile = { token: string; name: string; sourceToken: string; width: number | null; height: number | null; encoding: string | null; fps: number | null; ptz: boolean; streamAvailable: boolean; snapshotAvailable: boolean };
export type CameraDevice = {
  id: string; name: string; location: string; host: string; vpnConnectionId?: string | null; kind: "camera" | "nvr"; connectionMode: "onvif" | "rtsp";
  onvifPort: number; onvifPath: string; onvifHttps: boolean; status: "verified" | "error" | "unverified"; lastSeenAt: string | null; lastErrorCode: string | null;
  infoJson: Record<string, string> | null; profiles: CameraProfile[]; credentialsConfigured: boolean; createdAt: string;
};
export type CameraCandidate = { host: string; onvifPort: number; onvifPath: string; onvifHttps: boolean; name: string; evidence: "onvif" | "rtsp"; requiresCredentials: boolean; registered: boolean };
export type CameraDiscovery = { cidr: string; candidates: CameraCandidate[]; scannedAddresses: number; partial: boolean };
export type CameraInput = { host: string; name: string; location: string; kind: "camera" | "nvr"; connectionMode: "onvif" | "rtsp"; onvifPort: number; onvifPath: string; onvifHttps?: boolean; username?: string; password?: string; rtspUrl?: string; vpnConnectionId?: string };
export type CameraPreview = { id: string; status: string; expiresAt: string; preview: { titleFa: string; titleEn: string; cameraName: string; host: string; effectFa: string; effectEn: string; risk: string; connectorInvoked: false } };
export type CameraResult = { status: string; connectorInvoked: boolean; accepted?: boolean; code?: string; requiresReconnect?: boolean };
export type CameraHistory = { id: string; operation: string; status: string; createdAt: string; previewJson: CameraPreview["preview"]; resultJson: CameraResult | null };

const errors: Record<string, [string, string]> = {
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
export const listCameras = () => cameraJson<{ cameras: CameraDevice[] }>("");
export const createCamera = (input: CameraInput) => cameraJson<{ camera: CameraDevice }>("", { method: "POST", body: JSON.stringify(input) });
export const updateCamera = (id: string, input: Partial<CameraInput>) => cameraJson<{ camera: CameraDevice }>(`/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
export const removeCamera = (id: string) => cameraJson(`/${encodeURIComponent(id)}`, { method: "DELETE" });
export const refreshCamera = (id: string) => cameraJson<{ camera: CameraDevice }>(`/${encodeURIComponent(id)}/refresh`, { method: "POST" });
export const discoverCameras = (cidr: string, ports?: number[], vpnConnectionId?: string) => cameraJson<CameraDiscovery>("/discover", { method: "POST", body: JSON.stringify({ cidr, ports, vpnConnectionId }) });
export const previewCameraAction = (id: string, operation: string, parameters?: Record<string, string>) => cameraJson<CameraPreview>(`/${encodeURIComponent(id)}/actions/preview`, { method: "POST", body: JSON.stringify({ operation, ...parameters }) });
export const executeCameraAction = (id: string, planId: string) => cameraJson<CameraResult>(`/${encodeURIComponent(id)}/actions/${encodeURIComponent(planId)}/execute`, { method: "POST", body: JSON.stringify({ intent: "execute", confirmed: true }) });
export const cameraImageUrl = (id: string, profile: string, mode: "live" | "snapshot") => apiUrl(`/cameras/${encodeURIComponent(id)}/${mode}?profile=${encodeURIComponent(profile)}`);

export async function cameraImageResponse(id: string, profile: string, mode: "live" | "snapshot", signal?: AbortSignal) {
  const response = await fetch(cameraImageUrl(id, profile, mode), { credentials: "include", signal, cache: "no-store" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.code ?? "CAMERA_VIDEO_FAILED");
  }
  return response;
}
