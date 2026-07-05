# Task History

## Task 15.1: Multi-Vendor Daily Check Engine + AI/Catalog Execution Fix

Date: 2026-07-05

Goal: Add vendor-aware daily checks and ensure supported Persian AI/catalog requests resolve to real controlled templates.

Files changed: Daily Check registry, engine, routes and UI; Linux/MikroTik templates and connectors; catalog, aliases, migration, grouped results, tests, and docs.

Behavior changed: Linux/MikroTik daily checks run bounded read-only commands after confirmation. Other vendors remain honest manual-only profiles. Stale previews rebuild once and continue; results open in a new tab; success still requires a real connector result.

Protected behavior preserved: `quick_controlled`, unrestricted lab confirmation, PolicyGuard, connector allowlists, audit, and real-result gating.

Build/test result: catalog validation and builds passed; backend suite passed after applying the enum migration to the local test database.

Commit message: Add vendor-aware daily checks and execution mapping

## Task 14.1E: Lab-Unrestricted Real Execution for AI and Catalog Actions

Date: 2026-07-04

Goal: Route supported AI and prepared actions through one real connector path after a single lab confirmation without downgrading them to manual proposals.

Files changed:

- Added five Prisma action/intent types, migration, product/legacy catalog entries, execution templates, planners, and Linux SSH handlers for sudo membership, group checks, lock, and unlock.
- Added Persian username/operation extraction, exact missing-field questions, AI ActionPlan catalog metadata enrichment, and executable command-catalog AI fallback mapping.
- Relaxed only risk/break-glass/rollback policy blockers in lab unrestricted mode while retaining device, credential, parameter, template, connector, audit, and real-result checks.
- Added explicit execute-intent enforcement, duration/result persistence, lab policy/template logs, and real fake-connector AI execution tests.

Behavior changed:

- «یوزر tavakoli رو از گروه sudo خارج کن» maps to `linux_remove_user_from_sudo` with `username=tavakoli`, `executionSupport=connector`, and a registered SSH template.
- Supported high-risk actions execute after the existing confirmation click in unrestricted lab mode; they are never marked succeeded without connector invocation.
- Missing usernames return only «نام کاربر لینوکس چیست؟» and do not create broken plans.

Protected behavior preserved:

- `quick_controlled`, preview, confirmation, PolicyGuard, connector allowlists, audit, result display, and MikroTik behavior remain enabled. Raw AI shell commands remain non-executable.

Build/test result:

- Command catalog validation passed: 41 items.
- Backend TypeScript build passed; backend tests passed: 105/105.
- Frontend TypeScript/Vite production build passed (existing bundle-size warning only).

Commit message:

- Enable lab execution for supported AI actions

## Task 14.1D: Fix Preview-vs-Execution Bug in Prepared Command Flow

Date: 2026-07-04

Goal: Ensure Confirm & Execute leaves preview mode, invokes the real connector exactly once, persists output, and never reports preview-only work as success.

Files changed:

- Replaced whole-parameters stale comparison with a stable execution-input fingerprint.
- Fixed quick-controlled approval recognition for product command-catalog metadata and removed the catch that returned failed previews as HTTP 200.
- Added explicit preview/execute intent, connector invocation metadata, complete structured execution traces/audits, and Persian preview-only errors.
- Added fake Linux connector tests proving planning calls zero executions and explicit execution calls exactly once with reloadable stdout.

Behavior changed:

- Existing fresh previews are reused; missing previews are generated once; user-input changes produce a real stale error.
- `succeeded` requires connector invocation and a real successful result. UI navigation additionally checks `connectorInvoked=true`.
- Backend logs cover request, catalog, preview, policy, connector, remote command, result persistence, and final outcome with safe bounded output metadata.

Protected behavior preserved:

- `quick_controlled`, PolicyGuard, confirmation, audit, and existing Linux/MikroTik connector implementations remain intact.

Build/test result:

- Command catalog validation passed: 36 items.
- Backend TypeScript build passed; backend tests passed: 103/103.
- Frontend TypeScript/Vite production build passed (existing bundle-size warning only).

Commit message:

- Fix prepared command preview execution transition

## Task 14.1C: Fix Prepared Command Real Execution, Lifecycle, and Result Display

Date: 2026-07-04

Goal: Make confirmation execute the registered connector/template, persist an honest execution result, and open a clean Persian result view.

Files changed:

- Tightened catalog resolution, execution metadata, connector-result success gating, and Linux command fallbacks.
- Added Persian preview/result UX, catalog execution debug fields, parsed listening-port results, and raw-output fallback.
- Added lifecycle/template/UI regression coverage and updated product documentation.

