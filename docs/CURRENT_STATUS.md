# Current Project Status

Last updated: 2026-07-12

## Task 17.8 - Linux Monitoring and Service Status Reliability

- Task 18.0 adds the first compact Security Platform milestone. The app now has `/assets` and `/security` views backed by asset inventory models, idempotent import/sync, seeded security detection, asset-linked findings, and finding-to-reviewed-ActionPlan handoff.
- Asset intelligence now covers sites, locations, roles, vendors, platforms, assets, interfaces, IPs, prefixes, VLANs, relationships, tags, import sources, and sync runs. Existing Devices, SecurityEvents, Findings, and ActionPlans can link to an Asset.
- Mock NetBox and Wazuh integrations are available for health, sync preview, and idempotent sync. They demonstrate the integration contract only; no live external credentials are used.
- Security findings remain proposal-first. Creating an ActionPlan from a Finding does not execute a connector, does not mark success, and does not bypass preview, confirmation, PolicyGuard, audit, or the `connectorInvoked=true` success rule.
- Task 18.0 validation passed: `npx prisma validate`; focused `task18-platform-milestone.test.ts` (5/5); backend `npm run build`; backend `npm run validate:command-catalog` (136 items); backend `npm test` (181/181); root `npm run test:i18n` (73 keys); root frontend build via `npx pnpm@10 build` with the existing Vite large-chunk warning. Local `pnpm` was not on PATH.

- Task 17.8C adds a read-only Linux Server Overview first screen. Device Monitoring now opens on Server Overview by default and summarizes real server state before showing live monitoring, findings, raw logs, or advanced telemetry.
- `/api/devices/:deviceId/telemetry/linux/overview` collects Linux state over the existing SSH connector: host identity, OS/kernel/uptime, CPU/load/core count, memory/swap, mounted disks, disk I/O hints, network interfaces, top processes, important services, listening ports, and recent auth/security warnings. Individual unavailable commands return warnings and partial data instead of failing the whole overview.
- The overview UI presents plain-language cards for Overall Health, CPU, Memory, Disk, Network, Important Services, Security Signals, and Recent Problems, with English/Persian labels and RTL-friendly layout. Advanced technical details remain outside the first screen.
- Task 17.8C parser follow-up: the Linux Server Overview parser now treats missing/undefined command stdout and absent optional sections as partial overview data with warnings instead of crashing. It also keeps Ubuntu/Debian/RHEL-like parsing working and fixes service-state normalization so `inactive` is not misread as `active`.
- Task 17.8C validation passed: focused Task 17.8 tests (18/18); backend `npm test` (176/176); backend `npm run build`; backend `npm run validate:command-catalog` (136 items); root frontend build via `npx pnpm@10 build` with the existing Vite large-chunk warning. Local `pnpm` was not on PATH, Corepack pnpm failed with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, and `npx pnpm@11.10.0` requires newer Node than local `v20.19.5`.
- Task 17.8B simplified the Device Telemetry page into a non-technical three-step flow: Connection, Live Monitoring, and Results. The main screen now shows connected state, device IP/SSH port, last checked time, monitoring status, event count, last event, simple storage usage, and finding cards with problem/impact/evidence/recommended fix.
- Raw event streams, source presets, advanced source selection, storage warnings, backend counters, confidence/parser details, and technical evidence are now behind Advanced diagnostics or Show technical evidence.
- Analyze now works without AI. The Linux telemetry analyze endpoint rebuilds findings from stored telemetry with the deterministic vendor finding engine, returns counts and `lastAnalyzedAt`, and exposes `aiSummary`, `aiAvailable`, and `aiError` without blocking local analysis. The UI no longer calls `/api/ai/chat` for telemetry Analyze and shows a small AI-unavailable note instead of a scary network error.
- Windows storage handling now retries EPERM/EBUSY rename failures with backoff, uses `<deviceId>.<timestamp>.<random>.jsonl.tmp` temp names, and falls back to safe append when a locked rename cannot complete so monitoring keeps running.
- Follow-up runtime fix: telemetry persistence is now Windows-safe. The store recreates `backend/storage/telemetry` recursively before every append/read/status path, serializes writes per device, and uses unique same-directory temp files before atomic rename so first writes and concurrent stream events do not race on a shared `.tmp` file.
- Storage errors are separated from security evidence. Backend logs keep storage failure details under `[linux-telemetry-storage]`, while live monitoring surfaces only a clean telemetry warning and continues generating findings from live events.
- Device Monitoring storage counters now read as `used ... of ...` for bytes and event count. Incoming stream events update live event count, last event time, and stored event count immediately, followed by a backend storage-status refresh.
- Device Monitoring now has bounded per-device event storage. Live Linux events are stored as structured JSONL with max bytes/count/age retention and default 10 MB per device; old events rotate instead of growing without limit.
- Live Linux sources now cover auth, system, kernel, firewall, nginx, apache, fail2ban, and docker. Stream status remains controlled with one active session per device, timeout, warnings, SSE, and stop handling that closes remote SSH stream handles.
- The Linux live parser classifies authentication failures, sudo failures, service failures/restart loops, nginx/apache errors, fail2ban events, firewall blocks, kernel pressure/errors, and Docker daemon errors. Findings stay deduplicated through the vendor finding engine instead of producing one card per line.
- `linux_check_service_status` now uses structured service detection and parsing. Inactive, failed, missing, and unknown services are successful read results when SSH execution succeeded; only SSH/template/validation failures fail the ActionPlan. Result UI shows normalized state, exit code, confidence, explanation, systemd fields, and raw evidence.
- Device Telemetry UI now exposes live event count, stream state, active sources, last event time, bounded storage bytes/count, source/severity filters, grouped findings/evidence, and suggested ActionPlan creation.
- External repo `hiddent3rminal/SSH-Automation-For-Multiple-Servers` was evaluated and rejected as a dependency. It is MIT Python/Paramiko with useful fan-out/retry/result-collection ideas, but has hardcoded sample passwords, insecure host-key auto-add, sudo password shell piping, unbounded logs, and incompatible architecture.
- Validation passed: focused Task 17.8/17.8B tests 14/14 with byte/count retention, Windows storage retry/fallback, deterministic analyze, and simplified UI source coverage; backend build; backend full tests 172/172; frontend build with the existing large-chunk warning.

