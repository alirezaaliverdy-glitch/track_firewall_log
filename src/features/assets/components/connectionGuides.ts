export type ConnectionGuide = {
  titleFa: string;
  titleEn: string;
  stepsFa: string[];
  stepsEn: string[];
  command?: string;
  noteFa?: string;
  noteEn?: string;
};

export const connectionGuides: Record<string, Record<string, ConnectionGuide>> = {
  cisco: {
    ssh: {
      titleFa: "اتصال مدیریتی Cisco",
      titleEn: "Cisco management connection",
      stepsFa: ["SSH v2 را روی اینترفیس مدیریتی فعال کنید و فقط IP سرور برنامه را مجاز کنید.", "حساب فقط‌خواندنی برای جمع‌آوری بسازید؛ برای اقدام‌های تغییردهنده مجوز جداگانه بدهید."],
      stepsEn: ["Enable SSH v2 on the management interface and allow only the application server.", "Use a read-only account for collection; grant write permission separately for actions."]
    },
    snmpv3: {
      titleFa: "راه‌اندازی SNMPv3 روی Cisco",
      titleEn: "Set up SNMPv3 on Cisco",
      stepsFa: [
        "روی دستگاه، یک کاربر فقط‌خواندنی SNMPv3 با سطح authPriv بسازید.",
        "دسترسی UDP/161 را فقط از IP سرور برنامه مجاز کنید.",
        "نام کاربری و دو رمز احراز هویت و محرمانگی را در فرم زیر وارد کنید؛ سپس اتصال را تست کنید."
      ],
      stepsEn: [
        "Create a read-only SNMPv3 authPriv user on the device.",
        "Allow UDP/161 only from the application server.",
        "Enter the username, authentication secret, and privacy secret below, then test."
      ],
      command: "snmp-server group FIREWALL-RO v3 priv\nsnmp-server user firewall-monitor FIREWALL-RO v3 auth sha <AUTH_SECRET> priv aes 128 <PRIV_SECRET>",
      noteFa: "فرمان نمونه برای IOS است؛ محدودسازی منبع را با ACL مطابق نسخه IOS/IOS-XE انجام دهید.",
      noteEn: "Sample IOS commands; restrict the source using an ACL appropriate for your IOS/IOS-XE version."
    }
  }
};
