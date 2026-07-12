# CODEX_HANDOFF.md

## Task 18.0 - Security Platform Minimum Tangible Milestone (2026-07-12)

- Implemented the first tangible platform-expansion milestone from `MASTER_SECURITY_PLATFORM_TASK.md` without starting the full roadmap at once.
- Added asset intelligence persistence in Prisma: asset sites, locations, roles, vendors, platforms, assets, interfaces, IP addresses, prefixes, VLANs, relationships, tags, sources, and sync runs. Existing `Device`, `Finding`, `SecurityEvent`, and `ActionPlan` records can now link to an asset.
- Added `backend/src/assets/asset-intelligence.service.ts` for asset import preview/apply, idempotent sync, device-to-asset linking, topology lookup, security event ingestion, seeded rule detection, finding listing, and finding-to-reviewed-ActionPlan handoff.
- Added mock NetBox and Wazuh adapters plus APIs for health, sync preview, and idempotent sync. These are local/mock integrations only; no external credentials are stored or required.
- Added compact platform routes: `/api/assets`, `/api/assets/:id`, `/api/assets/:id/topology`, `/api/assets/import/preview`, `/api/assets/import/apply`, `/api/assets/sync/devices`, `/api/security/events`, `/api/security/findings`, `/api/security/rules`, and detection/finding action endpoints.
- Added compact frontend views at `/assets` and `/security` through `SecurityPlatformPanel`, with grouped inventory, sync, findings, and rule sections. The UI remains proposal/review oriented and does not execute connectors from detections.
- Added platform docs: `PLATFORM_EXPANSION_ROADMAP`, `ASSET_INTELLIGENCE`, `DETECTION_ENGINE`, `SECURITY_FINDINGS`, `CASE_MANAGEMENT`, `MONITORING_ARCHITECTURE`, `SEARCH_AND_CORRELATION`, `TOPOLOGY_AND_IMPACT`, `AI_WORKFLOW_ORCHESTRATION`, `INTEGRATIONS_ARCHITECTURE`, and `UX_INFORMATION_ARCHITECTURE`.
- Safety boundary preserved: finding-created ActionPlans are reviewed proposals only. Preview is not execution, and success still requires the existing Action Center confirmation, PolicyGuard, connector invocation, audit/result, and `connectorInvoked=true`.
- Migration added: `backend/prisma/migrations/20260712180000_platform_asset_security_milestone`.
- Validation passed: `npx prisma validate`; focused `npx tsx --test test/task18-platform-milestone.test.ts` (5/5); backend `npm run build`; backend `npm run validate:command-catalog` (136 items); backend `npm test` (181/181); root `npm run test:i18n` (73 keys); root frontend build via `npx pnpm@10 build` with the existing Vite large-chunk warning. Local `pnpm` was not on PATH, so the pinned `npx pnpm@10` fallback was used.

## Task 17.8C - Linux Server Overview First Screen (2026-07-12)

- Added a read-only Linux overview API at `/api/devices/:deviceId/telemetry/linux/overview`. It runs through the existing SSH connector and collects host identity, OS/kernel/uptime, CPU load/core data, memory/swap, mounted disk usage, disk I/O hints, network interfaces, top processes, important service states, listening ports, and recent auth/security warnings.
- Overview collection is partial-failure tolerant. Missing commands add warnings and unavailable sections instead of failing the whole response; SSH/device credential failures remain clean endpoint failures. The parser now also handles missing/undefined stdout and missing overview sections without calling string helpers on undefined.
- Added structured overview parsing in `backend/src/telemetry/linux/linux-telemetry.service.ts` for Ubuntu/Debian/RHEL-like command output, including health summaries, service state normalization, security signals, and recent-problem extraction.
- Device Monitoring now opens on a `Server Overview` tab by default before live logs/findings. The first screen shows plain-language cards for Overall Health, CPU, Memory, Disk, Network, Important Services, Security Signals, and Recent Problems, with English/Persian labels and RTL-compatible layout.
- Live Monitoring and Results remain available as secondary tabs. Raw logs, source filters, storage internals, backend counters, event IDs, and technical evidence stay in Advanced diagnostics or technical evidence details. Analyze remains deterministic-first and does not depend on `/api/ai/chat`; AI unavailability is shown as a small non-blocking note.
- Added focused regression coverage for the Linux overview parser, missing command output, partial command failure behavior, service-status state coverage, overview endpoint wiring, default Server Overview tab, Persian/English label presence, and AI-unavailable Analyze copy.
- Migrations: none.
- Validation passed: focused Task 17.8 tests (18/18); backend `npm test` (176/176); backend `npm run build`; backend `npm run validate:command-catalog` (136 items); root frontend build via `npx pnpm@10 build` with the existing Vite large-chunk warning. Local `pnpm` was not on PATH, Corepack pnpm failed with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, and `npx pnpm@11.10.0` requires newer Node than the local `v20.19.5`.