## Task 17.7 - FortiGate Execution Verification Hardening

- FortiGate guided IPsec VPN now keeps selected AES/SHA2 proposals intact (`aes256-sha256` remains `set proposal aes256-sha256`) and rejects DES/3DES/MD5/SHA1 proposals by default.
- FortiGate connector success is no longer enough for guided VPN success. The connector scans stdout/stderr for FortiOS CLI errors and requires semantic verification of phase1, phase2, static route when enabled, both VPN firewall policies when enabled, NAT/logging expectations, and tunnel summary output.
- Mandatory VPN verification uses targeted `show vpn ipsec phase1-interface <phase1Name>`, `show vpn ipsec phase2-interface <phase2Name>`, `show firewall policy | grep -f <vpnName>`, `get router info routing-table all | grep <remoteSubnet>`, and `get vpn ipsec tunnel summary`. Version-sensitive debug is not mandatory.
- Action Result formatting now shows FortiGate post-execution verification checks when present.
- Action Library support states remain honest: FortiGate actions are executable only when the shared verified requirements are present; unsupported or incomplete write actions stay preview/manual/non-executable.
- Live lab checklist is documented in the handoff; cleanup remains explicit-confirmation-only.
- Validation passed: focused Task 17.7 tests; backend catalog validation (136 items); backend build; backend full tests (158/158); locale parity (73 keys); frontend build with the existing large-chunk warning.

## Task 17.6C - Standard Guided Parameter Flow

- Parameterized catalog actions now route through a standard guided ActionSession flow using generated `catalog:<commandId>` blueprints. This applies across FortiGate, MikroTik, Linux, and future catalog vendors.
- Action Library cards no longer collect required parameters inline. Parameterized actions open the guided flow and preserve selected action/vendor/device in URL state; non-parameterized actions can still create plans directly.
- The guided flow validates required fields before preview/build-plan and rejects exact placeholder/example values. Secret fields are masked, and internal UI control identifiers are not accepted as execution params.
- AI Assistant and Command Catalog AI fallback now route recognized actionable tasks with missing parameters into the same guided flow instead of stopping at text-only or raw `needs_input` responses.
- Verified actions still require validator/template/compiler, connector, PolicyGuard, semantic result support, confirmation, audit, and real connector invocation. Preview-only/manual-only parameterized actions can build review plans but cannot execute.
- Guided UI follows the active `fa`/`en` direction setting; locale parity is maintained.
- Playwright MCP browser tooling is not available in this session, so browser-level acceptance remains pending.
- Validation passed: backend build; focused guided/support/AI regression tests (33/33); backend catalog validation (136 items); backend full test suite (152/152); root i18n parity (73 keys); root `pnpm build` with the existing Vite large-chunk warning.

## Task 17.6 - Optional/Manual Backup Export

- Quick Controlled execution no longer creates mandatory automatic backup/export preflight commands for FortiGate or MikroTik actions.
- FortiGate execution no longer uses `show full-configuration`; guided IPsec VPN can execute after the normal single confirmation without backup/export preflight.
- Backup/export is now clearly optional/manual. PolicyGuard, validation, registered connector/template requirements, audit logging, and real connector-result success conditions remain required.
- Validation passed: focused regression tests, backend catalog validation (136 items), backend build/full test suite, and frontend production build. The frontend build retains only its existing Vite dynamic-import/chunk-size warnings.