Behavior changed:

- Planning remains non-executing; `executed` stays false until a real connector command succeeds.
- Successful quick execution stores timestamps, exit code, stdout/stderr, executor, and navigates to `/actions/:id/result`.
- Manual-only and unsupported operations cannot display or use automatic execution.

Protected behavior preserved:

- `quick_controlled`, PolicyGuard, explicit confirmation, connector checks, audit logging, and existing Linux/MikroTik connector architecture remain in place.

Build/test result:

- Command catalog validation passed: 36 items.
- Backend TypeScript build passed; backend tests passed: 101/101.
- Frontend TypeScript/Vite production build passed (existing bundle-size warning only).

Commit message:

- Fix prepared command execution lifecycle and results

## Task 10: Project Integrity and Production Safety

Summary:

- Cleaned project config and env handling
- Improved production safety
- Added `APP_PROFILE`
- Improved docker-compose env handling
- Fixed misleading privacy notice
- Preserved `quick_controlled` lab behavior

Commit:

- Stabilize project config and production safety

## Task 11.0: Codex Memory and Living Project Status

Summary:

- Added `AGENTS.md`
- Added living current status docs
- Added task history docs
- Added architecture map
- Added project snapshot helper script

Commit:

- Add Codex project memory and living status docs

## Task 12: Vendor Deep Telemetry Foundation - Linux Live Collector

Date:

2026-07-02

Goal:

Add read-only Linux security snapshots, posture analysis, bounded live log streaming, suspicious signal detection, a focused telemetry UI, and compact AI context integration.

Files changed:

- Linux SSH connector telemetry allowlist and stream lifecycle
- Linux telemetry snapshot, analyzer, stream manager, API routes, and tests
- Linux telemetry frontend API and panel
- AI security context telemetry summary
- Project status, task history, architecture map, and Linux telemetry guide

Behavior changed:

- Linux SSH devices can collect and store structured security snapshots.
- Authenticated users can start bounded read-only log streams over SSE.
- Suspicious live signals are highlighted and stored as security events.

Protected behavior preserved:

- Action Center and action execution paths are unchanged.
- `ACTION_EXECUTION_MODE=quick_controlled` remains supported.
- `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true` remains supported.
- Linux telemetry runs read-only allowlisted commands only.

Build/test result:

- Backend build: passed
- Backend tests: 67 passed
- Frontend build: passed

Commit message:

- Add read-only Linux deep telemetry foundation

## Task 12.1: Fix Linux Telemetry Device Selection and SSH Port Handling

Date:

2026-07-02

Goal:

Use the selected Linux device and its configured SSH management endpoint throughout snapshot, analysis, status, and stream operations.

Files changed:

- Linux connector capability and connection-port resolution
- Linux telemetry status, errors, snapshot metadata, and stream startup
- Linux telemetry device selection and connection display
- Linux telemetry regression tests and documentation

Behavior changed:

- Linux vendor/type/capability aliases now use the same Linux SSH capability rule as Device Test.
- `managementPort` is preferred for SSH connections, with port 22 only as the final fallback.
- Connection port and detected remote sshd service port are displayed separately.
- Missing credentials, incompatible devices, connection failures, and limited sudo now have distinct messages.

Protected behavior preserved:

- Action Center and action execution behavior are unchanged.
- `ACTION_EXECUTION_MODE=quick_controlled` remains supported.
- `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true` remains supported.
- Telemetry remains read-only and command allowlisted.

Build/test result:

- Backend build: passed
- Backend tests: 70 passed
- Frontend build: passed

Commit message:

- Fix Linux telemetry device selection and SSH port handling

## Task 12.3: Make Linux Telemetry Real-Time, Actionable, and Easy to Use

Date:

2026-07-02

Goal:

Provide one-click live monitoring, immediate findings, resilient SSE viewing, source presets, compact AI analysis, and proposal-only fix actions.

Files changed:

- Linux live stream warning and SSE lifecycle handling
- Linux telemetry presets, finding aggregation, and fix-action mapping
- Three-column Linux monitoring, findings, and events UI
- Linux telemetry tests and living documentation

Behavior changed:

- Monitoring starts with smart sources and automatically collects a stale or missing baseline.
- Live findings update while streams remain active and can be acknowledged.
- Actionable findings create ActionPlans for review without execution.
- EventSource reconnects no longer stop server-side SSH streams.
- Source failures appear as inline warnings while healthy sources continue.

Protected behavior preserved:

- Action Center and action execution behavior are unchanged.
- `ACTION_EXECUTION_MODE=quick_controlled` remains supported.
- `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true` remains supported.
- Linux telemetry remains read-only and command allowlisted.