## Task 17.8B - Simplified Device Telemetry UX, Deterministic Analyze, and Windows EPERM Storage Fix (2026-07-12)

- Reworked Device Telemetry into a simple three-step flow for non-technical users: `Connection`, `Live Monitoring`, and `Results`. The main page now explains connected state, device IP/SSH port, monitoring status, log collection, analysis results, and recommended next steps in plain English/Persian.
- Moved raw event stream, source presets, advanced source selection, storage warnings, backend counters, detected SSH service details, and raw technical evidence behind an `Advanced diagnostics` section. Finding cards now show problem, why it matters, short evidence, count, recommended fix, and `Create ActionPlan`; raw evidence is hidden behind `Show technical evidence`.
- `Analyze` no longer calls `/api/ai/chat` from the telemetry UI. It first calls the deterministic Linux telemetry analyze endpoint and continues to work when AI is unavailable. The UI shows `AI explanation is unavailable. Local analysis is still available.` as a small non-blocking message and maps network failures to `Backend is not reachable. Check API server.`
- Extended `/api/devices/:deviceId/telemetry/linux/analyze` to rebuild findings from stored JSONL telemetry using the vendor finding engine, return finding counts and `lastAnalyzedAt`, and include explicit `aiSummary`, `aiAvailable`, and `aiError` fields without blocking local analysis on AI.
- Hardened Windows telemetry writes again: temp files now use `<deviceId>.<timestamp>.<random>.jsonl.tmp`, rename has EPERM/EBUSY retry/backoff, and if Windows keeps the file locked the store safely appends the new event and removes the temp file so monitoring continues without losing the current event.
- Added focused regressions for deterministic analyze without AI, stored-event finding generation, Windows EPERM retry, locked-rename append fallback, simplified UI flow, hidden technical evidence, Advanced diagnostics, backend-unreachable copy, and Persian/English label presence.
- Migrations: none.
- Validation passed: focused Task 17.8 tests (14/14); backend build; backend full test suite (172/172); root `pnpm build` with the existing Vite large-chunk warning.

## Task 17.8 Follow-up - Windows-Safe Telemetry Storage Runtime Fix (2026-07-12)

- Fixed the Windows telemetry persistence failure where concurrent live events could race on the shared `<deviceId>.jsonl.tmp` file and surface `ENOENT` during rename.
- `BoundedTelemetryStore` now ensures the telemetry directory exists recursively before append, read, status, and rotation operations. First writes for new devices create the target JSONL file safely.
- Atomic JSONL replacement now uses per-device serialized writes plus unique same-directory temp files before rename, which keeps Windows writes path-safe and avoids stale/missing tmp-file races.
- Storage write failures are logged separately on the backend with `[linux-telemetry-storage]`, while live monitoring receives a clean warning: `Telemetry storage is temporarily unavailable; live monitoring continues.` Raw `ENOENT`, paths, rename details, and stack text are not emitted as findings/evidence.
- Device Monitoring storage counters now display `used ... of ...` for bytes and event count. New stream events update live event count, last event time, and stored event count immediately, then refresh storage status from the backend.
- Added regressions for missing telemetry directory creation, first write for a new device, byte-limit rotation, Windows path-safe concurrent temp writes, and storage failure not breaking monitoring findings.
- Migrations: none.
- Validation passed: focused Task 17.8 tests (10/10); backend build; backend full test suite (168/168); root `pnpm build` with the existing Vite large-chunk warning.

## Task 17.8 - Production Linux Monitoring and Service Status Semantics (2026-07-12)

