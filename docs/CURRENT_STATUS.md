## AI Assistant structured ActionPlan architecture (2026-07-19)

- AI Assistant planning now separates plan creation from execution eligibility. Selected Device context is the source of truth for vendor/platform/capabilities, and generated steps are resolved only through that vendor's backend registry/templates.
- Structured AI plans record executable steps, missing parameters, blocked unsupported capabilities, dependencies, risk, verification, rollback metadata, approval requirement, and `rawCommandExecution=false`.
- Exact supported single actions still create executable ActionPlans through the existing Action Center path. Unmatched operational prompts create review-only structured ActionPlans; informational prompts remain chat-only.
- Action Center displays structured step status and keeps execution behind preview, explicit approval, PolicyGuard, connector invocation, and audit.
- Validation: backend build; frontend build; focused planner/routing/target-device/vendor-isolation/Action Center/guided tests 96/96; command catalog validation; i18n; UTF-8; workflow guard; git diff check.

## AI Assistant ActionPlan creation regression fix (2026-07-19)

- Supported selected-device catalog requests create proposed ActionPlans again, including parameterized actions that still need guided completion. Cisco `create VLAN` resolves only through the exact `cisco.create-vlan` operation, and FortiGate `create policy` resolves through the implemented FortiGate catalog before guided fallback.
- Unsupported/custom/unmatched prompts, including vague Cisco requests such as `configure something for me`, remain chat-only with no ActionPlan and no vendor generic catalog match.
- Chat still never creates a Guided Action session or redirects; guided collection remains behind explicit user action. Action Center, approval, PolicyGuard, connector invocation, audit, and protected lab execution settings are unchanged.
- Validation: backend build; frontend build; new AI ActionPlan routing regression test 6/6; existing AI target-device test 13/13; command catalog validation; `git diff --check`. Full backend `npm test` remains gated by missing isolated `TEST_DATABASE_URL`.

## AI Assistant guided-action redirect fix (2026-07-19)

- Assistant chat no longer creates Guided Action sessions or navigates based on returned session/action IDs. Guided navigation is behind an explicit start button only.
- Generic/custom fallback no longer promotes `generic_security_action` or `custom_vendor_action` into vendor catalog rows; unsupported, partial, custom, informational, and read-only prompts remain reviewable Assistant responses unless they map to a verified ActionPlan path.
- Guided-start eligibility is limited to the selected device as source of truth: verified catalog action, implemented, connector-backed, selected device supports the connector, and required parameters are still missing.
- Validation: backend build; frontend `pnpm build`; focused AI target-device tests 13/13; command catalog validation; i18n; UTF-8; workflow guard; `git diff --check`. Full backend `npm test` remains gated by missing isolated `TEST_DATABASE_URL`.

## AI Assistant target-device context fix (2026-07-19)

- The selected target device is now the AI Assistant source of truth. Each prompt rebuilds backend context from that Device and target-scopes vendor, platform, capabilities, health, inventory, connection state, routes, workflow state, and supported catalog actions.
- Stale Cisco/vendor context, previous intents, and previous guided-action state are no longer reused when the operator switches targets or sends a new prompt. Unsupported requests return selected-device suggestions instead of cross-vendor ActionPlans.
- Validation: backend build, frontend build, focused AI target-device context test 7/7, command catalog validation, i18n parity/Persian copy, UTF-8/mojibake, workflow guard, and git diff --check.

## Cisco IOS Classic localized workspace (2026-07-19)

- The device overview now separates connection, verification, inventory, capability, health, interfaces, and last successful collection. Cisco identifiers render LTR while Persian labels remain RTL and natural.
- Capability groups display typed states and partial/unsupported/failed distinctions rather than empty placeholders when collection has run. Action Center and result pages no longer expose internal connectorInvoked expressions in the main UI.
- Validation: frontend build, i18n parity/Persian copy, UTF-8 guard, and internal-expression scan.

## Cisco IOS Classic Action Center integration (2026-07-19)

- IOS Classic now uses the existing Action Center execution path for read-only diagnostics, backup, and scoped safe-write Cisco workflows. The generated catalog exposes required parameters and mutating risk correctly from the single Cisco operation registry.
- The Cisco planner and connector wrapper support server-built CLI specs, preview exact commands, require approval for writes, invoke the existing SSH2 interactive connector on execution, and redact sensitive configuration output before evidence is returned.
- Destructive/high-risk roadmap actions such as reload, erase, delete VLAN, bulk shutdown, and restore remain planned and non-executable until protected PolicyGuard contracts are explicitly completed.
- Validation: backend build, command catalog validation, focused Cisco Action Center mocked tests, and focused Cisco source/mocked connector tests.

## Cisco IOS Classic inventory and capability profile (2026-07-19)

- IOS Classic now has a typed read-only collection bundle for system, inventory, interfaces, health, network, configuration metadata, security/services, and per-device capability states.
- Saved Cisco capability evidence feeds the existing workspace projection and Asset sync without schema changes, duplicate APIs, or a second Cisco connector.
- Validation for this slice: backend build, command catalog validation, focused Cisco tests 18/18.

## Cisco IOS Classic discovery and verification (2026-07-19)

- IOS Classic no longer falls into connected_unsupported when SSH and read-only Cisco evidence succeed; it is supported alongside IOS-XE in the existing Cisco SSH2 connector path.
- Onboarding stores sanitized Cisco discovery evidence and initial parsed system/interface facts without exposing credentials or weakening global SSH algorithms.
- Current validation for this slice: backend build, focused Cisco ssh2/source/parser tests, and git diff --check. Database-backed connector tests still require an explicit isolated TEST_DATABASE_URL.

## Cisco Legacy IOS SSH Compatibility Fix (2026-07-19)

- The `legacy_cisco` profile is now the named Legacy Cisco IOS Compatibility Profile and explicitly prepends `diffie-hellman-group14-sha1`, `ssh-rsa`, CBC ciphers, and SHA-1 HMACs only for approved legacy Cisco devices.
- Modern-first Cisco SSH remains the default. Onboarding still retries legacy compatibility only after SSH negotiation failure and explicit operator approval; Action Center and protected execution behavior are unchanged.
- Real-device proof succeeded at the transport/auth/shell/read-only-command layers with sanitized evidence: `connectorInvoked=true`, `compatibilityProfile=legacy_cisco`, authenticated privileged shell, one platform command result, and existing `connected_unsupported` semantics for the detected non-IOS-XE platform.
# Current Project Status

