# Task History

Entries are chronological and compact. Validation reflects what was known at the end of each task.

## Task 18.0 - Security Platform Minimum Tangible Milestone (2026-07-12)

- Summary: implemented the first usable asset/security platform slice instead of attempting the full master roadmap at once.
- Backend: added asset intelligence models, import preview/apply, idempotent sync runs, device-to-asset linking, topology lookup, seeded detection rules, SecurityEvent ingestion, Finding correlation, and Finding-to-reviewed-ActionPlan handoff.
- Integrations: added mock NetBox and Wazuh adapters for health checks, sync preview, and idempotent sync without external credentials.
- Frontend: added compact grouped `/assets` and `/security` views plus header navigation entries.
- Docs: added platform expansion, asset intelligence, detection, findings, case-management, monitoring, search/correlation, topology/impact, AI orchestration, integrations, and UX information architecture docs.
- Safety: Finding-created ActionPlans are proposals only. No raw AI shell execution, no connector invocation from detections, no fake success, and no change to protected quick-controlled execution behavior.
- Migration: `20260712180000_platform_asset_security_milestone`.
- Validation: `npx prisma validate`; focused `task18-platform-milestone.test.ts` passed 5/5; backend `npm run build`; backend `npm run validate:command-catalog` (136 items); backend `npm test` passed 181/181; root `npm run test:i18n` passed 73 keys; root `npx pnpm@10 build` passed with the existing Vite large-chunk warning. Local `pnpm` was not on PATH.

## Task 17.8C - Linux Server Overview First Screen (2026-07-12)

- Summary: added a plain-language Server Overview as the default Device Monitoring screen so non-technical users see server health before logs/findings/advanced telemetry.
- Backend: added `/api/devices/:deviceId/telemetry/linux/overview` through the existing SSH connector. The read-only overview command collects host/OS/kernel/uptime, CPU/load/core count, memory/swap, disk usage, disk I/O hints, network interfaces, top processes, important service states, listening ports, and recent auth/security warnings.
- Parsing: added Ubuntu/Debian/RHEL-like overview parsing with partial command failure warnings, health summaries, service state normalization, security signals, and recent problem extraction. Missing optional commands do not fail the whole overview. Follow-up hardening makes missing/undefined stdout and missing sections return partial data with warnings instead of crashing.
- Frontend: `LinuxTelemetryPanel` now defaults to a Server Overview tab with cards for Overall Health, CPU, Memory, Disk, Network, Important Services, Security Signals, and Recent Problems. Live Monitoring and Results remain secondary tabs, and raw logs/storage internals/event IDs stay under Advanced diagnostics.
- UX: new labels are present in English and Persian; the existing deterministic Analyze behavior remains AI-optional and shows only a small AI-unavailable message.
- Tests: added focused source/parser coverage for the overview endpoint, missing command output, partial command failure handling, active/inactive/not_found service status parsing, default Server Overview tab, English/Persian labels, and AI-unavailable Analyze copy.
- Migrations: none.
- Validation: focused Task 17.8 tests (18/18); backend `npm test` (176/176); backend `npm run build`; backend `npm run validate:command-catalog` (136 items); root frontend build via `npx pnpm@10 build` passed with the existing Vite large-chunk warning. Local `pnpm` was unavailable, Corepack pnpm failed with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, and `npx pnpm@11.10.0` requires newer Node than local `v20.19.5`.

## Task 17.8B - Simplify Device Telemetry UX and Fix Analyze/Windows Storage (2026-07-12)

- Summary: simplified Device Telemetry for non-technical operators, made Analyze deterministic-first and AI-optional, and hardened Windows telemetry writes against EPERM/EBUSY rename locks.
- Backend: `/api/devices/:deviceId/telemetry/linux/analyze` now reads stored JSONL telemetry, rebuilds findings with the vendor finding engine, returns finding counts and `lastAnalyzedAt`, and exposes `aiSummary`, `aiAvailable`, and `aiError` without depending on `/api/ai/chat`.
- Storage: per-device queueing remains in place; temp files now follow `<deviceId>.<timestamp>.<random>.jsonl.tmp`, rename retries EPERM/EBUSY with backoff, and locked rename fallback appends the current event safely so monitoring continues.
- Frontend: `LinuxTelemetryPanel` now presents Connection, Live Monitoring, and Results as the primary flow. Raw logs, advanced sources, backend counters, storage warnings, detected SSH service details, and raw evidence are behind Advanced diagnostics or Show technical evidence.
- UX: Analyze no longer fails completely when AI is unavailable. The UI shows `AI explanation is unavailable. Local analysis is still available.` for optional AI absence and `Backend is not reachable. Check API server.` for real API reachability failure.
- Tests: added focused coverage for deterministic analyze without AI, findings from stored events, Windows EPERM retry, locked-rename append fallback, simplified three-step UI, hidden raw evidence, Advanced diagnostics, and Persian/English label presence.
- Migrations: none.
- Validation: focused Task 17.8 tests (14/14); backend `npm run build`; backend `npm test` (172/172); root `pnpm build` passed with the existing Vite large-chunk warning.

## Task 17.8 Follow-up - Windows-Safe Telemetry Storage Runtime Fix (2026-07-12)