- Added a bounded file-backed telemetry store at `backend/src/telemetry/bounded-telemetry-store.ts`. It writes structured JSONL events per device with `id`, `deviceId`, vendor/type, source, timestamp, severity, category, raw/normalized message, parsed fields, and optional finding link. Retention is configurable with `TELEMETRY_MAX_BYTES_PER_DEVICE` (default 10 MB), `TELEMETRY_MAX_EVENTS_PER_DEVICE` (default 5000), `TELEMETRY_MAX_AGE_DAYS` (default 30), and `TELEMETRY_STORE_DIR` (default `./storage/telemetry`).
- Linux live monitoring now includes `apache` and `fail2ban` sources in addition to auth/system/kernel/firewall/nginx/docker, stores every normalized event through the bounded store, exposes `/api/devices/:deviceId/telemetry/linux/storage/status`, and keeps stream state timeout/stop handling through the existing SSH stream handles.
- Live parsing now recognizes SSH auth failures, sudo auth failures, service failure/restart-loop signals, nginx/apache 4xx/5xx, fail2ban events, firewall blocks, kernel OOM/segfaults, and Docker errors. Vendor finding aggregation remains deduplicated by stable fingerprints.
- Fixed `linux_check_service_status`: removed fragile `systemctl status <service> --no-pager || service <service> status`; added strict service-name validation `[a-zA-Z0-9_.@:-]+`, structured `systemctl show`, `is-active`, `is-enabled`, SysV fallback, and weak `pgrep` fallback parsing. Normalized states are `active`, `inactive`, `failed`, `not_found`, and `unknown`.
- Action execution semantics now distinguish SSH/template failure from successful read results. `inactive`, `failed`, `not_found`, and `unknown` service states are persisted as successful read executions when the connector ran and parsed evidence; `failed`/`unknown` carry warnings and parser confidence/evidence.
- Device Telemetry UI now shows stream state, live event count, active sources, last event time, stored log bytes/count versus configured limits, apache/fail2ban source filters, grouped active findings, evidence previews, and suggested ActionPlan creation. Service status results show normalized state, raw evidence, exit code, parser confidence, and explanation.
- External repo evaluation: cloned `https://github.com/hiddent3rminal/SSH-Automation-For-Multiple-Servers.git` to `C:\tmp\ssh-automation-eval`. It is MIT-licensed Python/Paramiko with thread-pool fan-out, ping precheck, retry/backoff, timestamped logs, and JSON result collection. It was not added as a dependency or copied because it hardcodes example passwords, uses `AutoAddPolicy` host-key trust, pipes sudo passwords into shell, stores logs without bounded retention, and does not fit this Node/Fastify/SSH-connector/ActionPlan architecture. Useful concepts retained only as architecture notes: bounded concurrency, per-host structured results, retry/backoff, and timeout handling.
- Linux action audit outcome for this task: service-status is parser-backed read-only; existing read-only Linux inventory actions remain verified through fixed connector templates; mutating Linux user/firewall actions remain controlled executable only where schema/template/connector/parser tests exist. Broader package/service coverage can be expanded as new verified templates are added.
- Migrations: none.
- Validation passed: focused Task 17.8 tests (7/7, including separate per-device byte-limit and count-limit retention tests); backend command catalog validation (136 items); backend build; backend full test suite (164/164); root i18n parity (73 keys); root `pnpm build` with the existing Vite large-chunk warning.

## Task 17.7 - FortiGate Execution Verification Hardening (2026-07-11)