## Phase B - device onboarding and workspace simplification (2026-07-19)

- Phase B only is complete on top of Phase A commit 11923753ea8e00feda6a4ff25a20b529ade47132; commit history was not rewritten.
- Device onboarding now uses a tighter three-step operator flow with localized copy, structured client-side error mapping, existing credential/session APIs, honest verified vs unverified registration, and Cisco legacy SSH approval only under Advanced.
- Device Workspace now exposes only Overview, Interfaces, Configuration, Actions, Monitoring, and History as primary tabs. Overview shows Connection, Identity, Interfaces summary, and Recommended next action, with no fake collection values.
- Workflow Lab now includes verified and unverified workspace fixture states in both Persian RTL and English LTR. Action Center architecture and backend execution policy remain untouched.
- Validation is green for the applicable Phase B scope: frontend build/typecheck, i18n parity/Persian copy, UTF-8, workflow-lab contract, backend build, command catalog validation, mocked/source Phase B tests, and diff check.

## Workflow Foundation Phase A - reusable UI and safe lab (2026-07-19)

- Phase A only is complete: reusable presentation primitives now exist in src/components/workflows/ and a fixture-driven DEV-only Workflow Lab is available at /tools/workflow-lab.
- The lab covers Persian RTL and English LTR visual states for device onboarding success/failure/unverified registration, action review/executing/success/failure, planned Cisco, and unsupported operations.
- No backend behavior, API contract, Prisma schema, connector, ActionPlan execution, Product State navigation, or protected lab execution setting changed.
- Validation is green: frontend typecheck/build, locale parity/Persian copy, UTF-8/mojibake, Workflow Lab dev-only source contract, diff check, and production bundle absence of the lab route string.

## Device UX repair Phase A - guarded data integrity (2026-07-18)

- Test execution now fails closed unless `TEST_DATABASE_URL` is explicitly isolated from `DATABASE_URL` and is not the historical `firewall_log_analyzer` database. Prisma test runtime uses only the verified test target.
- Equipment is currently an Asset-backed list. Device deletion returns 204, `Asset.deviceId` becomes null through `onDelete: SetNull`, and the orphan Asset remains visible from `/api/assets`; executable DB regression coverage records this exact sequence.
- The canonical Device/Asset contract and four independent status dimensions are documented and represented in backend types. Runtime removal behavior is intentionally unchanged until Phase B.
- Current environment has no test database identity (`TEST_DATABASE_URL` missing). Seven non-DB Phase A tests pass and the DB regression is safely refused before writes. Backend build and Prisma validation pass.

## Repair bundle Phase 1 - interactive Cisco SSH and diagnostics (2026-07-18)

- Cisco read-only operations now use a reusable PTY interactive shell with prompt synchronization, privileged EXEC handling, paging control, bounded output, stage-specific timeouts, keyboard-interactive auth, keepalives, and deterministic cleanup.
- Safe diagnostic evidence distinguishes DNS/TCP, SSH negotiation, authentication, shell, prompt, privilege, command, and platform detection failures. Classic IOS and NX-OS remain connected-but-unsupported instead of appearing disconnected.
- Legacy algorithms are opt-in per device and auditable; enable mode references a separate encrypted stored Credential. Defaults were not weakened and no migration was required.
- Validation: Phase 1 scoped lint, backend/frontend builds, 250/250 backend tests, i18n and UTF-8 passed. Global lint has unrelated baseline failures (65 backend; 89 root errors plus 6 warnings). Phase 2 is intentionally not started.

## Device onboarding required-name UX repair (2026-07-18)

- The reported onboarding 400 was traced to an empty device name; `edge-switch-01` was placeholder text rather than an entered value. The selected stored Credential was valid and present.
- Required identity fields are explicit, client-side validation prevents the invalid request, the error is visible inside the active form, and focus moves to the failing field.
- Backend validation and connector behavior are unchanged. Focused onboarding tests passed 9/9, and both builds passed.

## Operator-first Action Center (2026-07-15)

- Action Center now opens with Connection status and the direct Device -> Credential -> Action workflow. Execute immediately is the default; Preview only is optional; ActionPlan history remains available without dominating normal operation.
- Connection status exposes Test, Refresh, Retry, last success/failure, connector, SSH, and authentication state. Exact sanitized failures are visible, while raw JSON is confined to the closed Advanced Details disclosure.
- The Execute control calls the real create-plan and quick-execute backend endpoints and retains controlled planning, PolicyGuard, connector audit, and `connectorInvoked=true` success requirements.
- Cisco show-version is a verified read-only catalog/template/planner/connector path. Vendor-scoped convergence prevents unrelated generic manual actions from being promoted.
- Authenticated Playwright: Linux service status succeeded; Linux daily check succeeded; FortiGate VPN succeeded; FortiGate HA/VDOM/zone reached the connector and failed on the appliance's `show system vdom`; Cisco show version reached the connector and timed out. Exact failures and invocation evidence are persisted. Preview-only remained non-executing.
- English/Persian, LTR/RTL, 1440px/390px, no-overflow, default Execute, closed Advanced Details, direct history context, green Connected, and failed Retry states passed browser acceptance.
- Validation is green: backend build, catalog 138, backend 237/237, frontend build, locale parity, Persian copy, UTF-8, diff check, Prisma status, and dry-run reconciliation. All 35 migrations are current; no migration was added or applied.
- Protected counts: Device 4, Asset 7, DeviceCredential 4, Finding 5. ActionPlan is 133 after intentionally retaining seven current-task acceptance plans from the 126 browser baseline; existing history was preserved.
- Live blockers: FortiGate rejects one zone/VDOM read command in its current context; Cisco SSH times out. Neither path is reported as a successful device operation.

## Master repair convergence - Phase 2 (2026-07-14)

