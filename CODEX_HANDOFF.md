# CODEX_HANDOFF.md

## هدف فعلی

- جهت محصول: Persian Network & Security Command Center با مسیر `AI/Catalog -> ActionPlan -> Preview -> User Confirm -> Connector -> Audit/Result`.
- کار فعال: Task 16 تا اینجا برای Daily Check چندوندوری، Linux Service Health، باز شدن نتیجه در تب جدید، و Action Result UX تکمیل شده است.

## تغییرات انجام‌شده

- Daily Check backend برای Linux و MikroTik با پروفایل‌های vendor-aware و خروجی ساختاریافته سخت‌گیرانه شد.
- UI فارسی Daily Check اضافه/بازنویسی شد و وضعیت `اجرای واقعی` / `چک‌لیست دستی` / `در حال توسعه` را صادقانه نشان می‌دهد.
- Linux Service Health با دستورات `running/failed/status/important services` به کاتالوگ، template registry، planner، connector و UI اضافه شد.
- Result UX طوری سخت‌گیرانه شد که بعد از اجرای موفق، نتیجه در تب جدید باز شود و در صورت popup block لینک fallback نشان داده شود.
- `ActionResultView` و formatterهای مرتبط برای Linux/MikroTik/Daily Check و Service Health بازنویسی شدند.
- backend build/test و frontend build پاس شدند؛ برای عبور تست‌های plan creation، migration enum جدید به دیتابیس محلی execute شد.

## فایل‌های مهم

- `AGENTS.md`: قواعد ثابت پروژه، lab mode، محدودیت‌های اجرای واقعی.
- `backend/src/daily-check/vendor-daily-check-profiles.ts`: منبع واحد پروفایل Daily Check برای همه vendorها.
- `backend/src/daily-check/daily-check-engine.ts`: ساخت خروجی نهایی Daily Check با `overallStatus`, `score`, `sections`, `rawOutputs`.
- `backend/src/commands/catalog/index.ts`: آیتم‌های جدید Linux Service Health و Daily Check.
- `backend/src/commands/execution/execution-template-registry.ts`: templateهای اجرایی Linux Service Health.
- `backend/src/connectors/vendors/linux-edge.planner.ts`: command planهای read-only لینوکس برای سرویس‌ها.
- `backend/src/connectors/linux-ssh.connector.ts`: اجرای واقعی templateهای لینوکسی و read-only commands.
- `src/components/daily-check/DailyCheckPanel.tsx`: پنل فارسی Daily Check.
- `src/components/services/LinuxServiceHealthPanel.tsx`: پنل سلامت سرویس‌های لینوکس.
- `src/components/actions/ActionCenterPanel.tsx`: اجرای ActionPlan و باز کردن نتیجه در تب جدید با fallback.
- `src/components/actions/ActionResultView.tsx`: نمایش ساختاریافته نتیجه اجرا.
- `src/features/actions/actionResultFormatter.ts`: formatterهای نتیجه برای اکشن‌های Linux/MikroTik.

## کارهای باقی‌مانده

- فوری:
  - پاک‌سازی mojibakeهای قدیمی در فایل‌هایی که خارج از محدوده مستقیم Task 16 مانده‌اند.
  - اگر محیط‌های دیگر از دیتابیس مشترک استفاده می‌کنند، migration Task 16 روی آن‌ها هم اعمال شود.
- نزدیک:
  - افزودن formatter و UX عمیق‌تر برای vendorهای غیر Linux/MikroTik وقتی connector واقعی آماده شد.
  - اضافه کردن نمایش مستقیم نتیجه Daily Check در tab جدید از داخل پنل Daily Check، اگر later execution entrypoint مستقل اضافه شود.
- بعداً:
  - connector واقعی برای FortiGate/Cisco/pfSense/Juniper/Palo Alto/Windows/Docker/Kubernetes.
  - کوچک‌سازی chunk فرانت‌اند و code-splitting.

## دستوراتی که اجرا شده

- `git status --short`
- `Get-Content AGENTS.md`
- `Get-Content CODEX_HANDOFF.md`
- `Get-Content docs/CURRENT_STATUS.md`
- `Get-Content docs/TASK_HISTORY.md`
- `rg -n "window.open|openActionResultInNewTab|ActionResultView|DailyCheckPanel|LinuxServiceHealthPanel|task16" -S backend src`
- `npm run prisma:generate` در `backend`
- `npm run validate:command-catalog` در `backend`
- `npm run build` در `backend`
- `npm test` در `backend`
- `pnpm build`
- `npx prisma db execute --file prisma/migrations/20260707160000_task16_linux_service_health/migration.sql` در `backend`

## نکته‌های مهم

- Supported actions execute after user confirmation in lab unrestricted mode.
- Never mark succeeded unless connectorInvoked=true.
- Linux and MikroTik are currently the strongest real execution targets.
- Other vendors may be manual/planned unless connectors are ready.
- Persian-first flow باید حفظ شود.
- `ACTION_EXECUTION_MODE=quick_controlled` و `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true` نباید تغییر کنند.
- هیچ secret، token، password یا `.env` value وارد کد، داک، یا خروجی نشود.

- Task 16.2: Command Search AI fallback now routes through `backend/src/ai/ai-template-resolver.ts` before any manual fallback. Persian port-status requests such as `وضعیت پورت های رو میخوام ببینم` on a Linux device create executable `linux_read_listening_ports` ActionPlans with `executionTemplateRef=linux_list_open_ports`, `connectorType=linux-ssh`, `executionSupport=connector`, and metadata source `command_search_ai_fallback`. No selected device returns `needs_input` with the Persian device-selection message. Backend build/tests and frontend build passed; frontend keeps the existing large-chunk warning.

- Task 16.3: Persian intent understanding is now deterministic before AI/manual fallback through `backend/src/ai/persian-intent-router.ts`, consumed by `ai-template-resolver`, `/api/commands/ai-propose`, and AI chat mapped-template creation. Linux phrases such as `وضعیت پورت های باز رو نشون بده` now create executable `linux_list_open_ports` ActionPlans with `executionTemplateRef=linux_list_open_ports`, `connectorType=linux-ssh`, `source=ai_mapped_template`, empty `normalizedParams`, and no `sourceIp`/`ipAddress`/`port` validation. Linux service status, firewall status, sudo users, block IP, open port, and MikroTik management services/login logs/block IP map to registered templates. Local enum migration `20260707183000_task16_3_persian_intent_aliases` was applied for validation. `npm run validate:command-catalog`, backend build, backend tests (119/119), and root frontend build passed; `pnpm` remains unavailable in this shell, and Corepack pnpm fails with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`.
