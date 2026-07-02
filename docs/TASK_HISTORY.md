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

## Future Task Entry Template

Use this template after every future task:

### Task X: Task Name

Date:

Goal:

Files changed:

Behavior changed:

Protected behavior preserved:

Build/test result:

Commit message:
