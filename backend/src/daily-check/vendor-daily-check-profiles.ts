import { normalizeVendor } from "../services/ai-normalization.js";

export type DailyCheckVendor =
  | "linux"
  | "mikrotik"
  | "fortigate"
  | "cisco"
  | "pfsense"
  | "juniper"
  | "paloalto"
  | "windows"
  | "docker"
  | "kubernetes";

export type DailyImplementationState = "implemented" | "manualOnly" | "planned";

export type DailyCheckSectionProfile = {
  key: string;
  titleFa: string;
  templates: string[];
  parserRules: string[];
  severityRules: string[];
  suggestedActions: string[];
};

export type VendorDailyCheckProfile = {
  vendor: DailyCheckVendor;
  titleFa: string;
  requiredConnector: string | null;
  implementationState: DailyImplementationState;
  sections: DailyCheckSectionProfile[];
};

function section(
  key: string,
  titleFa: string,
  templates: string[],
  parserRules: string[],
  severityRules: string[],
  suggestedActions: string[] = []
): DailyCheckSectionProfile {
  return { key, titleFa, templates, parserRules, severityRules, suggestedActions };
}

function manualProfile(vendor: DailyCheckVendor, titleFa: string, suggestions: string[]): VendorDailyCheckProfile {
  const sections: Array<[string, string]> = [
    ["overall", "سلامت کلی"],
    ["resources", "منابع سیستم"],
    ["services", "سرویس‌ها / قابلیت‌ها"],
    ["network", "شبکه و اینترفیس‌ها"],
    ["firewall", "فایروال و دسترسی مدیریت"],
    ["vpn_ha", "VPN / HA / نشست‌ها"],
    ["logs", "لاگ‌ها و تغییرات مهم"],
    ["next_actions", "پیشنهادهای بعدی"],
  ];

  return {
    vendor,
    titleFa,
    requiredConnector: null,
    implementationState: "manualOnly",
    sections: sections.map(([key, sectionTitle], index) =>
      section(
        key,
        sectionTitle,
        [],
        ["چک‌لیست دستی"],
        ["تا زمان آماده شدن connector، اجرای واقعی در دسترس نیست."],
        [suggestions[index] ?? "در صورت نیاز، خروجی این بخش را دستی ثبت و به ActionPlan بررسی تبدیل کنید."]
      )
    ),
  };
}