- Summary: fixed the Windows live-monitoring persistence bug where JSONL rotation could fail with `ENOENT` during rename and leak raw storage errors into the monitoring experience.
- Backend: `BoundedTelemetryStore` now recreates the telemetry directory recursively before writes/reads/status checks, handles first writes for new devices safely, serializes writes per device, and uses unique same-directory temp files before atomic rename.
- Runtime behavior: storage write failures are logged as backend telemetry-storage warnings, live monitoring continues, and the UI receives only a clean telemetry warning instead of raw paths, rename messages, or stack details.
- Frontend: Device Monitoring storage counters now show `used ... of ...` for bytes/events, and new stream events update live event count, last event time, and stored event count before the next backend status refresh.
- Tests: added regressions for missing telemetry directory creation, first write for a new device, byte-limit rotation, Windows path-safe concurrent temp writes, and storage failure not breaking monitoring findings.
- Migrations: none.
- Validation: focused Task 17.8 tests (10/10); backend `npm run build`; backend `npm test` (168/168); root `pnpm build` passed with the existing Vite large-chunk warning.

## Task 17.8 - Production-Grade Linux Device Monitoring and Service Status Reliability (2026-07-12)

- Summary: added bounded Linux telemetry storage, expanded live stream parsing/sources, fixed service-status read semantics, and evaluated the external SSH automation repo without adopting it as a dependency.
- Backend: added `BoundedTelemetryStore` with configurable per-device byte/count/age retention, `TELEMETRY_*` env settings, storage status API, structured live event persistence, apache/fail2ban stream sources, and parser coverage for auth/sudo/service/web/fail2ban/kernel/docker signals.
- Linux service status: added strict service-name validation, structured systemd `show`/`is-active`/`is-enabled`, SysV fallback, weak `pgrep` fallback, normalized states, parser confidence/explanation/evidence, and ActionPlan success semantics that treat inactive/failed/not_found/unknown as successful read results when SSH ran successfully.
- Frontend: Device Telemetry now shows stream state, event count, active sources, last event time, storage usage/count limits, expanded source filters, grouped findings/evidence, and service-status result details.
- External repo: `SSH-Automation-For-Multiple-Servers` is MIT Python/Paramiko. Useful ideas are bounded fan-out, retry/backoff, timeouts, and structured per-host results. Rejected as dependency/code source due to hardcoded sample passwords, insecure `AutoAddPolicy`, sudo password shell piping, unbounded local logging, and mismatch with Node/Fastify connector-controlled ActionPlan architecture.
- Tests: added `task17-8-linux-monitoring.test.ts` for separate per-device byte-limit and count-limit bounded store rotation, stream parser coverage, finding dedupe/severity, service parser states including systemctl-unavailable SysV fallback, service-name safety, no placeholder command leakage, and connector/read-success semantics. Updated older static Linux connector expectations.
- Migrations: none.
- Validation: focused Task 17.8 tests (7/7); `npm run validate:command-catalog` (136 items); backend `npm run build`; backend `npm test` (164/164); root `npm run test:i18n` (73 keys); root `pnpm build` passed with the existing Vite large-chunk warning.

## Task 17.7 - FortiGate Full Action Library Execution Coverage and Real CLI Verification (2026-07-11)

- Summary: hardened FortiGate guided IPsec execution so real connector success must be followed by semantic FortiGate verification before the ActionPlan can succeed.
- VPN fixes: preserved `aes256-sha256` proposal generation, blocked DES/3DES/MD5/SHA1 proposals by default, changed mandatory verification to targeted FortiGate `show`/`get` commands, and removed fixed debug/diagnose syntax from the required path.
- Connector: added FortiOS stdout/stderr failure detection and post-execution verification for phase1, phase2, static route, bidirectional firewall policies, NAT/logging, and tunnel summary evidence.
- Catalog/UI: support-state remains default-deny and no longer uses a hard-coded VPN preview-only override; result formatting shows post-execution verification checks.
- Tests: added `task17-7-fortigate-execution-coverage.test.ts` for proposal regression, weak proposal blocking, route/policy verification failure, CLI failure detection, and FortiGate catalog inventory honesty; included it in `npm test`.
- Live smoke checklist: create address object, service object, zone, firewall policy, static route, VIP/port-forward, IPsec VPN, run read-only checks, verify with FortiGate `show`/`get`, and clean up only after explicit confirmation.
- Migrations: none.
- Validation: focused Task 17.7 tests (6/6); `npm run validate:command-catalog` (136 items); backend `npm run build`; backend `npm test` (158/158); root `npm run test:i18n` (73 keys); root `pnpm build` passed with the existing Vite large-chunk warning.

## Task 17.6C - Standard Guided Parameter Flow for Parameterized Actions (2026-07-11)