- Phase 2 router convergence is complete: React Router owns routing/navigation, unknown routes render a distinct 404, and all 53 feature routes have stable page identities.
- Frontend routes and backend Product State are guarded by exact 53-key and route parity tests.
- Authenticated Playwright verified the 404, Dashboard, and client-side Assets navigation with correct identities, RTL, no overflow, and real same-origin API traffic.
- Historical database counts remain unchanged. Next allowed work is Phase 3 Device/Asset and schema reconciliation.

## Master repair convergence - Phase 1 (2026-07-14)

- Phase 0 complete with a verified, untouched custom-format database dump and preserved historical counts.
- Phase 1 runtime convergence is implemented: backend 4000, strict Vite 5173, same-origin development proxy, one shared resolved datasource for Prisma/Pool, and redacted readiness identity with schema readiness.
- Database remains `127.0.0.1:5432/firewall_log_analyzer` (`public`); Device 3, Asset 7, DeviceCredential 4, Finding 5, ActionPlan 124.
- Next phase: replace the manual router with React Router and a shared route/feature manifest. Do not begin data repair before Phase 2 passes.

Last updated: 2026-07-14

## Task 20 - Real Network Operations Kickoff

- Task 20.1A is partially complete and currently blocked. Database/auth milestones A-C are committed (`afbdd4c`, `f09bb4a`, `9b55d87`), but real Cisco onboarding is stopped because the active stable runtime database has no saved Credential Reference rows and therefore does not contain the required `cisco-f2 — admin` reference for `192.168.7.12`.
- PostgreSQL default service remains unhealthy from this session: `postgresql-x64-18` is running but `127.0.0.1:5432` TCP fails. The healthy runtime used for proof remains the user-owned PostgreSQL on `127.0.0.1:55432/firewall_log_auth`.
- New readiness behavior: `/api/health/live` returns 200, `/api/health/ready` returns 200 with `databaseReady=true` when the DB is reachable and structured 503 otherwise. A 181-second proof produced 10/10 live 200 and 10/10 ready 200.
- MCP auth proof after the repair: `/login` and `/dashboard` opened in the authenticated shell with `/api/auth/me` 200. The MCP surface has no fill/type/click tool, so credential-entry replay could not be performed while the session was already authenticated. A transient `/api/assets` timeout/500 appeared once in backend logs after the MCP dashboard refresh and then retried successfully; do not claim complete no-5xx acceptance yet.
- Task 20.1 Milestone A trace is complete and committed as `cc3bd67`. Playwright MCP in this session opened `/assets/devices/new?vendor=linux`, title `log-app`, saw authenticated onboarding APIs succeed (`/api/auth/me` 200, session creation 201, credentials 200, product navigation 200), and found the live `Credential reference` selector with zero console errors.
- Full Task 20.1 acceptance is currently blocked, not complete: the runtime database has no saved credentials and no devices, and no real target/credential reference has been supplied. `connectorInvoked=true`, Device persistence, animated success, automatic redirect, workspace opening, and dashboard charts from the persisted device are not claimed.
- New evidence docs: `docs/TASK_20_1_ONBOARDING_RUNTIME_TRACE.md`, `docs/TASK_20_1_API_SEQUENCE_TRACE.md`, `docs/TASK_20_1_FRONTEND_STATE_TRACE.md`, and `docs/TASK_20_1_BACKEND_STATE_TRACE.md`.
- Backend startup/auth repair restored the current login path. The app now uses one shared Prisma client and one shared `pg` Pool, Fastify app close no longer disconnects the shared database adapter, process shutdown owns database teardown, startup auth bootstrap has a short transient retry, and `/api/health/ready` reports database readiness with 200/503 structured output.
- Local Windows PostgreSQL service `postgresql-x64-18` still reports `Running` but returns `no response`/`ETIMEDOUT` on port 5432, and Windows denied service/process restart. To restore login without touching `.env` or the protected service data directory, a user-owned temporary PostgreSQL 18 cluster was initialized under `.runtime/postgres-task20-auth`, started on `127.0.0.1:55432`, and the backend is running on port 4000 with only its process `DATABASE_URL` overridden to that healthy local database.
- Validation for the repair slice: `npx prisma validate`, `npx prisma generate`, backend `npm run build`, root `npx pnpm@10 build`, and backend `npm test` pass (209/209) against the healthy temporary database. Playwright MCP confirms `/api/auth/me` returns 200 in the authenticated shell, `/api/*` dashboard requests return 200, and `/dashboard` has zero console errors.
- Task 20 mandatory MCP gate passed in this session: Playwright MCP opened `http://localhost:5173/`, title `log-app`, and captured an authenticated Persian app shell snapshot.
- Baseline evidence is recorded in `docs/TASK_20_PRECHANGE_RUNTIME_BASELINE.md`, `docs/TASK_20_MCP_PROOF.md`, `docs/TASK_20_ROUTE_CONTROL_BASELINE.md`, `docs/TASK_20_API_FAILURE_REGISTER.md`, and `docs/TASK_20_BACKEND_LOG_REGISTER.md`.
- Onboarding API compatibility now includes Task 20 route names: `/test-connection`, `/detect-platform`, `/build-preview`, and `/retry`, alongside the existing Task 19.2A routes.
- Public diagnostics now have a real Check-Host-backed session API and Tools UI. `example.com` produced persisted session `cmrkfksle0000zolvol4yk1ge` with DNS/HTTP/Ping/TCP provider request IDs and `providerInvoked=true`; MCP verified `/tools/history` renders those IDs.
- This is not yet full Task 20 acceptance: dedicated diagnostic Prisma domain models, Nmap worker, monitor scheduler, integration expansion, and live device onboarding with a supplied target/credential are still not complete.
- Local Prisma migration history still reports 34 migrations unapplied; no destructive database recovery was attempted.
- Nmap 7.80 is now installed and a safe isolated worker implementation exists, but live `workerInvoked=true` persistence is blocked because local PostgreSQL stopped accepting TCP connections from this session. Do not mark Nmap acceptance complete until a scan record is persisted and visible.

## Task 19.2A - Runtime Repair and Full Audit

