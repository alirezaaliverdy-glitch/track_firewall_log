# اتصال فایروال و ساخت تونل IKEv2

## امنیت و پذیرش

PSK در پاسخ عمومی ماسک می‌شود و در ActionPlan/audit/خروجی نگهداری نمی‌شود. مرجع موقت حافظه 30 دقیقه اعتبار دارد؛ جلسه ناقص نیز عمر محدود دارد. پس از انقضا یا ری‌استارت API فرم را دوباره بسازید. مرجع بین چند نمونه API مشترک نیست؛ برای استقرار چندنمونه‌ای session affinity یا secret store مشترک لازم است. پاسخ XML محدود و بدون DTD/ENTITY پردازش می‌شود؛ متن خام خطای API که ممکن است رمز را بازتاب دهد نمایش داده نمی‌شود.

مسیر Catalog → ActionPlan → Preview → Confirm → PolicyGuard → Connector → Audit حفظ شده است. هیچ فرمان دلخواهی از فرم اجرا نمی‌شود و خطا به‌جای موفقیت ثبت می‌شود. تست‌های فعلی شبیه‌سازی‌شده‌اند؛ پیش از تولید، مجوز حداقلی، HTTPS معتبر، جمع‌آوری، یک تونل آزمایشگاهی، خواندن مجدد، SA/ترافیک و بازگردانی دستی باید روی نسخه واقعی پذیرفته شوند.

## منابع رسمی

