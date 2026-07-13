# Task 19.1 API Failure Register — Milestone R-A

Date: 2026-07-13

## Milestone R-D disposition

- API-01 is resolved: the same reviewed request now returns 200/succeeded, and repeated verification returns `verified_no_change`; both require `connectorInvoked=true`.
- API-04 is resolved: deterministic executable resolution returns `linux_close_port`, `canCreateActionPlan=true`, no contradictory missing-fields blocker, and the exact reusable ActionPlan ID.
- API-05 is resolved: preview now stores resolved vendor/platform, capability, catalog ID, template, connector, canonical parameters/payload hashes, and revision identity before execution.
- Genuine post-approval controlled-input changes remain a 409, but the response is now nested and structured with code, retryability, recovery, current/approved revisions, and changed fields.

Scope: requests observed from the new authenticated Playwright MCP context.

R-C update: `GET /api/actions/:id` now returns structured, non-retryable `ACTION_PLAN_NOT_FOUND` for an unknown plan. Action Center renders the code, requested ID, and recovery control without a raw backend URL. The expected 404 remains observable and is never converted to success.

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
