## 2026-07-19 - AI Assistant structured ActionPlan architecture

- Added the shared AI structured planner that decomposes selected-device requests into backend-validated vendor steps instead of requiring every workflow to exist as one catalog item.
- Preserved execution controls: AI plans never include executable raw CLI, unsupported steps are blocked, missing fields are surfaced for guided input, and backend Action Center remains the only execution path after preview and approval.
- Updated chat routing to keep informational requests chat-only, preserve existing guided workflows behind explicit confirmation, and attach structured plan metadata to supported/custom proposals.
- Updated Action Center review UI to show structured step status, missing parameters, blocked reasons, catalog/action ids, and backend registry execution status.
- Validation: backend npm run build; root npm run build; focused backend planner/routing/target-device/vendor-isolation/Action Center/guided tests 96/96; backend command catalog validation; root i18n, UTF-8, workflow guard; git diff check.

## 2026-07-19 - AI Assistant ActionPlan creation regression

- Fixed the regression from the guided-routing guard where valid implemented catalog actions with missing parameters no longer created ActionPlans.
- Resolver now checks selected-device supported catalog matches before guided fallback, keeps generic/custom fallback blocked, and maps Cisco VLAN creation by exact `cisco.create-vlan` operation instead of `generic_security_action`.
- AI chat and `/api/commands/ai-propose` create proposed ActionPlans for verified connector-backed catalog matches while preserving missing-field metadata and requiring explicit guided/action-center completion before preview or execution.
- Validation: backend npm run build; root npm run build; backend focused regression test 6/6; backend AI target-device test 13/13; backend command catalog validation; git diff --check. Full backend npm test stopped at the required TEST_DATABASE_URL_REQUIRED guard.

## 2026-07-19 - AI Assistant guided-action redirect fix

- Reproduced the current flow in source from prompt handling through selected-device context, resolver normalization, ActionPlan/session creation, and Assistant navigation. The unintended redirect came from backend chat allocating a guided session plus frontend submit handling navigating immediately when session data existed.
- Restricted resolver fallback so generic/custom intent types cannot bind to vendor catalog rows with `generic_security_action`; this prevents unsupported/custom Cisco-style requests from becoming executable-looking catalog actions.
- Removed Assistant chat-side Guided Action session creation and limited guided-start candidates to verified, implemented, connector-backed catalog actions for the selected device with missing required parameters. Existing Action Center review/approval/execution remains unchanged.
- Removed frontend auto-start/auto-navigation from submit handling. The Assistant now clears stale guided/action state on chat clear, prompt submit, and target switch, shows an explicit start button only for eligible multi-step parameter collection, and navigates only after that click.
- Validation: backend npm run build; frontend pnpm build; backend source test `tsx --test test/ai-target-device-context.test.ts` 13/13; backend npm run validate:command-catalog; root npm run test:i18n; root npm run test:utf8; root npm run test:workflows; git diff --check. Backend npm test was attempted and correctly refused without TEST_DATABASE_URL.

## 2026-07-19 - AI Assistant target-device context

- Added a target-context builder for AI Assistant prompts and wired chat context creation to selectedDeviceId on every request.
- Restricted resolver catalog fallback so selected Cisco, FortiGate, MikroTik, and Linux targets cannot inherit another vendor's stale action match.
- Cleared prior intent, ActionPlan handoff, and guided-action state on target switch and new prompt; unsupported actions now suggest valid actions for the selected device only.
- Validation: backend npm run build; frontend npm run build; backend npx tsx --test test/ai-target-device-context.test.ts; backend npm run validate:command-catalog; root npm run test:i18n; root npm run test:utf8; root npm run test:workflows; git diff --check.

## 2026-07-19 - Cisco IOS Classic localized workspace

- Localized the Cisco device workspace state model and overview cards for connection, verification, inventory, health, interfaces, capability summary, raw diagnostics, and Action Center/backup entry points.
- Added Persian/English parity keys for Cisco capability states and removed user-visible internal connectorInvoked expressions from onboarding/action result surfaces.
- Validation: root npm run build; root npm run test:i18n; root npm run test:utf8; internal-expression scan.

## 2026-07-19 - Cisco IOS Classic Action Center integration

- Added controlled Cisco Action Center operations for IOS Classic and IOS-XE through the existing registry/planner/catalog/connector path, including read-only show commands, backup, and scoped safe-write workflows.
- Updated PolicyGuard to validate Cisco generic catalog actions against registered Cisco SSH devices and credentials, and routed sensitive configuration evidence through Cisco CLI redaction.
- Validation: backend npm run build; backend npm run validate:command-catalog; focused Cisco Action Center test 4/4; focused Cisco source/mocked tests 15/15.

## 2026-07-19 - Cisco IOS Classic inventory and capabilities

- Added safe optional IOS Classic command collection through the existing SSH2 command path and stored structured collection/profile evidence under Device capabilities.
- Broadened Cisco read-only capability/platform metadata to include IOS Classic and adjusted workspace/Asset projection to use saved collection evidence when cache tables are absent.
- Validation: backend npm run build; backend npm run validate:command-catalog; focused Cisco tests 18/18.

## 2026-07-19 - Cisco IOS Classic discovery and verification

- Root cause addressed: IOS Classic detection was successful, but platform support was restricted to cisco-ios-xe, so connected devices were classified as connected_unsupported before inventory and verification could progress.
- Added IOS Classic to the existing Cisco automation support boundary, carried safe identification commands through onboarding, and persisted parsed initial system/interface facts into the existing Device capabilities payload.
- Validation: backend npm run build; focused Cisco ssh2/source/parser tests 16/16; git diff --check. DB-backed interactive connector test refused to run without TEST_DATABASE_URL, preserving the safety gate.

## 2026-07-19 - Cisco legacy IOS SSH compatibility

- Converted the opt-in legacy Cisco SSH algorithm override into a named Legacy Cisco IOS Compatibility Profile.
- Added explicit support for `diffie-hellman-group14-sha1`, `ssh-rsa`, and SHA-1 HMAC negotiation while keeping the modern profile unchanged and preserving per-device/session approval.
- Strengthened focused connector/source coverage and ran a sanitized real registered-device SSH test; the connector authenticated, opened a privileged shell, and returned the read-only platform command, then retained the existing `connected_unsupported` classification for classic/non-IOS-XE Cisco.
# Task History

## 2026-07-19 - Phase B: device onboarding and workspace simplification

- Simplified the existing Device Onboarding page without adding APIs or stores: identity, credential/test, review, verified commit, and explicit unverified registration all continue through the current onboarding-session contract.
- Added structured frontend onboarding error handling using backend error codes, while keeping detailed diagnostics behind Advanced and preserving connector-backed success semantics.
- Simplified Device Workspace to the six Phase B tabs, moved vendor capability sections to Advanced, and made missing collection data explicit rather than showing invented zero values.
- Extended Workflow Lab with verified/unverified workspace fixture states and added balanced English/Persian locale coverage plus source-level mocked Phase B tests.
- Validation: root npm run build; root npm run test:i18n; root npm run test:utf8; root npm run test:workflows; backend npm run build; backend npm run validate:command-catalog; backend npx tsx --test test/phase-b-onboarding-workspace-source.test.ts; git diff --check.

## 2026-07-19 - Workflow foundation Phase A

