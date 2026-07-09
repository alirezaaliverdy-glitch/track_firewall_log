# Current Project Status

Last updated: 2026-07-09

## Task 17.2C Guided VPN Build-Plan Preview

- Completed FortiGate VPN guided sessions now build a useful preview-only ActionPlan instead of returning 409 when execution templates are incomplete.
- Preview-only VPN plans are persisted with `executionSupport=planned_or_partial`, `implementationState=partial`, `executable=false`, `source=guided_action_wizard`, missing template names, Persian structured preview, safe CLI outline, verification plan, and rollback plan.
- Action Center disables execution for preview-only guided plans and shows `این اکشن هنوز اجرای واقعی کامل ندارد.` while keeping preview/debug/verification data visible.
- Raw PSK/password values are not persisted in the plan preview; manual PSK input is represented only as `[secret]`.
- FortiGate VPN execution remains partial/planned until full Phase1/Phase2/route/policy templates and verification parser are verified. Protected quick-controlled execution behavior is unchanged.
- Validation passed: Prisma generation, local enum migration apply, backend build, backend tests 140/140, and frontend `pnpm build` with existing Vite warnings.

## Task 17.2B Guided Wizard First for Multi-Step Requests

- Multi-step creation requests now always route to `guided_workflow` before generic/manual fallback, including when no device is selected in the main chat.
- Missing selected device is handled inside the wizard. `/api/action-sessions/start` can create a pending session, and the first step is `device_selection` (`انتخاب دستگاه`); after selection, the backend resolves vendor/connector context from the DB.
- Bottom chatbot and Command Catalog AI fallback start an ActionSession and open `/guided-actions/:sessionId`; they do not create normal ActionPlans, `custom_vendor_action`, `generic_security_action`, or `unsupported_vendor` for guided workflows.
- ActionPlans are still created only after wizard completion and build-preview, then execution remains Action Center confirmation -> PolicyGuard -> connector -> audit/result.
- Validation passed: backend build, backend tests 139/139, and frontend `pnpm build` with the existing chunk-size warning.

## Task 17.2A Guided Workflow Routing Fix

- Multi-step operational requests are now guarded before generic AI/manual fallback. VPN, VDOM, Zone, Policy/Rule, VIP/NAT/Port Forward, Interface/VLAN, and Route creation phrases route to `guided_workflow` when a matching vendor blueprint exists.
- Selected device context is now sent from Command Search Ask AI and bottom chatbot, and the backend resolves `selectedDeviceId` against the DB before trusting UI vendor hints. FortiGate selected devices resolve to `fortigate`/`fortigate-ssh`; MikroTik resolves to `mikrotik`; Linux resolves to `linux`.
- If a guided request has no selected device, the resolver returns `clarification` with `اول دستگاه مقصد را انتخاب کن.` and creates no `vendor=unknown`, `custom_vendor_action`, or `unsupported_vendor` ActionPlan.
- Bottom chatbot guided requests now show the Persian multi-step message and `شروع ساخت مرحله‌ای`; clicking it starts an ActionSession and opens `/guided-actions/:sessionId`.
- Current guided workflow availability: FortiGate Policy/Zone/Route/VLAN/Object/Service are executable where existing compiler templates support them; FortiGate VPN and VDOM are partial/planned and do not build executable plans; MikroTik/Linux guided placeholders open the wizard but remain planned.
- Validation passed: catalog validation, backend build, backend tests 139/139, and frontend `pnpm build` with the existing large chunk warning.

## Task 17.1 FortiGate Full Control Engine

- FortiGate is no longer read-only in the command catalog. Full-control registry coverage now includes interfaces/VLANs, zones, address/service objects, policies, VIP/IP pools, routing/DNS/NTP, VPN, admin access, VDOM, HA, and SD-WAN.
- Every implemented FortiGate action is registered as connector-backed through `fortigate-ssh`; implemented actions no longer intentionally fall through to `manual_or_not_implemented` or `generic_security_action` when a template exists.
- Write flows keep the controlled Mini-SOAR path: structured ActionPlan, config snapshot/preflight, CLI preview/diff metadata, user confirmation, PolicyGuard, real connector execution, verification commands, audit, and rollback reference.
- Persian Command Search Ask AI and bottom chatbot continue to share `resolveAiTemplate`; key operational phrases now map to real FortiGate ActionPlans including interface status, allowaccess changes, zone creation, policy creation with missing-field prompts, and VPN status.
- Raw secrets remain blocked. VPN PSK handling requires `pskSecretRef`; plaintext PSK/API token/password/certificate material must not be emitted to UI/model logs.
- Validation passed: Prisma generation, command catalog validation (136 items), backend build, backend tests (125/125), local enum migration apply, and frontend `pnpm build` with the existing large-chunk warning.

## Task 17.2 Global Guided Action System

