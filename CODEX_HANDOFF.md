# CODEX_HANDOFF.md

## Device onboarding required-name UX repair (2026-07-18)

- Reproduced the reported `/answers` 400 against persisted Session `0a491d1a-d131-49e9-8cf9-15a603cc99cb`: the selected Credential existed, but the submitted device name was empty. The visible `edge-switch-01` text was only a placeholder, and the backend correctly returned `Device name is required.`
- Required device identity fields are now explicitly marked. The name placeholder says `مثال`, empty/invalid values are blocked before the request, the exact Persian validation appears inside the connection form, and focus/scroll moves to the invalid control.
- The server-side validation and controlled connector flow are unchanged. Focused onboarding tests passed 9/9; backend and frontend builds passed. Browser automation was not exposed in this session, so no click-level browser proof is claimed.

## Direct device/vendor management and ActionPlan history cleanup (2026-07-15)

- Vendor names in the equipment table now link directly to a vendor overview; equipment names already open the device workspace, which now exposes visible Edit and Delete controls.
- Device edit supports name, management host/port, protocol, environment, and tags. Delete requires typing the exact device name and preserves historical ActionPlans with their device link unset by the existing database relation.
- ActionPlan history now has an admin-only `Clear history` workflow with explicit confirmation. It deletes only terminal succeeded/failed/cancelled/rolled-back plans and their dependent audit/approvals; pending and executing plans are retained.
- Authenticated Chrome proved vendor/device navigation, edit/delete dialogs, and history-clear confirmation without mutating protected records. A separate temporary-device API test proved real create -> edit -> delete and cleaned the temporary record.

## Asset Sync usability and runtime repair (2026-07-15)

- Replaced the screenshot-reproduced dead-end status message with a complete structured workflow for NetBox mock data, Wazuh mock data, and real internal Device-to-Asset reconciliation.
- NetBox/Wazuh now support Preview -> visible create/update rows -> explicit mock-data confirmation -> idempotent mock apply. They remain honestly labeled Mock and never claim a production external connection.
- Device sync now shows scanned, created, and updated counts instead of discarding the API response. Failures are sanitized and visible; loading disables duplicate submissions.
- Focused backend integration tests proved preview/apply/idempotency, and authenticated Chrome at 1366x768 proved both previews, confirmation/cancel, Device sync, structured result, zero console errors, and zero horizontal overflow.

## Action history execution discoverability repair (2026-07-15)

- Fixed the screenshot-reproduced dead end where history-row `Open` changed the deep link but left the operator scrolled below all execution controls. Selecting an ActionPlan now scrolls and focuses the visible review card.
- History actions now use lifecycle-aware labels (`Review and preview`, `Review and execute`, `Review and retry`, `View result`) and executable pending rows receive primary-button emphasis.
- Fixed duplicate React keys in structured result rows, which surfaced as console errors for repeated Linux port evidence.
- Authenticated Playwright proved the requested Persian flow end-to-end: AI Assistant created Linux open-ports ActionPlan -> `رفتن به مرکز عملیات` -> review card in viewport -> preview -> confirm/execute -> dedicated result page with real connector output and `connectorInvoked=true`. No console errors remained, and temporary plans/sessions were deleted.

## Dedicated Action result handoff (2026-07-15)

- Action Center now navigates to `/actions/:actionId/result` immediately after a confirmed real execution, including connector-backed failures so operators can see an actionable result instead of remaining in the approval workspace.
- The existing result page remains the single deep-linkable result surface and preserves the fail-closed `connectorInvoked=true` success rule.
- Authenticated Playwright proved Linux open-ports Preview -> Confirm and Execute -> dedicated result route with real connector output and `connectorInvoked=true`; the temporary ActionPlan was deleted after acceptance.

## Assistant to Action Center approval repair (2026-07-15)

- Fixed the unusable assistant handoff: proposed executable ActionPlans now expose a visible top-of-page `Generate Preview` control in Action Center, followed by `Confirm and Execute` after preview.
- Added a prominent selected-action handoff card above connection/history content, so operators arriving from the Assistant deep link do not need to search or scroll for approval controls.
- Authenticated Playwright proved the full Persian flow: select registered Linux device in Assistant, request `وضعیت پورت های باز رو نشون بده`, click `رفتن به مرکز عملیات`, click `ساخت پیش‌نمایش`, then `تأیید و اجرا`.
- Real quick-execute returned 200, lifecycle `succeeded`, `connectorInvoked=true`, exit code 0, and live `ss/netstat` stdout. No error boundary or horizontal overflow occurred.
- All temporary acceptance ActionPlans and AI chat sessions were deleted precisely; ActionPlan count returned to 136.

## Action detail null-payload runtime regression (2026-07-15)

- Root cause: historical/planned ActionPlan `cmrlyhzyg001sqklvahjmseq2` returned HTTP 200 with `connectorResult: null` and `approval: null`; `ActionCenterWorkspace` directly read `selected.connectorResult.stdout`, causing the route error boundary.
- Added a backward-compatible client normalization boundary for nullable, missing, legacy, and JSON-string ActionPlan fields. Lifecycle/status projection remains fail-closed for succeeded records without `connectorInvoked=true`.
- Authenticated local Playwright at 1366x768 proved the exact deep link, an existing failed record, an existing succeeded record, and the planned record render without the error boundary; Retry, Run again, and Confirm and Execute are visible; no horizontal overflow or post-login console errors occurred.
- Read-only network proof returned 200 for Action Center detail/list, devices, credentials, catalog search, device verification, and evidence embedded in Action Center detail. No ActionPlan mutation endpoint was called.
- Full-suite and commit remain gated until final validation; no migration, reset, seed, ActionPlan execution, preview, retry mutation, or database maintenance was performed.

## Urgent Action Center execution-path correction (2026-07-15)

- Added a visible primary `New Action` entry point and changed new actions to an explicit two-step flow: required device/credential/action/parameters -> `Generate Preview` -> visible `Confirm and Execute` through the existing `/api/actions/:id/quick-execute` route.
- Added visible lifecycle controls: planned previews offer `Confirm and Execute`, failures offer `Retry`, and completed read-only history offers `Run again`; retry/rerun always creates a new ActionPlan and never mutates the historical record.
- The main result surface now shows final status, `connectorInvoked`, stdout, stderr, and evidence. Unsupported actions show their support reason. Raw JSON remains collapsed under `Advanced Details`.
- Success projection remains fail-closed unless `connectorInvoked=true`; no execution policy, connector, credential-secret, migration, or protected lab behavior changed.
- Focused backend Action Center contract tests, backend build, frontend build, i18n/UTF-8 checks, and diff checks passed. Playwright navigation tooling is not exposed in this turn, so authenticated browser/vendor acceptance is not claimed here.

## Operator-first Action Center repair (2026-07-15)

