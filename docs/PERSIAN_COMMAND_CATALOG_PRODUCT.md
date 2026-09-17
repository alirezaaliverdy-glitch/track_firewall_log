# محصول کاتالوگ دستورات فارسی

## جهت محصول

در `PRODUCT_MODE=persian_command_catalog` مسیر اصلی فارسی‌محور و backend-first است:

`Device -> Command Catalog -> validated ActionPlan -> Preview -> User Confirm -> PolicyGuard -> Connector -> Audit/Result`

برای عملیات چندمرحله‌ای:

`Persian intent -> Resolver -> GuidedActionBlueprint -> ActionSession -> ActionPlan preview -> Action Center confirmation -> Connector`

For the new asset/security platform milestone:

`Asset or integration source -> SecurityEvent -> detection rule -> Finding -> reviewed ActionPlan -> Action Center`

Findings may create reviewed ActionPlans, but they do not execute connectors, do not mark success, and do not bypass the existing catalog/guided Action Center boundary.

Task 17.2B rule: multi-step creation requests such as VPN, VDOM, Zone, Policy/Rule, VIP/NAT/Port Forward, Interface/VLAN/Subinterface, and Route/Gateway must return `guided_workflow` before generic AI/manual fallback. No selected device is not a chat error. The app starts an ActionSession anyway, opens `/guided-actions/:sessionId`, and the wizard's first step is `device_selection` (`انتخاب دستگاه`). Only after the wizard has all required fields and the user builds a preview may an ActionPlan be created. These requests must never become `custom_vendor_action`, `generic_security_action`, `unsupported_vendor`, or `manual_or_not_implemented` while a guided blueprint exists.

Task 17.2C rule: when the wizard has valid required fields but the executable backend template is not complete, build-plan must create a preview-only ActionPlan instead of returning a useless 409. For FortiGate VPN, the preview plan is non-executable (`executionSupport=planned_or_partial`, `executable=false`), includes Persian summary, safe CLI outline, missing templates, verification and rollback plans, and disables Action Center execution. Secrets such as PSK/password are masked and are not persisted as raw values.


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
- guided actions: `backend/src/guided-actions/`, `backend/src/routes/action-sessions.ts`
- template registry: `backend/src/commands/execution/execution-template-registry.ts`
- API: `backend/src/routes/command-catalog.ts`
- UI: `src/components/commands/CommandCatalogPanel.tsx`
- اجرا و نتیجه: `backend/src/services/action-plan.service.ts`, `src/components/actions/ActionResultView.tsx`

بعد از تغییر کاتالوگ، در `backend` دستور `npm run validate:command-catalog` اجرا شود. vendorهای غیر Linux/MikroTik تا زمان وجود connector و verification واقعی، manual/planned باقی می‌مانند.
# FortiGate Read-only Management Foundation (Task 17.0)

FortiGate operational intelligence follows the same catalog-first path as other implemented vendors. The supported read-only families are system status, interfaces, routing/DNS, admin access, policies/NAT/VIP, VPN, and HA/VDOM/zone. Each family compiles only fixed CLI commands and produces the shared structured contract: Persian summary, status, sourced evidence, findings, tables, and a reference to collapsed raw output.

The Daily Check combines those families into eight sections: سلامت سیستم، وضعیت لایسنس و FortiGuard، اینترفیس‌ها و دسترسی مدیریتی، مسیر و DNS، سیاست‌ها/NAT/VIP، شبکه خصوصی، افزونگی/VDOM/Zone، و امنیت مدیران. Missing evidence is not treated as a confirmed fault. Invalid licensing on a lab VM is `needs_review` unless device output proves that a required feature is blocked.

Both `/api/commands/ai-propose` and operational chat use the central AI template resolver. With a selected FortiGate device, Persian interface/port requests resolve to the implemented `fortigate_show_interfaces` action and `fortigate_show_interfaces` execution template on `fortigate-ssh`; raw AI CLI is never executable.

## FortiGate Full Control Engine (Task 17.1)

FortiGate is now a connector-backed management target, not a read-only vendor. The full-control registry is `backend/src/fortigate/full-control-registry.ts` and records action metadata: `actionType`, `titleFa`, `category`, `risk`, `readCommand`, create/update/delete/enable/disable templates, required params, prechecks, preview diff, execution template, verification commands, rollback template, parser, and UI hints.

Implemented FortiGate actions use the same controlled path:

`Persian intent -> FortiGate device -> ActionPlan -> config snapshot/preflight -> CLI preview/diff -> user confirmation -> PolicyGuard -> fortigate-ssh -> verification -> Persian result -> audit/rollback reference`

The registry covers interface/VLAN, zone, address/service objects, firewall policy, VIP/IP pool, routing/DNS/NTP, VPN, admin/access/security, VDOM, HA, and SD-WAN actions. Command Search Ask AI and the bottom chatbot both use the central resolver, so supported Persian requests produce executable FortiGate ActionPlans instead of generic prose or `generic_security_action`.

Secret handling remains strict. Plain PSK/API token/password/certificate material must never appear in params, prompts, logs, docs, or UI; VPN PSK flows require `secretRef`/`pskSecretRef`.

## Global Guided Actions (Task 17.2)

The resolver can now return `guided_workflow` for multi-step operational requests. The frontend opens `ساخت مرحله‌ای اکشن`, collects Persian-labeled fields, validates fixed dropdowns and IP/CIDR/port values, and calls `/api/action-sessions/:id/build-plan`. The session API builds only backend template-backed ActionPlans and never executes directly.

FortiGate workflows added:

- Policy creation, address object creation, service object creation, static route, and VLAN interface are executable when all required values are supplied.
- VIP/port forward is partial because optional policy creation remains a separate workflow.
- IPsec VPN, SSL VPN, and policy enable/disable/move are partial/planned until deeper CLI/template coverage is complete.

The port-status intent bug is fixed. With a selected FortiGate device, `وضعیت پورت هامو نشون بده` maps to `fortigate_show_interfaces` without `srcInterface`. With a selected Linux device it maps to the listening/open-port template. Without a vendor/device, the UI gets a Persian clarification between physical interfaces and TCP/UDP listening ports.