- Device onboarding has an explicit backend state machine from answer save through connection test, platform detection, discovery, preview, saving, and completion. Recoverable failure/cancel states are stored rather than silently falling back to `draft`.
- The misleading save-and-preview behavior is split: answers save to `answers_saved`, connector-backed discovery completes to `discovery_completed`, and an explicit preview action reaches `preview_ready`.
- Focused backend coverage proves Cisco onboarding connector invocation, platform detection evidence, Device persistence, and final `completed` state using a controlled connector-backed test double.
- Dashboard controls now route to implemented destinations: Add Device, quick network check, domain/IP check, and devices. `/tools` and `/tools/network-check` are present as non-executing diagnostic placeholders; no external scan/Nmap work has started.
- Linux monitoring returns a clean `observability.state=not_configured` contract when optional health tables are missing and logs only one concise warning instead of repeated Prisma errors.
- Task 19.2A audit evidence is recorded in `docs/TASK_19_2A_RUNTIME_BASELINE.md`, `docs/TASK_19_2A_ONBOARDING_FAILURE_TRACE.md`, `docs/TASK_19_2A_DASHBOARD_CONTROL_MATRIX.md`, `docs/TASK_19_2A_API_FAILURE_REGISTER.md`, `docs/TASK_19_2A_ROUTE_ACCEPTANCE_MATRIX.md`, `docs/TASK_19_2A_CONTROL_ACCEPTANCE_MATRIX.md`, and `docs/TASK_19_2A_BROWSER_RESULTS.md`.
- Connected Playwright MCP was not exposed to this Codex session, so current authenticated browser acceptance remains documented as pending rather than claimed.

## Task 19.2-A - Visible Device Registration

- Dashboard exposes `ثبت دستگاه جدید` as a primary action and quick actions now include registration, quick network test, domain/IP check, and device list access.
- Product State Contract is `19.2-A`; implemented Add Device is no longer hidden from generated Assets navigation.
- Assets navigation now includes Overview, Devices, Register device, and Vendors. Contextual onboarding routes remain backed by the existing reusable onboarding engine.
- Cisco, FortiGate, MikroTik, and Linux vendor pages show vendor-specific onboarding CTAs that preselect the vendor through `/assets/vendors/:vendorKey/devices/new`.
- No diagnostics, Check-Host, Nmap, scan authorization, monitoring, finding, connector execution, migration, destructive DB command, `.env`, or credential work was started.
- Validation is green for the touched scope: Prisma validate, focused backend Product State/onboarding tests, backend build, frontend build, i18n/primary-copy, UTF-8, and diff check. Connected Playwright MCP was unavailable; local Playwright screenshots only reached the login gate in a fresh context.

## Task 19.1 - Automatic ActionPlan revision convergence

- Genuine canonical input drift no longer ends execution with `COMMAND_PLAN_STALE` HTTP 409. The service regenerates and approves the newest revision, then continues through PolicyGuard and the registered connector.
- All frontend Execute entry points resolve and reference the latest stored revision. Older quick-execute revision input is safely converged to current state and audited.
- Assistant and Action Center share one backend-owned action contract covering plan creation, manual-only/executable state, execution support/mode, and lifecycle identity/revision/state.
- Functional stale-plan coverage passes at revision 2 with one fake connector invocation and `connectorInvoked=true`.
- Same-context authenticated Playwright passed Assistant -> exact Action Center -> Execute -> result for Linux port 546: quick-execute HTTP 200, status `succeeded` with verified no-change, no stale plan/409, zero console errors, and stored `connectorInvoked=true`.
- Current validation is green: Prisma, backend build, catalog 137, backend 205/205, frontend build, i18n/primary Persian copy, UTF-8, and diff check.

## Task 19.1 R-G - Global route/control acceptance

- All 14 requested routes pass authenticated Playwright at the five required locale/viewport combinations with exact route identity, correct RTL/LTR, no page overflow, no unexpected API failure, and no current-navigation console error.
- Enabled dead global controls were removed: search and notifications are disabled with localized explanations. Named Assistant/Action Center product copy and Linux monitoring presets are locale-backed; a regression guard covers 16 required Persian labels.
- Safe navigation, Action Center, Assistant, and mock integration preview controls were exercised without errors. Production integration Apply remains disabled and honest.
- Full live new-device onboarding is not accepted: no explicit new Linux or Cisco target plus credential reference was supplied. Cisco live connector success is therefore not claimed.
- R-G validation is green except the known repository-wide lint baseline. Prisma migration status remains unapplied and untouched; no destructive database action occurred.
- Separate evidence: `TASK_19_1_ROUTE_ACCEPTANCE_MATRIX.md`, `TASK_19_1_CONTROL_ACCEPTANCE_MATRIX.md`, and `TASK_19_1_BROWSER_RESULTS.md`.

## Task 19.1 R-F - Asset workspace analytics and vendor tabs

- Device workspaces now expose stored-data-only health, connector, availability, resource, finding, action, and change series with five time ranges.
- Device/asset linkage uses OR semantics for related findings/actions/collections, so records linked through either identity are visible.
- Workspace overview and health render six responsive charts; missing series remain explicit no-data states rather than fabricated trends.
- Vendor tabs are capability-gated. Linux has seven operational views; missing data explains reason, requirement, and next action. Cisco tabs derive from verified capability-cache domains.
- Authenticated Playwright passed desktop/mobile Persian RTL and English LTR for the Linux workspace, 30-day interaction, real finding/action points, and CPU no-data state without overflow or console errors.
- Validation passed: serial backend 204/204, backend/frontend builds, Prisma validate, command catalog 137, i18n 73, UTF-8, and diff check.
- R-G global route/control audit remains. R-F performed no connector/device/database mutation.

## Task 19.1 R-E - Action Center and Assistant UX