- Replaced the lifecycle-table-first Action Center with a direct operator workflow: select Device, saved Credential Reference, and executable catalog action, then Execute. `Execute immediately` is the default; `Preview only` remains an explicit optional mode.
- Added the top Connection card with connector-backed Test Connection, Refresh Status, Retry, Last Success, Last Failure, connector state/type, SSH reachability, authentication status, green Connected state, and exact sanitized connector errors.
- Raw command/validation/result/audit JSON is no longer exposed on the main surface; it is retained under a closed native `Advanced Details` disclosure. ActionPlan history and all existing Action Center APIs/routes remain available in a secondary disclosure.
- Immediate execution still preserves the controlled architecture: the UI creates the ActionPlan, posts `intent=execute` to `/api/actions/:id/quick-execute`, runs PolicyGuard, and accepts success only with `connectorInvoked=true`. Preview posts `intent=preview` and leaves `connectorInvoked=false`.
- Added one verified read-only Cisco path for `cisco.show-version`, backed by the existing IOS-XE SSH connector and fixed `show version` command ID. Generic actions now converge only within the same normalized vendor, preventing Cisco support from promoting Linux manual actions.
- Fixed three runtime truth defects exposed by browser acceptance: `Linux Edge` vendor aliases now normalize correctly, failed connector executions persist `connectorInvoked=true` in result evidence, and successful connection attempts populate Last Success before a full onboarding commit.
- Authenticated Playwright proof: Linux service status and Linux daily check succeeded through real quick-execute requests; FortiGate VPN succeeded; FortiGate HA/VDOM/zone invoked the connector but FortiOS rejected `show system vdom`; Cisco show version invoked the connector but the configured target timed out. Both failures retain `connectorInvoked=true` and render the exact error. Preview-only produced a ready command plan without connector invocation.
- Browser UX proof passed in English LTR and Persian RTL at 1440px desktop and 390px mobile with zero horizontal overflow. Execute is checked by default; Advanced Details is closed and raw JSON is not visible; direct history links restore the target Device/Credential context.
- Validation passed: backend build, command catalog validation (138), full backend suite (237/237), frontend build, locale parity, Persian primary-copy guard, UTF-8 scan, `git diff --check`, authenticated Playwright, Prisma migration status, and dry-run Device/Asset reconciliation (`changed=0`). No migration is required.
- Protected records remain Device 4, Asset 7, DeviceCredential 4, and Finding 5. ActionPlan count moved from the current-task browser baseline 126 to 133 because the seven requested acceptance operations/previews were intentionally retained as audit history; no existing ActionPlan was deleted or rewritten.
- Remaining live-target results are honest: the FortiGate appliance does not accept `show system vdom` in its current CLI context, and the configured Cisco target is unreachable over SSH. UI/backend/connector invocation and error handling are verified; successful device output is not claimed for those two paths.

## Master Repair Phase 2 - Router convergence (2026-07-14)

- Replaced the manual pathname matcher with `react-router-dom` `BrowserRouter`, `Routes`, `Route`, `Navigate`, `Link`, `useNavigate`, and `useParams`.
- Unknown authenticated routes now render a real 404 with `data-page-id="not-found"`; Dashboard is no longer the fallback.
- All 53 feature routes expose their feature key as `data-page-id`; ActionPlan result and guided-session deep links remain explicit.
- Removed direct `history.pushState`, pathname assignment, reload navigation, and manual popstate handling from frontend navigation paths.
- Route/Product State parity now asserts exactly 53 unique keys and exact key-to-route equality.
- Playwright authenticated proof: unknown route rendered 404/`not-found`; Dashboard rendered `dashboard.overview`; clicking Assets rendered `assets.overview`; Persian RTL and no overflow were confirmed; API calls stayed on `/firewall-api` and returned the expected contracts.
- Preserved DB counts: Device 3, Asset 7, DeviceCredential 4, Finding 5, ActionPlan 124.

## Master Repair Phase 1 - Normal runtime convergence (2026-07-14)

- Phase 0 verified the existing custom dump at `backups/phase0_firewall_log_analyzer.dump` read-only; archive header reports `firewall_log_analyzer`, PostgreSQL 18.4, and 364 TOC entries.
- Historical runtime is `127.0.0.1:5432/firewall_log_analyzer`, schema `public`; preserved counts are Device 3, Asset 7, DeviceCredential 4, Finding 5, and ActionPlan 124.
- Normal runtime is one backend on 4000 and one Vite frontend on strict port 5173. Local browser API traffic now uses `/firewall-api` through the Vite proxy; stale 5174 CORS defaults were removed.
- `/api/health/ready` now reports redacted host/port/database/schema plus `databaseReady` and `schemaReady`; 10/10 live checks passed.
- Focused authentication lifecycle proves login and authenticated `/api/auth/me`; Playwright proves the login page identity and same-origin `/firewall-api/auth/me`. The connected browser itself remains unauthenticated because no secret was accessed.
- Protected quick-controlled execution behavior and `connectorInvoked=true` success semantics are unchanged.

## Database Runtime Port Correction - Windows PostgreSQL (2026-07-14)

- Normal backend runtime now keeps the existing dotenv database name and credentials and resolves local PostgreSQL to `127.0.0.1:5432`.
- Root cause: `backend/src/config/database-url.ts` still contained stale normalization from the earlier temporary runtime. It rewrote local `firewall_log_analyzer` to `firewall_log_auth` and forced port `55432`, so `cd backend && npm run dev` targeted the wrong local database runtime.
- Fix: removed the local database/port rewrite from `resolveDatabaseUrl`; development localhost normalization now only changes host to `127.0.0.1`.
- Shared path: `backend/src/config/env.ts` and `backend/prisma.config.ts` still both call the same resolver, so Prisma config, PrismaClient, PrismaPgAdapter, and the pg Pool use the same connection source.
- Verification: `Test-NetConnection 127.0.0.1 -Port 5432` succeeded; resolved runtime source is `127.0.0.1:5432/firewall_log_analyzer`; normal `cd backend && npm run dev` is running on port 4000; `/api/health/ready` returned 200; `/api/auth/login` returned 200; `/api/auth/me` returned 200; `/api/assets` returned 200 with 7 assets; `/api/credentials` returned 200 with 4 credential references.
- Validation: `cd backend && npm run build` passed.
- Limitation: Playwright MCP tools were not exposed in this turn after targeted tool discovery, so authenticated dashboard MCP opening could not be completed from this tool surface.

## Task 20.1A - DB/auth repair and Cisco onboarding blocker (2026-07-14)

