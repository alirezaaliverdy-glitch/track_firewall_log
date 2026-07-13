# Task 19.1 API Failure Register — Milestone R-A

Date: 2026-07-13

Scope: requests observed from the new authenticated Playwright MCP context.

## Transport failures and 4xx/5xx

| ID | Request | Request body | Response | Browser behavior | Connector evidence |
|---|---|---|---|---|---|
| API-01 | `POST /api/actions/cmrix2ddb00ao2glvh3tagbe6/quick-execute` | `{"intent":"execute","reason":"Execute from Action Center"}` | `409 {"error":"COMMAND_PLAN_STALE","detail":"The command plan is stale because the ActionPlan parameters changed."}` | Action Center logs a console error and renders the raw English message plus full API URL. | `connectorInvoked=false`; plan remains `dry_run_ready`. |

No other request failure, browser `requestfailed` event, or 4xx/5xx response was observed across the required R-A route pass.

## Successful responses with broken product contracts

| ID | Request | Response status | Contract failure |
|---|---|---|---|
| API-02 | `GET /api/vendors/cisco/devices` | 200 | Returns an honest empty collection, but the UI provides no registration workflow to change that state. |
| API-03 | `GET /api/vendors/cisco` | 200 | Advertises 11 implemented read capabilities and an executable IOS-XE platform while the live Cisco connector path is not registered/usable. UI and backend capability state overstate runtime readiness. |
| API-04 | `POST /api/ai/chat` for `پورت 545 را ببند` with the selected Linux device | 200 | Response/UI reports `canCreateActionPlan=true`, yet the same workflow is labelled manual-only and creates no ActionPlan. |
| API-05 | `GET /api/actions` | 200 | Returns the existing plan with `vendor=linux_edge`, but its stored preview fingerprint uses `vendor=linux` and null catalog/template resolution, leaving the backend-generated plan stale before connector execution. |

## Required contract repair

The 409 must not be suppressed. R-D must:

1. resolve target, vendor/platform, capability, catalog item, template, connector, canonical parameters, and risk before hashing;
2. persist explicit revision identity and the exact approved canonical payload;
3. execute that immutable approved revision without mutating it;
4. create a new revision for user-controlled changes;
5. return genuine conflicts as a structured `{ error: { code, message, retryable, recovery, currentRevision, approvedRevision, changedFields } }` object;
6. preserve success semantics: `succeeded` is impossible unless the real connector ran and `connectorInvoked=true`.
