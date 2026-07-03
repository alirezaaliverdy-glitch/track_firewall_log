# Task History

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
