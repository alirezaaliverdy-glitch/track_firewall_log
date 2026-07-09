# CODEX_HANDOFF.md

## Task 17.2C - Guided VPN Build-Plan Preview Instead of 409 (2026-07-09)

- Fixed `/api/action-sessions/:id/build-plan` for completed FortiGate VPN wizard sessions: partial/planned VPN no longer returns a dead-end 409 after required fields are collected.
- `fortigate_guided_vpn_setup` now creates a persisted preview-only ActionPlan with `vendor=fortigate`, `connectorType=fortigate-ssh`, `source=guided_action_wizard`, `implementationState=partial`, `executionSupport=planned_or_partial`, `executable=false`, missing template names, Persian structured summary, safe CLI outline, verification plan, and rollback plan.
- Added Prisma enum values `fortigate_guided_vpn_setup` and `fortigate_guided_workflow_preview`. Prisma enum names cannot contain dots, so the requested dotted identity is stored in metadata as `actionType=fortigate.guided_vpn_setup` while the DB action type is `fortigate_guided_vpn_setup`.
- Added backend execution guards and Action Center UI gating so preview-only guided plans show `این اکشن هنوز اجرای واقعی کامل ندارد.` and never expose confirm/execute; direct execute attempts are blocked before connector invocation.
- FortiGate VPN remains preview-only because the existing compiler does not yet verify the full Phase1/Phase2/route/policy multi-step CLI sequence. No fake execution or success was added, and PSK/password values are masked/excluded from persisted preview/audit payloads.
- Updated the Guided Action Wizard success state: executable plans show `پیش‌نمایش اکشن ساخته شد.`; preview-only plans show `پیش‌نمایش ساختار اکشن ساخته شد، اما اجرای واقعی این سناریو هنوز کامل نشده است.` with a `مشاهده پیش‌نمایش` path.
- Validation passed: `npm run prisma:generate`, local enum migration apply, backend `npm run build`, backend `npm test` (140/140), and root `pnpm build` with the existing chunk-size/dynamic-import warnings.

## Task 17.2B - Guided Wizard for Multi-Step Requests Without Device (2026-07-09)

- Changed the central resolver path so clear multi-step creation requests return `mode=guided_workflow` before generic/manual fallback even when no device is selected.
- `/api/commands/ai-propose` no longer returns the chat-only "select device first" dead-end for guided requests; it returns a guided blueprint, `deviceId=null`, `vendor=null` when unresolved, and creates no ActionPlan.
- `/api/action-sessions/start` now supports pending sessions with no device. The wizard first exposes `device_selection` (`انتخاب دستگاه`), then resolves the selected device from the DB and switches to the matching vendor blueprint.
- Bottom chatbot and Command Catalog AI fallback start an ActionSession and navigate to `/guided-actions/:sessionId`; normal ActionPlans are still created only after wizard completion and preview build.
- Preserved protected execution behavior: no raw AI command execution, no fake success, no connector success without `connectorInvoked=true`, and no changes to quick-controlled lab mode.
- Validation passed: backend `npm run build`, backend `npm test` (139/139), and root `pnpm build` with the existing large-chunk warning.

## Task 17.2A - Guided Workflow Routing for Multi-Step Requests (2026-07-09)