- Read `TASK_20_1A_DB_AUTH_CISCO_ONBOARDING_REPAIR.md` and the required project/status/architecture/task docs before editing.
- Milestone A completed and committed: `afbdd4c docs: trace postgres prisma authentication failure`.
- Reproduced default PostgreSQL failure without reading or printing `.env`: service `postgresql-x64-18` reports running, but `127.0.0.1:5432` TCP fails; `npx prisma migrate status` ends with schema engine error; `buildApp()` fails in `bootstrapAdmin()` at `prisma.appUser.count()` with timeout.
- Milestone B completed and committed: `f09bb4a fix: stabilize postgres prisma and backend readiness`.
- Backend lifecycle changes: one shared Pool/adapter/client path retained, startup retry is now 5 attempts with exponential backoff and jitter, Prisma startup logging is concise, `/api/health/live` exists, `/api/health/ready` returns the Task 20.1A shape, and auth DB failures return structured 503.
- Readiness proof on the healthy user-owned PostgreSQL runtime `127.0.0.1:55432/firewall_log_auth`: long run covered 181 seconds with 10/10 live 200 and 10/10 ready 200; clean body sample showed 10/10 `status=live` and 10/10 `status=ready,databaseReady=true`.
- Milestone C evidence committed: `9b55d87 fix: restore authentication after database readiness`; MCP opened `/login` and `/dashboard` and showed the authenticated Persian dashboard shell with `/api/auth/me` 200.
- Limitation: this MCP tool surface has no fill/type/click tools, and the session was already authenticated, so manual credential entry could not be replayed from MCP.
- Important blocker: the active stable runtime database has zero `DeviceCredential` rows; the required `cisco-f2 — admin` Credential Reference is not present. Per Task 20.1A stop condition 4, real Cisco onboarding cannot continue until that saved Credential Reference exists or the original database becomes reachable.
- Not claimed: real Cisco connector invocation, Device persistence, animated success, redirect, workspace, dashboard charts, full route matrix, or full acceptance matrix.

## Task 20.1 - Onboarding workspace/dashboard trace (2026-07-14)

- Read `CODEX_START_PROMPT.txt` and `TASK_20_1_ONBOARDING_WORKSPACE_DASHBOARD.md`; started Task 20.1 from the current checkout without starting a new task.
- Added Task 20.1 Milestone A trace docs: `docs/TASK_20_1_ONBOARDING_RUNTIME_TRACE.md`, `docs/TASK_20_1_API_SEQUENCE_TRACE.md`, `docs/TASK_20_1_FRONTEND_STATE_TRACE.md`, and `docs/TASK_20_1_BACKEND_STATE_TRACE.md`.
- Playwright MCP from this exact session opened `http://localhost:5173/assets/devices/new?vendor=linux`; current URL stayed on that route and page title was `log-app`.
- MCP network evidence on the onboarding route: `/api/auth/me` returned 200, `/api/device-onboarding/sessions` returned 201, `/api/credentials` returned 200, `/api/product-state/navigation` returned 200, and console errors were zero.
- MCP accessibility evidence found the live onboarding form and the `Credential reference` selector.
- Runtime database evidence showed `devices=[]` and `credentials=[]`; therefore Task 20.1 successful acceptance is blocked by missing real reachable target and missing saved Credential Reference.
- Not claimed: `connectorInvoked=true`, Device persistence, animated success notification, automatic redirect, Device workspace opening, Dashboard charts from persisted device data, or full acceptance tests.
- Commit: `cc3bd67 docs: trace task 20.1 onboarding failure`.

## Task 20 - Backend readiness/auth startup repair (2026-07-14)

- Paused Task 20.1 feature work to fix the current backend startup/auth failure first.
- Reproduced startup failure without reading or printing `.env`: `buildApp()` reaches `bootstrapAdmin()` and fails on the `AppUser` count query when PostgreSQL cannot complete a connection.
- PostgreSQL diagnostics without secrets: the Windows service `postgresql-x64-18` reports `Running`, but Node `pg` and Prisma time out connecting to port 5432 (`ETIMEDOUT`). Windows denied service restart and process termination from this session.
- Code repair: `backend/src/db/prisma.ts` now owns one shared `pg` Pool and one shared Prisma client; Fastify `onClose` no longer disconnects the shared Prisma adapter; `backend/src/server.ts` owns process termination shutdown; startup auth bootstrap retries transient DB connection closures/timeouts briefly and then throws one concise startup error.
- Added `GET /api/health/ready`. It returns structured 503 when the DB is unavailable and returned 200 after the healthy local runtime was started.
- Runtime workaround for this session: initialized a user-owned PostgreSQL 18 cluster under `.runtime/postgres-task20-auth`, started it on `127.0.0.1:55432`, pushed the Prisma schema into database `firewall_log_auth`, and started the backend on port 4000 with only process `DATABASE_URL` overridden. `.env` was not modified.
- Current login status: `http://localhost:5173` is usable again with the running backend. Playwright MCP shows authenticated `/api/auth/me` 200, dashboard API 200 responses, visible `Alireza` admin shell, and zero console errors on `/dashboard`.
- Validation: `cd backend && npx prisma validate` passed; `cd backend && npx prisma generate` passed; `cd backend && npm run build` passed; root `npx pnpm@10 build` passed with the existing large-chunk warning; `cd backend && npm test` passed 209/209 against the healthy temporary database.
- Follow-up: repair or restart the original Windows PostgreSQL service with elevated permissions before depending on the default `.env` database again.

## Task 20 - MCP baseline and onboarding API compatibility (2026-07-14)

- Started Task 20 from `CODEX_START_PROMPT.txt` and `TASK_20_REAL_NETWORK_OPERATIONS.md` after re-reading the required live handoff/status/history/architecture docs and Task 19/19.1/19.2/19.2A specifications.
- Playwright MCP is available in this exact Codex session. MCP opened `http://localhost:5173/`, reported URL `http://localhost:5173/`, title `log-app`, and captured a visible authenticated Persian shell snapshot at `.playwright-mcp/page-2026-07-14T08-56-05-007Z.yml`.
- Added Task 20 prechange evidence docs: `docs/TASK_20_PRECHANGE_RUNTIME_BASELINE.md`, `docs/TASK_20_MCP_PROOF.md`, `docs/TASK_20_ROUTE_CONTROL_BASELINE.md`, `docs/TASK_20_API_FAILURE_REGISTER.md`, and `docs/TASK_20_BACKEND_LOG_REGISTER.md`.
- Device onboarding now exposes Task 20 endpoint names while preserving existing Task 19.2A routes: `/test-connection`, `/detect-platform`, `/build-preview`, and `/retry`.
- Retry behavior is honest: a draft with no validated answers stays `draft` with `retryFrom=draft`; completed/cancelled sessions are not silently retried; recoverable failures return a structured retry target.
- Added `credential_missing`, `credential_invalid`, and `preview_failed` to the onboarding state contract. Live connector/device success is still only claimed after connector invocation, platform evidence, discovery, preview, and persisted Device ID.
- Validation passed for this slice: `cd backend && npx prisma validate`; `cd backend && npm run build`; `cd backend && npx tsx --test test/task19-1-onboarding-workspace.test.ts` (9/9); `git diff --check` with line-ending warnings only.
- `npx prisma migrate status` still reports the known unapplied local migration-history baseline; no destructive recovery, `.env` access, secret exposure, Nmap scan, Check-Host call, or external diagnostic provider call occurred.

## Task 20 - Check-Host diagnostics workspace (2026-07-14)