- Summary: standardized parameterized action handling so catalog-backed FortiGate, MikroTik, Linux, and future vendor actions open a guided ActionSession instead of staying as inline/raw preview cards.
- Backend: added generated `catalog:<commandId>` guided blueprints, normalized submitted params, rejected placeholder/example values, filtered UI/internal identifiers, and preserved default-deny support states during preview/build/execute.
- Frontend: Action Library cards show executable/preview/manual/unsupported state and route parameterized actions to `Configure / Create ActionPlan`; guided modal stores selected action/vendor/device in URL state and follows active RTL/LTR direction.
- AI: Command Catalog AI fallback and AI Assistant now route missing-parameter actionable tasks into the same guided flow. Deterministic guided routing avoids external AI provider calls for recognized guided intents.
- Safety: verified actions execute only after preview and confirmation through the existing PolicyGuard/connector/audit path. Preview-only/manual-only parameterized actions can build review plans but do not invoke connectors.
- Tests: added regressions for guided parameter collection, missing/invalid/placeholder blocking, connector invocation only after confirmation, preview/manual no-execute behavior, source checks for Action Library routing, and locale parity.
- Migrations: none.
- Validation: backend build; focused `task17-2`, `task17-3`, and `task16` guided/AI tests (33/33); backend catalog validation (136 items); backend full test suite (152/152); root i18n parity (73 keys); root `pnpm build` passed with the existing Vite large-chunk warning.
- Playwright MCP: requested by task but not exposed in this session; browser-level verification remains a follow-up.

## Task 17.6 - Disable Mandatory Action Backup Preflight (2026-07-11)

- Summary: removed automatic mandatory backup/export commands from Quick Controlled FortiGate and MikroTik execution paths; backup/export is optional/manual only.
- FortiGate: no longer injects `show full-configuration` into execution. Guided IPsec site-to-site VPN now builds, previews, and confirmed-executes without a backup/export preflight.
- Safety: retained PolicyGuard, validated parameters, registered templates/connectors, explicit `intent=execute`, connector invocation, audit logging, and evidence-based success. No secrets were added to persisted plans, audit, or output.
- Areas: FortiGate/MikroTik policy guards and SSH connectors, generic action execution metadata, FortiGate compiler/capability UX, Action Center readiness copy, and Task 17.6 regression coverage.
- Validation: focused `task17-2`, `task17-3`, and generic tests; backend catalog validation (136 items); backend build; full backend test suite; frontend `pnpm build` passed with existing Vite dynamic-import/chunk-size warnings.

## Task 17.5 Follow-up - AI Assistant Action Routing (2026-07-11)

- Summary: fixed AI Assistant actionable request routing so VPN chat requests create a guided ActionSession and open the Guided Action flow instead of returning only text.
- Routing: Persian and English VPN creation phrases, including `build vpn`, now map to `fortigate_guided_vpn_setup`; `/api/ai/chat` returns `actionSessionId`, `actionSession`, and `guidedActionUrl`.
- Frontend: the AI panel follows `guidedActionUrl`/`actionSessionId` and navigates to `/guided-actions/:sessionId`; required VPN fields are collected there before preview/action-plan creation.
- Safety: chat still never executes commands, never sends raw CLI, and never bypasses explicit confirmation, PolicyGuard, or connector execution. Missing fields block build-plan with validation instead of creating an executable plan.
- Areas: AI chat service, FortiGate guided intent resolver, AI response typing, AI assistant panel routing, guided/support-state tests.
- Changed files: `backend/src/services/ai-chat.service.ts`, `backend/src/guided-actions/vendors/fortigate/fortigate-blueprints.ts`, `backend/test/task17-2-guided-actions.test.ts`, `backend/test/task17-3-support-state-i18n.test.ts`, `src/components/ai/AiSecurityAssistantPanel.tsx`, `src/lib/ai.ts`, docs.
- Migrations: none.
- Validation: `cd backend && npm run build`; `cd backend && npm run validate:command-catalog` (136 items); `cd backend && npx tsx --test test/task17-2-guided-actions.test.ts test/task17-3-support-state-i18n.test.ts` (22/22); `cd backend && npm test` (147/147); root `pnpm build` passed with existing Vite dynamic-import/chunk-size warnings.
- Follow-up: add browser-level navigation coverage when tooling is available and expand automatic chat routing for additional guided action families as they are hardened.

## Task 17.5 - FortiGate Guided VPN Parameter Mapping and Execution Fix (2026-07-11)

