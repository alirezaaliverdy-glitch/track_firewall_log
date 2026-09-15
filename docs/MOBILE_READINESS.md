# آمادگی موبایل، تبلت و دسکتاپ

این پروژه سه روش اجرا دارد:

1. وب واکنش‌گرا در مرورگر موبایل و تبلت؛
2. نصب PWA از همان وب؛
3. برنامه بومی Capacitor برای Android و iOS، شامل حالت Local Mobile Runtime.

## آدرس صحیح روی گوشی

`localhost` روی گوشی به خود گوشی اشاره می‌کند، نه کامپیوتر یا سرور Docker. برای باز کردن نسخه وب از موبایل، گوشی و سرور باید در یک شبکه باشند و آدرس قابل دسترس سرور استفاده شود، برای نمونه:

```text
http://192.168.1.20/firewall/
```

برای محیط واقعی و نصب مطمئن PWA از HTTPS و نام دامنه معتبر استفاده کنید:

```text
https://firewall.example.com/firewall/
```

## ساخت نسخه وب زیر `/firewall/`

در PowerShell:

```powershell
$env:VITE_BASE_PATH = "/firewall/"
$env:VITE_API_BASE_URL = "/firewall-api"
npm run build
```

`BrowserRouter`، manifest، service worker و آیکن‌ها همگی از base path استفاده می‌کنند. service worker فقط داخل مرورگر ثبت می‌شود و در WebView بومی Capacitor غیرفعال است.

نکته: PWA خارج از `localhost` به HTTPS نیاز دارد. اجرای ساده HTTP روی شبکه محلی برای تست رابط وب مناسب است، اما معیار انتشار PWA نیست.

## ساخت Android

نسخه بومی باید با base path ریشه ساخته شود؛ مقدار `/firewall/` را برای آن نگه ندارید:

```powershell
Remove-Item Env:VITE_BASE_PATH -ErrorAction SilentlyContinue
npm run build
pnpm exec cap sync android
Set-Location android
.\gradlew.bat --no-daemon verifyRootSdkVariables testDebugUnitTest assembleDebug
```

APK دیباگ در مسیر زیر تولید می‌شود:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

برای اتصال Server Mode در نسخه بومی، API باید با یک URL مطلق HTTPS و قابل دسترس از گوشی ساخته شود. هیچ رمز، token یا credential نباید در متغیرهای `VITE_*` قرار گیرد.

ساخت نهایی iOS به macOS و Xcode نیاز دارد. روی Windows فقط کد مشترک و Sync پروژه قابل بررسی است و امضای IPA باید روی macOS انجام شود.

## رفتار رابط در اندازه‌های مختلف

- دسکتاپ: سایدبار کامل و نوار ابزار کامل؛
- تبلت و موبایل: سایدبار به Drawer تبدیل می‌شود؛
- موبایل: نوار پایین پنج‌گزینه‌ای برای داشبورد، دارایی‌ها، پایش، عملیات و «بیشتر»؛
- جدول‌های عریض به‌صورت افقی و لمسی اسکرول می‌شوند؛
- فیلترها، فرم‌ها، دیالوگ‌ها و کارت‌ها در تلفن تک‌ستونه می‌شوند؛
- فیلدها حداقل فونت 16px دارند تا Safari هنگام تایپ zoom ناخواسته نکند؛
- Safe Area بالا و پایین برای دستگاه‌های notch‌دار رعایت می‌شود؛
- باز شدن کیبورد موبایل ارتفاع قابل استفاده صفحه را اصلاح می‌کند؛
- حالت RTL فارسی و LTR انگلیسی از همان layout مشترک استفاده می‌کنند.

## ماتریس پذیرش قبل از انتشار

این موارد باید هم در فارسی و هم انگلیسی بررسی شوند:

| گروه | اندازه پیشنهادی | موارد اصلی |
| --- | --- | --- |
| تلفن کوچک | 360×800 | ورود، Drawer، نوار پایین، فرم و کیبورد |
| تلفن معمول | 390×844 | Dashboard، Assets، Monitoring، Actions |
| تبلت عمودی | 768×1024 | چیدمان کارت‌ها، فیلترها و جدول‌ها |
| تبلت افقی | 1024×768 | تغییر Drawer/Sidebar و نبود overflow صفحه |
| دسکتاپ | 1440×900 | سایدبار، جستجو، جدول‌ها و دیالوگ‌ها |

برای هر اندازه این مسیرها مرور شوند:

- `/login`
- `/dashboard`
- `/assets`, `/assets/devices`, `/assets/devices/new`
- `/security`, `/security/findings`, `/security/rules`
- `/monitoring`, `/monitoring/linux`
- `/actions` و جزئیات ActionPlan
- `/assistant`, `/integrations`, `/tools`, `/settings`, `/mobile/local`

موارد پذیرش: نبود اسکرول افقی در کل صفحه، هدف لمسی حداقل 44px، قابل مشاهده ماندن دکمه اصلی پس از باز شدن کیبورد، بسته شدن Drawer با Escape/پس‌زمینه، اسکرول مستقل جدول، نمایش Offline banner و عدم امکان اجرای آفلاین عملیات کنترلی.