- Fixed guided workflow routing so clear multi-step requests such as `برام vpn بساز`, `برام vdom بساز`, and `zone بساز` return `mode=guided_workflow` before generic/custom AI fallback can create an ActionPlan.
- `/api/commands/ai-propose` now resolves `selectedDeviceId` from the DB and uses the real device vendor/connector context; FortiGate resolves to `vendor=fortigate` and `connectorType=fortigate-ssh`, not `unknown`.
- Missing selected device for guided intents returns Persian clarification `اول دستگاه مقصد را انتخاب کن.` and creates no `custom_vendor_action`, `generic_security_action`, or `unsupported_vendor` plan.
- Bottom chatbot now sends selected device context to the same resolver, displays `این درخواست چندمرحله‌ای است. برای ادامه باید چند مقدار را وارد کنید.`, shows `شروع ساخت مرحله‌ای`, starts an ActionSession, and opens `/guided-actions/:sessionId`.
- Added requested blueprint IDs and routing coverage: FortiGate VPN/VDOM/Zone plus existing Policy/VIP/Route/VLAN; MikroTik/Linux planned guided placeholders open the wizard without fake execution.
- FortiGate VPN wizard now uses `fortigate_guided_vpn_setup` with `vpnType` as a fixed select in step `نوع VPN`; VDOM is planned/high-risk, Zone is implemented via the existing FortiGate create-zone template.
- Preserved protected lab behavior: no raw AI execution, no fake success, no connector success without `connectorInvoked=true`, and no changes to `ACTION_EXECUTION_MODE=quick_controlled` or `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`.
- Validation passed: `npm run validate:command-catalog`, backend `npm run build`, backend `npm test` (139/139), and root `pnpm build` with the existing large-chunk warning. Playwright MCP was not available in this session.

## Task 17.2 - Global Guided Action System + FortiGate Workflow Registry (2026-07-09)

- Added backend-owned guided action infrastructure under `backend/src/guided-actions/`: global blueprint types, validators, registry, in-memory ActionSession service, and `/api/action-sessions/*` routes.
- Added FortiGate guided blueprints for firewall policy creation, address object creation, service object creation, VIP/port forward, static route, IPsec VPN, SSL VPN, VLAN interface creation, and policy enable/disable/move.
- Fixed the regression for `وضعیت پورت هامو نشون بده`: Linux maps to `linux_list_open_ports`; FortiGate maps to `fortigate_show_interfaces` with no invented `srcInterface`/`srcintf`; vendorless ambiguous port requests return a Persian clarification.
- Resolver modes now include `guided_workflow`, `clarification`, and `manual_or_not_supported` while preserving executable ActionPlan creation for complete registered templates.
- Frontend Command Catalog AI fallback opens a Persian `ساخت مرحله‌ای اکشن` wizard for guided workflows and still sends execution to Action Center only after plan build/confirmation.
- Official Fortinet docs checked for `config firewall address`; remaining FortiGate enums are sourced from existing project templates or marked partial/planned.
- Validation passed: `npm run validate:command-catalog`, `npm run build`, `npm test` (133/133), and root `pnpm build` with the existing Vite large-chunk warning.

## Task 17.1 - FortiGate Full Control Engine (2026-07-09)

- FortiGate now has a full-control action registry in `backend/src/fortigate/full-control-registry.ts` with the requested metadata fields: action type, Persian title, category/risk, read/create/update/delete/enable/disable templates, params, prechecks, preview diff, verification commands, rollback template, parser, and UI hints.
- The registry feeds command catalog items and execution template registration, expanding the FortiGate catalog to CRUD/read/update/delete/enable/disable coverage for interfaces/VLANs, zones, objects/services, firewall policies, VIP/IP pools, routing/DNS/NTP, VPN, admin access, VDOM, HA, and SD-WAN.
- `fortigate-ssh` remains the only execution path. FortiGate actions still require selected device, structured params, preview/confirmation, PolicyGuard, connector invocation, audit, and real output; success remains tied to `connectorInvoked=true`.
- Persian resolver coverage now maps acceptance examples such as `وضعیت پورت های فایروال رو نشون بده`, `روی port1 فقط ping ssh فعال کن`, `یه zone به اسم DMZ بساز`, `policy جدید برای lan به dmz بساز`, and `وضعیت vpn هامو نشون بده` to registered FortiGate ActionPlans rather than generic text.
- Secrets remain protected: raw PSK/plain secrets are rejected for VPN creation/update; secret-sensitive flows require `pskSecretRef` and never expose PSK/API tokens/passwords in UI/model logs.
- Migration `20260709120000_task17_1_fortigate_full_control` adds the new FortiGate ActionType/AiIntentType enum values and was applied locally.
- Validation passed: `npm run prisma:generate`, `npm run validate:command-catalog` (136 items), `npm run build`, `npm test` (125/125), and root `pnpm build` with the existing Vite large-chunk warning.