- Summary: fixed the execution blocker where `guided_action_wizard` provenance leaked into FortiGate VPN execution parameters and was validated as an interface; added canonical guided VPN schema, normalization, validation, compiler coverage, live discovery fallback, UI interface suggestions, and clearer Action Center fix fields.
- Executable now: FortiGate IPsec Site-to-Site guided VPN only, through `fortigate_guided_vpn_setup` and `fortigate-ssh`, when canonical required fields and PSK `secretRef` are present and PolicyGuard passes.
- Still planned/preview-only: FortiGate SSL VPN, IPsec Remote Access, and any FortiGate VPN/catalog action without complete verified schema/template/connector/parser/precheck/post-verification.
- Safety: raw PSK remains transient only; previews show `set psksecret ********`; ActionPlan JSON, dry-run output, audit, rollback metadata, docs, and frontend persisted state do not store the clear PSK.
- Broken diff handling: replaced the broken preview/incomplete guided VPN execution mapping with the canonical schema + compiler + connector path; preserved the useful Task 17.3B action-library/i18n/support-state changes.
- Areas: FortiGate guided VPN schema, ActionPlan normalization/execution discovery fallback, PolicyGuard/FortiGate policy guard, FortiGate compiler, guided blueprint fields, Guided Action Wizard interface suggestions, Action Center validation repair, and guided VPN regression tests.
- Changed files: `backend/src/services/fortigate-guided-vpn.schema.ts`, `backend/src/services/action-plan.service.ts`, `backend/src/services/policy-guard.service.ts`, `backend/src/services/fortigate-policy-guard.service.ts`, `backend/src/services/fortigate-command-compiler.ts`, `backend/src/guided-actions/vendors/fortigate/fortigate-blueprints.ts`, `backend/test/task17-2-guided-actions.test.ts`, `src/components/guided-actions/GuidedActionWizard.tsx`, `src/components/actions/ActionCenterPanel.tsx`, `src/lib/commandCatalog.ts`, docs.
- Migrations: none.
- Validation: `cd backend && npm run build`; `cd backend && npm run validate:command-catalog` (136 items); `cd backend && npx tsx --test test/task17-2-guided-actions.test.ts test/task17-3-support-state-i18n.test.ts` (21/21); `cd backend && npm test` (146/146); root `npm run test:i18n` (72 keys); root `pnpm build` passed with existing Vite dynamic-import/chunk-size warnings.
- Follow-up: replace process-local PSK refs with a vault-backed temporary secret store, implement SSL VPN/remote-access templates/parsers before execution, and run browser-level validation when tooling is available.

## Task 17.3 - Safe Vendor Action Library + Global i18n (2026-07-11)

- Summary: introduced authoritative support state (`verified | preview_only | manual_only | unsupported`), moved prepared actions to `/action-library`, blocked non-verified execution/dry-run generation server-side, and added global i18n plumbing with fa/en locale files and language direction switching.
- Areas: catalog types/evaluator/validator/resolver, command-catalog and action routes, ActionPlan service execution gates, AI resolver/AI-created plan metadata, Action Library UI, app header/navigation/language selector, locale files, parity script, and regression tests.
- Migrations: none.
- Support-state rules: verified requires validated input schema, registered compiler/template, compatible connector/planner, semantic result parser, precheck, and post-verification; otherwise the item is preview-only/manual-only/unsupported and cannot execute.
- Actions downgraded from executable: FortiGate full-control/write/unfinished library entries without all verified requirements, including VLAN/interface changes, zones, address/service objects, policies, VIP/IPPool, route/DNS/NTP changes, IPsec/SSL VPN changes, admin changes, VDOM, HA, and SD-WAN operations. FortiGate VPN guided wizard remains preview-only.
- Safety: Quick Controlled still applies only after support-state verification and does not bypass selected device, validation, compatibility, environment restrictions, PolicyGuard, audit, or real connector invocation. Manual/preview-only plans never send commands to SSH.
- Validation: `npm run validate:command-catalog` passed with 136 items; backend `npm run build` passed; backend `npm test` passed 145/145; root `npm run test:i18n` passed with 56 parity keys; root `pnpm build` passed with existing dynamic-import/chunk-size warnings.
- Commit: not created per user instruction.
- Follow-up: complete locale-key migration for older legacy frontend panels and add browser-level Playwright tests for RTL/LTR switching and library filtering when tooling is available.

## Task 17.2C - Guided Build-Plan Preview for FortiGate VPN (2026-07-09)

- Summary: fixed completed FortiGate VPN wizard build-plan so partial/planned execution templates create a preview-only ActionPlan instead of a useless 409.
- Areas: `backend/src/guided-actions/session-service.ts`, `backend/src/guided-actions/vendors/fortigate/fortigate-blueprints.ts`, Prisma schema/migration, `backend/src/services/action-plan.service.ts`, `src/components/guided-actions/GuidedActionWizard.tsx`, `src/components/actions/ActionCenterPanel.tsx`, `src/lib/actionApprovalState.ts`, tests and docs.
- Safety: execution remains disabled for preview-only guided plans; no raw AI commands, no connector invocation from wizard, no fake success, and PSK/password values are masked/excluded from persisted preview data.
- Validation: `npm run prisma:generate`; local enum migration apply; backend `npm run build`; backend `npm test` passed with 140/140; root `pnpm build` passed with existing chunk-size/dynamic-import warnings.
- Commit: pending.

## Task 17.2B - Force Multi-Step Requests into Guided Wizard (2026-07-09)

- Summary: removed the no-device chat dead-end for guided workflows. VPN/VDOM/Zone/Policy/VIP/NAT/VLAN/Route-style creation requests now return `guided_workflow`, start an ActionSession, and open the Persian wizard with device selection as step one when needed.
- Areas: `backend/src/ai/ai-template-resolver.ts`, `backend/src/routes/command-catalog.ts`, `backend/src/routes/action-sessions.ts`, `backend/src/guided-actions/session-service.ts`, `src/components/ai/AiSecurityAssistantPanel.tsx`, `src/components/commands/CommandCatalogPanel.tsx`, `src/components/guided-actions/GuidedActionWizard.tsx`, tests and docs.
- Safety: no guided request creates a normal ActionPlan before wizard completion; partial/planned workflows still do not fake execution or success; protected quick-controlled lab behavior remains unchanged.
- Validation: backend `npm run build`; backend `npm test` passed with 139/139; root `pnpm build` passed with existing chunk-size warning.
- Commit: pending.