- Added a global Guided Action Blueprint system and ActionSession API. Multi-step requests now return `guided_workflow` instead of being forced into broken single-template missing-field plans.
- FortiGate guided workflow registry now covers policy creation, address object creation, service object creation, VIP/port forward, static route, IPsec VPN, SSL VPN, VLAN interface creation, and policy enable/disable/move.
- Executable FortiGate guided workflows are limited to compiler-backed templates. VPN/SSL VPN and incomplete multi-step variants remain partial/planned and do not fake ActionPlan success.
- The port-status bug is fixed: `وضعیت پورت هامو نشون بده` on Linux maps to `linux_list_open_ports`; on FortiGate maps to `fortigate_show_interfaces` and never invents `srcInterface`.
- Command Catalog Ask AI now returns the new modes: `executable_action_plan`, `needs_input`, `guided_workflow`, `clarification`, and `manual_or_not_supported`.
- Frontend Command Catalog opens a Persian guided action wizard for `guided_workflow` and hands built plans back to Action Center.
- Validation passed: command catalog validation, backend build, backend tests (133/133), frontend `pnpm build`.

## Task 17.0 FortiGate Read-only Intelligence

- FortiGate has real connector-backed read-only plans for system status, interfaces, routing/DNS, admin access, firewall policy/NAT/VIP, VPN, and HA/VDOM/zone.
- Daily Check returns eight concise Persian sections from the same normalized parsers used by individual ActionResults.
- Severity is evidence-based: unknown data is `not_checked`, unsupported CLI is `not_supported`, standalone HA is not critical, and invalid VM lab licensing is normally `needs_review`.
- Persian Ask AI/chat interface requests resolve to `fortigate_show_interfaces` with `fortigate-ssh` and a registered template.
- Protected quick-controlled lab execution and the `connectorInvoked=true` success requirement are unchanged.

Branch: `product-persian-command-catalog`

Product mode: `PRODUCT_MODE=persian_command_catalog`

## Product State

The project now behaves as a Persian-first Network & Security Command Center with the controlled path:

`AI/Catalog -> ActionPlan -> Preview -> User Confirm -> Connector -> Audit/Result`

Task 16 is functionally complete for:

- AI resolver / AI assistant contract / honest catalog AI fallback
- vendor-aware Daily Check foundations and Persian UI
- Linux Service Health templates, connector coverage, and UI
- result navigation in a new tab with popup-block fallback
- structured Action Result formatting for key Linux and MikroTik actions

Task 16.2 is complete for Command Catalog AI fallback: no-result `Ask AI` requests now use the central AI template resolver first and create executable ActionPlans when a registered template exists.

Task 16.3 is complete for deterministic Persian intent routing across AI chat and Command Search AI fallback. Simple Persian admin requests now map to executable template-backed ActionPlans before generic AI/manual fallback.

## What Works

- AI-supported Persian requests that map to registered templates create executable ActionPlans instead of vague manual proposals.
- Command Catalog AI fallback maps Persian Linux port-status phrases such as `وضعیت پورت های رو میخوام ببینم` to `linux_list_open_ports` with `executionTemplateRef=linux_list_open_ports` and `connectorType=linux-ssh`.
- Persian deterministic intent routing maps `وضعیت پورت های باز رو نشون بده` to executable `linux_list_open_ports` with empty params, `executionTemplateRef=linux_list_open_ports`, `connectorType=linux-ssh`, and metadata source `ai_mapped_template`.
- Linux mapped requests for firewall status, service status, sudo users, block IP, and open port now validate only the resolved template params. Open-port listing no longer requires `sourceIp`, `ipAddress`, or `port`.
- MikroTik mapped requests for management services, login logs, and block IP now use executable alias action types backed by registered RouterOS templates.
- Command Catalog AI fallback now returns honest modes: `executable_action_plan`, `needs_input`, `guided_workflow`, `clarification`, and `manual_or_not_supported`.
- Daily Check now uses vendor-aware profiles across Linux, MikroTik, FortiGate, Cisco, pfSense, Juniper, Palo Alto, Windows, Docker, and Kubernetes.
- Linux and MikroTik Daily Check remain the real connector-backed execution paths.
- Linux Service Health is available for running services, failed services, important services, and targeted service status checks.
- Action execution results open in a new tab from Action Center, with a visible fallback link if the browser blocks popups.
- Action Result view now shows Persian summary, execution status, device/vendor, duration, structured output, next actions, and collapsed raw output.
- Execution safety remains strict: `intent=execute`, resolved template, real connector invocation, persisted stdout/stderr/exitCode/duration, and no success without `connectorInvoked=true`.

## Partial or Open

- Older mojibake strings still exist in unrelated legacy UI/backend areas and need a dedicated encoding cleanup task.
- Daily Check for non-Linux/MikroTik vendors is honest manual-only today; it is not real execution yet.
- Frontend build still emits the existing large-chunk warning; this is not introduced by Task 16.
- The local database needed the Task 16 enum migration SQL executed for validation; other environments must also apply it before using the new Linux service-health actions.

