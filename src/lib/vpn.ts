import { apiRequest } from "./apiTransport";
export type VpnRuntime = { state: string; handshakeAt?: string; rxBytes?: number; txBytes?: number; code?: string };
export type VpnProfile = { id: string; revision: string; name: string; protocol: "wireguard" | "l2tp"; endpoint: string; endpointPort: number; routesJson: string[]; lastErrorCode: string | null; runtime: VpnRuntime };
export type VpnInput = { name: string; protocol: "wireguard" | "l2tp"; endpoint: string; endpointPort: number; routes: string[]; address?: string; privateKey?: string; publicKey?: string; presharedKey?: string; mtu?: number; username?: string; password?: string; ipsecPsk?: string };
export type VpnList = { available: boolean; splitOnly: boolean; l2tpReady?: boolean; profiles: VpnProfile[] };
export async function vpnRequest<T>(path = "", method = "GET", data?: unknown): Promise<T> {
  const response = await apiRequest(`/vpn${path}`, { method, ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error?.code ?? "VPN_REQUEST_FAILED"); return result;
}
const errors: Record<string, string> = {
  VPN_MTU_INVALID: "MTU باید بین ۱۲۸۰ و ۱۴۲۰ باشد.",
  VPN_ASSETS_BOUND: "این VPN به تجهیز یا دوربین ثبت‌شده وصل است؛ اول مسیر آن‌ها را تغییر بده.",
  VPN_BOUND_TARGET_OUTSIDE_ROUTES: "بازهٔ تازه، IP برخی تجهیزات یا دوربین‌های این VPN را پوشش نمی‌دهد.",
  VPN_TARGET_OUTSIDE_ROUTES: "IP تجهیز بیرون از بازهٔ انتخاب‌شدهٔ این VPN است.",
  VPN_CONNECT_FIRST: "ابتدا این VPN را وصل کن.",
  VPN_ASSET_ROUTE_CONFLICT: "در بازهٔ این VPN دارایی‌ای با مسیر دسترسی دیگری ثبت شده است؛ مسیر آن را اصلاح کن.",
  VPN_TARGET_USES_TUNNEL: "این IP اکنون از VPN عبور می‌کند؛ VPN مربوط به آن را انتخاب کن.",
  VPN_ROUTE_MISMATCH: "مسیر این IP متعلق به VPN دیگری است.",
  VPN_ADDRESS_CONFLICT: "IP داخلی این اتصال با یک VPN فعال یکسان است؛ از پروفایل کاربر دیگری استفاده کن.",
  VPN_AGENT_UNAVAILABLE: "سرویس VPN آماده نیست؛ وضعیت سرویس را بررسی کن.",
  VPN_ROUTES_INVALID: "بازه‌های خصوصی را با CIDR وارد کن؛ مثلاً 192.168.18.0/24. مسیر عمومی و پیش‌فرض مجاز نیست.",
  VPN_ROUTE_OVERLAP: "این بازه با اتصال دیگری هم‌پوشانی دارد. ابتدا آن اتصال را قطع کن.",
  VPN_NETWORK_CONFLICT: "بازه با شبکهٔ داخلی سرور یا یک مسیر موجود تداخل دارد؛ بازه را محدودتر کن.",
  VPN_ENDPOINT_IN_ROUTE: "آدرس سرور VPN نباید داخل بازه‌ای باشد که وارد تونل می‌شود.",
  VPN_ENDPOINT_INVALID: "IP یا نام معتبر سرور VPN را وارد کن.",
  VPN_KEY_INVALID: "کلید WireGuard معتبر نیست؛ کلید کامل را از تنظیمات VPN کپی کن.",
  VPN_ADDRESS_INVALID: "IP تونل معتبر نیست.", VPN_IP_INVALID: "IP معتبر وارد کن.", VPN_NAME_REQUIRED: "نام اتصال را وارد کن.",
  VPN_CREDENTIAL_INVALID: "نام کاربری، رمز یا PSK معتبر نیست. این موارد را در فیلدهای جدا وارد کن.",
  VPN_WIREGUARD_UNAVAILABLE: "هستهٔ سرور WireGuard را پشتیبانی نمی‌کند.", VPN_PPP_UNAVAILABLE: "دستگاه PPP روی سرور در دسترس نیست.",
  VPN_IPSEC_FAILED: "IPsec برقرار نشد؛ آدرس سرور، PSK و تنظیمات رمزنگاری دو طرف را بررسی کن.",
  VPN_PPP_FAILED: "ورود L2TP برقرار نشد؛ نام کاربری، رمز و دسترسی حساب را بررسی کن.",
  VPN_PPP_AUTH_FAILED: "VPN نام کاربری یا رمز را نپذیرفت.", VPN_PPP_CONFIG_FAILED: "نسخهٔ PPP تنظیمات اتصال را نپذیرفت؛ سرویس VPN باید به‌روز شود.",
  VPN_PPP_KERNEL_REQUIRED: "درایور PPP میزبان Docker فعال نیست؛ مدیر سرور باید پشتیبانی PPP/L2TP را آماده کند.",
  VPN_IPSEC_POLICY_CONFLICT: "IPsec برقرار شد، اما قانون رمزنگاری با ترافیک L2TP تطبیق ندارد؛ مسیر سرور VPN و تنظیمات IPsec را بررسی کن.",
  VPN_DISCONNECT_FIRST: "ابتدا اتصال را قطع کن، سپس تنظیمات را تغییر بده یا حذف کن.",
  VPN_CAPACITY: "حداکثر چهار تونل و یک اتصال L2TP هم‌زمان مجاز است.", VPN_CONFIRM_REQUIRED: "اتصال یا قطع VPN نیاز به تأیید دارد.",
  VPN_TEST_TARGET_INVALID: "IP تست باید داخل یکی از بازه‌های همین اتصال باشد.", VPN_ROUTE_NOT_ACTIVE: "مسیر این IP هنوز از تونل عبور نمی‌کند.",
  VPN_ADMIN_REQUIRED: "فقط مدیر می‌تواند اتصال VPN را تغییر دهد.", VPN_OPERATION_BUSY: "عملیات این اتصال در حال انجام است.",
  VPN_PROFILE_CHANGED: "تنظیمات اتصال تغییر کرده؛ وضعیت را به‌روز کن و دوباره بازبینی کن.",
  VPN_PORT_INVALID: "پورت باید بین ۱ تا ۶۵۵۳۵ باشد.", VPN_DEFAULT_ROUTE_CHANGED: "تغییر مسیر عمومی تشخیص داده شد؛ اتصال لغو شد.",
};
export const vpnError = (error: unknown) => errors[error instanceof Error ? error.message : ""] ?? "عملیات انجام نشد؛ اتصال و تنظیمات را بررسی کن.";
export function importWireguard(text: string): Partial<VpnInput> {
  if (text.length > 16384) throw new Error("VPN_KEY_INVALID");
  const values: Record<string, string> = {}; let section = "", peers = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[")) { section = line.toLowerCase(); if (!["[interface]", "[peer]"].includes(section)) throw new Error("VPN_KEY_INVALID"); if (section === "[peer]" && ++peers > 1) throw new Error("VPN_KEY_INVALID"); continue; }
    const split = line.indexOf("="); if (split < 1) throw new Error("VPN_KEY_INVALID");
    const key = line.slice(0, split).trim().toLowerCase(), value = line.slice(split + 1).trim();
    if (!["privatekey", "address", "publickey", "presharedkey", "endpoint", "allowedips", "persistentkeepalive", "listenport", "dns", "mtu", "table"].includes(key) || !section || values[`${section}.${key}`] !== undefined) throw new Error("VPN_KEY_INVALID");
    values[`${section}.${key}`] = value;
  }
  if (peers !== 1 || !values["[interface].privatekey"] || !values["[peer].publickey"]) throw new Error("VPN_KEY_INVALID");
  const endpoint = values["[peer].endpoint"] ?? "", match = /^([^:]+):(\d+)$/.exec(endpoint);
  if (!match) throw new Error("VPN_ENDPOINT_INVALID");
  const address = (values["[interface].address"] ?? "").split(",").map(value => value.trim()).find(value => /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(value)) ?? "";
  const routes = (values["[peer].allowedips"] ?? "").split(",").map(v => v.trim()).filter(v => /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(v));
  return { protocol: "wireguard", endpoint: match[1], endpointPort: Number(match[2]), address, privateKey: values["[interface].privatekey"], publicKey: values["[peer].publickey"], presharedKey: values["[peer].presharedkey"] ?? "", mtu: Number(values["[interface].mtu"] ?? 1420), routes };
}
