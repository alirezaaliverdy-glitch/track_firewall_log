# بسته پیاده‌سازی Workflowهای پروژه Firewall Automation Platform

این بسته بر اساس بررسی مستقیم Snapshot پروژه `track_firewall_log_review.zip` ساخته شده است. هدف آن اضافه‌کردن Workflowهای روان و یکپارچه، بدون ایجاد مسیرهای موازی، بدون دور زدن Backend، و بدون شکستن Connectorها و Action Center فعلی است.

## نتیجه بررسی پروژه

معماری فعلی پایه‌های مناسبی دارد:

- Frontend: React + Vite + TypeScript + React Router + i18next
- Backend: Fastify + Prisma + PostgreSQL + SSH2
- جریان اجرای امن فعلی:
  `Catalog/AI -> ActionPlan -> Review/Preview -> Confirm -> PolicyGuard -> Connector -> Audit/Result`
- ثبت دستگاه اکنون یک Wizard سه‌مرحله‌ای دارد و نباید از صفر بازنویسی شود.
- Backend ثبت دستگاه دارای Session state machine و مسیر ثبت Verified/Unverified است.
- Cisco دارای Registry مرکزی در `backend/src/cisco/cisco-operation-registry.ts` است؛ قابلیت‌های جدید باید فقط از همین Registry توسعه پیدا کنند.
- Dashboard دارای API واقعی `GET /api/dashboard/activity` است، اما Copy رابط هنوز عمدتاً انگلیسی و Hardcoded است.
- Action Center مسیر اصلی اجراست، اما `ActionCenterPanel.tsx` بسیار بزرگ و Debug-heavy است و باید تدریجی Refactor شود.
- بررسی‌های فعلی Locale parity و UTF-8 روی Snapshot پاس شدند.

## ترتیب امن اجرا

هر Phase باید جدا اجرا، تست و Commit شود. اجرای همه Phaseها در یک Commit ممنوع است.

1. `01_MASTER_RULES.md`
2. `02_CURRENT_PROJECT_MAP.md`
3. `03_PHASE_A_WORKFLOW_FOUNDATION.txt`
4. `04_PHASE_B_DEVICE_ONBOARDING_AND_WORKSPACE.txt`
5. `05_PHASE_C_ACTION_AND_SERVICE_WORKFLOWS.txt`
6. `06_PHASE_D_CISCO_CAPABILITY_WORKFLOWS.txt`
7. `07_PHASE_E_BULK_APPROVAL_HEALTH_DASHBOARD.txt`
8. `08_PHASE_F_INTENT_BASED_OPERATIONS.txt`
9. `09_WORKFLOW_LAB_AND_TESTS.txt`
10. `10_I18N_RTL_CONTRACT.md`
11. `11_ACCEPTANCE_MATRIX.md`
12. `12_COMMIT_AND_ROLLBACK_PLAN.md`

## روش پیشنهادی استفاده با Codex

کل پوشه را در ریشه پروژه قرار بده. سپس متن `13_START_PHASE_A.txt` را در Codex بفرست. بعد از گزارش و Commit موفق هر Phase، Prompt ادامه همان Phase بعدی را ارسال کن.

این روش کندتر از ریختن همه‌چیز در یک Prompt است، ولی احتمال اینکه پروژه به خرابه باستان‌شناسی تبدیل شود بسیار کمتر است.

## محدودیت تست این بررسی

در محیط تحلیل، Dependencyهای پروژه نصب نبودند و دسترسی Registry وجود نداشت؛ بنابراین Build کامل اجرا نشد. موارد زیر با موفقیت روی Snapshot اجرا شدند:

- Locale key parity: 97 کلید فارسی و 97 کلید انگلیسی
- Persian primary-route copy check
- UTF-8/mojibake scan: 393 فایل

Build و تست‌های TypeScript باید در محیط اصلی پروژه و توسط Codex طبق Acceptance Matrix اجرا شوند.