- Added WorkflowStepper, WorkflowStateCallout, WorkflowReviewSummary, WorkflowResultTimeline, and WorkflowPrimaryAction as reusable presentation-only workflow primitives.
- Added /tools/workflow-lab as a DEV-only fixture page with Persian RTL and English LTR examples for the required onboarding, action, planned Cisco, and unsupported states.
- Added locale keys and a source validation script proving the lab route is not exposed through production navigation/Product State and performs no API/execution calls.
- Preserved frontend/backend compatibility, full Persian RTL support, Action Center architecture, existing API contracts, Prisma schema, connectors, PolicyGuard, and protected lab execution behavior.
- Validation: npm run build, npm run test:i18n, npm run test:utf8, npm run test:workflows, git diff --check, and production bundle route-string check passed; only the known Vite large-chunk warning remains.

## 2026-07-18 - Device UX repair Phase A: test data safety and removal regression

- Audited Phase 1 and the Device/Asset paths without modifying the committed Cisco connector work. Confirmed the equipment page reads Asset records, while deletion removes only Device and Prisma nulls the Asset link.
- Replaced the derived historical test database behavior with an explicit safety gate. Missing/invalid/equal/historical test targets are rejected without exposing connection credentials; Prisma test initialization enforces the same gate.
- Added pure safety/contract/source-chain tests plus an isolated DB integration reproduction for create/link -> DELETE 204 -> orphan Asset still returned by `/api/assets`. Cleanup is limited to the exact generated IDs.
- Defined and documented Device ownership, Asset projection/removal semantics, and independent inventory/connection/verification/management statuses. No schema, visible onboarding, Cisco fallback, Phase B behavior, deployment, migration, or database mutation occurred.
- Validation: seven pure Phase A tests, backend build, Prisma validate, locale/Persian checks, UTF-8, and diff check. With no `TEST_DATABASE_URL`, the DB-writing regression and full DB suite correctly stop at `TEST_DATABASE_URL_REQUIRED` before any write.

## 2026-07-18 - Repair bundle Phase 1: reliable interactive Cisco connector

- Replaced exec-only Cisco SSH with a single PTY interactive session supporting prompt detection, enable mode through a separate encrypted Credential reference, paging disable/handling, command echo cleanup, keyboard-interactive auth, keepalive, independent timeouts, output bounds, and deterministic cleanup.
- Added a typed sanitized diagnostic contract and propagated it through the Cisco wrapper and onboarding test endpoint. Added explicit supported/unsupported/failed connection semantics and opt-in per-device legacy algorithm compatibility without weakening defaults.
- Added deterministic stream tests and real in-process SSH2 password/private-key fixtures with runtime-generated keys; repaired the stale `DeviceConnector` test import and made the onboarding integration fixture use collision-free test addressing and cleanup.
- Passed Phase 1 scoped lint, backend/frontend builds, full backend 250/250, i18n and UTF-8. Global lint remains blocked by unrelated pre-existing issues. No deployment, migration execution, production mock, real-device mutation, or secret inspection was performed. Stopped before Phase 2.

## 2026-07-18 - Device onboarding required-name UX repair

- Inspected the exact persisted failed onboarding Session and confirmed the backend rejected an empty `name`; the apparent `edge-switch-01` value was only a visually ambiguous placeholder.
- Marked required fields, clarified the name example, added pre-request validation, placed the error inside the connection form, and focused/scrolled the invalid control.
- Added regression coverage. Focused onboarding tests passed 9/9; backend and frontend builds passed. No device, credential, connector, migration, or execution-policy behavior changed.

## 2026-07-15 - Operator-first Action Center repair

- Rebuilt the Action Center around the normal operator path: Device, Credential Reference, action, and one Execute click. Added default immediate execution and optional preview mode while retaining every ActionPlan API, direct route, history row, PolicyGuard check, and connector audit.
- Added the Connection card, persisted status refresh, exact failure/Retry behavior, successful-attempt timestamps, responsive enterprise layout, and closed Advanced Details JSON disclosure.
- Registered read-only Cisco show-version through the existing IOS-XE SSH transport and fixed vendor-scoped generic-action convergence plus connector-failure invocation evidence.
- Authenticated Playwright exercised all requested paths. Linux service status, Linux daily check, and FortiGate VPN succeeded with `connectorInvoked=true`; FortiGate zone and Cisco show version invoked their real connectors and surfaced exact live-target failures; preview-only created no connector invocation.
- Validation passed: catalog 138; backend build and 237/237 tests; frontend build; locale/Persian/UTF-8 checks; diff check; Playwright desktop/mobile RTL/LTR acceptance; Prisma current; dry-run reconciliation changed zero rows.
- Database preservation: Device 4, Asset 7, DeviceCredential 4, Finding 5 stayed unchanged. Seven acceptance ActionPlans were retained by design, moving the task baseline from 126 to 133 without deleting or rewriting prior history. No migration, restore, seed, destructive SQL, or secret access occurred.

## 2026-07-14 - Master repair Phase 2

- Migrated the application from manual pathname matching to React Router while preserving ActionPlan result and guided-action deep links.
- Added real 404 behavior and stable `data-page-id` markers for all feature routes and special routes.
- Replaced direct URL mutation/popstate navigation with router navigation and converted the generated shell navigation to `Link`.
- Strengthened Product State parity to exactly 53 unique keys with exact frontend/backend route equality.
- Validation passed: backend build; focused route/product-state/deep-link tests; frontend build; locale and UTF-8 checks; diff check; authenticated Playwright 404/Dashboard/Assets acceptance. Database counts remained unchanged.

## 2026-07-14 - Master repair Phase 1

- Completed the non-destructive Phase 0 identity/dump gate and normal-runtime convergence.
- Pinned Vite to strict port 5173, forced local development API calls through `/firewall-api`, removed stale 5174 default origins, and added redacted datasource/schema readiness to health.
- Validation: backend build; focused auth/product-state tests; frontend build; locale parity; UTF-8 guard; diff check; 10/10 readiness; Playwright login identity and same-origin proxy observation.
- Existing database counts remained unchanged. No migration, restore, seed, destructive SQL, `.env` access, or connector execution occurred.

Entries are chronological and compact. Validation reflects what was known at the end of each task.

## Task 20.1A - DB/Auth Repair and Cisco Onboarding Blocker (2026-07-14)

- Summary: executed Milestones A-C in order: reproduced the default PostgreSQL/Prisma startup failure, repaired readiness/live/auth database failure handling, and captured MCP authentication evidence.
- Reproduction: `postgresql-x64-18` was running but `127.0.0.1:5432` TCP failed; `prisma migrate status` returned a schema engine error; `buildApp()` failed at `bootstrapAdmin()`/`prisma.appUser.count()` with operation timeout.
- Backend: added `/api/health/live`; aligned `/api/health/ready` to the Task 20.1A shape; moved startup DB retry to a shared helper with 5 attempts, exponential backoff and jitter; reduced Prisma startup stack noise; kept one shared pg Pool, PrismaPg adapter, and Prisma client; auth database failures now return structured 503.
- Proof: backend built; healthy runtime on `127.0.0.1:55432/firewall_log_auth` produced 10/10 live 200 and 10/10 ready 200 over 181 seconds, plus a clean 10-sample body check with `databaseReady=true`.
- MCP: `/login` and `/dashboard` opened in the authenticated Persian shell with `/api/auth/me` 200. Manual credential entry was not replayable because the exposed MCP tool surface lacks fill/type/click commands and the browser session was already authenticated.
- Blocker: the active stable runtime database has no saved Credential References, so the required `cisco-f2 — admin` reference is missing. Task 20.1A stops here by its saved-Credential-Reference stop condition; Cisco onboarding, connector invocation, Device persistence, animated success, redirect, and workspace proof are not claimed.
- Commits: `afbdd4c docs: trace postgres prisma authentication failure`; `f09bb4a fix: stabilize postgres prisma and backend readiness`; `9b55d87 fix: restore authentication after database readiness`.

