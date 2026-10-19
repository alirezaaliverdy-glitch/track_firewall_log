import { apiRequest } from "./apiTransport";
export type VpnRuntime = { state: string; handshakeAt?: string; rxBytes?: number; txBytes?: number; code?: string };
export type VpnProfile = { id: string; revision: string; name: string; protocol: "wireguard" | "l2tp" | "openvpn"; endpoint: string; endpointPort: number; routesJson: string[]; lastErrorCode: string | null; desiredConnected?: boolean; recoveryBlocked?: boolean; retryAt?: string | null; runtime: VpnRuntime };
export type VpnInput = { name: string; protocol: "wireguard" | "l2tp" | "openvpn"; endpoint: string; endpointPort: number; routes: string[]; address?: string; privateKey?: string; publicKey?: string; presharedKey?: string; mtu?: number; username?: string; password?: string; ipsecPsk?: string; openvpnProfile?: string; keyPassphrase?: string };
export type VpnList = { available: boolean; splitOnly: boolean; l2tpReady?: boolean; openvpnReady?: boolean; profiles: VpnProfile[] };
export async function vpnRequest<T>(path = "", method = "GET", data?: unknown): Promise<T> {
  const response = await apiRequest(`/vpn${path}`, { method, ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error?.code ?? "VPN_REQUEST_FAILED"); return result;
}
const errors: Record<string, string> = {
  VPN_MANAGE_FORBIDDEN: "مدیریت VPN به نقش اپراتور یا مدیر و دسترسی فعال VPN نیاز دارد.",
  VPN_OPENVPN_PROFILE_INVALID: "فایل OpenVPN معتبر و یکپارچه با گواهی CA وارد کن؛ فایل روی سرور اعتبارسنجی می‌شود.",
  VPN_OPENVPN_PROFILE_SIZE: "فایل OpenVPN باید حداکثر ۱۲۸ کیلوبایت باشد.",
  VPN_OPENVPN_OPTION_UNSUPPORTED: "این فایل گزینهٔ پشتیبانی‌نشده، اسکریپت یا ارجاع به فایل جدا دارد. نسخهٔ یکپارچهٔ .ovpn بدون افزونه و اسکریپت صادر کن.",
  VPN_OPENVPN_EXTERNAL_FILE: "فایل باید یکپارچه باشد؛ نام کاربری و رمز را در فیلدهای برنامه وارد کن، نه مسیر فایل جداگانه.",
  VPN_OPENVPN_TUN_REQUIRED: "فقط OpenVPN با TUN پشتیبانی می‌شود؛ TAP لایهٔ دو پشتیبانی نمی‌شود.",
  VPN_OPENVPN_PROTOCOL_UNSUPPORTED: "فایل باید یک سرور IPv4 با UDP یا TCP-client داشته باشد.",
  VPN_OPENVPN_CRYPTO_UNSUPPORTED: "رمزنگاری این پروفایل قدیمی یا پشتیبانی‌نشده است؛ TLS 1.2 به بالا و AES یا ChaCha20 لازم است.",
  VPN_OPENVPN_AUTH_FAILED: "سرور OpenVPN اطلاعات ورود یا رمز کلید را نپذیرفت؛ برای جلوگیری از قفل حساب، بازیابی متوقف شده است.",
  VPN_OPENVPN_TLS_FAILED: "هویت یا گواهی سرور OpenVPN تأیید نشد؛ CA، نام سرور و تاریخ گواهی را بررسی کن.",
  VPN_OPENVPN_CONNECTION_FAILED: "OpenVPN اتصال معتبر برقرار نکرد؛ آدرس، پورت، فایروال و سازگاری پروفایل را بررسی کن.",
  VPN_TUN_UNAVAILABLE: "دستگاه TUN در سرویس VPN در دسترس نیست؛ تنظیمات استقرار سرور را بررسی کن.",
  VPN_RECONNECT_PENDING: "مسیرهای خصوصی محافظت می‌شوند؛ اتصال خودکار دوباره تلاش می‌کند.",
  VPN_CONFIG_INVALID: "فایل تنظیمات معتبر WireGuard را انتخاب کن؛ باید یک Interface و یک Peer داشته باشد.",
  VPN_FILE_READ_FAILED: "فایل خوانده نشد؛ دوباره انتخاب کن یا متن تنظیمات را جای‌گذاری کن.",
  VPN_FILE_TOO_LARGE: "حجم فایل تنظیمات باید کمتر از ۱۶ کیلوبایت باشد.",
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
  if (text.length > 16384) throw new Error("VPN_FILE_TOO_LARGE");
  text = text.replace(/^\uFEFF/, "");
  const values: Record<string, string> = {}; let section = "", peers = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s*[#;].*$/, "").trim(); if (!line) continue;
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

export async function readWireguardFile(file: File, maxBytes = 16384) {
  if (file.size > maxBytes) throw new Error(maxBytes > 16384 ? "VPN_OPENVPN_PROFILE_SIZE" : "VPN_FILE_TOO_LARGE");
  // FileReader also works on browsers/WebViews without Blob.text(). File data
  // stays in this form until the operator explicitly saves the connection.
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("VPN_FILE_READ_FAILED"));
    reader.onerror = reader.onabort = () => reject(new Error("VPN_FILE_READ_FAILED"));
    reader.readAsText(file);
  });
}
