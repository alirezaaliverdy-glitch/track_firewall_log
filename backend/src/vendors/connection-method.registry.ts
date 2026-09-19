export type VendorConnectionKey = "linux" | "cisco" | "fortigate" | "mikrotik" | "sophos";
export type ConnectionMethodKey = "ssh" | "rest_api" | "netconf" | "restconf" | "snmpv3" | "syslog" | "gnmi" | "agent" | "xml_api";
export type ConnectionPurpose = "control" | "inventory" | "telemetry" | "events";
export type ConnectionReadiness = "ready" | "setup_required" | "planned";

export type VendorConnectionMethod = {
  key: ConnectionMethodKey;
  title: string;
  titleFa: string;
  summary: string;
  summaryFa: string;
  purposes: ConnectionPurpose[];
  readiness: ConnectionReadiness;
  recommended: boolean;
  selectable: boolean;
  secure: boolean;
  defaultPort: number | null;
  credential: "username_password" | "private_key" | "api_token" | "certificate" | "snmpv3" | "none";
  prerequisites: string[];
  prerequisitesFa: string[];
};

export type VendorConnectionProfile = {
  vendor: VendorConnectionKey;
  strategy: string;
  strategyFa: string;
  methods: VendorConnectionMethod[];
};

const method = (value: VendorConnectionMethod) => value;