- Replaced the public diagnostics placeholder with a real Check-Host-backed API and UI for public DNS/HTTP/Ping/TCP checks.
- Added `/api/diagnostics/sessions` create/list/get. Sessions persist through the existing `AuditLog` table as `action=diagnostic_session`, avoiding a new Prisma migration while migration history is drifted.
- Added target classification and safety rejection: private/reserved/loopback/unsafe URL targets are rejected and persisted with `providerInvoked=false`.
- Added direct tool routes for `/tools/domain-check`, `/tools/ip-check`, `/tools/nmap`, `/tools/dns`, `/tools/http`, `/tools/ports`, `/tools/traceroute`, `/tools/ip-info`, `/tools/subnet`, `/tools/history`, and `/tools/monitors`. Nmap and monitors are visible but gated until their worker/scheduler milestones.
- Real provider proof: `example.com` produced persisted diagnostic session `cmrkfksle0000zolvol4yk1ge`; Check-Host request IDs were `446466a3k175` (DNS), `446466cfk36b` (HTTP), `446466e5k33e` (Ping), and `4464670ck87e` (TCP), with `providerInvoked=true`.
- MCP browser proof: `/tools` rendered the real form; `/tools/history` rendered `Target: example.com`, the provider request IDs, and the persisted history table in the authenticated Persian shell.
- Validation passed: `cd backend && npx tsx --test test/task20-diagnostics.test.ts` (3/3); `cd backend && npm run build`; root `npx pnpm@10 build` with the existing Vite chunk warning.

## Task 20 - Nmap worker implementation blocked on DB persistence proof (2026-07-14)

- Installed real Nmap through winget. `C:\Program Files (x86)\Nmap\nmap.exe --version` reports Nmap 7.80.
- Added a safe isolated Nmap worker service using `spawn(..., { shell: false })`, fixed profile argument arrays only, timeout handling, XML parsing, and `AuditLog` persistence for `workerInvoked`, normalized hosts, addresses, ports, services, duration, and policy decisions.
- Added `/api/diagnostics/nmap` create/list routes and `/tools/nmap` UI controls for `host_discovery` and `quick_tcp`. Arbitrary flags are not accepted.
- Added regression coverage for private-target rejection, fixed profile args, and XML normalization.
- Important blocker: the local PostgreSQL service became unreachable from this session. `Test-NetConnection 127.0.0.1 -Port 5432` fails after service recovery attempts, and direct `pg`/Prisma reads time out. Service restart was denied by Windows permissions. Because Task 20 requires persisted evidence, Nmap acceptance is not claimed.
- Two pre-fix `scanme.nmap.org` API attempts reached the worker but returned HTTP 500 because `AuditLog` persistence timed out; after adding persistence retry, no further live acceptance is claimed while DB connectivity is unhealthy.
- MCP opened `/tools/nmap`, but the available browser context showed the unauthenticated login page, so route UI acceptance is also not claimed for this slice.
- Validation while DB was unhealthy: backend `npm run build` passed; root `npx pnpm@10 build` passed with the existing Vite chunk warning; focused diagnostics tests passed 3 source/policy/parser cases and failed 2 DB-persistence cases due the PostgreSQL timeout.

## Task 19.2A - Runtime repair and full audit (2026-07-14)

- Completed the requested Task 19.2A runtime repair without starting external diagnostics, scan authorization, Check-Host, Nmap, production integration expansion, or unrelated device mutation work.
- Device onboarding now uses explicit persisted transitions: `draft -> answers_saved -> connection_testing -> connection_verified -> platform_detecting -> platform_detected -> discovery_running -> discovery_completed -> preview_ready -> saving -> completed`, plus recoverable failure/cancel states.
- Added explicit preview and cancel APIs. Saving answers no longer pretends to build a preview; preview creation is a separate connector-backed step after inventory discovery.
- Cisco onboarding regression now proves connector invocation, IOS-XE platform detection evidence, preview readiness, final Device persistence, and completed onboarding state using a controlled connector-backed test double and real stored credential reference.
- Dashboard diagnostic controls now route to stable implemented destinations: Add Device `/assets/devices/new`, quick network check `/tools/network-check`, domain/IP check `/tools`, and devices `/assets/devices`.
- Added non-executing `/tools` and `/tools/network-check` routes and Product State entries so Dashboard controls do not fall into `/integrations` or a missing route while external diagnostics remain unstarted.
- Linux monitoring now handles missing optional observability tables through a stable `not_configured` contract and a single warning instead of noisy Prisma failures; no migration recovery or schema mutation was attempted.
- Added Task 19.2A audit/acceptance documents under `docs/TASK_19_2A_*`, including runtime baseline, onboarding failure trace, Dashboard matrix, API failure register, route/control acceptance, and browser-results limitation.
- Connected Playwright MCP was still not exposed in this session, so authenticated MCP browser acceptance is not claimed. The source and regression tests prove the runtime/control contracts, and the remaining browser replay steps are documented in `docs/TASK_19_2A_BROWSER_RESULTS.md`.

## Task 19.2-A - Visible device registration entry points (2026-07-14)

- Completed Milestone 19.2-A only. No Integrations redesign, external diagnostics, Check-Host adapter, Nmap worker, scan authorization, monitor, finding, or ActionPlan proposal work was started.
- Dashboard now has a visible `ثبت دستگاه جدید` primary CTA plus quick actions for network test, domain/IP check, and viewing devices. The Add Device path goes to the existing reusable onboarding engine at `/assets/devices/new`.
- Product State Contract advanced to `19.2-A` and now keeps implemented Add Device visible in the generated Assets navigation. The Assets children are `نمای کلی`, `تجهیزات`, `ثبت دستگاه`, and `وندورها`.
- Vendor onboarding CTAs now use explicit vendor labels for Cisco, FortiGate, MikroTik, and Linux while still routing through `/assets/vendors/:vendorKey/devices/new`.
- Safety boundary unchanged: no device mutation, connector execution, credential access, `.env` access, migration mutation, destructive database command, external diagnostic call, or Nmap execution occurred.
- Validation passed: Prisma validate, focused Product State/onboarding backend tests 9/9, backend build, frontend build, i18n/primary-copy guard, UTF-8 guard, and diff check. A mistaken full backend-suite run also reached 204/205 before failing only on the expected pre-update Product State version assertion; the focused rerun passed after updating the assertion.
- Browser tooling note: the requested connected Playwright MCP tools were not exposed in this session. Local `npx playwright` using system Chrome/Edge reached the login gate in a fresh unauthenticated context, so authenticated route visual acceptance could not be completed from this tool surface.

## Task 19.1 Runtime convergence follow-up - automatic ActionPlan revision repair (2026-07-13)

- Replaced the stale approved-plan HTTP 409 path with automatic in-place revision regeneration. A changed canonical fingerprint now creates the next revision, clears prior approval/execution artifacts, validates and previews the new canonical payload, binds approval to that revision, and continues controlled execution.
- Execute clients resolve the latest persisted ActionPlan immediately before both normal and quick execution and send its `actionPlanRevision`. The backend also resolves an older requested revision to the current stored revision and audits that convergence.
- Assistant now returns one authoritative action contract for `canCreateActionPlan`, `manualOnly`, executability, support/implementation state, execution mode, and ActionPlan lifecycle. The UI consumes that contract and displays the exact plan ID, revision, lifecycle state, and execution mode.
- The stale-revision regression executed a changed approved plan through a fake connector and proved revision 2, approved/executing revision 2, no stale state, no stale exception, and `connectorInvoked=true`.
- In the existing authenticated Playwright browser/context, Persian Assistant request `پورت 546 را ببند` created plan `cmrj3z0dc0009xslv1ba6moxs`, handed it to the exact Action Center route, executed it, and opened its result route. `POST /quick-execute` returned 200, final status was `succeeded`/verified no-change, the connector ran, `connectorInvoked=true`, and the console had zero errors.
- Validation passed: Prisma validate, backend build, command catalog 137, backend 205/205, frontend build, locale/primary-copy checks, UTF-8 guard, and diff check. No `.env`, credential, migration, destructive database operation, or unrelated connector was touched.

