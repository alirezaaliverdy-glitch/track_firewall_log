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
  linux: {
    ssh: {
      titleFa: "جمع‌آوری Linux از SSH", titleEn: "Linux collection over SSH",
      stepsFa: ["سرویس SSH را فعال کنید و دسترسی آن را به IP سرور برنامه محدود کنید.", "یک حساب با دسترسی خواندن وضعیت سیستم و لاگ‌های لازم بسازید؛ برای عملیات مدیریتی sudo را جداگانه و محدود بدهید.", "اعتبارنامه را در تنظیمات تجهیز ثبت و اتصال را تست کنید؛ پایش دوره‌ای با همین مسیر انجام می‌شود."],
      stepsEn: ["Enable SSH and restrict its access to the application server IP.", "Create an account that can read system status and required logs; grant limited sudo separately for administrative actions.", "Save the credential in device settings and test. Periodic monitoring uses this same path."],
      noteFa: "Agent مستقل و گیرنده Syslog مستقیم هنوز در برنامه ارائه نشده‌اند؛ این موارد به‌عنوان مسیر متصل نمایش داده نمی‌شوند.",
      noteEn: "A standalone agent and direct Syslog receiver are not shipped yet and are not presented as connected paths."
    }
  },
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
  },
  fortigate: {
    ssh: {
      titleFa: "اتصال مدیریتی FortiGate", titleEn: "FortiGate management connection",
      stepsFa: ["SSH را فقط روی اینترفیس مدیریتی قابل‌اعتماد فعال کنید.", "برای برنامه حساب با حداقل مجوز لازم بسازید و دسترسی IP سرور را محدود کنید."],
      stepsEn: ["Enable SSH only on a trusted management interface.", "Create a least-privilege account and restrict access to the application server IP."]
    },
    snmpv3: {
      titleFa: "راه‌اندازی SNMPv3 روی FortiGate", titleEn: "Set up SNMPv3 on FortiGate",
      stepsFa: ["در بخش System → SNMP یک کاربر SNMPv3 فقط‌خواندنی با authPriv و SHA/AES بسازید.", "دسترسی SNMP اینترفیس مدیریتی و میزبان مجاز را به IP سرور برنامه محدود کنید.", "دو رمز و نام کاربر را در فرم زیر ذخیره کنید و تست اتصال را اجرا کنید."],
      stepsEn: ["Create a read-only SNMPv3 authPriv user with SHA/AES under System → SNMP.", "Restrict SNMP on the management interface and permitted hosts to the application server.", "Save the username and two secrets below, then run the connection test."],
      noteFa: "این مسیر زمان‌کار و تعداد اینترفیس‌ها را می‌خواند؛ لاگ‌های فایروال از SNMP دریافت نمی‌شوند.",
      noteEn: "This path reads uptime and interface count; firewall logs are not collected over SNMP."
    }
  },
  mikrotik: {
    rest_api: {
      titleFa: "اتصال RouterOS REST", titleEn: "RouterOS REST connection",
      stepsFa: ["سرویس HTTPS مدیریت RouterOS را با گواهی معتبر فعال کنید.", "یک کاربر فقط‌خواندنی بسازید و دسترسی آن را به IP سرور برنامه محدود کنید."],
      stepsEn: ["Enable the RouterOS HTTPS management service with a trusted certificate.", "Create a read-only user and restrict its access to the application server IP."]
    },
    ssh: {
      titleFa: "اتصال SSH MikroTik", titleEn: "MikroTik SSH connection",
      stepsFa: ["SSH را در IP → Services فعال و IP مجاز را محدود کنید.", "حساب دارای حداقل مجوز لازم برای مشاهده اطلاعات بسازید."],
      stepsEn: ["Enable SSH under IP → Services and restrict allowed addresses.", "Create a least-privilege account for reading device data."]
    },
    snmpv3: {
      titleFa: "راه‌اندازی SNMPv3 روی MikroTik", titleEn: "Set up SNMPv3 on MikroTik",
      stepsFa: ["SNMP را فعال کنید و یک community/کاربر با security=private، احراز هویت SHA و محرمانگی AES بسازید.", "آدرس مجاز را فقط IP سرور برنامه بگذارید و UDP/161 را در فایروال باز کنید.", "نام و دو رمز همین کاربر را در فرم زیر وارد و تست کنید."],
      stepsEn: ["Enable SNMP and create a private-security user/community with SHA authentication and AES privacy.", "Restrict the source address to the application server and allow UDP/161.", "Enter the same user and two secrets below, then test."],
      noteFa: "SNMPv3 برای سلامت پایه است؛ جزئیات کامل RouterOS همچنان از REST/SSH خوانده می‌شود.",
      noteEn: "SNMPv3 supplies basic health data; full RouterOS details still come from REST/SSH."
    }
  },
  sophos: {
    xml_api: {
      titleFa: "اتصال API سوفوس", titleEn: "Sophos Firewall API connection",
      stepsFa: ["در Administration → API Access دسترسی API را برای IP سرور برنامه فعال کنید.", "حساب با مجوز لازم برای مشاهده بسازید؛ مجوز تغییر را فقط در صورت نیاز به اقدام بدهید."],
      stepsEn: ["Allow the application server IP under Administration → API Access.", "Create an account with read permission; grant write permission only for reviewed actions."]
    },
    snmpv3: {
      titleFa: "راه‌اندازی SNMPv3 روی Sophos", titleEn: "Set up SNMPv3 on Sophos",
      stepsFa: ["در Administration → SNMP کاربر SNMPv3 با سطح authPriv، SHA و AES تعریف کنید.", "در قوانین مدیریت، UDP/161 را فقط از IP سرور برنامه مجاز کنید.", "نام کاربر و دو رمز را در فرم زیر ذخیره و تست کنید."],
      stepsEn: ["Create an SNMPv3 authPriv user with SHA and AES under Administration → SNMP.", "Allow UDP/161 only from the application server in management access rules.", "Save the username and both secrets below, then test."],
      noteFa: "دریافت لاگ IPS/وب از این مسیر انجام نمی‌شود؛ فقط متریک پایه SNMP جمع‌آوری می‌شود.",
      noteEn: "IPS and web logs are not collected through this path; only basic SNMP metrics are collected."
    }
  },
  esxi: {
    soap_api: {
      titleFa: "اتصال API هاست ESXi", titleEn: "ESXi host API connection",
      stepsFa: ["برای هاست مستقل، HTTPS روی پورت ۴۴۳ و حساب دارای مجوز مشاهده هاست را آماده کنید.", "گواهی TLS باید معتبر باشد؛ در صورت خودامضا بودن، گواهی CA تأییدشده را در تنظیم مسیر وارد کنید.", "بعد از ذخیره، تست اتصال باید موجودی واقعی هاست را بخواند."],
      stepsEn: ["For a standalone host, prepare HTTPS on port 443 and an account allowed to read host inventory.", "TLS must be trusted; supply a verified CA certificate if the host uses a self-signed certificate.", "After saving, the connection test must read real host inventory."]
    },
    ssh: {
      titleFa: "اتصال SSH هاست ESXi", titleEn: "ESXi host SSH connection",
      stepsFa: ["در Host Client مسیر Manage → Services → TSM-SSH → Start را باز کنید و دسترسی را به سرور برنامه محدود کنید.", "برای حساب، Shell Access را فعال کنید و اثر انگشت RSA/SHA256 هاست را از کنسول مورداعتماد بگیرید.", "اثر انگشت و اعتبارنامه را در تنظیم مسیر وارد کنید؛ ورود وب به‌تنهایی مجوز SSH نیست."],
      stepsEn: ["In Host Client, open Manage → Services → TSM-SSH → Start and restrict access to the application server.", "Enable Shell Access for the account and obtain the host's RSA/SHA256 fingerprint from a trusted console.", "Enter the fingerprint and credential in path settings; web login alone does not grant SSH access."],
      command: "/usr/lib/vmware/openssh/bin/ssh-keygen -l -f /etc/ssh/ssh_host_rsa_key.pub -E sha256",
      noteFa: "فرمان را فقط داخل خود ESXi اجرا کنید؛ خروجی SHA256 را با منبع مورداعتماد تطبیق دهید.",
      noteEn: "Run this command on ESXi itself and verify the SHA256 output through a trusted source."
    }
  }
};