- FortiGate guided IPsec site-to-site VPN now preserves approved AES/SHA2 proposals such as `aes256-sha256` in phase1 and phase2 CLI; weak DES/3DES/MD5/SHA1 proposals are rejected unless explicitly marked with `allowWeakProposal=true`.
- Mandatory VPN post-checks now use targeted FortiGate commands: `show vpn ipsec phase1-interface <phase1Name>`, `show vpn ipsec phase2-interface <phase2Name>`, `show firewall policy | grep -f <vpnName>`, `get router info routing-table all | grep <remoteSubnet>`, and `get vpn ipsec tunnel summary`. Fixed `diagnose vpn tunnel list name ...` is no longer mandatory.
- Added `backend/src/fortigate/execution-verifier.ts` to detect FortiOS stdout/stderr failures (`command parse error`, invalid value, object not found, duplicate/object validation, permission errors) even when SSH returns exit code 0.
- FortiGate SSH execution now requires semantic post-execution verification before returning success. Guided VPN verification proves phase1, phase2, route, LAN-to-VPN policy, VPN-to-LAN policy, NAT/logging expectations, and tunnel summary evidence; missing route/policy verification fails execution.
- Action results now carry and display FortiGate post-execution verification checks in the result formatter.
- FortiGate catalog support-state evaluation no longer has a hard-coded guided-VPN preview-only override; verified status is based on the shared schema/template/connector/parser/precheck/post-verification requirements.
- Added focused Task 17.7 regression tests for AES proposal preservation, weak proposal rejection, missing route/policy verification failure, FortiOS CLI error detection, and FortiGate catalog inventory honesty.
- Live FortiGate smoke checklist: create address object; create service object; create zone; create firewall policy; create static route; create VIP/port-forward; create IPsec VPN; run read-only checks; verify every item with FortiGate `show`/`get`; perform cleanup only after explicit operator confirmation.
- Migrations: none.
- Validation passed: focused Task 17.7 tests (6/6); backend catalog validation (136 items); backend build; backend full test suite (158/158); root i18n parity (73 keys); root `pnpm build` with the existing Vite large-chunk warning.

## Task 17.6C - Standard Guided Parameter Flow (2026-07-11)

- Added a generic catalog-backed guided blueprint path (`catalog:<commandId>`) so parameterized FortiGate, MikroTik, Linux, and future catalog actions use the same ActionSession wizard instead of raw inline preview cards.
- Action Library parameterized cards now show support state and open the guided flow with URL state (`guidedBlueprintId`, `catalogActionId`, vendor/device) via the CTA `Configure / Create ActionPlan`; card-level parameter inputs were removed.
- Guided validation now rejects missing, invalid, secret-sensitive, and exact-placeholder submitted values before preview/build-plan. UI-only/internal keys such as wizard source metadata are filtered out of execution params.
- AI command proposal and AI Assistant routes now send actionable missing-parameter catalog tasks into the same guided flow. Deterministic guided/chat routing skips the external AI provider for recognized guided intents.
- Execution support remains default-deny: verified parameterized actions build previewable ActionPlans and execute only after confirmation; manual/preview-only parameterized actions can build review plans but do not invoke connectors.
- Guided UI now follows the active i18n text direction instead of hard-coded RTL and masks fields marked as password/generated secret/secret.
- Playwright MCP was requested but is not exposed in this session; browser-level verification could not be run.
- Migrations: none.
- Validation passed: backend build; focused guided/support/AI regression tests (33/33); backend catalog validation (136 items); backend full test suite (152/152); root i18n parity (73 keys); root `pnpm build` with the existing Vite large-chunk warning.

## Task 17.6 - Disable Mandatory Action Backup Preflight (2026-07-11)

- Removed mandatory automatic backup/export preflight from every Quick Controlled FortiGate and MikroTik execution path. Backup/export remains an optional manual operator action.
- FortiGate Quick Controlled execution no longer injects or executes `show full-configuration`; only controlled action commands (and any action-specific lightweight preflight) are permitted.
- FortiGate guided IPsec site-to-site VPN now completes dry-run and confirmed connector execution without backup/export preflight. The regression test verifies no backup audit event, `backupEnabled=false`, and real connector invocation.
- PolicyGuard, selected-device checks, parameter validation, registered templates/connectors, explicit `intent=execute`, audit logging, and evidence-based success semantics remain unchanged.
- Migrations: none.
- Validation passed: backend focused Task 17.2/17.3/generic tests; `npm run validate:command-catalog` (136 items); backend `npm run build`; backend `npm test`; root `pnpm build` (existing Vite dynamic-import/chunk-size warnings only).

## Task 17.5 Follow-up - AI Assistant Action Routing (2026-07-11)