## Task 19.1 Milestone R-G - Global control audit and Playwright acceptance (2026-07-13)

- Added route, control, and browser acceptance evidence in `docs/TASK_19_1_ROUTE_ACCEPTANCE_MATRIX.md`, `docs/TASK_19_1_CONTROL_ACCEPTANCE_MATRIX.md`, and `docs/TASK_19_1_BROWSER_RESULTS.md`.
- Authenticated Playwright swept all 14 requested primary/direct routes at 1440x900 Persian, 1280x800 Persian, 390x844 Persian, 1440x900 English, and 390x844 English. Exact paths, `lang`/`dir`, API responses, console state, and overflow passed.
- Safe controls were clicked for navigation, sidebar collapse, Action Center refresh/status/topic filters, Assistant refresh/new/clear, and both mock integration previews.
- Global search and notifications are now explicitly disabled and locally explained instead of enabled dead controls. Shell labels, Action Center fallback/topic copy, Assistant controls, and monitoring preset buttons use locale dictionaries.
- The Persian primary-route regression guard now checks 16 required product labels and the global disabled-control contract.
- The Linux close-port flow remains the only live device mutation in Task 19.1; its stored result proves `executed=true` and `connectorInvoked=true`. R-G performed no connector execution or device mutation.
- Full live Add Linux and Add Cisco acceptance remains blocked by the absence of unambiguous new targets and credential references. Task 19.1 is not reported as having all five live end-to-end flows complete.
- Validation: Prisma validate/generate, backend build, serial backend 204/204, catalog 137, frontend build, i18n/primary-copy guard, and UTF-8 pass. Migration status retains the known unapplied-history baseline without mutation. Repository-wide lint still fails on pre-existing debt outside R-G.

## Task 19.1 Milestone R-F - Asset workspace analytics and vendor tabs (2026-07-13)

- Device workspace API now returns chart series derived only from stored health snapshots, status checks, metric samples, collection runs, findings, actions, and audit records. It does not synthesize telemetry.
- Added health score, connector result, availability, CPU/memory, findings, action result, and recent-change series with 1h/6h/24h/7d/30d client filtering.
- Fixed related-record convergence: linked assets now include records attached to either `deviceId` or `assetId`; the prior AND filter hid valid findings, actions, and collections.
- Workspace overview/health render six responsive charts and honest no-data states. The live 30-day Linux view surfaces stored high-severity findings and succeeded actions while health/resource series remain explicitly empty.
- Added capability-gated vendor tabs. Linux exposes CPU/load, memory/swap, disk/inode, services, listening ports, firewall, and authentication; missing data states show reason, requirement, and next action. Cisco sections derive from verified capability-cache domains; other vendors show only registered operational domains.
- Authenticated Playwright verified the Linux workspace, time-range interaction, stored-data charts, and CPU no-data workflow at desktop/mobile in Persian RTL and English LTR with no horizontal overflow or console errors.
- Validation passed: serial backend 204/204, backend/frontend builds, focused R-F regression, Prisma validate, catalog 137, i18n 73, UTF-8, and diff check. No connector execution, device mutation, migration, or credential access occurred.

## Task 19.1 Milestone R-E - Action Center and Assistant UX (2026-07-13)

- Action Center now follows the active Persian/English locale for its primary header, summary, filters, table, status, risk, actions, exact-plan dialog, and recovery controls.
- The normal plan dialog exposes revision, platform, connector, execution template, target/vendor, verification state, parameters/preview, and audit details without requiring raw API output.
- `verified_no_change` and `already_compliant` render as explicit verified/no-change states instead of vague success. A successful connector response replaces the optimistic executing state immediately and refreshes audit data.
- Action API errors no longer expose raw backend URLs. Structured stale conflicts preserve code, retryability, recovery, current/approved revisions, and changed fields with a visible recovery action.
- Assistant primary controls now switch between Persian and English, including target device, summary refresh, clear chat, new request, send, Safety Boundary, and AI Provider.
- Authenticated Playwright verified `/assistant` and the exact port-545 ActionPlan on desktop/mobile in Persian RTL and English LTR: one selected plan, no page/dialog overflow, and zero console errors. No action was executed during R-E.
- Validation passed: focused R-E tests 2/2, serial full backend tests 203/203, backend/frontend builds, Prisma validate/generate, i18n 73, UTF-8, and diff check. Read-only migration status still reports the known unapplied baseline; no migration command was run.

## Task 19.1 Milestone R-D - Canonical revision and connector repair (2026-07-13)

- ActionPlan preview now resolves target, vendor/platform, capability, catalog item, execution template, connector, normalized parameters, and risk before hashing a canonical revision.
- Approval binds to an immutable canonical payload and revision. Genuine controlled-input edits create the next revision; executing a changed approved revision returns structured `COMMAND_PLAN_STALE` recovery details.
- Added the verified `linux.close-port` catalog/template/connector contract. The Linux SSH connector detects UFW, firewalld, nftables, or iptables, removes only matching allow rules, verifies effective state, and reports idempotent `verified_no_change` only after real connector inspection.
- Repeated Assistant requests reuse the same successfully verified ActionPlan instead of creating duplicates. Deterministic executable catalog matches bypass the external AI provider.
- Authenticated Playwright executed the reviewed port-545 plan on the selected Linux target. Initial execution and repeated verification both recorded `connectorInvoked=true`; the final stored outcome is `verified_no_change`, revision 1 remains the approved revision, and the detected adapter is UFW.
- Playwright also verified the repeated Persian Assistant request, exact-plan handoff, revision/status rendering, desktop/mobile layouts, Persian RTL, and English LTR without horizontal overflow.
- Validation passed: Prisma validate, backend build, serial full backend tests 201/201, catalog 137 items, frontend build, i18n parity 73 keys, UTF-8 guard, and `git diff --check`.
- No schema migration, destructive database command, `.env` access, credential exposure, or unrelated device/integration work occurred.

## Task 19.1 Milestone R-C - Exact ActionPlan navigation (2026-07-13)

- Assistant, Catalog, Daily Check, Service Health, and Guided Actions now hand off to exact `/actions/:actionPlanId` routes.
- Action Center restores selection on direct load/reload, chooses the current-status tab, prevents duplicate entries, focuses the row, and handles browser history.
- Unknown IDs render structured `ACTION_PLAN_NOT_FOUND` without exposing a raw backend URL.
- Playwright verified direct load, reload, back, invalid IDs, desktop English, and 390px Persian RTL without horizontal overflow.
- No connector or device mutation was invoked. The stale port-545 plan remains `connectorInvoked=false`; R-D is next.

