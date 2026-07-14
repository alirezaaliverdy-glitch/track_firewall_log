# Task 20 Prechange Runtime Baseline

Date: 2026-07-14

## Repository State

- Branch: `product-persian-command-catalog`
- Recent head: `ef1ae7b Repair Task 19.2A onboarding runtime audit`
- `git status --short` contains untracked task/spec/evidence files and Playwright artifacts. No `.env` file is staged.
- Prisma migrate status reports 34 migrations not applied in local migration history. No destructive database command was run.

## Mandatory MCP Gate

Playwright MCP is available and opened `http://localhost:5173/` in this session. See `docs/TASK_20_MCP_PROOF.md`.

## Current Onboarding State

The backend already exposes a Task 19.2A onboarding service with these states:

```text
draft, answers_saved, connection_testing, connection_verified,
connection_failed, platform_detecting, platform_detected,
platform_unsupported, discovery_running, discovery_completed,
discovery_failed, preview_ready, saving, completed, save_failed,
validation_failed, cancelled
```

Current mismatches against Task 20:

- Route aliases use `/test`, `/detect`, and `/preview`; Task 20 requires `/test-connection`, `/detect-platform`, and `/build-preview` in addition to the explicit flow.
- Session state is stored in memory, so onboarding session persistence is not durable across backend restart.
- `credential_missing`, `credential_invalid`, and `preview_failed` are not distinct public states.
- Cisco discovery currently runs a bounded subset of the Task 20 read-only proof set.
- No live Cisco/Linux/FortiGate/MikroTik credential reference was selected during this baseline, so no live connector success or Device persistence is claimed here.

## Current Tools and Diagnostics State

At prechange baseline, `/tools` and `/tools/network-check` existed, but `src/features/tools/pages/ToolsPage.tsx` explicitly labeled them as non-executing Task 19.2 placeholders. There was no real persisted diagnostic session, Check-Host provider invocation, Nmap worker invocation, monitor scheduler, or diagnostic history visible from the page.

Task 20 follow-up in this slice replaced the placeholder for public diagnostics with a Check-Host-backed diagnostic API and UI. Nmap worker and monitor scheduler remain unimplemented and visibly gated.

## Current Product State

Product State contract version is `19.2-A`. `tools.overview` and `tools.network_check` are marked partial because they are stable non-executing routes only. Task 20 must advance this only when backend/API/UI/test evidence exists.

## Safety

- `.env` was not read or modified.
- No secrets were printed.
- No destructive Prisma or git command was run.
- No Nmap scan or external diagnostic provider call was run during baseline.
- HTTP 200 responses are not treated as business success.