- Fixed AI Assistant action routing so actionable FortiGate VPN chat requests create a controlled guided ActionSession instead of returning only text.
- Persian and English VPN intents, including `build vpn`, `create vpn`, `setup fortigate vpn`, and Persian VPN creation phrases, now resolve to `fortigate_guided_vpn_setup`.
- `/api/ai/chat` now starts the backend ActionSession for guided workflows and returns `actionSessionId`, `actionSession`, and `guidedActionUrl`; it still does not create an ActionPlan or execute commands before wizard completion.
- The frontend assistant consumes the returned session and navigates directly to `/guided-actions/:sessionId`. Missing required fields stay in the guided form; preview/build-plan remains blocked until required parameters are provided.
- Safety boundary preserved: AI chat never emits executable raw CLI, never invokes connectors, and never bypasses Action Center confirmation, PolicyGuard, or connector execution rules.
- Fixed FortiGate guided resolver coverage so bare English `build vpn` maps to the VPN guided workflow instead of a generic text/manual response.
- Migrations: none.
- Changed files for this follow-up: `backend/src/services/ai-chat.service.ts`, `backend/src/guided-actions/vendors/fortigate/fortigate-blueprints.ts`, `backend/test/task17-2-guided-actions.test.ts`, `backend/test/task17-3-support-state-i18n.test.ts`, `src/components/ai/AiSecurityAssistantPanel.tsx`, `src/lib/ai.ts`, plus the required docs.
- Validation passed: backend `npm run build`; backend `npm run validate:command-catalog` (136 items); backend targeted `npx tsx --test test/task17-2-guided-actions.test.ts test/task17-3-support-state-i18n.test.ts` (22/22); backend `npm test` (147/147); root `pnpm build` with existing Vite dynamic-import/chunk-size warnings.
- Known remaining work: extend the same automatic chat-to-guided-session coverage to more non-VPN guided families where product UX needs direct routing, and add browser-level navigation assertions when browser tooling is available.

## Task 17.5 - FortiGate Guided VPN Execution Blocker Fix (2026-07-11)

- Fixed the broken FortiGate guided VPN execution path where `source=guided_action_wizard` could be normalized into `srcInterface` and then fail PolicyGuard as a FortiGate interface/zone.
- Added canonical backend schema/normalizer for `fortigate_guided_vpn_setup`: `vpnName`, `phase1Name`, `phase2Name`, `wanInterface`, `lanInterface`, `remoteGateway`, `localSubnet`, `remoteSubnet`, `pskSecretRef`, `proposal`, `dhGroup`, `ikeVersion`, `natTraversal`, `createFirewallPolicy`, `createStaticRoute`, plus optional comments/object/policy/route fields.
- Alias normalization is explicit: `srcInterface/internalInterface/lan` maps to `lanInterface`; `dstInterface/wan/gatewayInterface` maps to `wanInterface`; `gateway/peer/remotePeer` maps to `remoteGateway`. Internal control tokens such as `guided_action_wizard` are rejected as interface names.
- FortiGate IPsec Site-to-Site guided plans now compile controlled FortiOS CLI for phase1-interface, phase2-interface, optional static route, optional address objects, bidirectional firewall policies, verification commands, and rollback metadata. CIDR is converted to FortiGate address/mask format.
- PSK handling remains secret-safe: the wizard creates a temporary process-local `pskSecretRef`; raw PSK is not stored in ActionPlan JSON, dry-run output, audit metadata, docs, or frontend persisted state. Preview emits `set psksecret ********`; execution resolves the secret only inside `fortigate-ssh`.
- Execution path now refreshes FortiGate interface discovery with safe read-only connector calls before final PolicyGuard when cached discovery is missing. Missing/broken SSH connector setup fails clearly with `Cannot execute: FortiGate SSH connector is not configured for this device.`
- Guided VPN UI now collects real canonical values with placeholders only, supports discovered FortiGate interface suggestions while allowing manual interface entry, and no longer uses placeholders as submitted values.
- Action Center fix-field handling now includes `wanInterface` and `lanInterface` so validation repair prompts do not fall back to generic `srcInterface`.
- FortiGate SSL VPN and IPsec Remote Access remain preview-only/planned; they are not executable until real templates and semantic verification parsers exist.
- Broken prior diff replaced/kept only where useful: the preview-only Task 17.3B IPsec path was replaced by the canonical schema + compiler + connector execution path; unrelated Task 17.3B action-library/i18n/support-state work was preserved.
- Migrations: none.
- Changed files for this fix: `backend/src/services/fortigate-guided-vpn.schema.ts`, `backend/src/services/action-plan.service.ts`, `backend/src/services/policy-guard.service.ts`, `backend/src/services/fortigate-policy-guard.service.ts`, `backend/src/services/fortigate-command-compiler.ts`, `backend/src/guided-actions/vendors/fortigate/fortigate-blueprints.ts`, `backend/test/task17-2-guided-actions.test.ts`, `src/components/guided-actions/GuidedActionWizard.tsx`, `src/components/actions/ActionCenterPanel.tsx`, `src/lib/commandCatalog.ts`, plus the required docs.
- Validation passed: backend `npm run build`; backend `npm run validate:command-catalog` (136 items); backend targeted `npx tsx --test test/task17-2-guided-actions.test.ts test/task17-3-support-state-i18n.test.ts` (21/21); backend `npm test` (146/146); root `npm run test:i18n` (72 keys); root `pnpm build` with existing Vite dynamic-import/chunk-size warnings.
- Known remaining work: replace process-local PSK refs with vault-backed temporary secrets, add real SSL VPN/remote-access templates and parsers, and run browser click validation when browser tooling is available.

