# نصب و استفاده از Firewall SOAR Android 1.0.1

## پیش‌نیاز ساخت

- JDK 21
- Android Studio یا Android SDK با Platform 36
- Android Build Tools 35.0.0
- pnpm 10

در Android Studio از **SDK Manager**، موارد `Android SDK Platform 36`، `Android SDK Build-Tools 35.0.0` و `Android SDK Platform-Tools` را نصب کنید.

## ساخت APK آزمایشی

در PowerShell ریشه پروژه:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/mobile/build-android-debug.ps1
```

خروجی:

```text
artifacts/Firewall-SOAR-Android-1.0.1-debug.apk
```

این APK با کلید Debug امضا می‌شود و برای تست داخلی است، نه انتشار Google Play.

## نصب روی گوشی

1. فایل APK را به گوشی منتقل کنید.
2. در Android اجازه نصب از منبع فعلی را فقط برای همان File Manager فعال کنید.
3. APK را نصب و برنامه **Firewall SOAR** را باز کنید.
4. گوشی و رایانه/سرور را به یک شبکه متصل کنید.
5. در صفحه اول، آدرس Backend را وارد کنید.

نمونه برای گوشی واقعی:

```text
http://192.168.1.20/firewall-api
```

نمونه برای Emulator اندروید وقتی Backend روی همان رایانه اجرا می‌شود:

```text
http://10.0.2.2/firewall-api
```

`localhost` روی گوشی یعنی خود گوشی و آدرس رایانه نیست. IP رایانه را با `ipconfig` پیدا کنید. پورت HTTP پروژه نیز باید در Firewall ویندوز و شبکه قابل دسترس باشد.

پس از موفق‌شدن تست اتصال، با همان نام کاربری و رمز نسخه وب وارد شوید. برای عوض‌کردن سرور، منوی حساب در نوار بالا را باز و **تغییر سرور** را انتخاب کنید.

## نسخه واقعی سازمانی

برای انتشار، سرور باید HTTPS معتبر داشته باشد و APK/AAB با keystore سازمان امضا شود. متغیرهای `FIREWALL_RELEASE_STORE_FILE`، `FIREWALL_RELEASE_STORE_PASSWORD`، `FIREWALL_RELEASE_KEY_ALIAS` و `FIREWALL_RELEASE_KEY_PASSWORD` فقط در محیط امن CI تنظیم می‌شوند و نباید وارد Git شوند.

قبل از Release، بدون `CAPACITOR_ALLOW_CLEARTEXT` و `VITE_MOBILE_ALLOW_HTTP`، `pnpm run build` و `pnpm exec cap sync android` را اجرا کنید؛ سپس `bundleRelease` را با امضای سازمانی بسازید.