- Action Center primary workflow is locale-aware in Persian and English and exposes exact revision, runtime resolution, verification, preview/parameters, and audit context.
- Verified no-change outcomes are explicit; successful execution no longer leaves the selected dialog in an optimistic running state.
- Action API errors are URL-free and structured stale-revision recovery fields remain available to the UI.
- Assistant target/refresh/clear/new-request/send/safety/provider controls switch with the active locale.
- Authenticated Playwright passed desktop/mobile Persian RTL and English LTR for `/assistant` and `/actions/cmrix2ddb00ao2glvh3tagbe6` with no overflow or console errors. R-E performed no connector execution.
- Validation passed: serial backend 203/203, backend/frontend builds, Prisma validate/generate, focused R-E 2/2, i18n 73, UTF-8, and diff check. Migration status retains the known unapplied baseline and was not mutated.
- R-F and R-G remain. Asset charts/vendor tabs and the global control audit are not part of this commit.

## Task 19.1 R-D - Canonical ActionPlan revision and connector execution

- Canonical ActionPlan resolution, revision hashing, immutable approval snapshots, and structured stale-revision conflicts are implemented without a schema migration.
- `linux.close-port` is a verified catalog/template/Linux SSH connector capability with adapter-aware UFW, firewalld, nftables, and iptables inspection and effective-state verification.
- Repeated desired-state requests reuse a single succeeded plan only when the stored result proves `executed=true`, `connectorInvoked=true`, and an allowed completed/no-change outcome.
- The authenticated browser executed and re-verified the reviewed port-545 plan on the selected Linux device. Its current stored state is `succeeded`, revision 1, approved revision 1, UFW, `verified_no_change`, and `connectorInvoked=true`.
- Persian Assistant resolution now returns the exact reusable ActionPlan immediately without contradictory `missing_fields` state. Exact-plan desktop/mobile Persian/English rendering has no horizontal overflow.
- Validation is green: Prisma schema, backend build, serial backend suite 201/201, command catalog 137, frontend production build, i18n 73, UTF-8, and diff checks.
- R-E through R-G remain. Action Center localization and optimistic post-execution refresh belong to R-E.

## Task 19.1 R-C - Exact ActionPlan navigation

- Exact ActionPlan routing and selection are implemented across plan-creation entry points.
- Direct URL, reload, browser history, missing-plan recovery, desktop English, and mobile Persian RTL are Playwright-verified.
- The backend missing-plan response is structured and non-retryable; no raw API URL is rendered in this recovery state.
- R-D through R-G remain. The next milestone is R-D canonical ActionPlan revisioning and stale-plan repair.

## Milestone 19A - Product State and Navigation Synchronization

- Product capability state now has one backend-owned versioned contract instead of duplicated frontend `implemented`/`nav` flags.
- Read-only APIs expose the full contract and feature, navigation, vendor, and integration projections under `/api/product-state*`.
- Primary navigation is contract-generated and fail-closed. Every promoted route requires a real route plus backend/API/UI/test readiness; planned, unsupported, disabled, not-configured, and unverified states are rejected.
- Primary destinations are Dashboard; Assets overview/devices/vendors; Security overview/findings/rules; Monitoring overview/Linux; Actions; Assistant; and Integrations overview.
- Settings, mock sync, Cisco, NetBox/Wazuh children, Action aliases, and Monitoring aliases are no longer primary destinations. Their direct routes retain explicit planned, partial, unverified, or not-configured state.
- The four requested 19A reports/contracts are present under `docs/`, and the backend regression suite checks cross-layer feature identity and unsafe navigation mismatch.
- Authenticated Playwright acceptance passed on all 16 requested routes at desktop/mobile in Persian RTL and English LTR with no overflow or runtime/network errors. English shell/navigation is translated; full legacy feature-body translation remains deferred.
- Current validation: Prisma validate/generate pass; backend build and 190/190 tests pass; catalog 136 items passes; frontend build, i18n 73 keys, UTF-8 guard, and whitespace check pass. Existing root lint debt and the existing brittle handoff-heading `docs:check` mismatch remain non-19A blockers.
- Milestone 19B and all later convergence rewrites remain unstarted.

## Task 18.2 Safe Autonomous H1-H6

- Safe milestones H1, H3, H4, H5, and H6 are complete. H2 Prisma recovery is intentionally blocked until a verified nonzero database backup exists and migration-history writes are explicitly safe.
- Prisma baseline analysis found the database schema physically represented through `20260712180000_platform_asset_security_milestone`; `20260712192000_task18_2a_vendor_linux_observability` remains the pending migration. No `migrate resolve`, `migrate deploy`, reset, drop, truncate, or destructive migration command has been run in this safe-mode pass.
- Vendor UX is now honest in primary navigation and Cisco surfaces: read-only IOS-XE capability work is visible, broad Cisco mutations remain planned/non-executable, and planned-only pages are not advertised as primary destinations.
- NetBox and Wazuh integration routes are mock/preview-only and no longer expose fake apply controls.
- Dashboard and Linux monitoring now summarize Linux health in Persian-first operational language while keeping refresh read-only and connector-backed.
- Playwright MCP desktop/mobile checks passed on the hardened dashboard, asset, vendor, Linux monitoring, and integration routes with no visible mojibake, replacement character, dead controls, or horizontal overflow.
- Production blockers: complete a real database backup before H2 migration recovery, apply migration history safely after approval, keep Cisco mutations disabled until verified templates/parsers/prechecks/post-checks exist, and reduce pre-existing lint debt.

## Encoding Repair - Persian UTF-8/Mojibake Guard

- Persian UTF-8 repair is now the active stabilization change after Milestone 18.2A.
- Repaired corrupted Persian labels in the app shell/route registry, backend auth message, AI duration aliases, and the Persian command catalog product doc.
- Added `npm run test:utf8` to fail on known mojibake markers in `src`, `backend/src`, `docs`, and root Markdown task files.
- `.editorconfig` now enforces UTF-8, LF, and final newline for the project.
- Validation and Playwright MCP verification passed: Persian dashboard/sidebar/topbar text renders readably, no replacement character was found, and English mode switches through the UI language selector.
## Task 18.2A - Cisco IOS-XE Read-only Foundation and Linux Observability