## Task 20.1 - Onboarding Workspace Dashboard Trace (2026-07-14)

- Summary: executed the Task 20.1 Milestone A failure trace after reading the required prompt/spec/docs, using only Playwright MCP for browser evidence.
- Browser: MCP opened `http://localhost:5173/assets/devices/new?vendor=linux`; page title was `log-app`; authenticated API calls returned 200/201; the live form and `Credential reference` selector were visible; console errors were zero.
- Backend/database: runtime database had no Devices and no saved Credential References, so real connector-backed onboarding cannot proceed honestly.
- Docs: added runtime, API sequence, frontend state, and backend state traces under `docs/TASK_20_1_*`.
- Safety/blocker: no `.env`, secret, destructive Prisma command, local Playwright fallback, fake device, or fake connector success was used. Full Task 20.1 remains blocked until a real target and saved credential reference are available.
- Commit: `cc3bd67 docs: trace task 20.1 onboarding failure`.

## Task 20 - Backend readiness and auth startup repair (2026-07-14)

- Summary: paused Task 20.1 feature work to investigate the current backend startup/auth failure around Prisma `AppUser` bootstrap and login's auth-server connection error.
- Reproduction: `buildApp()` fails during `bootstrapAdmin()`/`prisma.appUser.count()` with database connection timeout; `/api/health/ready` returns structured 503 while the DB is unavailable.
- Backend: changed Prisma setup to one shared `pg` Pool plus one shared Prisma client, removed Fastify app-close database disconnect, moved database shutdown to process termination, added narrow transient startup retry, and added `GET /api/health/ready`.
- Runtime recovery: local PostgreSQL service `postgresql-x64-18` remains externally unreachable to Node/Prisma (`ETIMEDOUT` on port 5432), and service/process restart was denied by Windows permissions. A user-owned temporary PostgreSQL 18 cluster was initialized under `.runtime/postgres-task20-auth`, started on `127.0.0.1:55432`, and the backend was started with only process `DATABASE_URL` overridden to the healthy temporary database.
- Validation: `npx prisma validate`, `npx prisma generate`, backend build, frontend build, and backend `npm test` passed (209/209) against the healthy temporary database. Playwright MCP confirmed authenticated `/api/auth/me` 200, dashboard API 200 responses, visible admin shell, and no console errors on `/dashboard`.

## Task 20 - MCP Baseline and Onboarding API Compatibility (2026-07-14)

- Summary: began Task 20 with the mandatory prechange gate, proved current-session Playwright MCP availability, and aligned onboarding API names with the Task 20 contract without changing protected execution behavior.
- Browser: MCP opened `http://localhost:5173/`, page title `log-app`, and captured authenticated Persian shell evidence in `.playwright-mcp/page-2026-07-14T08-56-05-007Z.yml`.
- Docs: added Task 20 prechange runtime baseline, MCP proof, route/control baseline, API failure register, and backend log register.
- Backend: added `/test-connection`, `/detect-platform`, `/build-preview`, and `/retry` aliases for onboarding sessions; retry is structured and does not fabricate progress from a draft.
- Safety: no `.env`, secret, destructive DB command, Nmap scan, Check-Host call, external provider invocation, or device mutation occurred in this slice.
- Validation: Prisma validate passed; backend build passed; focused onboarding/workspace suite passed 9/9; `git diff --check` passed with line-ending warnings only. Migration status remains the known unapplied-history baseline.

## Task 20 - Check-Host Diagnostics Workspace (2026-07-14)

- Summary: replaced the public `/tools` placeholder with a real Check-Host-backed diagnostic session API, Tools UI, direct tool routes, and persisted history through the existing `AuditLog` table.
- Backend: added `/api/diagnostics/sessions` create/list/get, target classification, private/reserved target rejection with `providerInvoked=false`, Check-Host DNS/HTTP/Ping/TCP JSON invocation with bounded polling, provider request IDs, and database persistence.
- Frontend: `/tools`, `/tools/network-check`, `/tools/history`, and related tool routes render a target input, suggestions, provider source, invocation flag, request IDs, latest result, and history. Nmap and monitors remain visibly gated until their worker/scheduler milestones.
- Real provider proof: `example.com` persisted session `cmrkfksle0000zolvol4yk1ge` with Check-Host request IDs `446466a3k175`, `446466cfk36b`, `446466e5k33e`, and `4464670ck87e`, all with `providerInvoked=true`.
- Browser: MCP opened `/tools` and `/tools/history`; `/tools/history` visibly rendered `Target: example.com`, the request IDs, and the history table.
- Validation: focused diagnostics tests passed 3/3; backend build passed; frontend `npx pnpm@10 build` passed with the existing chunk-size warning.

## Task 20 - Safe Nmap Worker Implementation Attempt (2026-07-14)

- Summary: installed real Nmap 7.80 and implemented the safe worker path, but did not complete acceptance because PostgreSQL persistence became unreachable.
- Backend: added fixed-profile Nmap worker execution through `spawn` without shell concatenation, policy rejection for private/unsafe targets, XML parsing for host/address/port/service data, retry around `AuditLog` persistence, and `/api/diagnostics/nmap` routes.
- Frontend: `/tools/nmap` now has target/profile controls and Nmap history/result rendering for `workerInvoked`, profile, scan ID, host state, addresses, and ports.
- Safety: arbitrary flags, private targets without scope, URL/host:port/CIDR Nmap targets, and unsafe profiles are rejected. No exploit scripts or intrusive NSE profiles were added.
- Blocker: PostgreSQL service remained `Running` but stopped completing TCP connections; direct `pg` and Prisma calls timed out. Service restart/control was denied. Nmap scans against `scanme.nmap.org` reached the worker but could not persist, so `workerInvoked=true` acceptance is not claimed.
- Validation: backend build passed; frontend build passed with the existing chunk warning; focused diagnostics tests passed source/policy/parser cases and failed DB-persistence cases due the local PostgreSQL timeout.

## Task 19.2A - Runtime Repair and Full Audit (2026-07-14)

- Summary: repaired onboarding runtime state, Dashboard diagnostic routing, and optional Linux monitoring schema handling while keeping external diagnostics/Nmap unstarted.
- Onboarding: added explicit persisted states, recoverable failure states, preview and cancel APIs, and UI controls that separate answer save, connection test, platform detection, discovery, preview, and final save.
- Proof: focused backend regression exercises Cisco onboarding end to end with connector invocation, IOS-XE evidence, platform detection, preview readiness, stored Device creation, and final completed state.
- Dashboard/tools: quick actions now route to `/assets/devices/new`, `/tools/network-check`, `/tools`, and `/assets/devices`; non-executing tools routes are registered in the route table and Product State contract.
- Monitoring: missing optional observability tables now return `observability.state=not_configured` with one warning instead of repeated Prisma relation failures.
- Docs: added the requested Task 19.2A runtime baseline, failure trace, control/API matrices, acceptance matrices, and browser-results limitation files.
- Browser: connected Playwright MCP/current authenticated session was unavailable to this tool surface, so browser acceptance is explicitly not claimed and replay steps are recorded.