## Milestone 19A Product Convergence (2026-07-13)

- Completed Milestone 19A only. No onboarding, Cisco mutation, detection rewrite, finding rewrite, Settings implementation, production integration expansion, migration mutation, or device mutation was started.
- Added backend-owned Product State Contract `19A.1` with read-only `/api/product-state`, `/navigation`, `/features`, `/vendors`, and `/integrations` projections. It records stable feature keys, readiness evidence, honest state, requirements, and verification date.
- Primary desktop/mobile navigation is now generated from the backend contract. The frontend route registry owns component matching only and shares stable `featureKey` values with the backend.
- Navigation validation fails closed: planned, unsupported, disabled, not-configured, and unverified states cannot be promoted, and a navigation item must have backend, API, UI, and test readiness.
- Removed Settings, mock asset sync, Cisco, NetBox, Wazuh, pending/history aliases, and monitoring aliases from primary navigation. Direct/contextual routes remain available with their honest state.
- Added `docs/TASK_19_BROWSER_BASELINE.md`, `docs/TASK_19_FEATURE_GAP_REGISTER.md`, `docs/TASK_19_UI_BACKEND_CONTRACT_GAPS.md`, and `docs/PRODUCT_STATE_CONTRACT.md`.
- Added four Product State regressions covering forbidden navigation state, readiness mismatch, frontend/backend feature-key alignment, navigation exclusions, and API projection consistency.
- Playwright MCP verified the 16 requested routes through the authenticated session. Desktop 1440x900 and mobile 390x844 passed in Persian RTL and English LTR with no horizontal overflow, console errors, failed requests, or HTTP responses at or above 400. Existing feature-page body copy is not universally translated in English and remains a documented deferred gap.
- Validation passed: Prisma validate/generate, backend build, full backend tests 190/190, command catalog 136 items, frontend build, i18n parity 73 keys, UTF-8 guard, and `git diff --check`. Root lint still reports the pre-existing 66 errors/4 warnings outside 19A. `docs:check` still reports the pre-existing handoff-heading hash mismatch caused by the live task-heading structure.
- Missing referenced source files were recorded, not invented: `TASK_18_1_PLATFORM_UX_ARCHITECTURE.md`, `TASK_18_2_RECOVERY_AND_CONTINUATION.md`, and `PRISMA_BASELINE_RECOVERY_RUNBOOK.md`.
- Stop boundary: begin no Milestone 19B work until separately requested.

## Task 18.2 Safe Autonomous H1-H6 (2026-07-13)

- Executed the safe autonomous instructions from `TASK_18_2_SAFE_AUTONOMOUS_MODE.txt` from the current repository state without restarting completed 18.1/18.2A work.
- H1 baseline completed with Playwright MCP on authenticated desktop/mobile routes. Planned/dead/mock states were inventoried before feature hardening.
- H2 Prisma recovery remains blocked by the required backup gate: `pg_dump` was available, but the local backup attempt could not produce a verified nonzero dump without credentials. No migration-history write, `migrate resolve`, `migrate deploy`, reset, truncate, drop, or destructive SQL was executed.
- H3 vendor/navigation hardening committed as `b84891e`: planned-only routes were removed from primary navigation, vendor copy was made honest, and Cisco pages now expose supported read-only scope without broad mutation claims.
- H4 integration hardening committed as `aabf035`: NetBox/Wazuh routes now label mock data clearly, removed fake apply controls, and keep only safe previews.
- H5 Linux observability UX committed as `87ceb22`: dashboard and `/monitoring/linux` now present Persian-first Linux health summaries and read-only refresh paths.
- H6 UI/RTL polish tightened asset copy and table labels, then updated project memory docs. Safety boundary unchanged: no ActionPlan execution flow, PolicyGuard, connector, secret handling, or `connectorInvoked=true` success rule changed.
- Playwright MCP verified `/dashboard`, `/assets`, `/assets/sync`, `/assets/vendors`, `/assets/vendors/cisco`, `/assets/vendors/cisco/devices`, `/monitoring/linux`, `/integrations`, `/integrations/netbox`, and `/integrations/wazuh` on desktop and mobile. No visible mojibake, replacement character, dead controls, fake mock apply button, or horizontal overflow remained on the checked surfaces.
- Validation passed where not blocked: Prisma validate/generate, backend build, command catalog validation, frontend build, i18n parity, UTF-8/mojibake guard, and git whitespace check. `npx prisma migrate status` still reports the known unapplied migration-history baseline, and root lint still fails on pre-existing lint debt outside this safe-mode change.

## Encoding Repair - Persian UTF-8/Mojibake Guard (2026-07-12)

- Paused Milestone implementation to repair Persian UTF-8 handling and prevent future mojibake from entering source/docs.
- Configured the PowerShell session for UTF-8 and re-read Persian task/memory docs with explicit `Get-Content -Raw -Encoding UTF8` before trusting text.
- Repaired mojibake in `src/routes/appRoutes.tsx`, `src/components/layout/AppShell.tsx`, `backend/src/app.ts`, `backend/src/services/ai-intent.service.ts`, and `docs/PERSIAN_COMMAND_CATALOG_PRODUCT.md`.
- Added `.editorconfig` with UTF-8/LF/final-newline settings and `scripts/check-utf8-mojibake.mjs`, exposed as `npm run test:utf8`.
- `index.html` already contained `<meta charset="UTF-8" />`.
- Validation passed: `npm run test:utf8`, `npm run test:i18n`, backend `npm run build`, backend `npm test` (186/186), root `npx pnpm@10 build` with the existing Vite large-chunk warning, and Playwright MCP desktop/mobile browser checks for Persian/English rendering.
- Safety boundary unchanged: no ActionPlan, connector, PolicyGuard, lab mode, secret handling, or Cisco/Linux capability behavior changed.
## Task 18.2A - Cisco IOS-XE Read-only Foundation and Linux Observability Schema (2026-07-12)

