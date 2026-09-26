# بک‌آپ تجهیزات

مسیر برنامه: /firewall/backups

شرکت و دستگاه را انتخاب کنید، «گرفتن بک‌آپ» را بزنید و فایل را از تاریخچه دریافت کنید. نام کاربر، زمان تهران، اندازه و SHA-256 همراه فایل ثبت می‌شود. فقط مدیر یا اپراتور دارای دسترسی بخش دارایی‌ها و مجوز مدیریت تجهیزات می‌تواند این بخش را استفاده کند؛ حساب بیننده به فایل‌ها دسترسی ندارد.

## نوع فایل‌ها

| وندور | فایل و دامنه | پیش‌نیاز |
| --- | --- | --- |
| Cisco IOS / IOS-XE | running-config با پسوند cfg؛ نه Flash، Firmware یا startup-config | SSH، حساب دارای اجازه show running-config؛ پروفایل سازگاری سیسکو ثبت‌شده رعایت می‌شود |
| MikroTik RouterOS 6/7 | خروجی rsc با تنظیمات حساس قابل‌صدور؛ نه بک‌آپ باینری | SSH و مجوز export/sensitive؛ برای نسخه ۶ و ۷ دستور متفاوت است |
| FortiGate | فایل بومی sys_config با پسوند conf از SCP | SSH و admin-scp فعال و حساب مجاز؛ محدوده VDOM تابع دسترسی حساب است |
| pfSense | config.xml | SSH و مجوز خواندن /conf/config.xml |
| Linux / Linux edge | آرشیو tar.gz از /etc | SSH و خواندن تمام /etc؛ در صورت فعال بودن sudo در اعتبارنامه، sudo -n مجاز باشد |

این فایل‌ها بک‌آپ کامل دیسک یا دیتابیس نیستند. MikroTik گذرواژه کاربران، گواهی‌ها و فایل‌های مستقل را در export برنمی‌گرداند؛ pfSense نیز ممکن است فایل‌های مستقل افزونه‌ها را بیرون از config.xml داشته باشد. برای Sophos و وندورهای ناشناخته، نبود کانکتور بک‌آپ معتبر صریح نمایش داده می‌شود و فایل ساختگی ارائه نمی‌شود. بازگردانی خودکار در این نسخه وجود ندارد؛ بازیابی باید با روش رسمی، نسخه سازگار و بازبینی مدیر انجام شود.

## نگهداری و امنیت

- بک‌آپ مستقیم از دستگاه دریافت می‌شود، نه از cache پایش.
- محتوا با AES-256-GCM و CREDENTIAL_ENCRYPTION_KEY در DeviceSnapshot رمزنگاری می‌شود؛ مهاجرت دیتابیس لازم نیست. از دیتابیس و کلید رمزنگاری در محل‌های امن و جداگانه بک‌آپ بگیرید؛ تغییر یا حذف کلید، فایل‌های قبلی را غیرقابل‌خواندن می‌کند.
- فایل دانلودشده رمزنگاری‌شده نیست و ممکن است اطلاعات حساس داشته باشد. آن را منتشر نکنید و روی سرور عمومی قرار ندهید.
- فهرست و audit فقط فراداده دارند؛ هیچ خروجی دستگاه یا اعتبارنامه در پاسخ خطا ثبت نمی‌شود. ایجاد، دریافت و خطای بک‌آپ audit می‌شوند.
- مالکیت شرکت در ایجاد، تاریخچه و دانلود بررسی می‌شود. GETها نیز مجوز مدیریت تجهیزات لازم دارند؛ cache پاسخ‌ها ممنوع است.
- سقف فایل ۲۰ MiB، فرمان ۶۰ ثانیه، حداکثر چهار دریافت هم‌زمان و یک دریافت برای هر دستگاه است. آرشیو لینوکس هنگام اعتبارسنجی حداکثر ۱۲۸ MiB باز می‌شود. فایل ناقص، خطای فرمان، checksum نامعتبر و خروجی صفحه‌بندی‌شده پذیرفته نمی‌شود.
- مسیر SSH ذخیره‌شده و پورت همان مسیر استفاده می‌شود. اگر اتصال اصلی API باشد، مسیر SSH فعال ثبت‌شده استفاده می‌شود؛ پورت ۲۲ خودسرانه جایگزین نمی‌شود.

## اجرا و تست

Compose فعال محلی: docker-compose.firewall.yml با project برابر track_firewall_log. API و web باید از همین checkout بیلد شوند؛ volumeهای دیتابیس حذف نشوند. برای production تنظیمات امن محیط و کلید رمزنگاری پایدار لازم است.

تست‌های backend/test/device-backup.test.ts بدون دیتابیس واقعی، انتقال ناقص، مجوزها، رمزنگاری و محدودیت مالکیت را بررسی می‌کنند.

دو smoke script در backend/scripts موجود است. smoke-backups.mjs با BACKUP_SMOKE_LIVE=true بک‌آپ واقعی می‌سازد و فایل را با هش مقایسه می‌کند؛ سابقه و فایل واقعی باقی می‌مانند. smoke-backup-ui.mjs با Chromium موجود در کانتینر API صفحه مستقر را در اندازه موبایل و دسکتاپ بررسی می‌کند. این اسکریپت‌ها داخل کانتینر API و با dist همین نسخه اجرا شوند؛ هرکدام session موقت خود را پاک می‌کنند و محتوای فایل را چاپ نمی‌کنند.

## منابع رسمی

- [Cisco: Backup and restore configuration](https://www.cisco.com/c/en/us/support/docs/ios-nx-os-software/ios-software-releases-122-mainline/46741-backup-config.html)
- [MikroTik: Configuration management](https://manual.mikrotik.com/docs/getting-started/configuration-management/)
- [Fortinet: Native configuration download using SCP](https://community.fortinet.com/fortigate-3/technical-tip-how-to-download-a-fortigate-configuration-file-and-upload-a-firmware-file-using-secure-copy-scp-98734)
- [Netgate: XML configuration file](https://docs.netgate.com/pfsense/en/latest/config/xml-configuration-file.html)
