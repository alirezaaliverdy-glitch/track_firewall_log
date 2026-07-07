# CODEX_HANDOFF.md

## هدف فعلی

- جهت محصول: Mini-SOAR فارسی‌محور با کاتالوگ دستور backend-first و اجرای کنترل‌شده.
- کار فعال: Task 15.0؛ پایدارسازی حافظه پروژه، handoff و اسکریپت‌های snapshot/check بدون تغییر رفتار اجرا.

## تغییرات انجام‌شده

- اسناد حافظه با وضعیت واقعی کاتالوگ، Daily Check، telemetry و مسیر اجرا همگام شدند.
- snapshot قابل بازتولید و کنترل یکپارچگی حافظه اضافه/تقویت شد.
- ساختار ثابت این فایل و ترتیب مطالعه سریع مستند شد.

## فایل‌های مهم

- `AGENTS.md`: قواعد ثابت پروژه و رفتار محافظت‌شده.
- `docs/CURRENT_STATUS.md`: وضعیت جاری، شکاف‌ها و پیشنهاد کار بعدی.
- `docs/ARCHITECTURE_MAP.md`: نقشه جریان‌ها و اجزای اصلی.
- `backend/src/commands/catalog/`: کاتالوگ فارسی و اعتبارسنجی آن.
- `backend/src/commands/execution/`: templateهای ثبت‌شده اجرای واقعی.
- `backend/src/daily-check/` و `backend/src/telemetry/`: Daily Check و Finding Engine چندفروشنده‌ای.

## کارهای باقی‌مانده

- فوری: ثبت commit همین task.
- نزدیک: اصلاح mojibake باقی‌مانده در رشته‌های فارسی source با task مستقل و تست UI/API.
- بعداً: اتصال collector/parser و connector واقعی برای vendorهای غیر Linux/MikroTik؛ تکمیل verification و rollback.

## دستوراتی که اجرا شده

- `git branch --show-current`
- `git status --short`
- `git log -8 --pretty=format:"%h|%ad|%s" --date=short`
- بازرسی فایل‌ها با `Get-Content` و `rg`
- `powershell -ExecutionPolicy Bypass -File scripts/project-snapshot.ps1`
- `powershell -ExecutionPolicy Bypass -File scripts/check-project-memory.ps1`
- `cd backend; npm run build; npm test` (موفق، 109/109)
- `pnpm build` (موفق، با هشدار موجود اندازه chunk)

## نکته‌های مهم

- در lab unrestricted، action پشتیبانی‌شده بعد از یک تأیید کاربر اجرا می‌شود.
- هرگز بدون `connectorInvoked=true` وضعیت `succeeded` ثبت نشود؛ preview نتیجه اجرا نیست و موفقیت جعلی ممنوع است.
- Linux و MikroTik در حال حاضر قوی‌ترین اهداف اجرای واقعی هستند؛ vendorهای دیگر تا آماده‌شدن connector ممکن است `manualOnly` یا `planned` باشند.
- مسیر فارسی‌محور باید از Catalog/AI به ActionPlan، preview، تأیید، PolicyGuard، Connector و Audit/Result برسد.
- حالت‌های `quick_controlled` و `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true` محافظت‌شده‌اند. هیچ secret یا credential در اسناد ثبت نشود.