Build/test result:

- Backend TypeScript build passed.
- Backend tests passed: 73/73.
- Frontend TypeScript/Vite production build passed (existing bundle-size warning only).

Commit message:

- Add actionable real-time Linux security monitoring

## Task 12.4: Multi-Vendor Full Analysis and Hardening Engine

Date:

2026-07-02

Goal:

Make Full Analysis and Hardening Suggestions vendor-aware across MikroTik, Linux, FortiGate, pfSense, Cisco, and generic/unknown devices.

Files changed:

- Added vendor analysis profiles, deterministic snapshot checks, missing-telemetry reporting, and compact AI context summaries.
- Extended assessment persistence and hardening generation with vendor/device results and generic proposal-only fix actions.
- Added vendor/device tabs and Collected data, Missing data, Findings, and Recommended actions UI groups.
- Added multi-vendor regression tests and registered them in the backend test command.

Behavior changed:

- Full Analysis selects the correct profile per device and no longer displays MikroTik-only fields for other vendors.
- Missing snapshots are explicitly reported as `data not collected` with vendor-specific collection guidance.
- Hardening recommendations expose vendor, device, severity, evidence, impact, recommended fix, ActionPlan support, and action hints.
- Create Fix Action creates a proposed ActionPlan only; it does not execute a connector action.
- AI assessment context contains compact vendor summaries and does not include raw logs by default.

Protected behavior preserved:

- Existing MikroTik analysis and catalog-backed actions remain available.
- Action execution, PolicyGuard, connectors, and audit flow are unchanged.
- `ACTION_EXECUTION_MODE=quick_controlled` remains supported.
- `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true` remains supported.

Build/test result:

- Backend TypeScript build passed.
- Backend tests passed: 79/79.
- Frontend TypeScript/Vite production build passed (existing bundle-size warning only).

Commit message:

- Add multi-vendor analysis and hardening engine

## Future Task Entry Template

## Task 14.1B: Fix Command Catalog Action Creation, Navigation, and Quick Execute

Date:

2026-07-04

Goal:

Connect the Persian product catalog to the existing controlled execution path so newly created plans open immediately in Action Center and resolve their real template during quick execution.

Files changed:

- Added complete, versioned command-catalog metadata to created ActionPlans and a central product catalog action resolver with safe legacy fallback.
- Updated execute and quick-execute guards to validate catalog state, template, exact action type, required params, device vendor, and connector support before PolicyGuard/connector execution.
- Added URL/query and event handoff from the Persian catalog to Action Center, automatic plan selection/detail opening, Persian execute labels, and frontend blocking for manual/non-implemented metadata.
- Added backend/frontend integration coverage for metadata, needsInput, manual rejection, quick-execute resolution, and navigation handoff.

Behavior changed:

- Successful catalog plan creation navigates to `?selected=<id>#action-center`, refreshes the list, and opens the new plan.
- Implemented product commands no longer fail the legacy `ACTION_NOT_IN_CATALOG` guard. Manual/planned/unsupported commands remain non-executable with explicit Persian reasons.
- Existing metadata-less actions retain the legacy catalog path or a unique safe implemented-action fallback.

Protected behavior preserved:

- No creation-time auto-execution was added. `quick_controlled`, confirmation, PolicyGuard, connector support checks, audit logging, Device Registry, and existing Linux/MikroTik behavior remain intact.

Build/test result:

- Catalog validation passed (36 items); backend tests passed 97/97; backend and frontend builds passed.

Commit message:

- Fix catalog Action Center quick-execute flow

## Task 14.1: Make All Prepared Commands Real, Validated, and Vendor-Executable

Date:

2026-07-04

Goal:

Eliminate decorative executable commands by enforcing a strict catalog contract backed by real vendor planners/connectors and validating all inputs before ActionPlan persistence.

Files changed:

- Added four implementation states, execution support metadata, Persian parameter help, defaults/candidates, capability requirements, validation rules, and explicit rollback contracts.
- Added startup/CLI catalog validation and a real execution-template registry cross-checked against connector and planner supported actions.
- Added dedicated Linux SSH, failed-login, sudo-user, and fail2ban read actions plus Prisma enum migration and connector templates.
- Added device-aware search, pre-persistence `needsInput`, planned/unsupported rejection, state-aware Persian UI, Action Center Persian repair labels, and exhaustive catalog tests.

Behavior changed:

- Fourteen prepared commands are connector-backed (eight Linux, six MikroTik); all others are clearly manual-only or planned.
- Missing/invalid parameters return Persian `422 NEEDS_INPUT` without creating an ActionPlan. Planned/unsupported commands cannot create plans.
- Manual-only commands create non-executable generic review plans. AI fallback remains proposal-only.

