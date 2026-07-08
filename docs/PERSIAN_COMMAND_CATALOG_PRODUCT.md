# محصول کاتالوگ دستورات فارسی

## جهت محصول

در `PRODUCT_MODE=persian_command_catalog` مسیر اصلی فارسی‌محور و backend-first است:

`Device -> Command Catalog -> validated ActionPlan -> Preview -> User Confirm -> PolicyGuard -> Connector -> Audit/Result`

کاتالوگ نقطه شروع عملیات است و AI فقط وقتی دستور مناسب پیدا نشود، draft یا ActionPlan پیشنهادی می‌سازد. هیچ endpoint کاتالوگ یا AI نباید خودکار اجرا کند یا متن خام shell تولیدشده توسط AI را اجرا کند.

## قرارداد وضعیت

- `implemented`: planner، template و connector ثبت‌شده دارد و با پارامترهای کامل می‌تواند ActionPlan اجرایی بسازد.
- `manualOnly`: فقط plan بازبینی غیرقابل‌اجرا می‌سازد.
- `planned` و `unsupported`: ActionPlan نمی‌سازند و اجرایی نمایش داده نمی‌شوند.

وضعیت فعلی کاتالوگ: 51 آیتم؛ 22 مورد `implemented` شامل 15 Linux و 7 MikroTik (با احتساب Daily Check)، 28 مورد `manualOnly` و یک مورد `planned` برای MikroTik.

## مرز اجرا

- metadata کاتالوگ باید source، ID/version، action type دقیق، template/connector، implementation state، execution support، پارامترهای نرمال و کامل‌بودن آن‌ها را نگه دارد.
- preview هرگز نتیجه اجرا نیست و تا پیش از connector واقعی، `metadata.executed=false` می‌ماند.
- درخواست تأیید باید `intent=execute` بفرستد. fingerprint تازگی preview فقط از ورودی‌های پایدار اجرا ساخته می‌شود.
- فقط پس از اجرای موفق connector، ثبت output/exit code/executor/timestamps و `connectorInvoked=true` می‌توان plan را `succeeded` کرد.
- نتیجه موفق در `/actions/:id/result` نمایش داده می‌شود. preview-only باید خطا باشد، نه موفقیت.

## حالت آزمایشگاه محافظت‌شده

در ترکیب `ACTION_EXECUTION_MODE=quick_controlled` و `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`، برای template پشتیبانی‌شده و ثبت‌شده Linux/MikroTik یک تأیید کاربر کافی است. device، پارامتر معتبر، template/connector، PolicyGuard، `intent=execute`، invocation واقعی، audit و نتیجه واقعی همچنان الزامی‌اند.

## فایل‌های اصلی

- قرارداد و داده: `backend/src/commands/catalog/types.ts`, `backend/src/commands/catalog/index.ts`
- validation/resolution: `command-catalog-validator.ts`, `catalog-action-resolver.ts`
- template registry: `backend/src/commands/execution/execution-template-registry.ts`
- API: `backend/src/routes/command-catalog.ts`
- UI: `src/components/commands/CommandCatalogPanel.tsx`
- اجرا و نتیجه: `backend/src/services/action-plan.service.ts`, `src/components/actions/ActionResultView.tsx`

بعد از تغییر کاتالوگ، در `backend` دستور `npm run validate:command-catalog` اجرا شود. vendorهای غیر Linux/MikroTik تا زمان وجود connector و verification واقعی، manual/planned باقی می‌مانند.
# FortiGate Read-only Management Foundation (Task 17.0)

FortiGate operational intelligence follows the same catalog-first path as other implemented vendors. The supported read-only families are system status, interfaces, routing/DNS, admin access, policies/NAT/VIP, VPN, and HA/VDOM/zone. Each family compiles only fixed CLI commands and produces the shared structured contract: Persian summary, status, sourced evidence, findings, tables, and a reference to collapsed raw output.

The Daily Check combines those families into eight sections: سلامت سیستم، وضعیت لایسنس و FortiGuard، اینترفیس‌ها و دسترسی مدیریتی، مسیر و DNS، سیاست‌ها/NAT/VIP، شبکه خصوصی، افزونگی/VDOM/Zone، و امنیت مدیران. Missing evidence is not treated as a confirmed fault. Invalid licensing on a lab VM is `needs_review` unless device output proves that a required feature is blocked.

Both `/api/commands/ai-propose` and operational chat use the central AI template resolver. With a selected FortiGate device, Persian interface/port requests resolve to the implemented `fortigate_show_interfaces` action and `fortigate_show_interfaces` execution template on `fortigate-ssh`; raw AI CLI is never executable.