## Task 17.2A - Guided Workflow Routing for Multi-Step Requests (2026-07-09)

- Summary: fixed multi-step operational routing so VPN/VDOM/Zone/Policy/VIP/NAT/Route/VLAN creation requests open Guided Action Wizard instead of producing generic/custom ActionPlans with unknown vendor.
- Areas: `backend/src/ai/ai-template-resolver.ts`, `backend/src/routes/command-catalog.ts`, `backend/src/services/ai-chat.service.ts`, `backend/src/guided-actions/`, `src/lib/ai.ts`, `src/lib/commandCatalog.ts`, `src/components/ai/AiSecurityAssistantPanel.tsx`, `src/components/guided-actions/GuidedActionWizard.tsx`, `src/App.tsx`, docs and tests.
- Safety: selected device is resolved from DB, no raw AI execution was added, guided partial/planned workflows do not fake ActionPlans, and success semantics still require real connector invocation.
- Validation: `npm run validate:command-catalog`; backend `npm run build`; backend `npm test` passed with 139/139; root `pnpm build` passed with the existing Vite chunk-size warning. Playwright MCP was unavailable.
- Commit: pending.

## Task 17.2 - Global Guided Action System + FortiGate Workflow Registry (2026-07-09)

- Summary: added backend global guided-action blueprints, ActionSession APIs, FortiGate workflow registry, fixed FortiGate/Linux port-status intent routing, and added a Persian guided wizard in Command Catalog.
- Areas: `backend/src/guided-actions/`, `backend/src/routes/action-sessions.ts`, `backend/src/ai/ai-template-resolver.ts`, `backend/src/ai/persian-intent-router.ts`, `backend/src/routes/command-catalog.ts`, `src/lib/guidedActions.ts`, `src/components/guided-actions/GuidedActionWizard.tsx`, docs and tests.
- Safety: ActionSession never executes; execution remains Action Center confirmed execution only. Partial/planned FortiGate workflows do not fake commands or success. Secrets remain masked and PSK uses `pskSecretRef`.
- Validation: `npm run validate:command-catalog`; `npm run build`; `npm test` passed with 133/133; root `pnpm build` passed with existing large-chunk warning.
- Commit: this Task 17.2 commit.

## Task 17.1 - FortiGate Full Control Engine (2026-07-09)

- Summary: added a FortiGate full-control registry, expanded catalog/template registration to CRUD/read/write coverage across the requested FortiGate domains, added compiler support for the new action names, and mapped key Persian operational requests to executable `fortigate-ssh` ActionPlans.
- Areas: `backend/src/fortigate/full-control-registry.ts`, FortiGate compiler/catalog/template registry/policy support, Prisma enums and migration, Persian intent router, Action Result formatter, product/status docs.
- Safety: preserved quick-controlled execution, FortiGate SSH connector invocation, PolicyGuard/audit, no success without `connectorInvoked=true`, and raw secret rejection for PSK-sensitive VPN flows.
- Validation: `npm run prisma:generate`; `npm run validate:command-catalog` (136 items); `npm run build`; `npm test` (125/125); `npx prisma db execute --file prisma/migrations/20260709120000_task17_1_fortigate_full_control/migration.sql`; root `pnpm build` passed with the existing large-chunk warning.
- Commit: pending.

## Task 17.0 - FortiGate Management Foundation (2026-07-08)

- Summary: completed the FortiGate read-only command library, shared normalized parsers, eight-section evidence-based Daily Check, Persian central resolver mappings, and structured result tables/findings.
- Safety: no new write action; fixed template compilation, PolicyGuard, audit, real connector invocation, secret redaction, and protected lab settings remain intact.
- Validation: Prisma generation, command catalog (63 items), backend TypeScript build, backend tests (125/125), and frontend `pnpm build` passed with the existing large-chunk warning.
- Migration: `20260708183000_task17_fortigate_management_foundation` applied locally.
- Commit: this Task 17.0 commit.

## Task 17.1 - FortiGate Intent Routing and Result UX (2026-07-08)

- Summary: unified FortiGate operational requests under the central AI resolver, added four executable read-only templates, structured FortiGate result parsing, corrected Daily Check severity semantics, and improved Persian result summaries/counts.
- Validation: catalog valid with 57 items; dedicated FortiGate resolver/compiler tests 4/4; backend build/full tests and `pnpm build` passed. Playwright MCP was unavailable in this session.
- Migration: `20260708150000_fortigate_readonly_intents` applied locally.
- Commit: pending.

## Task 17 - FortiGate SSH Read-only Discovery and Daily Check (2026-07-08)

- Summary: promoted FortiGate to an interactive `fortigate-ssh` connector with prompt/pagination handling, structured discovery parsing, and connector-backed Persian Daily Check v1.
- Areas: FortiGate connector/compiler/catalog, Prisma action enums, Daily Check engine/profile, Persian result formatter, tests and docs.
- Validation: Prisma generation, catalog validation (53 items), backend build and existing suite passed; dedicated FortiGate tests passed; frontend build passed.
- Commit: `d30adac Add FortiGate SSH discovery and daily check`.

## Task 10 - Project Integrity and Production Safety (2026-07-01)

