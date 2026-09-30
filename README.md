# Firewall SOAR

این مخزن با Docker Compose از یک clone تازه قابل اجراست. فایل پیش‌فرض `docker-compose.yml` وب، API، PostgreSQL و درگاه HTTPS را راه می‌اندازد؛ در اولین اجرا secretهای تصادفی، مهاجرت‌های دیتابیس و حساب مدیر اولیه ساخته می‌شوند. راهنمای فارسی کامل‌تر در [README_FA.md](README_FA.md) است.

## نصب روی سرور تازه

پیش‌نیاز: Docker Engine و Compose v2، دسترسی به GitHub/Docker Hub/npm برای دریافت وابستگی‌ها، و پورت‌های آزاد ۸۰ و ۴۴۳.

```bash
git clone --depth 1 --branch main --single-branch https://github.com/alirezaaliverdy-glitch/track_firewall_log.git
cd track_firewall_log
docker compose up -d --build --wait
docker compose ps
```

پس از healthy شدن چهار سرویس اصلی، `https://SERVER_IP/firewall/` را باز کنید. گواهی پیش‌فرض Caddy داخلی است؛ برای محیط عملیاتی، دامنه و گواهی مورداعتماد تنظیم کنید. حساب مدیر اولیه در volume خصوصی ساخته می‌شود. فقط روی خود سرور و در ترمینال امن آن را بخوانید:

```bash
docker compose exec firewall-api cat /app/storage/bootstrap/initial-admin.json
```

رمز اولیه را پس از ورود تغییر دهید؛ آن را در تیکت، لاگ یا مخزن قرار ندهید. فایل `.env` برای اجرای پیش‌فرض لازم نیست. در صورت تنظیم `CORS_ORIGIN` برای production، مقدار آن باید مبدأ HTTPS واقعی باشد؛ `localhost` و IP خصوصی به‌درستی توسط محافظ امنیتی رد می‌شوند.

## به‌روزرسانی و بررسی

```bash
git pull --ff-only
docker compose up -d --build --wait
docker compose ps
```

برای خطاهای راه‌اندازی، `docker compose logs --tail=100 firewall-api gateway` را در محیط امن بررسی کنید و خروجی حاوی اطلاعات حساس را منتشر نکنید. `docker compose down -v` را روی سرور دارای داده اجرا نکنید؛ این گزینه volumeهای دیتابیس و اطلاعات پایدار را حذف می‌کند.

`docker-compose.production.yml` مسیر جداگانهٔ انتشار imageهای نسخه‌دار از CI است و به متغیرها و imageهای تعیین‌شده نیاز دارد؛ دستور نصب بالای این صفحه عمداً از Compose پیش‌فرضِ قابل‌ساخت از کد استفاده می‌کند.
