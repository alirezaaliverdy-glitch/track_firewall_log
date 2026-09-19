# راه‌اندازی Firewall SOAR روی سرور

این مخزن برای استقرار مستقیم آماده است. Docker Compose در اولین اجرا رابط وب، API، PostgreSQL، مهاجرت‌های دیتابیس، حساب مدیر اولیه، HTTPS و درگاه معکوس را به‌صورت خودکار آماده می‌کند.

## پیش‌نیاز

- Docker Engine
- Docker Compose v2
- آزاد بودن پورت‌های 80 و 443

## نصب و اجرا

    git clone --depth 1 --branch latest-safe-snapshot --single-branch https://github.com/alirezaaliverdy-glitch/track_firewall_log.git
    cd track_firewall_log
    docker compose up -d

در اجرای اول imageها ساخته و وابستگی‌ها دریافت می‌شوند؛ بنابراین ممکن است چند دقیقه زمان ببرد. وضعیت سرویس‌ها را با دستور زیر ببینید:

    docker compose ps

پس از healthy شدن سرویس‌ها، برنامه در این آدرس در دسترس است:

    https://SERVER_IP/firewall/

درگاه پیش‌فرض یک گواهی داخلی Caddy می‌سازد. مرورگر ممکن است تا زمان نصب CA داخلی یا قرار دادن برنامه پشت دامنه و گواهی معتبر، هشدار اعتماد نشان دهد.

## ورود اولیه

نام کاربری و رمز تصادفی مدیر فقط در volume خصوصی برنامه تولید می‌شود. برای مشاهده یک‌باره آن:

    docker compose exec firewall-api cat /app/storage/bootstrap/initial-admin.json

بعد از اولین ورود، رمز مدیر را تغییر دهید و خروجی دستور بالا را در پیام، تیکت یا فایل عمومی ذخیره نکنید.

## به‌روزرسانی

    git pull --ff-only
    docker compose up -d --build

Compose مهاجرت‌های جدید دیتابیس را پیش از شروع API اجرا می‌کند و داده‌های موجود در volumeها باقی می‌مانند.

## توقف و مشاهده لاگ

    docker compose stop
    docker compose logs -f --tail=200

از دستور docker compose down -v روی سرور واقعی استفاده نکنید؛ گزینه -v دیتابیس و داده‌های پایدار برنامه را حذف می‌کند.

## تنظیمات اختیاری

برای اجرای عادی هیچ فایل .env لازم نیست. در صورت نیاز می‌توانید متغیرهایی مانند FIREWALL_HTTP_PORT، FIREWALL_HTTPS_PORT، BOOTSTRAP_ADMIN_USERNAME، PUBLIC_APP_URL یا تنظیمات AI را در محیط سرور یا فایل .env خصوصی تعریف کنید.

فایل .env و اطلاعات دستگاه‌ها نباید commit شوند.