## Task 17.5 Follow-up AI Assistant Action Routing

- AI Assistant actionable VPN chat requests now route into the controlled guided flow instead of stopping at a text suggestion.
- Persian and English VPN intents, including `build vpn`, `create vpn`, `setup fortigate vpn`, and Persian VPN creation phrases, resolve to `fortigate_guided_vpn_setup`.
- `/api/ai/chat` creates a proposed ActionSession for guided workflows and returns `actionSessionId`, `actionSession`, and `guidedActionUrl`; the frontend opens `/guided-actions/:sessionId` automatically.
- Missing required VPN parameters are collected in the Guided Action form before preview. Immediate build-plan attempts without required fields return validation errors and create no executable ActionPlan.
- Safety boundary remains unchanged: chat creates only proposed controlled sessions, never raw CLI, never connector invocation, and never execution without explicit user confirmation, PolicyGuard, and the normal Action Center path.
- Migrations: none.
- Validation passed: backend build; catalog validation (136 items); targeted guided/support tests (22/22); backend full tests (147/147); frontend build with existing Vite warnings.
- Known limitations: browser-level navigation tests still need browser tooling; additional action families can reuse this session-routing pattern as their guided UX is hardened.

## Task 17.5 FortiGate Guided VPN Execution Fix

- FortiGate IPsec Site-to-Site guided VPN is now the only executable VPN mode: `fortigate_guided_vpn_setup` with `vpnType=ipsec_site_to_site`, PSK auth, canonical validated params, `fortigate-ssh`, dry-run preview, PolicyGuard, connector invocation, audit/result, and verification commands.
- Fixed the blocker where `guided_action_wizard` provenance leaked into execution parameters and was treated as `srcInterface`. The canonical fields are now `wanInterface` and `lanInterface`; internal UI/action tokens are rejected as FortiGate interfaces.
- The guided VPN compiler emits controlled FortiOS CLI for phase1-interface, phase2-interface, optional static route, optional managed address objects, LAN-to-VPN and VPN-to-LAN policies, verification commands, and rollback metadata.
- UI VPN fields are examples/placeholders only and support any valid customer values. Discovered FortiGate interfaces are offered as suggestions when available; manual entry remains allowed and is validated before execution.
- If cached FortiGate interface discovery is missing at execution time, the backend performs safe read-only discovery through `fortigate-ssh` before final PolicyGuard and before any write command.
- PSK is handled with a process-local temporary `pskSecretRef`. Raw PSK is not persisted in ActionPlan JSON, dry-run output, frontend persisted state, audit, rollback metadata, or docs. Preview redacts `set psksecret` as `********`.
- Action Center validation repair now presents `wanInterface`/`lanInterface` instead of generic `srcInterface` for guided VPN failures.
- Still planned/preview-only: FortiGate SSL VPN, IPsec Remote Access, and any FortiGate catalog/guided VPN action that lacks schema/template/connector/parser/precheck/post-verification.
- Migrations: none.
- Validation passed: backend build; catalog validation (136 items); targeted guided/support tests (21/21); backend full tests (146/146); fa/en key parity (72 keys); frontend build with existing Vite warnings.
- Known limitations: temporary PSK refs are process-local and expire; SSL VPN/remote-access execution still needs real templates/parsers; legacy i18n/mojibake cleanup remains a separate task.

## Task 17.3 Safe Vendor Action Library + Global i18n