- Milestone 18.2A is implemented as a narrow foundation: vendor/platform/capability framework, conservative Cisco platform-family detection, IOS-XE read-only capability metadata, parser fixtures, Cisco capability APIs/UI, Linux health metric schema, and Linux monitoring APIs/UI.
- Cisco status: IOS-XE read-only only. Implemented reads cover version/platform, inventory, CPU/memory, interface status/counters, IP interface brief, VLANs, trunks, EtherChannel, STP, routing table, and ACL inspection. Cisco writes remain planned/non-executable.
- Linux observability status: new metric/health tables and read APIs are available; refresh persists connector-backed metric samples and health snapshots after migration. Read endpoints degrade to unknown/empty data if the migration is pending instead of breaking the UI.
- New routes: `/assets/vendors`, `/assets/vendors/cisco`, `/assets/vendors/cisco/devices`, `/monitoring/linux`, and `/monitoring/linux/:deviceId`.
- New APIs: `/api/vendors*`, `/api/devices/:id/capabilities`, `/api/devices/:deviceId/capabilities/refresh`, and `/api/monitoring/linux*`.
- Playwright MCP final verification passed on authenticated desktop/mobile routes with RTL intact, no overflow, no console errors, and no failed/high-status network requests.
- Validation passed: Prisma validate/generate, backend build, backend full tests 186/186, command catalog validation 136 items, i18n parity 73 keys, and root `npx pnpm@10 build` with the existing chunk warning.

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

## Task 19.1 R-A confirmed runtime blockers (2026-07-13)

- Device registration has no live route or CTA from Assets, Devices, Vendors, or the Cisco empty state.
- Cisco exposes implemented read capability metadata without a registered usable live connector/device path.
- Assistant exact-plan handoff is not route-based and does not preserve an ActionPlan ID.
- The port-545 Linux ActionPlan is rejected with `COMMAND_PLAN_STALE` before connector execution; `connectorInvoked=false` and no success is claimed.
- Repeating the same Assistant request reports `canCreateActionPlan=true` but renders manual-only and creates no second plan.
- Persian pages currently run with `lang=en dir=ltr` and several primary workflows remain English-heavy.
- R-A evidence is recorded in `docs/TASK_19_1_RUNTIME_BASELINE.md`, `docs/TASK_19_1_BROKEN_CONTROL_REGISTER.md`, and `docs/TASK_19_1_API_FAILURE_REGISTER.md`.
- Next controlled milestone is R-B; R-C through R-G have not started.

## Task 19.1 R-B current state (2026-07-13)

- Device onboarding and device workspace foundations are implemented; Product State Contract is `19B.1`.
- Onboarding uses credential references only, rejects plaintext secrets, and requires connector-backed test, supported detection, read-only discovery, preview, and save in order.
- Cisco IOS-XE has a bounded live read-only SSH path for onboarding. No live Cisco target was supplied, so runtime acceptance remains unverified and mutations remain disabled.
- Required registration CTAs and routes are visible and Playwright-verified on desktop/mobile without overflow or 4xx/5xx responses.
- Existing Linux Device IDs and Asset IDs resolve to the same structured workspace contract; missing optional observability tables degrade without a migration.
- R-C through R-G remain unstarted. The next milestone is R-C exact-plan navigation.
## Database/Auth Runtime Status (2026-07-14)

- Normal backend runtime is restored for `cd backend && npm run dev`.
- Shared database URL resolution now aligns Prisma CLI, PrismaClient, PrismaPgAdapter, and pg Pool on `127.0.0.1:55432/firewall_log_auth` for the local stale-runtime case.
- `/api/health/ready` is stable and verifies database connectivity before reporting ready.
- Authentication is reachable again: MCP showed authenticated `/api/auth/me` responses and the Dashboard opened from the live frontend without current console errors.
- Validation passed: Prisma validate/generate, backend build, serialized backend tests 209/209, and frontend build.

## Runtime Auth/CORS Follow-up (2026-07-14)

- Backend is running as one normal `npm run dev` process on port 4000.
- Current frontend origin `http://localhost:5174` is included in backend CORS defaults.
- Runtime proof passed: ready endpoint 10/10, Prisma `appUser.count()`, auth login 200, and MCP-authenticated dashboard on 5174 with no current console errors.

## Database Runtime Port Correction (2026-07-14)

- Normal `cd backend && npm run dev` now uses the existing dotenv database name and credentials on Windows PostgreSQL at `127.0.0.1:5432`.
- `backend/src/config/database-url.ts` no longer rewrites the local development database to the stale temporary `127.0.0.1:55432/firewall_log_auth` runtime; it only normalizes localhost to `127.0.0.1`.
- Verified runtime source: `127.0.0.1:5432/firewall_log_analyzer`.
- Proof passed: `Test-NetConnection 127.0.0.1 -Port 5432`, `/api/health/ready` 200, `/api/auth/login` 200, `/api/auth/me` 200, `/api/assets` 200 with 7 assets, and `/api/credentials` 200 with 4 credential references.
- Backend build passed. Playwright MCP dashboard verification is still pending because no Playwright MCP callable tools were exposed in this turn.

## Device Onboarding Final Repair (2026-07-15)

- Onboarding now has an explicit honest unverified path and a connector-backed verified path that cannot succeed unless `connectorInvoked=true`.
- Sessions persist across restarts; missing, expired, credential-invalid, duplicate, and transaction-rollback paths have focused coverage.
- The additive onboarding-session migration is applied and Prisma reports the schema up to date.
- Browser acceptance created exactly one Device and linked Asset, verified redirect/list state, then safely removed only those test records; protected counts returned to 3/7/4/5/124.

## Device Workspace / Action Center Repair (2026-07-15)