- Implemented Milestone 18.2A only: vendor/platform/capability registry, Cisco platform-family detection, IOS-XE SSH connector foundation, safe read-only Cisco capability metadata, parsers/fixtures, capability APIs/UI, Linux health metric schema/collector APIs, database migration, tests, docs, and MCP browser evidence.
- Cisco support is intentionally narrow and honest: IOS-XE read-only commands only. IOS Classic, NX-OS, IOS-XR, ASA, FTD, and unknown Cisco families are detected as not supported by the IOS-XE connector. Cisco mutations such as VLAN creation and EtherChannel creation are registered as planned/partial only and are not executable.
- Added read-only Cisco capability registry for version/platform, inventory, CPU/memory, interface status/counters, IP interface brief, VLANs, trunks, EtherChannel summary, spanning tree, routing table, and ACL inspection. Implemented capabilities reference fixed templates and official Cisco command documentation; no arbitrary AI-generated CLI is allowed.
- Added Linux observability persistence and APIs for collection runs, metric samples, metric aggregates, health snapshots, health rules, and monitoring incidents. Linux read APIs degrade to unknown/empty health when the migration has not yet been applied; refresh/write paths still require the real schema and connector-backed collection.
- Added APIs: `/api/vendors`, `/api/vendors/:vendorKey`, `/api/vendors/:vendorKey/platforms`, `/api/vendors/:vendorKey/capabilities`, `/api/vendors/cisco/devices`, `/api/devices/:id/capabilities`, `POST /api/devices/:deviceId/capabilities/refresh`, `/api/monitoring/linux/summary`, `/api/monitoring/linux/devices`, `/api/monitoring/linux/devices/:deviceId`, `/api/monitoring/linux/devices/:deviceId/metrics`, and `POST /api/monitoring/linux/devices/:deviceId/refresh`.
- Frontend routes added: `/assets/vendors`, `/assets/vendors/cisco`, `/assets/vendors/cisco/devices`, `/monitoring/linux`, and `/monitoring/linux/:deviceId`. The existing `/dashboard`, `/assets`, `/assets/devices`, `/monitoring`, `/actions`, `/assistant`, and `/integrations` flows were preserved.
- Docs/evidence added under `docs/`: `TASK_18_2_DISCOVERY`, `TASK_18_2_BROWSER_BASELINE`, `TASK_18_2_BROWSER_RESULTS`, `CISCO_IMPLEMENTATION_SOURCES`, `VENDOR_CAPABILITY_FRAMEWORK`, `CISCO_IOSXE_ARCHITECTURE`, `CISCO_CAPABILITY_MATRIX`, `CISCO_GUIDED_WORKFLOWS`, `CISCO_LAB_TESTING`, and `LINUX_OBSERVABILITY`, plus screenshots in `docs/evidence/task-18-2/`.
- Playwright MCP final verification used the connected authenticated browser session on desktop 1440x900 and mobile 390x844 for `/dashboard`, `/assets`, `/assets/devices`, `/monitoring`, `/monitoring/linux`, `/actions`, `/assistant`, `/integrations`, `/assets/vendors`, `/assets/vendors/cisco`, and `/assets/vendors/cisco/devices`: RTL/lang were correct, no horizontal overflow was detected, and no console errors, request failures, or 4xx/5xx route responses remained.
- Safety boundary preserved: no `.env` read/write, no secrets exposed, no broad Cisco mutations, no raw AI CLI, no existing execution flow overwritten, and no success path added without `connectorInvoked=true`.
- Migration added: `backend/prisma/migrations/20260712192000_task18_2a_vendor_linux_observability`.
- Validation passed: `npx prisma validate`; `npx prisma generate`; backend `npm run build`; backend `npm test` (186/186); backend `npm run validate:command-catalog` (136 items); root `npm run test:i18n` (73 keys); root frontend build via `npx pnpm@10 build` with the existing Vite large-chunk warning.
- Production blockers/next work: run the migration in each target database before relying on persisted Linux health writes; enable live Cisco IOS-XE SSH only after lab device testing and credential/host-key policy review; implement Cisco mutations only as separate verified templates with parser/precheck/post-check coverage.

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

## Task 18.1 Milestone A - Platform IA and App Shell (2026-07-12)

- Added a lightweight frontend route registry for `/dashboard`, grouped asset/security/monitoring/action/assistant/integration/settings routes, planned-route badges, and backward compatibility for `/action-library`, `/guided-actions/:sessionId`, and `/actions/:id/result`.
- Added a real app shell with desktop sidebar, topbar search/language/user controls, and mobile bottom navigation for Dashboard, Assets, Security, and Actions.
- Split the compact platform UI into feature folders under `src/features/assets` and `src/features/security` with page modules, hooks, summary cards, and tables connected to existing APIs.
- Added design-system foundations in `src/design-system`: tokens, semantic tokens, typography, motion, breakpoints, and theme constants.
- Added `docs/TASK_18_1_DISCOVERY.md` with route/data-flow/coupling/blocker discovery.
- Safety boundary unchanged: no ActionPlan execution behavior, PolicyGuard behavior, protected lab settings, connector invocation semantics, or secrets were changed.
- Browser MCP pre-check reached the app but all requested authenticated routes showed the login gate without a valid session; screenshots were captured under `.playwright-mcp/` and only expected `/api/auth/me` 401 console errors appeared.
- Validation: root frontend `npx pnpm@10 build` passed with the existing Vite large-chunk warning after escalation for npm cache access.

## Task 19.1 Milestone R-A — Runtime baseline (2026-07-13)

- Re-read the Task 19.1 runtime specification, stale-repair contract, Playwright acceptance matrix, restored Task 18.2 specification, Task 19 product convergence specification, `AGENTS.md`, and this handoff.
- Started a new Playwright MCP browser context and verified that the current session is authenticated; no login credential or `.env` value was used.
- Audited every R-A route and created `docs/TASK_19_1_RUNTIME_BASELINE.md`, `docs/TASK_19_1_BROKEN_CONTROL_REGISTER.md`, and `docs/TASK_19_1_API_FAILURE_REGISTER.md`.
- Reproduced the port-545 failure through Action Center: the quick-execute request returned flat 409 `COMMAND_PLAN_STALE`; the plan remained `dry_run_ready` and `connectorInvoked=false`.
- Repeated `پورت 545 را ببند` for the selected Linux device. Assistant returned 200 and `canCreateActionPlan=true`, but labelled the result manual-only and created no second ActionPlan.
- Confirmed missing device onboarding, the Cisco zero-device loop, broken exact-plan handoff, raw proposal JSON, raw API URL errors, English/Persian mixing, and `lang=en dir=ltr` on Persian surfaces.
- No implementation fix, migration, destructive database operation, device mutation, or external integration call is part of R-A.
- Next allowed work: R-B only — device onboarding, Product State route visibility, and device workspace foundation, followed by its own commit.

## Task 19.1 Milestone R-B — Onboarding and workspace foundation (2026-07-13)

- Added one backend onboarding session engine and the required create/get/answers/test/detect/discover/commit APIs. Sessions accept credential references only and reject plaintext secrets.
- Added a real read-only Cisco IOS-XE SSH connector probe for `show version` plus bounded inventory discovery. It never reports success unless the live connector returned `connectorInvoked=true`.
- Added routed onboarding at `/assets/devices/new`, `/assets/onboarding`, `/assets/vendors/:vendorKey/devices/new`, and `/assets/devices/:deviceId/setup`, with CTAs from Assets, Devices, Vendors, generic vendor detail, and Cisco.
- Added a device workspace backend contract and frontend routes for overview, health, inventory, capabilities, findings, actions, history, and configuration.
- Optional observability tables missing from the current local database now degrade cleanly; no migration or database recovery was run.
- Product State Contract advanced to `19B.1` and now asserts onboarding/workspace backend, API, route, UI, and test readiness together.
- Playwright verified desktop and 390px mobile onboarding/workspace routes without overflow or HTTP errors. A live Cisco target/credential was not supplied, so no live Cisco success is claimed and no device was created.
- Validation: Prisma schema valid; backend build, full backend tests, command catalog (136), frontend build, i18n parity (73), UTF-8 guard, and diff check passed.
- Next allowed work after the separate R-B commit: R-C exact Assistant-to-ActionPlan navigation only.
## Database Runtime Alignment - Auth Startup Repair (2026-07-14)