- Summary: hardened config and env handling while preserving quick-controlled lab behavior.
- Areas: configuration, Docker/env safety, UI notice.
- Validation: relevant builds/tests passed.
- Commit: `Stabilize project config and production safety`
- Follow-up: living project memory.

## Task 11.0 - Codex Memory and Living Status (2026-07-01)

- Summary: introduced AGENTS, status/history/architecture docs, and snapshot helper.
- Areas: root docs and scripts.
- Validation: documentation/script review.
- Commit: `Add Codex project memory and living status docs`
- Follow-up: keep memory synchronized after tasks.

## Tasks 12-12.5 - Telemetry, Multi-Vendor Analysis, Evidence Packs (2026-07-02)

- Summary: added Linux snapshot/live telemetry, real-time findings, multi-vendor analysis/hardening, compact AI context, and the central orchestrator prompt.
- Areas: telemetry, assessments, AI context/prompts, frontend panels, tests.
- Validation: backend/frontend builds passed; suite reached 83/83.
- Commits: `Add Linux security telemetry foundation`; `Add actionable real-time Linux security monitoring`; `Add multi-vendor analysis and hardening engine`; `Add compact AI evidence packs and orchestrator prompt`
- Follow-up: feed non-Linux collectors into the shared engine.

## Task 13 - Vendor-Aware Telemetry and Findings Engine (2026-07-03)

- Summary: added vendor profiles, normalized Finding persistence, aggregation/suppression, APIs/SSE, and proposal-only remediation.
- Areas: Prisma, telemetry engine/routes/UI, AI context, tests.
- Validation: backend 88/88; backend/frontend builds passed.
- Commit: `Add vendor-aware telemetry findings engine`
- Follow-up: add real vendor collectors/parsers.

## Task 14 - Persian Backend-First Command Catalog (2026-07-04)

- Summary: established Persian catalog product mode, device-aware search, ActionPlan handoff, and proposal-only AI fallback.
- Areas: catalog types/data/routes/UI, product docs/tests.
- Validation: backend 90/90; backend/frontend builds passed.
- Commit: `Add Persian backend-first command catalog foundation`
- Follow-up: require real templates for executable labels.

## Task 14.1 - Real Validated Vendor Commands (2026-07-04)

- Summary: added implementation states, parameter validation, template registry, catalog validator, and honest executable/manual/planned UI states.
- Areas: catalog, templates/connectors, Prisma, Action Center, tests.
- Validation: catalog validation, builds, and backend 93/93 passed.
- Commit: `Enforce real validated vendor command catalog`
- Follow-up: complete Action Center handoff.

## Task 14.1B - Catalog Action Center Handoff (2026-07-04)

- Summary: preserved full catalog metadata, resolved templates safely, and opened newly created plans in Action Center.
- Areas: catalog resolver/routes, quick execute, frontend handoff/tests.
- Validation: catalog validation; backend 97/97; builds passed.
- Commit: `Fix catalog Action Center quick-execute flow`
- Follow-up: make lifecycle/result evidence honest.

## Tasks 14.1C-14.1D - Real Execution Lifecycle and Preview Fix (2026-07-04)

- Summary: separated preview from execution, added stable fingerprints/explicit intent, persisted real output, and required connector invocation for success/result navigation.
- Areas: action lifecycle, catalog resolution, result UI, regression tests.
- Validation: catalog validation; backend progressed to 103/103; builds passed.
- Commits: `Fix prepared command execution lifecycle and results`; `Fix prepared command preview execution transition`
- Follow-up: unify supported AI actions with catalog templates.

## Task 14.1E - Lab-Unrestricted AI/Catalog Execution (2026-07-04)

- Summary: mapped supported AI intents to registered Linux templates and kept single-confirmation lab execution without bypassing connector/audit controls.
- Areas: Prisma action types, catalog/templates, Linux connector, intent parsing, policy/tests.
- Validation: catalog 41 items; backend 105/105; builds passed.
- Commit: `Enable lab execution for supported AI actions`
- Follow-up: vendor-aware Daily Check.

## Task 15.1 - Multi-Vendor Daily Check (2026-07-05)

- Summary: added ten vendor profiles; Linux/MikroTik use real read-only templates while other vendors remain manual-only; improved grouped Daily Check results.
- Areas: Daily Check engine/routes/UI, templates/connectors, migration/tests/docs.
- Validation: catalog/builds passed; backend suite passed after local test migration.
- Commit: `Add vendor-aware daily checks and execution mapping`
- Follow-up: add real connectors before promoting manual profiles.

## Task 15.0 - Harden Project Memory and Codex Handoff (2026-07-07)

- Summary: created fixed-structure live handoff and memory index; refreshed status/architecture/codebase/product docs; hardened snapshot and memory checks.
- Areas: `AGENTS.md`, `CODEX_HANDOFF.md`, `docs/`, `scripts/`, root `package.json`.
- Validation: snapshot and memory check passed; backend build and 109/109 tests passed; frontend build passed with the existing chunk-size warning.
- Commit: `Harden project memory and Codex handoff system`
- Follow-up: UTF-8 cleanup and continued vendor connector integration.

## Task 16A - AI Resolver, Assistant Contract, and Catalog Fallback Hardening (2026-07-07)

