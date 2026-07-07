# CODEX_HANDOFF.md

## هدف فعلی

- جهت محصول: Persian Network & Security Command Center با مسیر `AI/Catalog -> ActionPlan -> Preview -> User Confirm -> Connector -> Audit/Result`.
- کار فعال: ادامه Task 16 با تمرکز روی resolver مرکزی AI، چت AI، و fallback کاتالوگ بدون تغییر رفتار اجرای lab.

## تغییرات انجام‌شده

- resolver مرکزی `backend/src/ai/ai-template-resolver.ts` اضافه و برای Linux/MikroTik/Daily Check/Fallback سخت‌گیرانه شد.
- `POST /api/commands/ai-propose` روی modeهای واقعی `executable_action_plan` / `needs_input` / `manual_proposal` تثبیت شد.
- پاسخ `POST /api/ai/chat` ساختاریافته شد و خطای provider با پیام فارسی شفاف برمی‌گردد.
- UI کاتالوگ و کلاینت AI با قرارداد جدید sync شدند تا ActionPlan قابل اجرا را به مرکز عملیات بفرستند و نیازمندی ورودی را صادقانه نشان دهند.
- تست جدید resolver/fallback اضافه شد و build/test فعلی سبز است.

## فایل‌های مهم

- `AGENTS.md`: قواعد ثابت پروژه، lab mode، رفتارهای محافظت‌شده.
- `backend/src/ai/ai-template-resolver.ts`: منبع واحد نگاشت درخواست AI به template/catalog.
- `backend/src/routes/ai.ts`: routeهای وضعیت provider، context و chat.
- `backend/src/routes/command-catalog.ts`: fallback هوش مصنوعی کاتالوگ و ساخت ActionPlan.
- `backend/src/services/ai-chat.service.ts`: جریان end-to-end چت AI تا ActionPlan پیشنهادی.
- `src/lib/ai.ts`: قرارداد کلاینت AI و normalize پاسخ ساختاریافته.
- `src/lib/commandCatalog.ts`: modeهای fallback کاتالوگ در فرانت.
- `src/components/commands/CommandCatalogPanel.tsx`: handoff درست به Action Center.

## کارهای باقی‌مانده

- فوری: تکمیل باقی Task 16 در Daily Check UI، Service Health و result UX سراسری.
- نزدیک: پاکسازی mojibake رشته‌های قدیمی و یکدست‌سازی Persian-first UI.
- بعداً: افزودن connector واقعی برای vendorهای غیر Linux/MikroTik و گسترش formatter/result UX.

## دستوراتی که اجرا شده

- `git status --short`
- `git diff -- backend/src/routes/ai.ts backend/src/routes/command-catalog.ts backend/src/services/ai-chat.service.ts src/components/ai/AiSecurityAssistantPanel.tsx src/lib/ai.ts backend/src/ai/ai-template-resolver.ts`
- `rg -n "ai-propose|assistantMessageRecord|connectorInvoked|window.open|ActionResultView|DailyCheckPanel|LinuxServiceHealthPanel|linux_list_running_services|linux_list_failed_services|linux_check_important_services" -S backend src`
- `npm run build` در `backend`
- `npm test` در `backend`
- `npx tsx --test test/task16-ai-resolver-and-fallback.test.ts` در `backend`
- `pnpm build`

## نکته‌های مهم

- Supported actions after user confirmation در lab unrestricted mode باید قابل اجرا بمانند.
- هرگز بدون `connectorInvoked=true` وضعیت `succeeded` ثبت نشود.
- Linux و MikroTik در حال حاضر قوی‌ترین هدف‌های اجرای واقعی هستند.
- سایر vendorها تا آماده‌شدن connector باید صادقانه `manualOnly` یا `planned` بمانند.
- Persian-first flow حفظ شود.
- هیچ secret، token، password یا `.env` value وارد مستندات یا خروجی نشود.
- `ACTION_EXECUTION_MODE=quick_controlled` و `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true` نباید تغییر کنند.