## Task 19.2-A - Visible Device Registration Entry Points (2026-07-14)

- Summary: restored obvious Add Device access without starting the diagnostics/Nmap milestones.
- Frontend: added Dashboard `ثبت دستگاه جدید` and quick action links; added vendor-specific onboarding labels for Cisco, FortiGate, MikroTik, and Linux; preserved the single onboarding engine at `/assets/devices/new` and vendor-prefilled `/assets/vendors/:vendorKey/devices/new`.
- Product State: advanced contract version to `19.2-A` and made `assets.device_onboarding_new` visible in generated Assets navigation because backend, API, route, UI, and tests are implemented.
- Tests: updated Product State/onboarding regressions to assert Add Device is visible and vendor CTAs are present.
- Browser: connected Playwright MCP tools were not exposed in this session. Local `npx playwright` with system Chrome/Edge reached only the unauthenticated login gate, so authenticated visual acceptance remains to be rerun with the connected MCP session.
- Validation/safety: Prisma validate, focused backend tests 9/9, backend build, frontend build, i18n/primary-copy, UTF-8, and diff check passed. No `.env`, credentials, connector execution, migration mutation, external diagnostics, or Nmap work occurred.

## Task 19.1 Runtime convergence follow-up - ActionPlan stale repair (2026-07-13)

- Summary: changed stale approved ActionPlans from a terminal HTTP 409 into automatic canonical revision regeneration and continued controlled execution on the newest revision.
- Backend: regenerates validation/preview/approval state, records revision history and convergence audits, and preserves the real connector/audit/result success boundary.
- Contracts: Assistant publishes one authoritative creation/manual/execution/lifecycle contract; Execute clients resolve the latest plan and include its revision.
- Tests: stale input now proves revision 2, approved/executing revision 2, completed state, no stale failure, exactly one connector invocation, and `connectorInvoked=true`; full backend suite passed 205/205.
- Browser: in the existing authenticated Playwright context, Persian Assistant created the port-546 plan, exact Action Center Execute returned HTTP 200, the Linux connector produced a verified-no-change result, the result route opened, and console errors remained zero.
- Validation/safety: Prisma validate, backend/frontend builds, catalog 137, i18n/primary-copy, UTF-8, and diff check passed. No secret, `.env`, migration, destructive database command, or unrelated mutation was accessed.

## Task 19.1 Milestone R-G - Global Control Audit and Playwright Acceptance (2026-07-13)

- Summary: audited all primary/direct routes and safe visible controls, completed global Persian/English and responsive acceptance, and documented the remaining live-target blockers.
- Frontend: disabled and explained unavailable global search/notifications; localized shell accessibility, Action Center fallback/topic, Assistant disabled-send, and monitoring preset copy through dictionaries.
- Tests: added the Persian primary-route copy/disabled-control guard to `npm run test:i18n`.
- Browser: 14 routes passed at 1440x900 FA, 1280x800 FA, 390x844 FA, 1440x900 EN, and 390x844 EN. Safe control clicks produced no failed API response or console error.
- Safety/blocker: no R-G device mutation, migration, credential access, or production integration call. New Linux/Cisco live onboarding remains blocked by missing explicit targets and credential references, so all five live flows are not claimed complete.
- Validation: Prisma validate/generate; backend build; serial backend 204/204; catalog 137; frontend build; i18n/primary-copy; UTF-8; diff check. Root lint retains pre-existing failures outside this slice.

## Task 19.1 Milestone R-F - Asset Workspace Analytics and Vendor Tabs (2026-07-13)

- Summary: completed the read-only device workspace with stored-data chart series, time ranges, and capability-gated vendor tabs.
- Backend: added health/connector/availability/resource/finding/action/change series and fixed related records to match either device or linked asset identity.
- Frontend: added responsive charts, 1h/6h/24h/7d/30d controls, recent-change annotations, honest no-data cards, and vendor capability tabs with reason/requirement/next action.
- Runtime: the Linux 30-day view shows recorded high findings and succeeded actions; absent health/resource history remains visibly empty. No data was synthesized.
- Browser: desktop/mobile Persian RTL and English LTR passed for workspace overview, time-range change, and CPU capability state without overflow or console errors.
- Validation: serial backend 204/204, focused R-F test, backend/frontend builds, Prisma validate, command catalog 137, i18n 73, UTF-8, and diff check passed. No connector, device, migration, or credential mutation occurred.

## Task 19.1 Milestone R-E - Action Center and Assistant UX (2026-07-13)

- Summary: localized the primary Action Center/Assistant workflows and made canonical revision, runtime resolution, verification, and structured recovery understandable in the normal UI.
- Action Center: localized headers, summaries, filters, table, states, risk, controls, and plan dialog; added explicit verified-no-change state; kept exact URL/selection; refreshed selected plan/audit immediately after connector success.
- Errors: removed raw backend URLs from user-facing action errors and retained structured stale recovery metadata and a review/new-revision recovery control.
- Assistant: localized target selection, refresh summary, clear chat, new request, send, Safety Boundary, and AI Provider in Persian/English.
- Browser: authenticated desktop/mobile Persian RTL and English LTR checks passed on Assistant and exact ActionPlan; one selected row, no page/dialog overflow, and zero console errors. No connector call was made in R-E.
- Validation: focused R-E tests 2/2, serial full backend suite 203/203, backend/frontend builds, Prisma validate/generate, i18n parity 73, UTF-8 guard, and diff check passed. Read-only migration status retained the known unapplied baseline.

## Task 19.1 Milestone R-D - Canonical Revision and Connector Repair (2026-07-13)

- Summary: repaired the backend-generated stale-plan failure by resolving and hashing one canonical runtime contract before preview, approval, and execution.
- Backend: added immutable revision/approval snapshots, structured genuine-stale conflicts, close-port catalog/template resolution, repeated-request reuse, and deterministic Assistant resolution without an external provider round trip.
- Connector: Linux close-port detects the active firewall adapter, inspects matching allow rules, performs only required removals, verifies effective state, and returns `verified_no_change` only after real connector invocation.
- Browser: the reviewed port-545 plan executed through Action Center and was then re-verified idempotently; stored evidence is revision 1, approved revision 1, status succeeded, UFW, outcome `verified_no_change`, and `connectorInvoked=true`. A repeated Persian Assistant request reused the same plan ID.
- Tests: added canonicalization, immutable revision, structured conflict, adapter parser, capability registration, and idempotent reuse regressions. Focused backend suite passed 19/19; serial full backend suite passed 201/201; catalog validation passed 137 items; frontend build, i18n 73, UTF-8, Prisma, and diff checks passed.
- Safety: no `.env` access, credentials, migration, destructive database command, raw AI shell execution, or unrelated mutation was introduced.

## Task 19.1 Milestone R-C - Exact Assistant-to-ActionPlan Navigation (2026-07-13)

