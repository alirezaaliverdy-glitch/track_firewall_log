# بسته Task 20.1A

این بسته باید قبل از Task موشن اجرا شود.

هدف:

1. رفع واقعی قطع اتصال PostgreSQL/Prisma
2. بازگشت ورود سامانه
3. تکمیل ثبت واقعی Cisco
4. ذخیره Device
5. نمایش پیام موفقیت متحرک
6. انتقال خودکار به صفحه اختصاصی دستگاه
7. اثبات همه مراحل با Playwright MCP

## فایل‌ها

- `TASK_20_1A_DB_AUTH_CISCO_ONBOARDING_REPAIR.md`
- `CODEX_START_PROMPT.txt`
- `TASK_20_1A_ACCEPTANCE_MATRIX.md`
- `QUICK_RUNBOOK.md`

## اجرا

فایل‌ها را در ریشه پروژه کنار `AGENTS.md` قرار بده.

بعد محتوای `CODEX_START_PROMPT.txt` را به Codex بده.

موفقیت با HTTP 200 یا ذخیره پاسخ‌های فرم تعریف نشده است. معیار واقعی، اتصال پایدار دیتابیس، ورود موفق، `connectorInvoked=true`، Device ID و بازشدن Workspace است. بشر بالاخره باید از یک کد وضعیت عبور کند و نتیجه واقعی ببیند.