- Added a catalog support-state contract: `verified`, `preview_only`, `manual_only`, `unsupported`. `implemented` is now implementation progress only, not execution permission.
- Verified execution requires all six requirements: validated input schema, registered compiler/template, compatible connector/planner, semantic result parser, precheck, and post-verification. Missing any requirement downgrades the item to `preview_only` or `manual_only`.
- Backend execution and dry-run preview generation reject non-verified catalog/guided ActionPlans. The primary rejection code is `CATALOG_COMMAND_NOT_VERIFIED` with stable `messageKey` metadata for frontend translation.
- Quick Controlled still removes only extra approval friction. It does not bypass support state, authorization, validation, device/vendor compatibility, environment restrictions, PolicyGuard, audit, or connector invocation.
- `/action-library` is the prepared-action surface. The dashboard no longer renders the full prepared-command catalog; it shows compact operational shortcuts/status instead.
- The Action Library is vendor-first: FortiGate, MikroTik, Linux, Cisco, pfSense, Generic. It includes device/search/category/risk/support-state/read-only/verified-only filters, device vendor override, compact cards, single-card expansion for params, and no raw CLI rendering.
- Added global i18n foundation using `i18next`/`react-i18next`, `src/i18n/locales/fa/common.json`, `src/i18n/locales/en/common.json`, localStorage language persistence, and `<html lang>`/`dir` switching. `npm run test:i18n` checks fa/en key parity.
- Actor identity for action routes now comes from authenticated request context (`request.authUser`) instead of request body.
- FortiGate VPN wizard remains preview-only. FortiGate write/full-control catalog entries without complete semantic parser/precheck/post-verification are downgraded to `preview_only`.
- Current verified actions: Linux catalog actions, MikroTik daily/check/block/backup actions, and FortiGate read-only/parser-backed actions (`daily-check`, interface/status/routing/license/admin/policy/VPN/HA-VDOM-zone show paths, plus verified show interfaces/firewall policies).
- Current preview-only actions: FortiGate full-control/write or unfinished action library entries including VLAN/interface changes, zones, address/service objects, policies, VIP/IPPool, routing/DNS/NTP changes, IPsec/SSL VPN changes, admins, VDOM, HA, and SD-WAN entries.
- Current manual-only actions: Linux restrict SSH/fail2ban review, MikroTik restrict management, Cisco/pfSense daily/manual reviews, FortiGate manual review items, and Generic security review. `mikrotik.change-ssh-port` remains `unsupported`.
- Migrations: none.
- Validation passed: `npm run validate:command-catalog`, backend `npm run build`, backend `npm test` (145/145), root `npm run test:i18n`, root `pnpm build` with existing Vite warnings.
- Known remaining work: finish migrating all legacy panel text to locale keys, add browser-level RTL/LTR and route tests when Playwright is available, and promote preview-only vendor actions only after the verified requirements are implemented.

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

## Task 17.3B Current Status (2026-07-11)

Product state: `/action-library` is now the prepared vendor-action surface; `/` remains a compact operational dashboard. The global header has Dashboard / Action Library navigation and a persisted language selector (`fa` RTL, `en` LTR).

Execution truth:

- Only `supportState=verified` can execute. `implemented` by itself is not enough.
- Verified requires validated params, registered compiler/template, compatible connector, semantic parser/result contract, precheck, and post-verification.
- Backend execution rejects non-verified catalog/guided plans even if an old client calls the API directly.
- Actor identity remains request-context driven; request bodies are not trusted for actor role/identity.

FortiGate VPN:

- Executable now: FortiGate IPsec Site-to-Site via guided action `fortigate_guided_vpn_setup` with `fortigate-ssh`.
- Required executable fields: tunnel name, WAN interface, LAN interface, remote gateway, local subnets, remote subnets, PSK secret reference, proposal, and optional policy/static-route/NAT/logging/enable-after-create flags.
- Compiler emits controlled FortiOS blocks for phase1-interface, phase2-interface, optional static routes, optional address objects, optional firewall policies in both directions, verification commands, and rollback metadata.
- PSK handling uses an in-memory temporary `pskSecretRef` with a 30-minute TTL. Raw PSK is not persisted in ActionPlan JSON, dry-run output, frontend state, audit logs, or docs. Preview redacts `set psksecret`.
- Still planned/preview-only: FortiGate SSL VPN and IPsec Remote Access. They are not executable until templates and verification parsers are implemented.

Known limitations:

- Temporary PSK refs are process-local and expire; rebuilding the ActionPlan is required after restart/expiry.
- Some legacy UI panels still have older hardcoded/mojibake strings and need a dedicated cleanup beyond this task.
- Frontend build still emits the existing Vite dynamic-import/chunk-size warnings.

Validation status:

- `cd backend && npm run build`: passed.
- `cd backend && npm run validate:command-catalog`: passed, 136 items.
- `cd backend && npx tsx --test test/task17-2-guided-actions.test.ts test/task17-3-support-state-i18n.test.ts`: passed, 20/20.
- `cd backend && npm test`: passed, 145/145.
- `npm run test:i18n`: passed, 72 keys.
- `pnpm build`: passed with existing Vite warnings.

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

## Task 18.1 Milestone A - Platform IA and App Shell

- The app now has a route registry and grouped shell for the Security Platform IA. `/dashboard`, `/assets`, `/assets/devices`, `/assets/devices/:assetId`, `/assets/sync`, `/security`, `/security/findings`, `/security/findings/:findingId`, `/security/rules`, `/monitoring`, `/actions`, `/assistant`, `/integrations`, and `/settings` are routable surfaces.
- Future pages are shown with planned badges instead of fake functionality.
- Asset and Security platform views are split into feature folders with hooks/components/pages. The old combined panel remains in the tree for compatibility but is no longer the main route surface.
- Design tokens were added for later Figma implementation without changing execution policy.
- MCP browser inspection before changes was limited by the auth gate; unauthenticated routes showed the login screen and expected 401 `/api/auth/me` errors.