## Task 17.3 - Safe Vendor Action Library + Global i18n (2026-07-11)

- Added authoritative catalog support state: `verified | preview_only | manual_only | unsupported`. `implemented` no longer means executable. Verified execution now requires input validation metadata, registered execution template, compatible planner/connector, semantic result parser coverage, precheck, and post-verification.
- Backend execution is default-deny for non-verified catalog/guided plans. Direct `/api/actions/:id/execute` and `/quick-execute` reject non-verified plans with stable code `CATALOG_COMMAND_NOT_VERIFIED`; dry-run preview generation is also blocked for non-verified catalog plans so manual/preview-only actions never produce executable command previews.
- Quick Controlled behavior is preserved only for verified actions. It still requires selected device, validated params, registered template/connector, `intent=execute`, PolicyGuard, audit, and real connector invocation.
- `/action-library` now hosts the vendor-first prepared action library in order: FortiGate, MikroTik, Linux, Cisco, pfSense, Generic. The dashboard no longer renders the full prepared-command list and shows only a compact Action Library shortcut/status surface.
- Library cards show title, vendor, category, risk, support state, and short description by default. Required params render only for the expanded card. Raw CLI is not rendered in the library.
- Device selection overrides manual vendor filtering. Filters include device, search, category, risk, support state, read-only, and verified-only.
- Added `i18next`/`react-i18next` plumbing, `src/i18n/locales/{fa,en}/common.json`, top-header language selector, localStorage persistence, and `<html lang>`/`dir` switching (`fa` RTL, `en` LTR). Added `npm run test:i18n` for locale key parity.
- Backend catalog/API errors now include stable `code`/`messageKey` on new support-state rejection paths. AI-created ActionPlans carry selected support metadata and never store raw executable CLI; echoed user request text remains review-only context.
- Actor identity for action propose/approve/reject/quick-execute routes is now derived from `request.authUser`, not request body.
- FortiGate VPN wizard remains preview-only. FortiGate full-control write/unfinished entries are downgraded from executable to `preview_only`; FortiGate verified set is limited to read-only/parser-backed actions plus known verified show paths.
- Migrations: none.
- Changed files: `backend/src/commands/catalog/types.ts`, `backend/src/commands/catalog/support-state.ts`, `backend/src/commands/catalog/index.ts`, `backend/src/commands/catalog/command-catalog-validator.ts`, `backend/src/commands/catalog/catalog-action-resolver.ts`, `backend/src/ai/ai-template-resolver.ts`, `backend/src/routes/actions.ts`, `backend/src/routes/command-catalog.ts`, `backend/src/services/action-plan.service.ts`, `backend/test/task14-1b-catalog-execution-flow.test.ts`, `backend/test/task17-3-support-state-i18n.test.ts`, `backend/package.json`, `src/App.tsx`, `src/components/commands/CommandCatalogPanel.tsx`, `src/lib/actionApprovalState.ts`, `src/lib/commandCatalog.ts`, `src/main.tsx`, `src/i18n/**`, `scripts/check-locale-parity.mjs`, `package.json`, `pnpm-lock.yaml`.
- Validation passed: `npm run validate:command-catalog` (136 items), backend `npm run build`, root `npm run test:i18n` (56 keys), root `pnpm build` with existing dynamic-import/chunk-size warnings, backend `npm test` (145/145).
- Known remaining work: complete full frontend text migration for legacy panels beyond the new shell/library/i18n architecture; add browser-level Playwright coverage when tooling is available; promote FortiGate preview-only actions only after semantic parsers/prechecks/post-verification are proven.

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

