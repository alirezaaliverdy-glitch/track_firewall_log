const faSecurityText: Record<string, string> = {
  "Repeated failed logins": "تلاش‌های ناموفق تکراری برای ورود",
  "Repeated denied SSH/login attempts from one source.": "تلاش‌های ردشده و تکراری SSH یا ورود از یک مبدأ.",
  "Login from new source": "ورود از مبدأ جدید",
  "Authentication success from an unseen source.": "ورود موفق از مبدأیی که پیش‌تر دیده نشده است.",
  "Admin account created": "حساب مدیریتی ایجاد شد",
  "Administrative account creation was observed.": "ایجاد یک حساب با دسترسی مدیریتی مشاهده شد.",
  "Firewall policy change": "تغییر سیاست فایروال",
  "Firewall or policy configuration changed.": "پیکربندی فایروال یا سیاست امنیتی تغییر کرده است.",
  "NAT change": "تغییر NAT",
  "NAT configuration changed.": "پیکربندی NAT تغییر کرده است.",
  "Management service enabled": "سرویس مدیریتی فعال شد",
  "Management service was enabled.": "یک سرویس مدیریتی فعال شده است.",
  "Interface unexpectedly down": "قطع غیرمنتظره رابط شبکه",
  "Interface transitioned down.": "وضعیت رابط شبکه به قطع‌شده تغییر کرده است.",
  "VPN authentication failure": "شکست احراز هویت VPN",
  "VPN authentication failed repeatedly.": "احراز هویت VPN چند بار ناموفق بوده است.",
  "New listening port": "پورت شنونده جدید",
  "New listening service was detected.": "یک سرویس شنونده جدید شناسایی شده است.",
  "Firewall disabled": "فایروال غیرفعال شد",
  "Host firewall was disabled.": "فایروال میزبان غیرفعال شده است.",
  "Critical service stopped": "توقف سرویس حیاتی",
  "Critical service stopped or failed.": "یک سرویس حیاتی متوقف شده یا از کار افتاده است.",
  "Repeated Daily Check failures": "شکست تکراری بررسی روزانه",
  "Daily Check failed repeatedly.": "بررسی روزانه چند بار ناموفق بوده است.",
  "Port Scan": "اسکن پورت",
  "Same source IP reaches many unique destination ports in a short window.": "یک IP مبدأ در بازه کوتاه به تعداد زیادی پورت مقصد متفاوت دسترسی داشته است.",
  "SSH Brute Force": "حمله حدس رمز SSH",
  "Repeated denied SSH attempts from the same source IP.": "تلاش‌های ردشده و تکراری SSH از یک IP مبدأ یکسان.",
  "Sensitive Port Exposure": "در معرض بودن پورت حساس",
  "Allowed traffic to sensitive management, database, or service ports.": "ترافیک مجاز به پورت‌های حساس مدیریتی، پایگاه داده یا سرویس مشاهده شده است.",
  "Deny/Drop Spike": "افزایش ناگهانی ترافیک ردشده",
  "High volume of denied or dropped traffic from the same source IP.": "حجم بالایی از ترافیک ردشده یا حذف‌شده از یک IP مبدأ مشاهده شده است.",
  "Repeated SSH authentication failures": "شکست تکراری احراز هویت SSH",
  "Repeated denied sudo attempts": "تلاش‌های ردشده و تکراری sudo",
  "SSH password authentication is enabled": "احراز هویت رمزی SSH فعال است",
  "Password SSH expands credential-attack risk.": "ورود رمزی SSH سطح حملات مبتنی بر اعتبارنامه را افزایش می‌دهد.",
  "SSH is exposed on a wildcard/public interface": "SSH روی رابط عمومی یا همه آدرس‌ها در معرض دسترسی است",
  "Internet-reachable management attracts automated attacks.": "مدیریت قابل‌دسترسی از اینترنت هدف حملات خودکار قرار می‌گیرد.",
  "Auditd inactive or unavailable": "Auditd غیرفعال یا خارج از دسترس است",
  "Important security activity may lack an audit trail.": "ممکن است فعالیت‌های مهم امنیتی بدون ردپای ممیزی باقی بمانند.",
  "SSH success after authentication failures": "ورود موفق SSH پس از تلاش‌های ناموفق",
  "Direct root SSH login is enabled": "ورود مستقیم کاربر root از طریق SSH فعال است",
  "Fail2ban inactive while SSH is exposed": "با وجود دسترسی عمومی SSH، سرویس Fail2ban غیرفعال است",
  "Management service exposed": "سرویس مدیریتی در معرض دسترسی قرار دارد",
  "Insecure management service enabled": "سرویس مدیریتی ناامن فعال است",
  "Repeated RouterOS login failures": "شکست تکراری ورود به RouterOS",
  "Risky public dstnat exposure": "انتشار عمومی پرخطر از طریق dstnat",
  "VPN/IPsec/L2TP failure burst": "افزایش شکست اتصال‌های VPN، IPsec یا L2TP",
  "Firewall input drop burst": "افزایش ناگهانی بسته‌های ردشده در ورودی فایروال",
  "Privileged user, service, or configuration change": "تغییر کاربر ممتاز، سرویس یا پیکربندی",
  "Admin login failures": "شکست تکراری ورود مدیر",
  "Management plane exposed or trusted hosts missing": "سطح مدیریت در معرض دسترسی است یا میزبان مورداعتماد تعریف نشده",
  "Local-in or policy exposure": "دسترسی پرخطر در Local-in یا سیاست فایروال",
  "Risky VIP/NAT publish": "انتشار پرخطر از طریق VIP یا NAT",
  "SSL-VPN authentication failures": "شکست تکراری احراز هویت SSL-VPN",
  "IPsec tunnel failure or flap": "قطع یا ناپایداری تونل IPsec",
  "Severe UTM threat event": "رویداد تهدید شدید در UTM",
  "Configuration revision or admin change": "تغییر نسخه پیکربندی یا حساب مدیر",
  "WebGUI/SSH authentication failures": "شکست تکراری احراز هویت WebGUI یا SSH",
  "WebGUI/SSH exposed on WAN": "دسترسی WebGUI یا SSH روی WAN باز است",
  "sshguard block spike": "افزایش ناگهانی مسدودسازی توسط sshguard",
  "Firewall deny burst": "افزایش ناگهانی ترافیک ردشده فایروال",
  "Risky NAT/port forward": "قاعده پرخطر NAT یا انتقال پورت",
  "OpenVPN/IPsec failures": "شکست تکراری OpenVPN یا IPsec",
  "Security update/advisory requires review": "به‌روزرسانی یا هشدار امنیتی نیازمند بررسی است",
  "AAA login failure burst": "افزایش شکست ورود در AAA",
  "Telnet management enabled": "مدیریت از طریق Telnet فعال است",
  "Configuration change": "تغییر پیکربندی",
  "ACL deny burst": "افزایش ناگهانی رد ترافیک توسط ACL",
  "VPN/tunnel failure": "شکست VPN یا تونل شبکه",
};

const genericExposureSuffix = "can indicate security exposure, compromise, or loss of control.";

export function securityDisplayText(value: string, language: string) {
  if (!language.toLowerCase().startsWith("fa")) return value;
  const exact = faSecurityText[value];
  if (exact) return exact;
  if (value.endsWith(genericExposureSuffix)) {
    const rawTitle = value.split(". ")[0].trim();
    const title = faSecurityText[rawTitle] ?? rawTitle;
    return `${title} می‌تواند نشانه ضعف امنیتی، نفوذ یا از دست رفتن کنترل باشد.`;
  }
  const separator = value.indexOf(". ");
  if (separator > 0) {
    const title = value.slice(0, separator);
    const detail = value.slice(separator + 2);
    const localizedTitle = faSecurityText[title];
    const localizedDetail = faSecurityText[detail.endsWith(".") ? detail : `${detail}.`];
    if (localizedTitle || localizedDetail) return `${localizedTitle ?? title}. ${localizedDetail ?? detail}`;
  }
  return value;
}