- Phase 1 device verification backend is implemented without a migration: the Device-scoped API reuses durable onboarding sessions and registered connectors.
- Failed real attempts remain unverified while preserving `connectorInvoked=true` when invocation occurred; successful verification still requires connector-backed test, detection, discovery, preview, and commit.
- Next phase: expose this contract as the prominent Connection & Verification workspace surface.
- Phase 2 is complete: the contract is now visible and operable on every managed Device Workspace in Persian and English, with responsive controls and history.
- Next phase: converge the Action Center lifecycle/backend projection.
- Phase 3 is complete: `/api/action-center` now supplies truthful lifecycle, summary, control-capability, detail/audit, retry, and cancellation contracts.
- Current live projection contains 124 preserved ActionPlans; any historical success lacking connector evidence is deliberately counted as failed.
- Next phase: replace the clipped legacy Action Center UI with the responsive workspace.
- Phase 4 is complete: Action Center now uses the lifecycle projection, shows at most 25 rows per page, and keeps execution controls visible in the detail panel.
- Direct routes, both locales, unsupported-action gating, and all three required desktop viewports have authenticated browser proof.
- Next phase: full validation, real connector acceptance, preservation proof, and final cleanup tests.
- Final acceptance is complete. Device Workspace real Cisco attempts invoke the registered connector and persist truthful failure evidence across restart; the current Cisco target times out and therefore remains unverified.
- A temporary read-only Linux ActionPlan completed the full Action Center lifecycle with `connectorInvoked=true`; its evidence/result views passed authenticated browser inspection and the tagged plan was precisely cleaned up.
- Final protected counts are Device 4, Asset 7, DeviceCredential 4, Finding 5, and ActionPlan 124. Prisma is current, the dry-run reconciliation changed zero rows, and no migration is required by this repair.
- Validation passed: backend build and 236/236 tests; frontend build; 97-key locale parity; Persian copy check; 450-file UTF-8 check; responsive authenticated Playwright acceptance; and diff check.
## 2026-07-15 - Action Center urgent execution path

- Implemented visible New Action, preview, Confirm and Execute, Retry, and Run again controls.
- Real execution continues through quick-execute and the UI exposes connector invocation, stdout/stderr, evidence, and final lifecycle status.
- Historical completed records remain immutable; rerun/retry creates a new ActionPlan.
- Browser acceptance remains pending because Playwright MCP navigation is unavailable in the current tool surface.
## 2026-07-15 - Action detail runtime compatibility repair

- Historical ActionPlans with nullable result/approval JSON are normalized before rendering.
- Authenticated Playwright proved planned, failed, and succeeded deep links at 1366x768 with no error boundary, console errors, or horizontal overflow.
- Existing ActionPlan records were read only; mutation-based preview/retry/execution acceptance was intentionally not run under the no-database-modification constraint.
## 2026-07-15 - Assistant Action Center handoff

- Proposed Assistant ActionPlans now show Generate Preview immediately at the top of their Action Center deep link.
- Preview transitions the same plan to visible Confirm and Execute; execution remains routed through quick-execute and requires connector evidence.
- Authenticated Persian browser acceptance succeeded against the registered Linux connector with real stdout and `connectorInvoked=true`.
## 2026-07-15 - Action result page handoff

- Confirmed Action Center executions now open the dedicated `/actions/:actionId/result` page after the backend quick-execute request settles.
- Failed connector executions also open the result page so sanitized error/output evidence remains visible.
- Focused contract tests, frontend/backend builds, and authenticated real-browser acceptance passed; temporary acceptance data was removed.
## 2026-07-15 - Action history controls are executable and visible

- Opening a history ActionPlan now brings its review/preview/execute controls into the viewport instead of leaving the user at the bottom of the history table.
- Row actions are lifecycle-aware and visually primary when operator approval is possible.
- Authenticated AI Assistant -> Action Center -> real connector -> result acceptance passed at 1366x768 with zero console errors; temporary runtime records were removed.
## 2026-07-15 - Asset synchronization workflow repaired

- `/assets/sync` now renders actual preview rows and structured operation results instead of instructing operators to inspect raw API/audit data.
- NetBox and Wazuh mock apply are explicitly review/confirm gated and idempotent; production connectivity remains disabled and clearly labeled until real endpoints and credential references exist.
- Device-to-Asset reconciliation is directly usable and reports scanned/created/updated totals. Focused API and authenticated browser acceptance passed.
## 2026-07-15 - Direct equipment management and history cleanup

- Equipment and vendor clicks now lead to useful summaries, and the device workspace has direct quick-edit and guarded-delete controls.
- Admins can clear completed ActionPlan history after explicit confirmation; active/pending actions are preserved.
- Focused API tests and authenticated 1366x768 browser acceptance passed without deleting existing user records.

## 2026-07-18 - Inventory/onboarding/Cisco/action UX repair

- Active inventory removal now uses archive semantics across Device and Asset instead of hard-deleting only Device rows.
- Device onboarding is a simplified three-step flow with inline credentials, real connection testing, unverified fallback, SPA navigation, and duplicate prevention.
- Cisco onboarding uses secure modern algorithms first and exposes legacy compatibility only behind an explicit Advanced approval path.
- Equipment list, device overview, and Action Center execution surfaces are simplified for operator use, with diagnostics and internals moved to Advanced sections.
- Validation passed for schema/build/catalog/i18n/UTF-8/diff checks; isolated-database tests remain skipped unless TEST_DATABASE_URL is provided.
## 2026-07-18 - Operational dashboard and Cisco capability architecture

- Dashboard is now operational-data backed: recent executions, success/failure, approvals, registrations, and configuration changes come from stored product records.
- Cisco support now has a central operation registry and generated catalog/action definitions. Implemented read-only IOS-XE commands execute through Action Center; configuration/admin areas remain planned and non-executable until safe contracts are added.
- `/api/vendors/cisco/devices` reports active registered Cisco devices from inventory/detection evidence instead of returning a mock empty list.
- Current validation passed for schema, catalog, backend/frontend builds, i18n, UTF-8, diff check, and Cisco parser/fixture coverage. Isolated DB tests still require TEST_DATABASE_URL.
## 2026-07-19 - Cisco legacy onboarding and idempotent registration repair