const PROFILES: Record<VendorConnectionKey, VendorConnectionProfile> = {
  linux: {
    vendor: "linux",
    strategy: "Use SSH keys for control and bootstrap; use the agent or Syslog for continuous evidence.",
    strategyFa: "برای کنترل و راه‌اندازی از کلید SSH و برای شواهد پیوسته از Agent یا Syslog استفاده کنید.",
    methods: [
      method({ key: "ssh", title: "SSH", titleFa: "SSH امن", summary: "Full administrative control and read-only discovery.", summaryFa: "کنترل مدیریتی و کشف خواندنی با پشتیبانی کلید خصوصی.", purposes: ["control", "inventory"], readiness: "ready", recommended: true, selectable: true, secure: true, defaultPort: 22, credential: "private_key", prerequisites: ["Reachable SSH service", "Least-privilege sudo account"], prerequisitesFa: ["دسترسی شبکه به سرویس SSH", "حساب sudo با حداقل سطح دسترسی"] }),
      method({ key: "agent", title: "Agent", titleFa: "عامل پایش", summary: "Continuous metrics and security telemetry.", summaryFa: "ارسال پیوسته متریک‌ها و داده‌های امنیتی.", purposes: ["telemetry", "events"], readiness: "setup_required", recommended: true, selectable: false, secure: true, defaultPort: null, credential: "api_token", prerequisites: ["Install and enroll the application agent"], prerequisitesFa: ["نصب و ثبت عامل برنامه روی سرور"] }),
      method({ key: "syslog", title: "Syslog over TLS", titleFa: "Syslog امن", summary: "Agentless security and system event stream.", summaryFa: "ارسال رخدادهای امنیتی و سیستمی بدون عامل.", purposes: ["events"], readiness: "setup_required", recommended: false, selectable: false, secure: true, defaultPort: 6514, credential: "certificate", prerequisites: ["Configure rsyslog/syslog-ng TLS forwarding"], prerequisitesFa: ["تنظیم ارسال TLS در rsyslog یا syslog-ng"] })
    ]
  },
  cisco: {
    vendor: "cisco",
    strategy: "Use SSH/CLI for broad IOS compatibility; add RESTCONF/NETCONF for structured IOS-XE data and gNMI for streaming telemetry.",
    strategyFa: "برای سازگاری گسترده IOS از SSH/CLI استفاده کنید؛ در IOS-XE برای داده ساخت‌یافته RESTCONF/NETCONF و برای تله‌متری پیوسته gNMI را فعال کنید.",
    methods: [
      method({ key: "ssh", title: "SSH / CLI", titleFa: "SSH / CLI", summary: "Best compatibility for IOS, IOS-XE and current controlled actions.", summaryFa: "بیشترین سازگاری با IOS و IOS-XE و همه عملیات کنترل‌شده فعلی.", purposes: ["control", "inventory"], readiness: "ready", recommended: true, selectable: true, secure: true, defaultPort: 22, credential: "username_password", prerequisites: ["SSH v2 enabled", "Privilege 15 or enable credential for write actions"], prerequisitesFa: ["فعال بودن SSH v2", "سطح ۱۵ یا رمز enable برای عملیات تغییردهنده"] }),
      method({ key: "restconf", title: "RESTCONF / YANG", titleFa: "RESTCONF / YANG", summary: "Structured HTTPS inventory and configuration for supported IOS-XE releases.", summaryFa: "دریافت و پیکربندی ساخت‌یافته روی HTTPS در نسخه‌های پشتیبانی‌شده IOS-XE.", purposes: ["inventory", "control"], readiness: "setup_required", recommended: true, selectable: false, secure: true, defaultPort: 443, credential: "username_password", prerequisites: ["IOS-XE RESTCONF enabled", "HTTPS and YANG models available"], prerequisitesFa: ["فعال‌سازی RESTCONF در IOS-XE", "فعال بودن HTTPS و مدل‌های YANG"] }),
      method({ key: "netconf", title: "NETCONF / YANG", titleFa: "NETCONF / YANG", summary: "Transactional model-driven configuration over SSH.", summaryFa: "پیکربندی تراکنشی و مدل‌محور روی SSH.", purposes: ["inventory", "control"], readiness: "setup_required", recommended: false, selectable: false, secure: true, defaultPort: 830, credential: "username_password", prerequisites: ["NETCONF-YANG enabled", "TCP 830 reachable"], prerequisitesFa: ["فعال‌سازی NETCONF-YANG", "دسترسی به پورت ۸۳۰"] }),
      method({ key: "gnmi", title: "gNMI", titleFa: "gNMI", summary: "High-frequency OpenConfig/YANG telemetry subscriptions.", summaryFa: "اشتراک تله‌متری پرتعداد بر پایه OpenConfig/YANG.", purposes: ["telemetry"], readiness: "setup_required", recommended: false, selectable: false, secure: true, defaultPort: 9339, credential: "certificate", prerequisites: ["Platform and release support gNMI", "TLS credentials configured"], prerequisitesFa: ["پشتیبانی مدل و نسخه دستگاه از gNMI", "تنظیم گواهی TLS"] }),
      method({ key: "snmpv3", title: "SNMPv3", titleFa: "SNMPv3", summary: "Low-cost health and interface counters.", summaryFa: "متریک سلامت و شمارنده اینترفیس‌ها با سربار کم.", purposes: ["telemetry"], readiness: "setup_required", recommended: false, selectable: false, secure: true, defaultPort: 161, credential: "snmpv3", prerequisites: ["SNMPv3 authPriv user configured"], prerequisitesFa: ["تعریف کاربر SNMPv3 با authPriv"] }),
      method({ key: "syslog", title: "Syslog over TLS", titleFa: "Syslog امن", summary: "Security, configuration and operational events.", summaryFa: "رخدادهای امنیتی، تغییر تنظیمات و عملیات دستگاه.", purposes: ["events"], readiness: "setup_required", recommended: true, selectable: false, secure: true, defaultPort: 6514, credential: "certificate", prerequisites: ["Remote logging host configured"], prerequisitesFa: ["تعریف سرور لاگ راه دور روی دستگاه"] })
    ]
  },
  mikrotik: {
    vendor: "mikrotik",
    strategy: "Use RouterOS REST over HTTPS for structured read-only inventory on v7; keep SSH for complete controlled changes and legacy RouterOS.",
    strategyFa: "در RouterOS 7 برای موجودی ساخت‌یافته از REST روی HTTPS و برای همه تغییرات کنترل‌شده یا نسخه‌های قدیمی از SSH استفاده کنید.",
    methods: [
      method({ key: "ssh", title: "SSH / CLI", titleFa: "SSH / CLI", summary: "Complete discovery and controlled operations across RouterOS versions.", summaryFa: "کشف کامل و عملیات کنترل‌شده در نسخه‌های مختلف RouterOS.", purposes: ["control", "inventory"], readiness: "ready", recommended: true, selectable: true, secure: true, defaultPort: 22, credential: "username_password", prerequisites: ["SSH service enabled", "User has ssh/read and required write policies"], prerequisitesFa: ["فعال بودن سرویس SSH", "داشتن مجوزهای ssh/read و مجوزهای لازم برای تغییر"] }),
      method({ key: "rest_api", title: "REST API (HTTPS)", titleFa: "REST API امن", summary: "Structured RouterOS v7 inventory; write actions remain intentionally on SSH.", summaryFa: "موجودی ساخت‌یافته RouterOS 7؛ عملیات تغییردهنده عمداً از مسیر SSH انجام می‌شوند.", purposes: ["inventory"], readiness: "ready", recommended: false, selectable: true, secure: true, defaultPort: 443, credential: "username_password", prerequisites: ["RouterOS 7", "www-ssl service enabled", "User has rest-api/read policies"], prerequisitesFa: ["RouterOS نسخه ۷", "فعال بودن سرویس www-ssl", "داشتن مجوزهای rest-api/read"] }),
      method({ key: "snmpv3", title: "SNMPv3", titleFa: "SNMPv3", summary: "Health and traffic counters without administrative CLI access.", summaryFa: "متریک سلامت و ترافیک بدون دسترسی مدیریتی CLI.", purposes: ["telemetry"], readiness: "setup_required", recommended: false, selectable: false, secure: true, defaultPort: 161, credential: "snmpv3", prerequisites: ["SNMPv3 enabled and restricted to collector IP"], prerequisitesFa: ["فعال‌سازی SNMPv3 و محدودکردن آن به IP جمع‌آورنده"] }),
      method({ key: "syslog", title: "Remote Syslog", titleFa: "Syslog راه دور", summary: "Firewall and system event stream.", summaryFa: "ارسال رخدادهای فایروال و سیستم.", purposes: ["events"], readiness: "setup_required", recommended: true, selectable: false, secure: false, defaultPort: 514, credential: "none", prerequisites: ["Remote logging action configured"], prerequisitesFa: ["تعریف remote logging action در RouterOS"] })
    ]
  },
  fortigate: {
    vendor: "fortigate",
    strategy: "Use the REST API with a least-privilege token for automation, SSH for compatibility, and Syslog/SNMPv3 for telemetry.",
    strategyFa: "برای اتوماسیون از REST API با توکن حداقل‌دسترسی، برای سازگاری از SSH و برای پایش از Syslog/SNMPv3 استفاده کنید.",
    methods: [
      method({ key: "ssh", title: "SSH / CLI", titleFa: "SSH / CLI", summary: "Current complete connector for discovery and controlled actions.", summaryFa: "اتصال کامل فعلی برای کشف و عملیات کنترل‌شده.", purposes: ["control", "inventory"], readiness: "ready", recommended: true, selectable: true, secure: true, defaultPort: 22, credential: "username_password", prerequisites: ["SSH enabled on a trusted interface"], prerequisitesFa: ["فعال بودن SSH روی اینترفیس قابل اعتماد"] }),
      method({ key: "rest_api", title: "FortiOS REST API", titleFa: "REST API فورتی‌اواس", summary: "Token-based structured automation with trusted-host restrictions.", summaryFa: "اتوماسیون ساخت‌یافته با توکن و محدودیت trusted host.", purposes: ["control", "inventory"], readiness: "planned", recommended: true, selectable: false, secure: true, defaultPort: 443, credential: "api_token", prerequisites: ["REST API administrator and token", "Trusted host restriction"], prerequisitesFa: ["ساخت REST API Administrator و توکن", "محدودکردن trusted host"] }),
      method({ key: "snmpv3", title: "SNMPv3", titleFa: "SNMPv3", summary: "Device, interface and session metrics.", summaryFa: "متریک دستگاه، اینترفیس و نشست‌ها.", purposes: ["telemetry"], readiness: "setup_required", recommended: false, selectable: false, secure: true, defaultPort: 161, credential: "snmpv3", prerequisites: ["SNMPv3 user and permitted hosts"], prerequisitesFa: ["تعریف کاربر SNMPv3 و میزبان‌های مجاز"] }),
      method({ key: "syslog", title: "Syslog over TLS", titleFa: "Syslog امن", summary: "Traffic, UTM and security event stream.", summaryFa: "ارسال رخدادهای ترافیک، UTM و امنیت.", purposes: ["events"], readiness: "setup_required", recommended: true, selectable: false, secure: true, defaultPort: 6514, credential: "certificate", prerequisites: ["Reliable/TLS logging configured"], prerequisitesFa: ["تنظیم ارسال قابل‌اعتماد یا TLS برای لاگ‌ها"] })
    ]
  },
  sophos: {
    vendor: "sophos",
    strategy: "Use the supported firewall API for configuration and Syslog/SNMPv3 for operational evidence.",
    strategyFa: "برای تنظیمات از API رسمی فایروال و برای شواهد عملیاتی از Syslog/SNMPv3 استفاده کنید.",
    methods: [
      method({ key: "xml_api", title: "Sophos Firewall API", titleFa: "API فایروال سوفوس", summary: "Current connector for inventory and controlled configuration.", summaryFa: "اتصال فعلی برای موجودی و پیکربندی کنترل‌شده.", purposes: ["control", "inventory"], readiness: "ready", recommended: true, selectable: true, secure: true, defaultPort: 4444, credential: "username_password", prerequisites: ["API access enabled for the application host"], prerequisitesFa: ["مجازکردن API برای IP سرور برنامه"] }),
      method({ key: "rest_api", title: "Firewall REST API", titleFa: "REST API جدید", summary: "Bearer-token configuration API on supported current releases.", summaryFa: "API پیکربندی با Bearer token در نسخه‌های جدید پشتیبانی‌شده.", purposes: ["control", "inventory"], readiness: "planned", recommended: false, selectable: false, secure: true, defaultPort: 4444, credential: "api_token", prerequisites: ["Supported SFOS release", "API key and trusted endpoint"], prerequisitesFa: ["نسخه پشتیبانی‌شده SFOS", "API key و endpoint قابل اعتماد"] }),
      method({ key: "snmpv3", title: "SNMPv3", titleFa: "SNMPv3", summary: "Health and interface monitoring.", summaryFa: "پایش سلامت و اینترفیس‌ها.", purposes: ["telemetry"], readiness: "setup_required", recommended: false, selectable: false, secure: true, defaultPort: 161, credential: "snmpv3", prerequisites: ["SNMPv3 configured"], prerequisitesFa: ["تنظیم SNMPv3"] }),
      method({ key: "syslog", title: "Syslog", titleFa: "Syslog", summary: "Firewall, IPS, web and authentication events.", summaryFa: "رخدادهای فایروال، IPS، وب و احراز هویت.", purposes: ["events"], readiness: "setup_required", recommended: true, selectable: false, secure: false, defaultPort: 514, credential: "none", prerequisites: ["Syslog server configured in SFOS"], prerequisitesFa: ["تعریف سرور Syslog در SFOS"] })
    ]
  }
};

export function listConnectionProfiles() {
  return Object.values(PROFILES);
}

export function getConnectionProfile(vendor: string) {
  return PROFILES[vendor.trim().toLowerCase() as VendorConnectionKey] ?? null;
}

export function onboardingMethodFor(vendor: VendorConnectionKey, key: ConnectionMethodKey) {
  const selected = PROFILES[vendor].methods.find((item) => item.key === key && item.selectable && item.readiness === "ready");
  if (!selected) return null;
  return {
    protocol: key === "rest_api" || key === "xml_api" ? "api" as const : "ssh" as const,
    port: selected.defaultPort ?? (key === "ssh" ? 22 : 443)
  };
}