export const VENDOR_DAILY_CHECK_PROFILES: Readonly<Record<DailyCheckVendor, VendorDailyCheckProfile>> = Object.freeze({
  linux: {
    vendor: "linux",
    titleFa: "چک روزانه لینوکس",
    requiredConnector: "linux-ssh",
    implementationState: "implemented",
    sections: [
      section(
        "overall",
        "سلامت کلی",
        ["linux daily check"],
        ["uptime و load average", "وضعیت کلی دسترس‌پذیری"],
        ["خطا یا failed service بحرانی => critical", "هشدار یا degraded => needs_review"],
        ["اگر بار سیستم غیرعادی است، پردازش‌ها و سرویس‌های پرمصرف را بررسی کنید."]
      ),
      section(
        "resources",
        "منابع سیستم",
        ["linux daily check"],
        ["CPU / RAM / Swap", "disk usage", "inode usage"],
        ["پر شدن disk یا inode => critical", "مصرف بالا => needs_review"],
        ["پیش از اختلال سرویس، فضای دیسک و inode را آزاد کنید."]
      ),
      section(
        "services",
        "سرویس‌ها / قابلیت‌ها",
        ["linux daily check", "important services", "running services", "failed services"],
        ["failed systemd services", "وضعیت سرویس‌های مهم", "تشخیص docker/nginx/apache/fail2ban"],
        ["سرویس بحرانی failed یا inactive => critical", "سرویس اختیاری غیرفعال => needs_review"],
        ["برای سرویس‌های مهم، بررسی وضعیت تکی همان سرویس را اجرا کنید."]
      ),
      section(
        "network",
        "شبکه و اینترفیس‌ها",
        ["linux daily check"],
        ["route و interface", "listening ports"],
        ["پورت غیرمنتظره => needs_review", "نبود داده شبکه => needs_review"],
        ["پورت‌های شنونده و مسیرهای مدیریتی را با سیاست فعلی تطبیق دهید."]
      ),
      section(
        "firewall",
        "فایروال و دسترسی مدیریت",
        ["linux daily check"],
        ["ufw / nftables / iptables", "sudo users", "root-equivalent access"],
        ["فایروال خاموش روی میزبان exposed => critical", "sudo user اضافی => needs_review"],
        ["کاربران sudo و وضعیت فایروال را با خروجی خام تطبیق دهید."]
      ),
      section(
        "vpn_ha",
        "VPN / HA / نشست‌ها",
        ["linux daily check"],
        ["نشانه‌های VPN یا HA در صورت وجود"],
        ["خطای VPN => needs_review"],
        ["اگر میزبان نقش VPN دارد، نشست‌ها و لاگ‌های همان سرویس را جداگانه بررسی کنید."]
      ),
      section(
        "logs",
        "لاگ‌ها و تغییرات مهم",
        ["linux daily check"],
        ["failed SSH logins", "journal errors in last 24h"],
        ["افزایش خطای احراز هویت => critical", "warning/error => needs_review"],
        ["در صورت خطای journal یا failed login زیاد، لاگ دقیق را بررسی کنید."]
      ),
      section(
        "next_actions",
        "پیشنهادهای بعدی",
        ["linux daily check"],
        ["استخراج اقدام بعدی از یافته‌ها"],
        ["یافته بحرانی => critical", "هشدار => needs_review"],
        ["برای هر مورد مهم، یک ActionPlan مستقل بسازید."]
      ),
    ],
  },
  mikrotik: {
    vendor: "mikrotik",
    titleFa: "چک روزانه میکروتیک",
    requiredConnector: "mikrotik-ssh",
    implementationState: "implemented",
    sections: [
      section(
        "overall",
        "سلامت کلی",
        ["mikrotik daily check"],
        ["system resource", "package print", "uptime و reboot signals"],
        ["warning/error در وضعیت کلی => needs_review"],
        ["اگر RouterOS یا resource غیرعادی است، package و log را بررسی کنید."]
      ),
      section(
        "resources",
        "منابع سیستم",
        ["mikrotik daily check"],
        ["CPU / Memory / Disk در صورت وجود"],
        ["کمبود شدید منابع => critical", "مصرف بالا => needs_review"],
        ["در صورت مصرف بالا، session و queue و log را بررسی کنید."]
      ),
      section(
        "services",
        "سرویس‌ها / قابلیت‌ها",
        ["mikrotik daily check"],
        ["ip services", "سطح دسترسی سرویس‌های مدیریتی"],
        ["باز بودن telnet/ftp/www => needs_review"],
        ["فقط سرویس‌های مدیریتی لازم را باز نگه دارید."]
      ),
      section(
        "network",
        "شبکه و اینترفیس‌ها",
        ["mikrotik daily check"],
        ["interface print", "ip address", "route print"],
        ["اختلال route/interface => needs_review"],
        ["اینترفیس‌ها، آدرس‌ها و routeهای مهم را تطبیق دهید."]
      ),
      section(
        "firewall",
        "فایروال و دسترسی مدیریت",
        ["mikrotik daily check"],
        ["firewall filter stats", "nat print", "address-list print"],
        ["سطح مدیریتی باز => critical", "hit counter غیرعادی => needs_review"],
        ["NATها و hit counterهای حساس را بازبینی کنید."]
      ),
      section(
        "vpn_ha",
        "VPN / HA / نشست‌ها",
        ["mikrotik daily check"],
        ["IPsec / L2TP / WireGuard در صورت وجود"],
        ["خطای VPN یا route flap => needs_review"],
        ["برای VPNهای خطادار، log و route همان بخش را بررسی کنید."]
      ),
      section(
        "logs",
        "لاگ‌ها و تغییرات مهم",
        ["mikrotik daily check", "mikrotik daily check logs"],
        ["account / system / firewall / ipsec / route / warning / error"],
        ["error زیاد یا account failure => critical", "warning => needs_review"],
        ["در صورت warning/error زیاد، لاگ دقیق MikroTik را جداگانه بگیرید."]
      ),
      section(
        "next_actions",
        "پیشنهادهای بعدی",
        ["mikrotik daily check"],
        ["استخراج اقدام بعدی از یافته‌ها"],
        ["یافته بحرانی => critical", "هشدار => needs_review"],
        ["برای تغییر واقعی فقط از ActionPlan تأییدشده استفاده کنید."]
      ),
    ],
  },
  fortigate: {
    vendor: "fortigate",
    titleFa: "چک روزانه FortiGate",
    requiredConnector: "fortigate-ssh",
    implementationState: "implemented",
    sections: [
      section("system_health", "سلامت سیستم", ["get system status", "get system performance status"], ["نسخه، build، hostname، uptime، CPU، حافظه و نشست‌ها"], ["فقط مصرف منبع اثبات‌شده و شدید => critical"], ["روند مصرف منابع و نشست‌ها را بررسی کنید."]),
      section("license", "وضعیت لایسنس و FortiGuard", ["get system status"], ["اعتبار لایسنس و اثر قابل مشاهده سرویس‌ها"], ["Invalid در VM آزمایشگاهی => needs_review مگر مسدود شدن قابلیت اثبات شود"], ["FortiGuard و به‌روزرسانی signature را جداگانه بررسی کنید."]),
      section("interfaces", "اینترفیس‌ها و دسترسی مدیریتی", ["show system interface", "get system interface physical"], ["تعداد، IP، link، role و allowaccess"], ["مدیریت روی WAN یا HTTP/Telnet => needs_review"], ["دسترسی مدیریت را محدود و پروتکل ناامن را حذف کنید."]),
      section("route_dns", "مسیر و DNS", ["routing-table all", "get system dns", "show system dns"], ["default route، gateway، interface و DNS"], ["نبود مسیر پیش‌فرض یا DNS => needs_review"], ["gateway و پاسخ DNS را اعتبارسنجی کنید."]),
      section("policy_nat_vip", "Policy / NAT / VIP", ["show firewall policy", "show firewall address", "show firewall vip", "show firewall ippool"], ["تعداد policy، وضعیت، NAT، VIP و logging"], ["policy فعال بدون logging => needs_review"], ["Policyهای بدون لاگ و objectهای منتشرشده را بازبینی کنید."]),
      section("vpn", "VPN", ["vpn ipsec", "vpn ssl"], ["IPsec up/down و SSL-VPN"], ["نبود شواهد => not_checked، نه critical"], ["تونل‌های down و محدودیت کاربران SSL-VPN را بررسی کنید."]),
      section("ha_vdom_zone", "HA / VDOM / Zone", ["system ha", "system vdom", "system zone"], ["HA mode، sync، VDOM و zone members"], ["standalone => safe/informational"], ["در HA فعال، وضعیت sync را بررسی کنید."]),
      section("admin_security", "Admin Security", ["show system admin", "show system interface"], ["تعداد مدیر، profile، وجود trusthost و سطح مدیریت"], ["مدیر بدون trusthost یا مدیریت عمومی => needs_review"], ["trusthost و allowaccess را محدود کنید."])
    ]
  },
  cisco: manualProfile("cisco", "چک روزانه Cisco", [
    "نسخه، uptime و alarmها را بررسی کنید.",
    "CPU و memory را دستی بررسی کنید.",
    "AAA، SNMP، syslog و management plane را بررسی کنید.",
    "interface، neighbor و route را بررسی کنید.",
    "ACL و دسترسی مدیریتی را بررسی کنید.",
    "VPN یا redundancy state را بررسی کنید.",
    "warning/error و login failure را بررسی کنید.",
    "در صورت نیاز، نتیجه را به ActionPlan دستی تبدیل کنید.",
  ]),
  pfsense: manualProfile("pfsense", "چک روزانه pfSense", [
    "نسخه و سلامت کلی سیستم را بررسی کنید.",
    "CPU، memory و disk را بررسی کنید.",
    "WebGUI، DNS Resolver و سرویس‌های اصلی را بررسی کنید.",
    "gateway و interface state را بررسی کنید.",
    "rules و NAT/port-forward را بررسی کنید.",
    "OpenVPN و IPsec را بررسی کنید.",
    "system و auth logها را بررسی کنید.",
    "یافته‌ها را به ActionPlan دستی تبدیل کنید.",
  ]),
  juniper: manualProfile("juniper", "چک روزانه Juniper", [
    "alarm، chassis و uptime را بررسی کنید.",
    "resource utilization را بررسی کنید.",
    "management services و daemonها را بررسی کنید.",
    "route، interface و neighbor را بررسی کنید.",
    "policy و filterها را بررسی کنید.",
    "VPN و cluster/HA را بررسی کنید.",
    "auth و warning/error log را بررسی کنید.",
    "در صورت نیاز، ActionPlan دستی بسازید.",
  ]),
  paloalto: manualProfile("paloalto", "چک روزانه Palo Alto", [
    "system info و jobها را بررسی کنید.",
    "CPU، session و memory را بررسی کنید.",
    "management service و content status را بررسی کنید.",
    "interface، route و HA را بررسی کنید.",
    "security/NAT policy و management access را بررسی کنید.",
    "GlobalProtect، IPsec و HA را بررسی کنید.",
    "admin، threat و traffic log را بررسی کنید.",
    "برای اصلاح‌ها ActionPlan دستی بسازید.",
  ]),
  windows: manualProfile("windows", "چک روزانه Windows", [
    "uptime و reboot history را بررسی کنید.",
    "CPU، memory و disk را بررسی کنید.",
    "service failureها و سرویس‌های مهم را بررسی کنید.",
    "interface و listening ports را بررسی کنید.",
    "Windows Firewall و RDP exposure را بررسی کنید.",
    "VPN client/server state را بررسی کنید.",
    "failed logon و critical eventها را بررسی کنید.",
    "برای تغییرات، ActionPlan دستی بسازید.",
  ]),
  docker: manualProfile("docker", "چک روزانه Docker", [
    "وضعیت Docker daemon را بررسی کنید.",
    "مصرف منابع containerها را بررسی کنید.",
    "health و restart loop کانتینرها را بررسی کنید.",
    "published port و networkها را بررسی کنید.",
    "port exposure و docker proxy را بررسی کنید.",
    "overlay/VPN در صورت وجود را بررسی کنید.",
    "log خطاهای مهم containerها را بررسی کنید.",
    "برای اصلاح، ActionPlan دستی بسازید.",
  ]),
  kubernetes: manualProfile("kubernetes", "چک روزانه Kubernetes", [
    "cluster health و control plane را بررسی کنید.",
    "node pressure و resource quota را بررسی کنید.",
    "pod health و deployment state را بررسی کنید.",
    "service و ingress exposure را بررسی کنید.",
    "API access و network policy را بررسی کنید.",
    "HA و tunnel/overlay network را بررسی کنید.",
    "warning event و auth issue را بررسی کنید.",
    "برای هر مورد مهم، ActionPlan دستی بسازید.",
  ]),
});

const EXTRA_ALIASES: Record<string, DailyCheckVendor> = {
  juniper: "juniper",
  junos: "juniper",
  paloalto: "paloalto",
  panos: "paloalto",
  windows: "windows",
  windowsserver: "windows",
  docker: "docker",
  kubernetes: "kubernetes",
  k8s: "kubernetes",
};

export function normalizeDailyCheckVendor(value: unknown): DailyCheckVendor | null {
  const common = normalizeVendor(value);
  if (common && common !== "generic" && common !== "unknown") return common as DailyCheckVendor;
  const token = typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_-]+/g, "") : "";
  return EXTRA_ALIASES[token] ?? null;
}

export function getVendorDailyCheckProfile(vendor: unknown, type?: unknown) {
  const normalized = normalizeDailyCheckVendor(vendor) ?? normalizeDailyCheckVendor(type);
  return normalized ? VENDOR_DAILY_CHECK_PROFILES[normalized] : null;
}