- Summary: added a central AI-to-template resolver, hardened structured AI chat responses, fixed Command Catalog AI fallback modes, and updated the catalog UI/client to reflect executable/manual/missing-input states honestly.
- Areas: `backend/src/ai/ai-template-resolver.ts`, `backend/src/routes/ai.ts`, `backend/src/routes/command-catalog.ts`, `backend/src/services/ai-chat.service.ts`, `src/lib/ai.ts`, `src/lib/commandCatalog.ts`, `src/components/commands/CommandCatalogPanel.tsx`, Task 16 backend tests.
- Validation: backend build/tests and frontend build passed.
- Commit: completed previously from latest committed state.
- Follow-up: finish Daily Check, Service Health, result UX, and docs.

## Task 16B - Daily Check, Linux Service Health, and Result UX Hardening (2026-07-07)

- Summary: completed vendor-aware Daily Check profiles/engine, added Persian Daily Check UI and Linux Service Health UI, wired Linux service-health actions into catalog/templates/planner/connector, enforced new-tab result opening with popup fallback, and rebuilt Action Result formatting for key Linux/MikroTik actions.
- Areas: `backend/src/daily-check/`, `backend/src/commands/catalog/index.ts`, `backend/src/commands/execution/execution-template-registry.ts`, `backend/src/connectors/vendors/linux-edge.planner.ts`, `backend/src/connectors/linux-ssh.connector.ts`, `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260707160000_task16_linux_service_health/`, `src/components/daily-check/DailyCheckPanel.tsx`, `src/components/services/LinuxServiceHealthPanel.tsx`, `src/components/actions/ActionCenterPanel.tsx`, `src/components/actions/ActionResultView.tsx`, `src/features/actions/actionResultFormatter.ts`, `src/lib/actionResultNavigation.ts`, `src/lib/dailyCheck.ts`, backend tests/docs.
- Validation: `cd backend && npm run prisma:generate`; `cd backend && npm run validate:command-catalog`; `cd backend && npm run build`; `cd backend && npm test`; `cd backend && npx prisma db execute --file prisma/migrations/20260707160000_task16_linux_service_health/migration.sql`; `pnpm build` all passed. Frontend build kept the existing Vite chunk-size warning only.
- Commit: pending.
- Follow-up: UTF-8 cleanup in legacy areas and applying the Task 16 enum migration on every shared/local environment.

## Task 16.2 - Command Search AI Fallback Executable Actions (2026-07-07)

- Summary: fixed `/api/commands/ai-propose` so Command Catalog no-result Ask AI requests route through the central AI template resolver before manual fallback, pass selected device/vendor/search context, and create executable ActionPlans for supported Linux/MikroTik templates.
- Areas: `backend/src/ai/ai-template-resolver.ts`, `backend/src/routes/command-catalog.ts`, `backend/src/services/action-plan.service.ts`, `backend/test/task16-ai-resolver-and-fallback.test.ts`, `src/lib/commandCatalog.ts`, `src/components/commands/CommandCatalogPanel.tsx`, `src/components/charts/TopPortsChart.tsx`.
- Validation: `cd backend && npm run build`; `cd backend && npm test` passed with 117/117 tests; root frontend build passed with the existing large-chunk warning. `pnpm` was unavailable in this shell, so root `npm run build` was used after repairing local dependencies.
- Commit: pending.
- Follow-up: continue UTF-8/mojibake cleanup separately; do not change protected quick-controlled lab execution behavior.

## Task 16.3 - Persian Intent Understanding and Executable Action Creation (2026-07-07)

- Summary: added deterministic Persian intent routing before AI/manual fallback, promoted mapped template aliases such as `linux_list_open_ports`, fixed stale `sourceIp` validation for open-port listing, and made AI chat plus Command Search AI fallback create executable `ai_mapped_template` ActionPlans.
- Areas: `backend/src/ai/persian-intent-router.ts`, `backend/src/ai/ai-template-resolver.ts`, `backend/src/routes/command-catalog.ts`, `backend/src/services/ai-chat.service.ts`, `backend/src/services/action-plan.service.ts`, `backend/src/services/policy-guard.service.ts`, `backend/src/commands/catalog/`, `backend/src/commands/execution/`, Linux/MikroTik connectors, Prisma schema/migration, Task 16 tests, frontend action result/action typing.
- Validation: `cd backend && npm run prisma:generate`; `cd backend && npm run validate:command-catalog`; `cd backend && npx prisma db execute --file prisma/migrations/20260707183000_task16_3_persian_intent_aliases/migration.sql`; `cd backend && npm run build`; `cd backend && npm test` passed with 119/119 tests; `pnpm build` unavailable, `corepack pnpm build` failed with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, root `npm run build` passed with the existing large-chunk warning.
- Commit: pending.
- Follow-up: apply the Task 16.3 enum migration on other local/shared databases before creating the new alias ActionTypes there.

## Task 16.3A - Runtime AI Fallback Validation and Source Param Fix (2026-07-07)