## Known Bugs and Risks

- If another environment does not apply `20260707160000_task16_linux_service_health`, creating plans for new Linux service-health actions will fail at the database enum layer.
- Several legacy screens still mix older English text with Persian-first UI conventions.
- Success semantics must stay evidence-based; preview-only states must never be shown as successful execution.
- `command_search_ai_fallback` metadata is now treated as controlled catalog metadata only when it is implemented, connector-backed, and has a registered execution template.
- `ai_mapped_template` metadata is controlled only when it is implemented, connector-backed, has a registered execution template, and still passes PolicyGuard/connector checks.

## Vendor Status

| Vendor | implemented | manualOnly | planned | connector status | daily check status |
|---|---|---|---|---|---|
| Linux | Yes | Some catalog items | No | `linux-ssh` real connector | Real execution |
| MikroTik | Yes | Some catalog items | Some | `mikrotik-ssh` real connector | Real execution |
| FortiGate | Full-control catalog and read/write templates | Some legacy/manual review items | Some | `fortigate-ssh` interactive SSH connector | Real execution |
| Cisco | No | Yes | Some | connector not ready | Manual checklist |
| pfSense | No | Yes | Some | connector not ready | Manual checklist |
| Juniper | No | Yes | Some | connector not ready | Manual checklist |
| Palo Alto | No | Yes | Some | connector not ready | Manual checklist |
| Windows | No | Yes | Some | connector not ready | Manual checklist |
| Docker | No | Yes | Some | connector not ready | Manual checklist |
| Kubernetes | No | Yes | Some | connector not ready | Manual checklist |

## Next Recommended Task

1. Run a focused UTF-8/mojibake cleanup pass without touching execution policy.
2. Apply the Task 16 enum migration to every shared/local environment that uses the project database.
3. If product scope continues, deepen Linux/MikroTik result UX and start real connector work for the next vendor.

## Validation

- `cd backend && npm run prisma:generate`
- `cd backend && npm run validate:command-catalog`
- `cd backend && npm run build`
- `cd backend && npm test`
- `cd backend && npx prisma db execute --file prisma/migrations/20260707183000_task16_3_persian_intent_aliases/migration.sql`
- `cd backend && npx prisma db execute --file prisma/migrations/20260707160000_task16_linux_service_health/migration.sql`
- `cd backend && npx prisma db execute --file prisma/migrations/20260709120000_task17_1_fortigate_full_control/migration.sql`
- `pnpm build` or equivalent root build command when pnpm is unavailable

Validation status: passed. Frontend build still shows the existing Vite chunk-size warning only.

## FortiGate SSH Read-only Discovery and Daily Check (2026-07-08)

- `fortigate-ssh` now uses an interactive FortiOS shell, recognizes prompts, and advances `--More--` pagination automatically.
- Discovery collects and parses version, serial, hostname, operation mode, system time, license, CPU/memory/sessions, interfaces/IPs, default route, DNS, and administrators.
- `fortigate_daily_check` is a registered read-only ActionPlan template using eight approved commands and six Persian result sections.
- Success continues to require a real connector call with `connectorInvoked=true`.
- Persian operational intent routing now covers interface/management ports, route/DNS, license/FortiGuard, admin users, and Daily Check through the same central resolver used by chat and AI propose.
- Supported FortiGate results are structured and Persian-first. `License Invalid` is a lab warning (`needs_review`), unknown parsing is `not_checked`, and command unavailability is `not_supported`.

## Protected Behavior

Keep:

- `ACTION_EXECUTION_MODE=quick_controlled`
- `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`

In this lab mode, one user confirmation is enough for supported Linux/MikroTik templates, but selected device, validated parameters, registered template/connector, explicit `intent=execute`, real connector invocation, audit logs, and real execution results remain mandatory.

## Task 16.3 Runtime Validation Follow-up

- The local no-result Command Catalog flow for `وضعیت پورت های باز رو نشون بده` now creates and executes a real connector-backed `linux_list_open_ports` ActionPlan without stale `sourceIp` validation.
- Verified route-level flow: search count 0 -> AI fallback `mode=executable_action_plan` -> `actionType=linux_list_open_ports` -> `executionTemplateRef=linux_list_open_ports` -> `executionSupport=connector` -> `connectorType=linux-ssh` -> validation passed -> quick execution succeeded with `connectorInvoked=true` and visible `ss/netstat` output.
- Action Center execute buttons now show the exact Persian label `تایید و اجرا`.
- Top-level ActionPlan control metadata such as `source=ai_mapped_template` must not be canonicalized into network fields such as `sourceIp`.
- Additional validation: `cd backend && npm run build`; `cd backend && npm run validate:command-catalog`; `cd backend && npm test` passed with 119/119 tests; root `npm run build` passed with the existing Vite large-chunk warning. `pnpm` is not available on PATH in this shell.
