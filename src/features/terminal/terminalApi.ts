import { API_BASE_URL } from "@/config/frontendEnv";
export type TerminalInfo={device:{id:string;name:string;vendor:string;host:string;port:number;company:string|null;environment:string;vpnConnectionId:string|null};supported:boolean;credentialsConfigured:boolean;username:string|null;trustedFingerprint:string|null;templateId:string};
export type TerminalPreview=TerminalInfo&{previewId:string;fingerprint:string;firstTrust:boolean;expiresAt:string};
export type TerminalRead={id:string;state:"connected"|"closed";reason:string|null;data:string;cursor:number;hasMore:boolean;truncated:boolean;openedAt:string};
export async function terminalApi<T>(path:string,body?:unknown,options:{signal?:AbortSignal;keepalive?:boolean}={}){
  const response=await fetch(`${API_BASE_URL}${path}`,{method:body===undefined?"GET":"POST",credentials:"include",cache:"no-store",...(body===undefined?{}:{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),...options});
  const data=await response.json();if(!response.ok)throw new Error(typeof data.code==="string"?data.code:response.status===403?"TERMINAL_ADMIN_REQUIRED":response.status===401?"SESSION_EXPIRED":"TERMINAL_SERVICE_UNAVAILABLE");return data as T;
}
const messages:Record<string,[string,string]>={
  TERMINAL_ADMIN_REQUIRED:["دسترسی CLI برای مدیر سامانه فعال است.","CLI access requires an administrator."],
  SSH_CREDENTIAL_MISSING:["ابتدا اعتبارنامهٔ SSH تجهیز را در تنظیمات اتصال انتخاب کن.","Select a stored SSH credential in connection settings first."],
  TERMINAL_SSH_NOT_CONFIGURED:["برای این تجهیز کانال SSH تنظیم نشده است. ONVIF و SNMP به‌تنهایی CLI ندارند.","No SSH channel is configured. ONVIF and SNMP alone do not provide a CLI."],
  SSH_AUTH_FAILED:["دستگاه ورود با اعتبارنامهٔ ذخیره‌شده را نپذیرفت.","The device rejected the stored SSH credentials."],
  SSH_HOST_KEY_MISMATCH:["اثر انگشت SSH تغییر کرده است. هویت دستگاه و تنظیمات اتصال را بررسی کن.","The SSH fingerprint has changed. Verify the device identity and connection settings."],
  SSH_CONNECTION_REFUSED:["پورت SSH اتصال را نپذیرفت؛ فعال بودن سرویس و شمارهٔ پورت را بررسی کن.","The SSH port refused the connection. Check the service and port."],
  SSH_HANDSHAKE_TIMEOUT:["پاسخ SSH در زمان مقرر نرسید؛ مسیر شبکه یا VPN را بررسی کن.","SSH timed out. Check the network or VPN path."],
  SSH_CONNECTION_FAILED:["ارتباط SSH برقرار نشد؛ شبکه و سازگاری SSH دستگاه را بررسی کن.","SSH could not connect. Check the network and device SSH compatibility."],
  SSH_DNS_FAILED:["نام میزبان پیدا نشد؛ آدرس دستگاه را بررسی کن.","The hostname could not be resolved."],
  SSH_SHELL_UNAVAILABLE:["حساب دستگاه اجازهٔ باز کردن پوستهٔ تعاملی را ندارد.","The device account cannot open an interactive shell."],
  TERMINAL_PREVIEW_EXPIRED:["بررسی اتصال منقضی شده است؛ دوباره اتصال را بررسی کن.","The connection preview expired. Check the connection again."],
  TERMINAL_CONFIGURATION_CHANGED:["تنظیمات یا دسترسی تجهیز تغییر کرد؛ نشست بسته شد. دوباره بررسی کن.","Device configuration or access changed. The session was closed."],
  TERMINAL_SESSION_LIMIT:["ظرفیت نشست‌های هم‌زمان تکمیل است؛ یکی از نشست‌هایت را ببند.","The concurrent session limit was reached. Close another session."],
  TERMINAL_NOT_FOUND:["نشست پایان یافته است؛ برای ادامه دوباره متصل شو.","The session ended. Connect again to continue."],
  TERMINAL_NOT_CONNECTED:["نشست متصل نیست.","The session is not connected."],
  TERMINAL_AUDIT_UNAVAILABLE:["ثبت ممیزی موقتاً در دسترس نیست؛ اتصال آغاز نشد.","Audit storage is unavailable. Connection was not started."],
  TERMINAL_INPUT_LIMIT:["حجم ورودی بیش از حد مجاز است؛ متن را در بخش‌های کوچک‌تر وارد کن.","Input is too large. Use smaller chunks."],
  TERMINAL_INPUT_SEQUENCE:["وضعیت ارسال مشخص نیست؛ برای جلوگیری از اجرای تکراری، دوباره متصل شو.","Input delivery is uncertain. Reconnect to avoid repeated execution."],
  SESSION_EXPIRED:["نشست ورود منقضی شده است؛ دوباره وارد برنامه شو.","Your login session expired. Sign in again."],
  VPN_CONNECT_FIRST:["ابتدا VPN انتخاب‌شده برای تجهیز را متصل کن.","Connect the device's selected VPN first."],
  VPN_ROUTE_NOT_ACTIVE:["مسیر تجهیز روی VPN فعال نیست.","The device VPN route is not active."],
};
export function terminalError(error:unknown,isFa:boolean){const code=error instanceof Error?error.message:String(error);return messages[code]?.[isFa?0:1]??(isFa?"ارتباط کامل نشد؛ تنظیمات اتصال و مسیر شبکه را بررسی کن.":"The request failed. Check connection settings and the network path.");}
export function terminalCloseReason(reason:string|null,isFa:boolean){const values:Record<string,[string,string]>={user_disconnected:["به درخواست شما قطع شد","Disconnected by you"],remote_closed:["دستگاه نشست را بست","The device closed the session"],idle_timeout:["نشست پس از ۱۰ دقیقه بدون ورودی بسته شد","Closed after 10 minutes without input"],session_expired:["زمان نشست به پایان رسید","Session time limit reached"],browser_disconnected:["ارتباط مرورگر پایان یافت","Browser connection ended"],TERMINAL_OUTPUT_LIMIT:["حجم خروجی نشست به سقف مجاز رسید","Session output limit reached"],service_stopped:["سرویس دوباره راه‌اندازی شد","The service restarted"]};return values[reason??""]?.[isFa?0:1]??(isFa?"نشست پایان یافت؛ برای ادامه دوباره متصل شو.":"Session ended. Connect again to continue.");}