- Summary: replaced DOM-only handoff with exact `/actions/:actionPlanId` routing durable across direct load, reload, selection, focus, close, and history.
- Backend: added structured `ACTION_PLAN_NOT_FOUND` 404 semantics for direct plan lookup.
- Frontend: unified exact-plan handoff across Assistant, Catalog, Daily Check, Linux Service Health, and Guided Actions; added status/revision details and missing-plan recovery.
- Tests/browser: added route/API regressions and verified desktop English plus 390px Persian RTL with no overflow or duplicate selected row.
- Safety: no action was executed; the stale plan has `connectorInvoked=false` and no success is claimed.
- Follow-up: R-D canonical resolution, immutable approved revision, stale repair, and repeated-request behavior.

## Milestone 19A - Full Audit and UI/Backend Synchronization (2026-07-13)

- Summary: audited the full requested browser/UI/API/backend surface, introduced Product State Contract `19A.1`, and made desktop/mobile primary navigation derive from verified backend state.
- State fixes: removed planned Settings, mock sync/integration children, unverified Cisco, and route aliases from primary navigation without deleting their honest direct/contextual routes.
- Backend: added product-state types, registry/validator, vendor/integration projections, and five read-only API endpoints.
- Frontend: replaced duplicated readiness/navigation flags with stable feature keys, consumed contract-generated navigation, added fail-closed navigation behavior, and added a Vite development proxy matching the deployed `/firewall-api` boundary.
- Docs: added browser baseline, feature gap register, UI/backend contract gap report, and Product State Contract; updated live project memory and structural maps.
- Tests: added four regressions for forbidden-state/readiness mismatches, navigation exclusions, cross-layer feature-key alignment, and API projection consistency.
- Browser: authenticated desktop 1440x900 and mobile 390x844 verification passed for all 16 requested routes in Persian RTL and English LTR; no console errors, failed requests, HTTP >=400 responses, or horizontal overflow were observed.
- Safety: no device mutation, migration mutation, credential access, connector execution, or later-milestone implementation occurred. The existing execution-success invariant remains unchanged.
- Validation: Prisma validate/generate, backend build, backend tests 190/190, catalog validation 136 items, frontend build, i18n 73 keys, UTF-8 guard, and diff check passed. Root lint retained the known pre-existing 66 errors/4 warnings; `docs:check` retained the pre-existing exact-heading mismatch.
- Commit: separate Milestone 19A commit.

## Task 18.2 Safe Autonomous H1-H6 (2026-07-13)

- Summary: executed safe autonomous hardening from `TASK_18_2_SAFE_AUTONOMOUS_MODE.txt` without restarting completed 18.1/18.2A work and without touching credentials or destructive database paths.
- H1/H2: completed browser and Prisma baseline analysis. Migration recovery is blocked because a verified nonzero backup could not be produced; no migration-history writes were run.
- H3: hardened vendor/navigation UX and committed `b84891e`.
- H4: hardened mock integration UX and committed `aabf035`.
- H5: improved dashboard/Linux observability UX and committed `87ceb22`.
- H6: polished Persian/RTL asset labels and updated live project memory docs. Safety semantics remain unchanged.
- Playwright MCP: checked dashboard, assets, sync, vendor, Cisco, Linux monitoring, and integration routes on desktop/mobile with no visible mojibake, replacement character, fake mock apply button, dead controls, or horizontal overflow on the verified surfaces.
- Validation: Prisma validate/generate, backend build, command catalog validation, frontend build, i18n parity, UTF-8 guard, and whitespace check passed. Migration status remains blocked by baseline recovery; root lint still has pre-existing lint debt.

## Encoding Repair - Persian UTF-8/Mojibake Guard (2026-07-12)

- Summary: repaired Persian mojibake introduced by trusting legacy PowerShell-rendered output and added a permanent validation guard.
- Areas: app route/sidebar labels, shell search/language text, backend Persian auth response, AI duration aliases, Persian command catalog product documentation, `.editorconfig`, and UTF-8/mojibake validation script.
- Validation: `npm run test:utf8`; `npm run test:i18n`; backend `npm run build`; backend `npm test` passed 186/186; root `npx pnpm@10 build` passed with the existing Vite large-chunk warning; `git diff --check` passed with line-ending warnings only; Playwright MCP desktop/mobile encoding verification passed.
- Commit: separate encoding repair commit.
## Task 18.2A - Cisco IOS-XE Read-only Foundation and Linux Observability (2026-07-12)

- Summary: implemented Milestone 18.2A only: vendor/platform/capability framework, Cisco IOS-XE read-only foundation, parser fixtures, capability APIs/UI, Linux health metrics schema/APIs/UI, migration, tests, docs, and MCP browser evidence.
- Backend: added vendor registries, Cisco platform detection, Cisco IOS-XE parser/template/connector foundation, capability discovery/cache APIs, Linux health parser/scorer/collector/service/routes, and migration `20260712192000_task18_2a_vendor_linux_observability`.
- Frontend: added Cisco vendor capability pages and Linux health pages under the Milestone 18.1 app shell without replacing existing execution routes.
- Safety: Cisco mutations are planned/non-executable only; no arbitrary AI CLI, no `.env` access, no secret exposure, and no success semantics without connector invocation.
- Docs/browser: added Task 18.2 discovery, baseline, final browser results, Cisco source/architecture/capability/lab docs, vendor framework docs, Linux observability docs, and desktop/mobile MCP screenshots under `docs/evidence/task-18-2/`.
- Validation: `npx prisma validate`; `npx prisma generate`; backend `npm run build`; backend `npm test` passed 186/186; backend `npm run validate:command-catalog` passed 136 items; root `npm run test:i18n` passed 73 keys; root `npx pnpm@10 build` passed with the existing Vite large-chunk warning.
- Playwright MCP: authenticated desktop/mobile verification passed for dashboard, assets, devices, monitoring, Linux monitoring, actions, assistant, integrations, and Cisco vendor routes; no console/network errors or horizontal overflow remained.
- Commit: pending.

## Task 19.1 Milestone R-A - Runtime Failure Reproduction (2026-07-13)

- Summary: used a new authenticated Playwright MCP context to reproduce the Task 19.1 blockers from the current committed state and recorded the required runtime, broken-control, and API failure registers.
- Routes: `/dashboard`, `/assets`, `/assets/devices`, `/assets/vendors`, `/assets/vendors/cisco`, `/assistant`, `/actions`, `/monitoring`, `/monitoring/linux`, `/security/findings`, `/security/rules`, `/integrations`, and `/settings`.
- Critical evidence: the controlled port-545 ActionPlan request returned 409 `COMMAND_PLAN_STALE`; plan status stayed `dry_run_ready`, and `connectorInvoked=false`.
- Repeated request evidence: Assistant returned `canCreateActionPlan=true` and manual-only at the same time, so no second ActionPlan was created.
- Other evidence: onboarding is unrouted, Cisco setup loops to a list without registration, Assistant cannot route to an exact plan, proposal JSON/API URLs leak into normal UI, and Persian surfaces use `lang=en dir=ltr` with extensive English copy.
- Safety: no `.env`, credential, migration, destructive database command, device mutation, or successful connector execution.
- Files: `docs/TASK_19_1_RUNTIME_BASELINE.md`, `docs/TASK_19_1_BROKEN_CONTROL_REGISTER.md`, `docs/TASK_19_1_API_FAILURE_REGISTER.md`, and project memory/handoff updates.
- Validation: `git diff --check` and `npm run test:utf8` passed. The repository has no `test:memory` script. R-A is committed separately before R-B starts.