## Task 17.3B - Safe Vendor Action Library, FortiGate IPsec Execution, Global i18n (2026-07-11)

- Replaced the broken preview-only FortiGate VPN attempt with a real `fortigate_guided_vpn_setup` execution path for IPsec Site-to-Site only.
- Executable FortiGate VPN requirements: `vpnType=ipsec_site_to_site`, PSK auth, tunnel name, WAN interface, LAN interface, remote gateway, local subnet list, remote subnet list, proposal, selected device, `fortigate-ssh`, registered template, compiler output, PolicyGuard, dry-run preview, audit/result path, and post-verification commands.
- Generated FortiOS CLI is compiled from structured parameters only: phase1-interface, phase2-interface selectors, optional static routes, optional managed address objects, optional local-to-remote and remote-to-local firewall policies, verification commands, and rollback metadata.
- PSK is not stored in ActionPlan JSON, dry-run output, frontend state, or audit logs. A temporary in-memory `pskSecretRef` is used for execution and expires after 30 minutes; rebuilding the ActionPlan is required after expiry.
- Dry-run/preview uses `set psksecret [REDACTED]`; execution resolves the temporary secret only inside `fortigate-ssh`. Backup preflight output is redacted in connector results/audit.
- SSL VPN and IPsec Remote Access remain planned/preview-only. They must not execute until real templates and semantic verification parsers exist.
- Support-state rules remain default-deny: only `verified` actions can execute; `implemented` alone is not executable. Missing schema/template/connector/parser/precheck/post-verification downgrades to `preview_only` or `manual_only`.
- Quick Controlled still removes extra confirmation only. It does not bypass support state, authorization, validation, device/vendor compatibility, environment restrictions, PolicyGuard, connector invocation, or audit/result requirements.
- Action Library is separate at `/action-library`; the dashboard now shows compact operational shortcuts instead of dumping the full prepared catalog. Header navigation exposes Dashboard and Action Library.
- Global i18n uses `i18next`/`react-i18next`, persists locale in localStorage, and applies `<html lang>` plus `dir` (`fa` RTL, `en` LTR). Added key parity validation.
- Changed files: `backend/src/services/fortigate-command-compiler.ts`, `backend/src/services/ephemeral-secret.service.ts`, `backend/src/connectors/fortigate-ssh.connector.ts`, `backend/src/actions/fortigate-action-catalog.ts`, `backend/src/services/fortigate-policy-guard.service.ts`, `backend/src/guided-actions/vendors/fortigate/fortigate-blueprints.ts`, `backend/src/commands/execution/execution-template-registry.ts`, `backend/src/commands/catalog/*`, `backend/src/routes/actions.ts`, `backend/src/routes/command-catalog.ts`, `backend/src/services/action-plan.service.ts`, `backend/src/ai/ai-template-resolver.ts`, `backend/test/task17-2-guided-actions.test.ts`, `backend/test/task17-3-support-state-i18n.test.ts`, `src/App.tsx`, `src/components/commands/CommandCatalogPanel.tsx`, `src/components/actions/ActionCenterPanel.tsx`, `src/lib/actionApprovalState.ts`, `src/lib/commandCatalog.ts`, `src/main.tsx`, `src/i18n/**`, `scripts/check-locale-parity.mjs`, `package.json`, `pnpm-lock.yaml`, `backend/package.json`.
- Migrations: none added for Task 17.3B.
- Actions downgraded/still non-executable: FortiGate SSL VPN setup, IPsec Remote Access, VDOM guided create, legacy FortiGate VPN catalog items without complete verified execution requirements, Cisco, pfSense, and Generic prepared actions without real connectors.
- Validation passed: backend `npm run build`; backend `npm run validate:command-catalog` (136 items); backend targeted `npx tsx --test test/task17-2-guided-actions.test.ts test/task17-3-support-state-i18n.test.ts` (20/20); backend `npm test` (145/145); root `npm run test:i18n` (72 keys); root `pnpm build` with existing Vite dynamic-import/chunk-size warnings.
- Known remaining work: persistent vault-backed PSK storage, real SSL VPN and remote-access templates/parsers, deeper i18n cleanup for legacy panels that still contain older hardcoded/mojibake text, and browser click validation when browser tooling is available.

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
