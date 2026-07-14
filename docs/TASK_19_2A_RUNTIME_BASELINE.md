# Task 19.2A Runtime Baseline

Date: 2026-07-14

## Scope

This baseline covers Task 19.2A runtime repair for onboarding, Dashboard routing, Linux monitoring optional-table behavior, and control audit readiness.

## Reproduced Failures

| Area | Baseline behavior | Evidence |
| --- | --- | --- |
| Cisco onboarding answers | `POST /api/device-onboarding/sessions/:id/answers` returned HTTP 200 but left the session in `draft`; no connector, detection, discovery, preview, or Device persistence happened. | Service code used the old `draft/tested/detected/preview_ready/committed` state set and reset `/answers` back to `draft`. |
| Preview button | UI label said `ذخیره پاسخ‌ها و ساخت Preview`, but it only saved answers. | Frontend called only `answerOnboarding(...)`; no `/preview` endpoint existed. |
| Connector proof | Connection success could not be inferred from answer saves. | Test/connection was a separate API, but UI progression hid the state-machine boundary. |
| Dashboard diagnostics | `تست سریع شبکه` and `بررسی دامنه یا IP` routed to `/integrations`. | Dashboard source used `/integrations` for both controls. |
| Linux monitoring | Missing optional observability tables could trigger Prisma missing-table stack traces before fallback. | `listLinuxMonitoringDevices()` queried `healthSnapshots` first and caught the Prisma error after logging. |
| Playwright MCP | Connected Playwright MCP tools were not exposed to this Codex turn. | Tool discovery exposed document/GitHub connectors only. |

## Runtime Safety

- No `.env` file was read or modified.
- No destructive database command was run.
- No raw AI CLI or scan worker was invoked.
- Cisco onboarding remains read-only.
- Device onboarding success is only valid after connector-backed test/discovery and persisted Device ID.