## Task 19.1 Milestone R-B - Device Onboarding and Workspace Foundation (2026-07-13)

- Summary: restored backend-backed device onboarding, Product State route visibility, vendor/Cisco registration entry points, and the dedicated device workspace foundation.
- Backend: added ephemeral versioned onboarding sessions, answers/test/detect/discover/commit routes, credential-reference-only validation, live bounded Cisco read-only SSH probing, and a structured workspace aggregation API.
- Frontend: added one reusable onboarding page for all required routes, safe encrypted Credential creation via the existing API, vendor-prefilled entry points, and workspace tabs for overview/health/inventory/capabilities/findings/actions/history/configuration.
- Database safety: no migration or destructive operation. Optional Task 18.2 tables are detected and missing sections degrade instead of returning 500.
- Cisco safety: no target/credential was supplied, so no live success or device creation is claimed. Cisco mutation remains disabled.
- Product State: advanced to `19B.1`; onboarding/workspace features are implemented but contextual, not extra primary-navigation noise.
- Browser: desktop and mobile 390px routes passed with visible CTAs, correct prefill, no overflow, and no HTTP failure.
- Validation: `npx prisma validate`; backend build; full backend tests including Task 19.1 regressions; catalog 136; frontend build; i18n 73; UTF-8; diff check.
- Commit: separate R-B commit pending at the time of this entry.

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
## Database/Auth Runtime Repair (2026-07-14)

- Summary: fixed the normal backend dev runtime database mismatch that caused Prisma `ConnectionClosed`/timeout behavior during auth bootstrap and made the login UI report an unreachable auth server.
- Root cause: dotenv-backed normal runtime resolved the old local PostgreSQL target instead of the reachable local service/database. Prisma config and app env now share the same resolver.
- Areas: `backend/src/config/database-url.ts`, `backend/src/config/env.ts`, `backend/prisma.config.ts`, handoff/status docs.
- Evidence: normal `cd backend && npm run dev` stayed running; `/api/health/ready` returned 200 ten times; direct `prisma.appUser.count()` succeeded; Playwright MCP opened the authenticated Dashboard and saw auth/assets/security/monitoring/product-state API calls return 200 with zero current console errors.
- Validation: `cd backend && npx prisma validate`; `cd backend && npx prisma generate`; `cd backend && npm run build`; backend test matrix passed 209/209 with `npx tsx --test --test-concurrency=1 ...`; `npx pnpm@10 build` passed with the existing chunk-size warning.
- Commit: pending.

## Runtime Auth/CORS Follow-up (2026-07-14)

- Summary: stopped duplicate backend dev processes, verified the normal PrismaPgAdapter/pg Pool connection source, and fixed browser authentication for the active frontend port.
- Root cause: the database source now resolves correctly, but the active frontend was running on 5174 while backend CORS defaults only allowed 5173, so MCP/browser auth calls were blocked from the dashboard. Duplicate/hot-restarted backend processes also produced misleading transient timeout symptoms during probing.
- Areas: `backend/src/config/env.ts`, handoff/status docs.
- Evidence: one normal backend dev process; `/api/health/ready` 200 ten times; `prisma.appUser.count()` succeeded; `/api/auth/login` returned 200; Playwright MCP opened `http://localhost:5174/dashboard` and saw auth/assets/security/monitoring/product-state API calls all 200 with zero current console errors.
- Commit: pending.

## Database Runtime Port Correction (2026-07-14)

- Summary: corrected normal backend database resolution for Windows PostgreSQL on `127.0.0.1:5432` without Docker, temporary shell overrides, migrations, seeds, db push, reset, or destructive SQL.
- Root cause: `backend/src/config/database-url.ts` still had stale temporary-runtime normalization that rewrote local `firewall_log_analyzer` to `firewall_log_auth` and forced port `55432`; on the real Windows PostgreSQL listener this produced Prisma `P1003` because the rewritten database did not exist there.
- Areas: `backend/src/config/database-url.ts`, handoff/status docs.
- Evidence: shared resolver reports `127.0.0.1:5432/firewall_log_analyzer`; normal `cd backend && npm run dev` starts one backend app process on port 4000; `/api/health/ready` returned 200; `/api/auth/login` returned 200; `/api/auth/me` returned 200; `/api/assets` returned 200 with 7 assets; `/api/credentials` returned 200 with 4 credential references.
- Validation: `cd backend && npm run build` passed.
- Limitation: Playwright MCP dashboard verification could not be completed because the Playwright MCP tools were not exposed in this turn after targeted discovery.

## Device Onboarding Final Repair (2026-07-15)

- Root cause: the onboarding UI exposed unsupported API choices, sessions were memory-only, credential-decrypt failures were not safely classified, and verified persistence crossed multiple non-atomic writes.
- Implemented honest unverified registration, persisted sessions, SSH-only verified onboarding, sanitized recovery states, and one atomic verified persistence transaction.
- Closed internal-router reloads, default full-suite discovery/serialization, onboarding lifecycle/rollback tests, and source/migration BOM enforcement.
- Authenticated Playwright acceptance passed and its single created Device/Asset pair was cleaned up without changing historical protected counts.
- Commits: `57ad699`, `17f264a`, `6e1c26e` (Phase 4; amended hash reported in final handoff if changed).

## Device Workspace / Action Center Repair - Phase 1 (2026-07-15)

- Implemented the four required Device verification endpoints and device-scoped orchestration over the persisted onboarding session engine.
- Added concurrency protection, persisted attempt-start evidence, sanitized status/history projection, and focused backend contract coverage.
- Validation: backend build passed; onboarding final repair tests 8/8 passed; new verification tests passed. No migration, dump operation, or protected-record write was performed.

## Device Workspace / Action Center Repair - Phase 2 (2026-07-15)

- Added the Device Workspace verification client contract, localized control panel, credential reference selector, session step controls, sanitized error display, and persisted history.
- Validation: frontend build, locale parity, Persian primary-route copy, UTF-8 guard, diff check, and authenticated Playwright at 1366x768 passed.

## Device Workspace / Action Center Repair - Phase 3 (2026-07-15)

- Added the backend Action Center projection, lifecycle normalization, fail-closed success evidence rule, filtered summaries, sanitized detail payload, guarded cancellation, and retry-as-new-plan behavior.
- Validation: backend build; Action Center contract tests 3/3; existing Action Center UX/source tests 3/3; authenticated browser GET returned 200 with the full 124-plan summary. No existing ActionPlan was mutated.

## Device Workspace / Action Center Repair - Phase 4 (2026-07-15)

- Added a responsive Action Center client/workspace and moved ActionPlan creation to an accessible top-level catalog panel.
- Preserved React Router deep links and connected every required control to an existing safe workflow or the new Action Center contract.
- Validation: frontend build, locale parity, Persian copy, UTF-8 guard, diff check, and authenticated Playwright layout/control/deep-link checks passed.

## Device Workspace / Action Center Repair - Final Acceptance (2026-07-15)