- Root cause: the normal backend dotenv runtime still resolved a stale local PostgreSQL URL using `localhost:5432/firewall_log_analyzer`, while the reachable Windows PostgreSQL service is `127.0.0.1:55432/firewall_log_auth`.
- Added one shared resolver in `backend/src/config/database-url.ts` and wired both `backend/prisma.config.ts` and `backend/src/config/env.ts` through it, so Prisma CLI, PrismaClient, PrismaPgAdapter, and pg Pool use the same normalized runtime source.
- No `.env` value was printed, modified, or committed; no temporary shell `DATABASE_URL` override was used for the final backend runtime.
- Normal `cd backend && npm run dev` now starts and stays listening on port 4000.
- Evidence: `/api/health/ready` returned `200 ready` ten consecutive times; direct `prisma.appUser.count()` succeeded with count 1; MCP dashboard pass showed `/api/auth/me`, `/api/assets`, `/api/security/findings`, `/api/monitoring/linux/summary`, and `/api/product-state/navigation` all returning 200 with zero current console errors.
- Validation: `npx prisma validate`, `npx prisma generate`, backend build, serialized backend test matrix 209/209, and frontend `npx pnpm@10 build` passed. The default parallel backend test run hit live-DB contention, then passed when rerun with Node test concurrency set to 1.

## Runtime Auth/CORS Follow-up (2026-07-14)

- Stopped duplicate backend dev processes and restarted exactly one normal `cd backend && npm run dev` backend.
- Confirmed PrismaPgAdapter/pg Pool path uses the shared `env.databaseUrl`, resolving to `127.0.0.1:55432/firewall_log_auth`.
- Raw `pg.Pool`, minimal PrismaPgAdapter, and shared app Prisma all succeeded against the same resolved connection source.
- Added the actual frontend dev origin `http://localhost:5174` and `http://127.0.0.1:5174` to default CORS origins; this fixed MCP/browser auth requests from the current frontend port.
- Evidence: `/api/health/ready` returned 200 ten times, `prisma.appUser.count()` succeeded, `/api/auth/login` returned 200 and set a cookie, and Playwright MCP opened `http://localhost:5174/dashboard` with authenticated shell plus auth/assets/security/monitoring/product-state API calls returning 200 and zero current console errors.

## Device Onboarding Final Repair (2026-07-15)

- Added honest credential-free unverified registration, durable database-backed onboarding sessions, sanitized credential failures, retry/new-session recovery, and atomic verified Device/Asset/placement/health/audit persistence.
- Applied additive migration `20260714210000_persist_device_onboarding_sessions`; it only creates the onboarding-session table and indexes.
- Replaced remaining internal hard navigation with React Router and made the default backend test command discover every test file once on the isolated test database, serially.
- Authenticated Playwright proved SSH-only UI, guarded missing-credential state, retry, RTL/LTR, SPA navigation, real unverified create/redirect/list visibility, and safe cleanup.
- Protected counts after cleanup: Device 3, Asset 7, DeviceCredential 4, Finding 5, ActionPlan 124.

## Device Workspace / Action Center Repair - Phase 1 (2026-07-15)

- Added persisted, device-scoped connection-test, verification, retry, and commit APIs by reusing the existing onboarding state machine and connector registry.
- Verification attempts persist the in-progress state before connector invocation, retain truthful `connectorInvoked` evidence on failed real attempts, reject concurrent runs, and return only sanitized errors and credential references.
- No schema migration or protected-record mutation was required. Backend build and focused onboarding/verification tests passed; one older Cisco onboarding integration case remains environment-sensitive because its fixed host collides with the current real Cisco Device.

## Device Workspace / Action Center Repair - Phase 2 (2026-07-15)

- Every managed Device Workspace now renders a prominent Connection & Verification panel before workspace tabs.
- The panel exposes stored credential selection/replacement, connection test, retry, platform detection, inventory discovery, verified commit, new-session, refresh, and persisted history controls without exposing credential material.
- Authenticated Playwright verified Persian RTL and English LTR rendering at 1366x768 with every control inside the viewport and no horizontal overflow.

## Device Workspace / Action Center Repair - Phase 3 (2026-07-15)

- Added a stable Action Center backend projection with the required draft, needs-input, ready, confirmed, executing, succeeded, failed, and cancelled lifecycle.
- The projection fails closed: a stored `succeeded` row without `connectorInvoked=true` is presented as failed, and Execute is enabled only for approved, verified connector-backed actions.
- Added filtered/paginated summaries, sanitized detail/evidence/result data, non-destructive retry-by-new-plan, and guarded cancellation endpoints. Existing ActionPlan rows were not rewritten.

## Device Workspace / Action Center Repair - Phase 4 (2026-07-15)

- Replaced the legacy clipped Action Center table/modal with a paginated lifecycle workspace, responsive summary/filter surface, and sticky detail/control panel.
- All required primary controls are visible: create, review, edit parameters, device/credential selection, preview, confirm, execute, retry, cancel, evidence/result views, and related Device Workspace navigation.
- Authenticated Playwright proved direct all/pending/history/detail/not-found routes, Persian RTL and English LTR, unsupported-action fail-closed controls, and no document overflow at 1366x768, 1440x900, or 1920x1080.

## Device Workspace / Action Center Repair - Final Acceptance (2026-07-15)

- Authenticated Playwright invoked the real `cisco-iosxe-ssh` connector twice from the Device Workspace. Both attempts truthfully remained failed/unverified because `192.168.7.12` timed out; each persisted `connectorInvoked=true`, a sanitized timeout, and history that survived a backend restart.
- Authenticated Playwright exercised a temporary read-only Linux ActionPlan through Draft -> Preview -> Confirmed -> Execute -> Succeeded. Success included `connectorInvoked=true`, visible evidence/audit and connector result, with no credential material; the exact tagged acceptance plan was then removed and ActionPlan count returned from 125 to 124.
- Action Center direct routes, lifecycle filters, unsupported-action gating, detail controls, evidence/result drawers, Persian RTL, English LTR, and 1366/1440/1920 desktop layouts passed browser acceptance without horizontal overflow.
- Final validation passed: backend build, full backend tests 236/236, final contract tests 3/3, frontend build, locale parity (97 keys), Persian primary copy, UTF-8 scan (450 files), Prisma migration status, dry-run Device/Asset audit, and `git diff --check`.
- Database preservation proof after all acceptance and test cleanup: Device 4, Asset 7, DeviceCredential 4, Finding 5, ActionPlan 124. The audit reported `changed=0`; all 35 migrations are current and this repair requires no migration.
- Remaining honest blocker: the configured Cisco target is unreachable over SSH, so successful Cisco verification/promotion cannot be claimed until the target responds. The failure path and connector invocation evidence are verified.