- [API در Sophos 21.5](https://docs.sophos.com/nsg/sophos-firewall/21.5/Help/en-us/webhelp/onlinehelp/AdministratorHelp/BackupAndFirmware/API/APIConfiguration/index.html)، [API در Sophos 22](https://docs.sophos.com/nsg/sophos-firewall/22.0/Help/en-us/webhelp/onlinehelp/AdministratorHelp/Administration/API/APIConfiguration/index.html)
- [ساختار VPNIPSecConnection](https://docs.sophos.com/nsg/sophos-firewall/21.5/api/CONFIGURE/VPN/IPSECConnection/operations/addfailovergroupipsecconnection&editipsecconnection.html)
- [ساختار VPNProfile](https://docs.sophos.com/nsg/sophos-firewall/21.5/api/CONFIGURE/VPN/VPNProfile/operations/addvpnpolicy&editvpnpolicy.html)، [تنظیم پروفایل](https://docs.sophos.com/nsg/sophos-firewall/21.5/Help/en-us/webhelp/onlinehelp/AdministratorHelp/Profiles/IPsecProfiles/IPsecProfileAdd/index.html)
- [Site-to-Site با PSK در FortiGate](https://docs.fortinet.com/document/fortigate/7.4.0/administration-guide/913287/basic-site-to-site-vpn-with-pre-shared-key)
- [Phase1](https://docs.fortinet.com/document/fortigate/7.4.7/administration-guide/790613/phase-1-configuration)، [Phase2](https://docs.fortinet.com/document/fortigate/7.4.6/administration-guide/604285/phase-2-configuration)

## اتصال Sophos

1. در SFOS 21.5 به **Backup and firmware → API** بروید، **API configuration** را فعال کنید، فقط IP سرور برنامه را در **Allowed IP address** وارد کنید و Apply بزنید. در نسخه‌های جدیدتر ممکن است منو زیر Administration باشد. دستگاه IP خروجی سرور یا NAT را می‌بیند، نه الزاماً IP داخلی کانتینر.
2. دسترسی HTTPS مدیریت را از همان IP مجاز کنید؛ نه تمام اینترنت. حساب اختصاصی با مجوزهای لازم API انتخاب کنید.
3. در برنامه: **دارایی‌ها → ثبت دستگاه → Sophos Firewall → API**. آدرس مدیریت، پورت HTTPS واقعی (معمولاً 4444) و اعتبارنامه دستگاه را وارد کنید. مسیر `/webconsole/APIController` را برنامه اضافه می‌کند؛ URL کامل را به جای هاست وارد نکنید.
4. HTTPS باید معتبر باشد. برای CA خصوصی، فقط گواهی عمومی PEM تأییدشده را وارد کنید، نه کلید خصوصی. نام DNS یا IP آدرس مدیریت باید با SAN گواهی مطابقت داشته باشد؛ افزودن CA خطای نام گواهی را حل نمی‌کند. اعتبارسنجی TLS را خاموش نکنید.
5. **تست اتصال → مرور → ثبت**. خطا را با بررسی پورت واقعی، IP خروجی، مجوز حساب، HTTPS مدیریت، مسیر شبکه و گواهی پیگیری کنید. نسخه SFOS برای راهنمای دقیق منوها لازم است.

## ساخت تونل در برنامه

در **اقدامات → کتابخانه فرمان‌ها** دستگاه و دسته VPN را انتخاب کنید. **ساخت تونل Site-to-Site سوفوس** یا **ساخت تونل Site-to-Site فورتی‌گیت** را باز کنید. فرم را تکمیل کنید؛ بعد از بررسی بک‌آپ، تأثیر تغییرات و پیش‌نمایش، اجرا را تأیید کنید. بازکردن فرم و پیش‌نمایش دستگاه را تغییر نمی‌دهد.

### Sophos

- دو IP Host از نوع **Network / IPv4** در دستگاه بسازید: شبکه محلی و شبکه مقابل، بدون هم‌پوشانی و با آدرس شبکه و ماسک معتبر. پس از جمع‌آوری جدید، گزینه‌های واقعی در فرم ظاهر می‌شوند.
- پروفایل موجود **IKEv2 / Automatic** با AES، SHA2 و DH امن انتخاب کنید. برخی نسخه‌های API نوع IKE را برنمی‌گردانند؛ آن را در دستگاه بررسی و در فرم تأیید کنید. الگوریتم‌ها، DH و زمان‌های مذاکره دو طرف باید تطبیق داشته باشند.
- WAN، IPv4 دروازه مقابل، Local ID و Remote ID را وارد کنید؛ شناسه‌ها در این نسخه IPv4 هستند و در سمت مقابل برعکس تطبیق داده می‌شوند.
- PSK دو طرف یکسان، 16 تا 64 نویسه و مطابق محدودیت فرم باشد. پیش‌فرض شروع مذاکره RespondOnly است؛ حداقل یک سمت باید آغازکننده باشد.
- برنامه قانون باز عمومی نمی‌سازد. قوانین **LAN ↔ VPN** با شبکه‌ها و سرویس‌های لازم، مسیر برگشت و NAT خاص را جداگانه بررسی کنید.

### FortiGate

- روش این عملیات SSH است. حساب باید مجوز خواندن پیش‌نیازها و تغییر VPN/interface و در صورت انتخاب route/policy در VDOM موردنظر را داشته باشد.
- نام Phase1 حداکثر 15 نویسه، WAN/LAN واقعی، IPv4 دروازه مقابل و دو شبکه بدون هم‌پوشانی لازم است. IKEv2 و DH امن استفاده می‌شود؛ Phase2 نیز PFS دارد.
- ساخت route و دو policy بین شبکه‌های مشخص اختیاری است. policyهای این سناریو همه سرویس‌ها را بین همان دو شبکه مجاز می‌کنند؛ اثر این دسترسی را بررسی کنید. NAT داخلی پیش‌فرض خاموش و متفاوت از NAT Traversal است.
- فعال‌سازی پس از ساخت پیش‌فرض خاموش است: interface تونل و policyهای ساخته‌شده غیرفعال‌اند. blackhole route خودکار ساخته نمی‌شود؛ جلوگیری از خروج ترافیک شبکه مقابل از مسیر پیش‌فرض هنگام قطع تونل را جداگانه طراحی کنید.
- نام‌های موجود پیش از نوشتن بررسی می‌شوند؛ ساخت، تونل/آدرس/policy هم‌نام را بازنویسی نمی‌کند.

## معنی نتیجه

**تنظیمات تأیید شد** یعنی خواندن مجدد و تطبیق اطلاعات با درخواست؛ نه اثبات SA یا عبور ترافیک. وضعیت SA در این مسیر Sophos **نامشخص** است؛ FortiGate خلاصه SA را جدا می‌خواند و بدون شواهد، نامشخص باقی می‌ماند.

برای تست واقعی، دو سمت را تنظیم و IKEv2/proposal/DH/PSK/ID/selectorها را تطبیق دهید. SA و ترافیک مجاز را در دستگاه بررسی کنید. UDP 500/4500، ESP در صورت نبود NAT-T، قوانین LAN/VPN و مسیر برگشت را مطابق توپولوژی کنترل کنید؛ نه با بازکردن دسترسی برای تمام اینترنت. خطا پس از نوشتن می‌تواند تغییر ناقص باشد؛ قبل از تکرار دستگاه را بررسی کنید.

بازگردانی خودکار پیاده نشده است؛ بک‌آپ و دسترسی مدیریت جایگزین داشته باشید. SSL VPN، همتای پویا، IPv6، گواهی به‌جای PSK، ویرایش/حذف خودکار تونل موجود و ساخت پروفایل Sophos خارج از دامنه فعلی هستند. این قابلیت، مدیریت تمام امکانات فایروال نیست.