- Fixed Cisco onboarding so the explicit per-session legacy compatibility option reaches the existing ssh2 connector as append-only legacy algorithms, while modern SSH remains the default and authentication failures do not trigger a legacy retry.
- Test Connection now persists truthful connector invocation and sanitized diagnostics, including connectorInvoked, legacyCompatibilityRequested, legacyCompatibilityApplied, connectionPhase, and structured Cisco error codes.
- Successful Cisco SSH now opens an interactive shell, disables paging, runs show version, detects IOS-XE, IOS Classic, NX-OS, and ASA separately from automation support, and lets unsupported-but-connected platforms proceed to unverified review.
- Device registration now normalizes management IPs and transactionally reuses/reactivates matching Device/Asset records, preserving history. True unrelated ownership returns DEVICE_MANAGEMENT_IP_CONFLICT for the UI conflict actions.
- Validation in progress includes backend build, frontend build/typecheck, Cisco ssh2 fixture tests, onboarding boundary tests, i18n, UTF-8, workflow, and diff checks. No secrets or .env values were printed or changed.

## 2026-07-19 - AI Assistant vendor context routing

- Assistant action routing now preserves selected-device context through context building, intent resolution, target-scoped catalog matching, and ActionPlan creation.
- The selected device is the source of truth for vendor/platform/capabilities/supported actions; prompt text is not used to infer or switch vendor.
- Supported executable MikroTik, Cisco, FortiGate, and Linux target actions can create reviewable ActionPlans again. Unsupported/custom requests stay in Assistant chat with no ActionPlan or Guided Action redirect.
- Validation passed for backend build, command catalog validation, targeted routing/context tests, frontend build, i18n, UTF-8, workflow, and diff check. Full backend tests still need an existing isolated test database; the attempted run failed because `firewall_log_analyzer_test` is absent.

## 2026-07-19 - AI Assistant custom ActionPlan fallback

- Supported executable actions still resolve through the selected device catalog and create connector-backed ActionPlans.
- Operational custom/unmatched prompts for a selected device now create a review-only `custom_vendor_action` ActionPlan for Action Center review across vendors.
- The fallback is not executable: metadata records `manualOnly`, `executionSupport=manual`, `executable=false`, no connector/template, no preview, no execution, and no Guided Action session.
- Informational prompts remain chat-only because the fallback requires an operational verb.
- Validation passed for backend build, targeted AI routing/context tests, frontend build, i18n, UTF-8, workflow, and diff check. Full backend tests were attempted; 232/298 passed and 66 failed due to the missing isolated `firewall_log_analyzer_test` database and older unrelated source-contract expectations.

## 2026-07-19 - AI Assistant selected-vendor ActionPlan coverage

- Selected-device overview/status prompts now route to registered read-only vendor actions when available, so a MikroTik router overview becomes a safe `mikrotik_daily_check` ActionPlan candidate instead of the generic "not ready" response.
- Unmatched selected-device requests now create review-only custom ActionPlans from both chat and `/commands/ai-propose`; neither path returns `actionPlan: null` for a device-scoped custom proposal.
- Executability remains controlled by backend catalog metadata: verified support, connector support, registered execution template, selected device protocol, PolicyGuard, approval, audit, and connector evidence are still required.
- Raw AI-generated commands are still not executable. To make a new custom request executable, add a registered backend catalog item/template/connector handler for that vendor.
- Validation passed for backend build, command catalog validation, targeted AI routing/context tests, frontend build, i18n, UTF-8, workflow, and diff check. Full backend tests were attempted; 235/301 passed and 66 failed due to the missing isolated `firewall_log_analyzer_test` database and older unrelated source-contract expectations.

## 2026-07-19 - AI Assistant selected-device fallback widened

- The remaining chatbot failure was caused by the fallback guard still requiring a device keyword or operational verb. Prompts like `کار هامو نشون بده` with a MikroTik target did not satisfy that guard, so the Assistant answered "not ready" without creating an ActionPlan.
- Any request with a selected device now creates a review-only custom ActionPlan when no executable backend catalog action matches and resolver-required fields are complete.
- Existing supported actions are unchanged and still create executable connector-backed ActionPlans. Custom fallback plans are review-only and cannot execute raw AI commands.
- Validation passed: backend build, command catalog validation (191 items), targeted AI routing/context tests (24/24), frontend build, i18n, UTF-8, workflow, and diff check.
- Full backend `npm test` was attempted and stopped at `TEST_DATABASE_URL_REQUIRED`, so no local development database was touched.

## 2026-07-19 - AI Assistant intent split for read-only Cisco VLAN questions

- The latest chatbot defect was a resolver scoring issue: a read-only VLAN count/list question could match Cisco `create-vlan` because `vlan` was the strongest shared token and generic mutating verbs were counted as lexical evidence.
- The resolver now separates read-only and mutating requests before target-catalog selection, ignores generic verbs as match evidence, and requires a real domain/title/alias token match.
- Persian VLAN spellings (`ویلن`, `ویلان`, `وی لن`) normalize to `vlan`; `چند تا vlan دارم` and `چن تا ویلن دارم` resolve to the read-only executable `cisco.show-vlan-brief` plan, while `create VLAN 123` remains `cisco.create-vlan`.
- Action Center uses catalog metadata titles for generic Cisco wrappers, so the selected action and history rows show the operation title rather than `generic security action`.
- Validation passed: targeted AI routing/context tests (27/27), backend build, command catalog validation, frontend build, i18n, UTF-8, workflow, and diff check. Full backend test remains gated by missing `TEST_DATABASE_URL`.

## 2026-07-19 - AI Assistant custom proposal catalog scoring

- Fixed nearest-catalog coercion for unprepared selected-device prompts. The resolver no longer scores generic wrapper action types such as `generic_security_action`, and action id/type phrase matching now handles separators without falling back across vendors.
- Supported catalog actions still create connector-backed ActionPlan candidates; unmatched Cisco, MikroTik, FortiGate, and Linux requests now become review-only `custom_vendor_action` proposals with no catalog id, no template, and no connector execution.
- Custom proposal ActionPlans now carry expected impact, prechecks, verification, rollback, proposed intent, and explicit review-only/backend-execution-required metadata for Action Center review.
- Validation passed: targeted AI routing/context tests (31/31), backend build, command catalog validation (191 items), frontend build, i18n, UTF-8, and workflow checks.
- Full backend `npm test` remains blocked by missing `TEST_DATABASE_URL`; a DB-backed chat smoke could not run because `firewall_log_analyzer_test` does not exist, and live `/api/devices` returned unauthorized without a browser session.