Protected behavior preserved:

- `quick_controlled`, unrestricted lab management, authentication, Device Registry, Action Center, existing connectors, PolicyGuard, auditing, and confirmation boundaries are unchanged.

Build/test result:

- Catalog validation and backend/frontend builds passed; backend regression suite passed 93/93 before final documentation-only changes.

Commit message:

- Enforce real validated vendor command catalog

## Task 14: Persian Product Pivot — Backend-First Command Catalog Architecture

Date:

2026-07-04

Goal:

Establish a Persian-first curated command workflow where AI is fallback and every operation enters the existing controlled ActionPlan lifecycle.

Files changed:

- Added product mode configuration, typed six-vendor command catalog, Persian search/filter/detail/action-plan APIs, and proposal-only AI fallback.
- Added the Persian command catalog UI and prepared prominent product/device workflow labels for Persian operation.
- Added catalog regression tests and product/architecture documentation.

Behavior changed:

- Users can select a device, search Persian ready-made commands, validate required inputs, and create a proposed ActionPlan in Action Center.
- Unsupported connector operations remain reviewable proposals; AI fallback produces a draft or proposed ActionPlan and never executes.

Protected behavior preserved:

- Authentication, Device Registry, Action Center, existing connectors, PolicyGuard, audit, `quick_controlled`, and unrestricted lab management remain intact.

Build/test result:

- Backend build passed; backend tests passed 90/90; frontend production build passed (existing bundle-size warning only).

Commit message:

- Add Persian backend-first command catalog foundation

## Task 13: Vendor-Aware Telemetry & Findings Engine

Date:

2026-07-03

Goal:

Turn vendor telemetry into stable, high-value findings while keeping raw events separate and remediation proposal-only.

Files changed:

- Added the 12-vendor telemetry registry, normalized Finding schema/migration, shared finding engine, APIs, SSE integration, AI Evidence Pack context, vendor-aware Device Telemetry UI, and regression tests.
- Updated the central orchestrator prompt and living project documentation.

Behavior changed:

- Linux live events and snapshots now use the same vendor engine; duplicate signals aggregate by stable fingerprint and low-value noise is suppressed.
- Persisted findings remain visible after stream disconnect and expose evidence, risk explanation, recommended intent, and Create ActionPlan.
- Proposed remediation uses the existing ActionPlan flow and never auto-executes.
- Linux, MikroTik, FortiGate, and pfSense rules are implemented; eight additional vendor/platform profiles contain at least five core scaffold rules each.

Protected behavior preserved:

- Existing Action Center, PolicyGuard, connector, audit, authentication, and quick-controlled lab execution paths are unchanged.
- `ACTION_EXECUTION_MODE=quick_controlled` and `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true` remain supported.

Build/test result:

- Backend TypeScript build passed.
- Backend tests passed: 88/88.
- Frontend production build passed (existing bundle-size warning only).

Commit message:

- Add vendor-aware telemetry findings engine

## Task 12.5: AI Evidence Pack + Strong Security Orchestrator Prompt

Date:

2026-07-02

Goal:

Reduce in-app AI context cost and improve security-orchestration behavior with a central prompt and compact vendor-aware Evidence Packs.

Files changed:

- Added the Evidence Pack builder, configurable context budgets, vendor field allowlists, secret filtering, raw-log controls, and regression tests.
- Strengthened the central Security Orchestrator mission and structured output contracts.
- Updated provider, chat, Full Analysis/Hardening metadata, and the lightweight AI context debug display.
- Updated project instructions, environment example, and architecture/status documentation.

Behavior changed:

- OpenAI-compatible calls now receive the central prompt, compact Evidence Pack, user request, and bounded action hints instead of the full legacy context.
- Raw logs remain excluded by default; credential-shaped fields are removed recursively.
- Operational requests remain proposal-oriented, including critical/destructive and unsupported operations.

Protected behavior preserved:

- Action Center execution, PolicyGuard, connectors, and audit flow are unchanged.
- `ACTION_EXECUTION_MODE=quick_controlled` remains supported.
- `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true` remains supported.

Build/test result:

- Backend TypeScript build passed.
- Backend tests passed: 83/83.
- Frontend TypeScript/Vite production build passed (existing bundle-size warning only).

Commit message:

- Add compact AI evidence packs and orchestrator prompt

Use this template after every future task:

### Task X: Task Name

Date:

Goal:

Files changed:

Behavior changed:

Protected behavior preserved:

Build/test result:

Commit message:
