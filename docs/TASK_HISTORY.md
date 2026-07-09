# Task History

Entries are chronological and compact. Validation reflects what was known at the end of each task.

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