- Summary: tested the no-result Command Catalog flow for `وضعیت پورت های باز رو نشون بده` against the local Linux device route path, fixed stale control-source normalization into `sourceIp`, kept executable metadata params clean, and changed Action Center execute buttons to the exact label `تایید و اجرا`.
- Areas: `backend/src/services/policy-guard.service.ts`, `backend/src/services/action-plan.service.ts`, `backend/test/task16-ai-resolver-and-fallback.test.ts`, `src/components/actions/ActionCenterPanel.tsx`, docs.
- Validation: route-level flow verified search count 0 -> AI fallback executable `linux_list_open_ports` -> validation passed -> quick execution succeeded with `connectorInvoked=true` and visible `ss/netstat` output; `cd backend && npm run build`; `cd backend && npm run validate:command-catalog`; `cd backend && npm test` passed with 119/119 tests; root `npm run build` passed with the existing Vite large-chunk warning. `pnpm` is not available on PATH in this shell.
- Commit: pending.
- Follow-up: Playwright MCP browser tooling was not exposed in this session; rerun click-level browser validation when that tool is available.

## Task 17.3B - Safe Vendor Action Library, Real FortiGate IPsec, Global i18n (2026-07-11)

- Summary: repaired the broken Task 17.3 vendor-library/i18n/support-state attempt, moved prepared actions to `/action-library`, enforced default-deny support states, and made FortiGate IPsec Site-to-Site guided VPN executable through `fortigate-ssh`.
- FortiGate executable mode: only `fortigate_guided_vpn_setup` with `vpnType=ipsec_site_to_site` and PSK auth is verified. It requires tunnel name, WAN interface, LAN interface, remote gateway, local and remote subnet lists, proposal, temporary PSK `secretRef`, and optional static-route/firewall-policy/NAT/logging/enable flags.
- FortiGate planned modes: SSL VPN and IPsec Remote Access remain preview-only/planned. FortiGate catalog/guided actions without full schema/template/connector/parser/precheck/post-verification are not executable.
- Safety: raw PSK is never stored in ActionPlan JSON, dry-run output, frontend state, audit, or docs. A process-local 30-minute temporary `pskSecretRef` is resolved only during connector execution; backup preflight output is redacted.
- Areas: FortiGate compiler/connector/policy guard, guided FortiGate blueprints, temporary secret service, action catalog/template registry, support-state catalog gate, command catalog routes, ActionPlan service, Action Library UI, App shell i18n, Action Center readiness UX, locale files/parity script, backend tests.
- Changed files: `backend/src/services/fortigate-command-compiler.ts`, `backend/src/services/ephemeral-secret.service.ts`, `backend/src/connectors/fortigate-ssh.connector.ts`, `backend/src/actions/fortigate-action-catalog.ts`, `backend/src/services/fortigate-policy-guard.service.ts`, `backend/src/guided-actions/vendors/fortigate/fortigate-blueprints.ts`, `backend/src/commands/execution/execution-template-registry.ts`, `backend/src/commands/catalog/*`, `backend/src/routes/actions.ts`, `backend/src/routes/command-catalog.ts`, `backend/src/services/action-plan.service.ts`, `backend/src/ai/ai-template-resolver.ts`, `backend/test/task17-2-guided-actions.test.ts`, `backend/test/task17-3-support-state-i18n.test.ts`, `src/App.tsx`, `src/components/commands/CommandCatalogPanel.tsx`, `src/components/actions/ActionCenterPanel.tsx`, `src/lib/actionApprovalState.ts`, `src/lib/commandCatalog.ts`, `src/main.tsx`, `src/i18n/**`, `scripts/check-locale-parity.mjs`, `package.json`, `pnpm-lock.yaml`, `backend/package.json`.
- Migrations: none.
- Validation: `cd backend && npm run build`; `cd backend && npm run validate:command-catalog` (136 items); `cd backend && npx tsx --test test/task17-2-guided-actions.test.ts test/task17-3-support-state-i18n.test.ts` (20/20); `cd backend && npm test` (145/145); `npm run test:i18n` (72 keys); `pnpm build` passed with existing Vite dynamic-import/chunk-size warnings.
- Follow-up: replace process-local PSK refs with a persistent vault integration; implement SSL VPN and remote-access templates/parsers before making them executable; complete dedicated legacy i18n/mojibake cleanup; run browser click validation when tooling is available.

## Task 18.1 Milestone A - Product IA, Routing, App Shell, Feature Split (2026-07-12)

- Summary: completed Milestone A scope from `TASK_18_1_PLATFORM_UX_ARCHITECTURE.md`: discovery, lightweight routing, app shell/navigation, feature folder split, and design tokens.
- Frontend: added `src/routes/appRoutes.tsx`, `src/components/layout/AppShell.tsx`, `src/design-system/*`, `src/features/assets/*`, `src/features/security/*`, and route pages for dashboard, monitoring, actions, assistant, integrations, and settings.
- Backward compatibility: `/action-library`, `/guided-actions/:sessionId`, and `/actions/:id/result` continue to work.
- Safety: no backend execution policy, ActionPlan lifecycle, connector, PolicyGuard, lab mode, or secrets changed.
- Browser MCP: inspected requested routes with the MCP browser before implementation; auth gate prevented authenticated page inspection without credentials, and the only console errors were expected 401 auth checks. Screenshots were saved in `.playwright-mcp/`.
- Validation: `npx pnpm@10 build` passed with the existing large-chunk warning after npm cache escalation. Backend validation was not required because backend/package code was not changed.
- Commit: pending.