- Reproduced and repaired the Device Workspace verification gap and the clipped, non-lifecycle Action Center in four separately committed phases.
- Proved truthful device behavior with two real Cisco SSH connector attempts: both timed out, both recorded `connectorInvoked=true`, neither promoted the Device to verified, and the persisted history survived backend restart.
- Proved successful execution with a temporary read-only Linux ActionPlan through preview, confirmation, connector execution, evidence, and result inspection. The succeeded result had `connectorInvoked=true`; the exact tagged plan was deleted afterward, restoring ActionPlan count to 124.
- Verified Action Center all/pending/history/detail/not-found routes, unsupported-action fail-closed behavior, complete controls, RTL/LTR, and responsive 1366x768, 1440x900, and 1920x1080 layouts with authenticated Playwright.
- Validation: backend build; backend tests 236/236; final repair contract 3/3; frontend build; locale parity 97 keys; Persian copy; UTF-8 450 files; Prisma schema current; dry-run Device/Asset audit `changed=0`; `git diff --check`.
- Preservation: Device 4, Asset 7, DeviceCredential 4, Finding 5, ActionPlan 124. No migration was created or required.
- Honest blocker: the configured Cisco host `192.168.7.12` does not answer SSH before timeout, so live successful Cisco verification remains unavailable despite proven connector invocation and recovery behavior.
## 2026-07-15 - Urgent Action Center operator flow

- Replaced immediate one-click creation/execution with preview then explicit confirmation over the real quick-execute endpoint.
- Added primary New Action and lifecycle-specific Confirm and Execute, Retry, and Run again controls.
- Promoted connector evidence and stdout/stderr to the visible result surface while retaining raw payloads under Advanced Details.
- Extended retry-as-new-plan to succeeded records without altering completed history.
## 2026-07-15 - Action detail null-payload regression

- Reproduced `connectorResult: null` on existing planned ActionPlan `cmrlyhzyg001sqklvahjmseq2` and traced the crash to `ActionCenterWorkspace` reading `.stdout` on null.
- Added Action Center response normalization for legacy/null JSON, lifecycle, device, support, controls, connector evidence, and audit fields.
- Authenticated Playwright read-only acceptance covered planned, failed, and succeeded records plus New Action visibility and responsive overflow.
## 2026-07-15 - Assistant to executable Action Center flow

- Root cause: backend projected `canPreview=true` for proposed Assistant plans, but the new Action Center rendered no Preview control for selected historical/deep-linked plans.
- Added top-level selected-action controls and wired preview to the existing quick-execute preview intent.
- Browser-proved Assistant -> Action Center -> Preview -> Confirm and Execute -> succeeded Linux connector result; temporary records were removed afterward.
## 2026-07-15 - User-friendly Action result navigation

- Connected the operator-first Action Center Confirm/Execute control to the existing deep-linkable result page.
- Preserved the real quick-execute backend call, ActionPlan history, execution safety checks, and connector-evidence success invariant.
- Proved the navigation in authenticated Playwright with a real Linux connector execution, then deleted only the temporary acceptance ActionPlan.
## 2026-07-15 - Repair Action Center history execution dead end

- Reproduced the screenshot behavior and connected history selection to the top review card through focus/scroll handling.
- Added lifecycle-specific history CTA copy and repaired duplicate result-row React keys.
- Proved the full Persian AI-created action flow in authenticated Chrome, including real Linux execution, result-route navigation, connector evidence, and cleanup.
## 2026-07-15 - Complete Asset Sync feature repair

- Rebuilt the three-card Asset Sync surface with visible progress, sanitized errors, preview rows, confirmation, idempotent mock apply, and structured results.
- Preserved the product-state truth boundary: NetBox/Wazuh are working mock workflows, not falsely advertised production integrations; Device sync is a real internal reconciliation.
- Verified focused backend integration behavior and all three cards in authenticated Chrome at 1366x768 without console errors or overflow.
## 2026-07-15 - Simplify device/vendor and ActionPlan management

- Linked vendor cells to vendor overview pages and added device edit/delete controls to the primary workspace.
- Added the admin-only confirmed ActionPlan terminal-history deletion endpoint and UI while retaining non-terminal actions.
- Verified real temporary-device create/edit/delete through backend APIs and all non-destructive UI confirmations in authenticated Chrome.

## 2026-07-18 - Simplify inventory, onboarding, Cisco compatibility, and action execution

- Root causes: Device deletion left Asset-backed equipment visible; onboarding mixed operator fields with connector internals; Cisco compatibility needed a scoped legacy retry path; action execution still had legacy popup/direct-list paths.
- Implemented archive-from-inventory behavior, duplicate prevention, simplified onboarding/list/overview UI, modern-first Cisco legacy retry with explicit approval, and a focused Action Center review/confirm/result flow.
- Validation: Prisma schema validation, backend build, command catalog validation, frontend build, locale parity checks, UTF-8 guard, diff check, and focused Cisco/non-database tests where possible.
- Skipped database-bound tests that require an isolated TEST_DATABASE_URL; no destructive database command or migration execution was run.
## 2026-07-18 - Real dashboard activity and Cisco operation registry

- Root causes: the dashboard activity surface was placeholder text rather than an operational projection; Cisco execution was hard-coded around one show-version action and the older Cisco action catalog was empty.
- Added a dashboard activity service/route and frontend dashboard feed for executions, successful/failed actions, pending approvals, device registrations, and configuration changes.
- Added a Cisco operation registry, generated command/action catalog entries, expanded read-only IOS-XE command templates, and updated planner/connector execution to select operations by catalog metadata through Action Center.
- Planned Cisco configuration/admin areas were registered as non-executable roadmap definitions only; no weak SSH algorithms, raw commands, migrations, or destructive database operations were added.
- Validation: Prisma schema validation, command catalog validation, backend build, frontend build, i18n, UTF-8, diff check, and Cisco fixture tests passed; DB-bound catalog/support tests stopped at TEST_DATABASE_URL_REQUIRED.
## 2026-07-19 - Cisco legacy onboarding and idempotent registration repair

- Fixed Cisco onboarding so the explicit per-session legacy compatibility option reaches the existing ssh2 connector as append-only legacy algorithms, while modern SSH remains the default and authentication failures do not trigger a legacy retry.
- Test Connection now persists truthful connector invocation and sanitized diagnostics, including connectorInvoked, legacyCompatibilityRequested, legacyCompatibilityApplied, connectionPhase, and structured Cisco error codes.
- Successful Cisco SSH now opens an interactive shell, disables paging, runs show version, detects IOS-XE, IOS Classic, NX-OS, and ASA separately from automation support, and lets unsupported-but-connected platforms proceed to unverified review.
- Device registration now normalizes management IPs and transactionally reuses/reactivates matching Device/Asset records, preserving history. True unrelated ownership returns DEVICE_MANAGEMENT_IP_CONFLICT for the UI conflict actions.
- Validation in progress includes backend build, frontend build/typecheck, Cisco ssh2 fixture tests, onboarding boundary tests, i18n, UTF-8, workflow, and diff checks. No secrets or .env values were printed or changed.

## 2026-07-19 - AI Assistant vendor context loss regression

- Root cause: deterministic Assistant resolution received selected device/vendor data inconsistently and fell back to prompt/catalog inference, so non-Cisco selected targets could resolve as `unknown` or custom proposals.
- Implemented a shared target-context resolver path that receives selected device vendor/platform/capabilities/supported actions/device id and matches only the selected device's supported action catalog.
- Restored ActionPlan creation for supported executable target actions while keeping unsupported/custom/unmatched prompts inside Assistant chat.
- Added regression coverage for MikroTik SSH port change, Cisco VLAN creation, FortiGate policy creation, Linux supported service status, unknown/custom chat-only behavior, and cross-vendor prompt text not overriding selected device context.
- Validation: backend build, command catalog validation, targeted backend tests, frontend build, i18n, UTF-8, workflow, and diff check passed. Full backend suite was attempted and failed because the local isolated test database `firewall_log_analyzer_test` does not exist.