## Task 17.0 - FortiGate Management Foundation (2026-07-08)

- Seven fixed read-only FortiGate action families now cover system, interfaces, routing/DNS, admin access, policies/NAT/VIP, VPN, and HA/VDOM/zone; Daily Check executes the combined approved command set through `fortigate-ssh`.
- `backend/src/fortigate/readonly-result-parser.ts` is the shared evidence parser. Every supported result exposes Persian `summary`, evidence with CLI source, findings, tables, and `rawOutputRef=true`; secrets are redacted and never copied into normalized admin output.
- Daily Check has eight evidence-based sections. Missing VPN evidence is `not_checked`, standalone HA is informational/safe, and invalid lab VM licensing is `needs_review` unless an actual blocked capability is proven.
- Command Search and chat continue to share the central resolver. Persian interface phrases map to implemented `fortigate_show_interfaces`, never generic/manual fallback.
- Result UI renders evidence, findings, recommended actions and structured tables; raw CLI is collapsed.
- Migration `20260708183000_task17_fortigate_management_foundation` adds the six new ActionType/AiIntentType enum values and was applied locally.

## Task 17.1 - FortiGate Intent and Result UX (2026-07-08)

- Chat and `/api/commands/ai-propose` share `resolveAiTemplate`; Persian FortiGate interface/port, route/DNS, license/FortiGuard, admin-user, and Daily Check requests now resolve to registered `fortigate-ssh` templates.
- New actions are read-only: `fortigate_show_interfaces`, `fortigate_route_dns_check`, `fortigate_license_status`, and `fortigate_admin_users`.
- FortiGate result parsing returns status, Persian summary, evidence, recommendations, commands, raw output, and confidence. Unknown output is `not_checked`; unavailable commands are `not_supported`; lab `License Invalid` is `needs_review`.
- Result UX shows connector evidence and Daily Check status counts; raw CLI remains collapsed.
- Playwright MCP was requested but not exposed in this session, so browser acceptance was covered by resolver/compiler tests plus backend/frontend builds, not click automation.

## Task 17 - FortiGate SSH Read-only Discovery (2026-07-08)

- FortiGate now has a first-class `fortigate-ssh` execution template for `fortigate_daily_check`.
- The connector uses an interactive FortiOS shell with prompt detection and automatic `--More--` continuation.
- Discovery parses system identity/licensing/health, interfaces and management exposure, default route, DNS, and admin users.
- Daily Check v1 is real, read-only, connector-backed, and rendered as Persian structured sections; success still requires `connectorInvoked=true`.
- Migration: `20260708120000_fortigate_readonly_discovery` adds `fortigate_daily_check` to both Prisma enums.

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

## Task 16.3 Runtime Validation Follow-up

- The no-result Command Catalog query `وضعیت پورت های باز رو نشون بده` was tested against the local Linux device through the same backend routes the UI uses.
- Initial validation exposed a regression where top-level ActionPlan control metadata `source=ai_mapped_template` was re-normalized into `sourceIp`, blocking `linux_list_open_ports`.
- `PolicyGuard` now ignores control-source strings when canonicalizing source IPs, and product metadata now keeps execution `normalizedParams` as the resolver output instead of mixing metadata fields into params.
- Verified result: `actionType=linux_list_open_ports`, `executionTemplateRef=linux_list_open_ports`, `executionSupport=connector`, `connectorType=linux-ssh`, no missing params, quick execution after confirmation, `connectorInvoked=true`, and visible `ss/netstat` output.
- Action Center execute buttons now use the exact Persian label `تایید و اجرا`.
- Playwright MCP browser tools were not exposed in this session, so browser-click validation was approximated with route-level execution plus UI source/build verification.