## 2026-07-19 - AI Assistant custom ActionPlan fallback

- Root cause: the guided-routing repair intentionally blocked unmatched/custom prompts, but the product now needs selected-device operational custom requests to become reviewable ActionPlans for every vendor.
- Implemented a shared, vendor-agnostic fallback in the chat service after catalog resolution: if a selected-device request is operational, has no executable catalog/support match, and has no missing fields, create a `custom_vendor_action` ActionPlan.
- Preserved the safety boundary by making fallback plans manual review only: no connector, no execution template, no preview/execution flags, no Guided Action session, and `executable=false`.
- Kept informational/status prompts chat-only and kept supported MikroTik/Cisco/FortiGate/Linux catalog actions on the existing executable ActionPlan path.
- Added regression coverage that the chat service creates review-only custom ActionPlans while the resolver still avoids fake executable catalog matches.
- Validation: backend build, targeted AI routing/context tests, frontend build, i18n, UTF-8, workflow, and diff check passed. Full backend suite was attempted with an isolated test URL but failed because `firewall_log_analyzer_test` is not present and several older unrelated source-contract tests fail.

## 2026-07-19 - AI Assistant selected-vendor ActionPlan coverage follow-up

- Root cause: the previous fallback still depended on a short operational-verb list and only covered the chat service, so selected-device overview prompts and `/commands/ai-propose` could still return the old "not ready" shape.
- Added a resolver-level default read-only target action for selected-device overview/status/health requests. It picks only read-only supported actions with connector and execution-template metadata from the selected device's supported action list.
- Broadened chat fallback matching to device planning signals such as router/device/status/health/about, so device-scoped unmatched requests create a review-only `custom_vendor_action` ActionPlan.
- Added the same review-only custom ActionPlan creation to `/api/commands/ai-propose` after executable catalog matching fails.
- Preserved controlled execution: custom AI proposals are Action Center records for review, but cannot preview/execute until a verified backend template/connector contract exists. Existing supported vendor actions still execute through the normal ActionPlan, PolicyGuard, connector, and audit path.
- Added regression coverage for MikroTik overview -> `mikrotik_daily_check`, selected-device default read-only mapping, and command-catalog custom ActionPlan fallback.
- Validation: backend build, command catalog validation, targeted AI routing/context tests, frontend build, i18n, UTF-8, workflow, and diff check passed. Full backend suite was attempted and failed only in the known environment/unrelated areas: 235/301 passed, 66 failed because the isolated test database is absent plus older source-contract tests.

## 2026-07-19 - AI Assistant arbitrary selected-device ActionPlans

- Root cause: the widened fallback was still gated by prompt wording. A selected device was present, but arbitrary Persian text without the expected signal terms bypassed review-only ActionPlan creation.
- Removed the prompt-text signal gate from chat fallback. After selected-device catalog matching fails, the Assistant now creates a review-only `custom_vendor_action` ActionPlan for the selected vendor as long as resolver-required fields are complete.
- Kept the execution boundary intact: fallback plans have no connector, no execution template, no Guided Action session, and cannot be previewed/executed as raw AI output. Supported catalog matches still use the existing ActionPlan, approval, PolicyGuard, connector, and audit pipeline.
- Added regression coverage for the screenshot-style MikroTik prompt `کار هامو نشون بده` and updated source-contract coverage for unconditional selected-device fallback.
- Validation: targeted AI routing/context tests (24/24), backend build, command catalog validation (191 items), frontend build, i18n, UTF-8, workflow, and diff check passed.
- Full backend `npm test` was attempted and stopped at `TEST_DATABASE_URL_REQUIRED`; the project safety guard prevented using the local development database.

## 2026-07-19 - AI Assistant read-only/mutating catalog routing

- Root cause: target-catalog scoring did not separate read-only questions from mutating requests. A Cisco VLAN count/list question could be interpreted as the multi-step `create-vlan` operation, and a cross-vendor "create" phrase could score unrelated mutating actions on the selected target.
- Added read-only/mutating intent gates in the shared resolver, removed generic verbs from action-token scoring, required domain/title/alias evidence, and normalized Persian VLAN spellings to the same `vlan` token.
- Added regression coverage for Cisco `چند تا vlan دارم` and `چن تا ویلن دارم`, both resolving to `cisco.show-vlan-brief`, plus the existing Cisco create VLAN and MikroTik cross-vendor safeguards.
- Updated Action Center presentation so metadata-backed Cisco operation titles are shown instead of the generic wrapper action type.
- Validation: targeted AI routing/context tests (27/27), backend build, command catalog validation (191 items), frontend build, i18n, UTF-8, workflow, and diff check passed. Full backend `npm test` stopped at `TEST_DATABASE_URL_REQUIRED`.

## 2026-07-19 - AI Assistant custom ActionPlan proposal scoring repair

- Root cause: after the custom ActionPlan fallback was added, target-catalog scoring could still treat weak overlap as a supported action match. Cisco generic wrappers were especially vulnerable because `generic_security_action` leaked `security` into match evidence.
- Fixed the shared resolver to normalize separators in action ids/types, ignore generic wrapper action types as evidence, require exact phrase evidence or stronger lexical evidence, and keep selected-device scoped supported actions as the only match source.
- Added regression tests for three unprepared prompts each on Cisco, MikroTik, FortiGate, and Linux; all must stay custom/manual with `catalogCommandId=null`.
- Enriched chat-created custom ActionPlans with AI proposal details in parameters and metadata while preserving the existing Action Center, approval, PolicyGuard, connector, and audit pipeline.
- Validation: targeted AI routing/context tests (31/31), backend build, command catalog validation, frontend build, i18n, UTF-8, and workflow checks passed. Full backend suite still requires an existing isolated test database.
## 2026-09-16 - Persian public landing page

- Built a new Persian-first landing page from the supplied visual reference using the project color system and code-native React/CSS visuals.
- Added responsive Header, Hero, Features, secure workflow, ecosystem/collaborators, CTA, and Footer sections.
- Added smooth IntersectionObserver-based scroll reveals, ambient motion, mobile navigation, and reduced-motion support.
- Changed only the root route to be public; all operational application routes still require authentication.
- Preserved controlled Mini-SOAR execution semantics and described the actual ActionPlan, preview, confirmation, PolicyGuard, connector, audit, and result flow.
- Validation: TypeScript/Vite production build passed in an ephemeral Node 22 container; UTF-8 guard passed (551 files); git diff check passed.
## 2026-09-16 - Export transferable frontend Docker image

- Fixed the frontend multi-stage Docker build ordering for the local SSH plugin dependency.
- Added pnpm 12 build-script allowlisting for only `@swc/core` and `esbuild` and pinned pnpm 12.4.2 in the container build.
- Built and smoke-tested `firewall-log-analyzer-web:2026.09.16-landing` for linux/amd64; `/firewall/` returned HTTP 200 with the React app root.
- Saved the 20.27 MiB image archive to the user's Desktop with SHA-256 `FBC6F590760FF639E55E61AF85E3262C566BEE41DC96C05765C64212DA7E36F4`.
