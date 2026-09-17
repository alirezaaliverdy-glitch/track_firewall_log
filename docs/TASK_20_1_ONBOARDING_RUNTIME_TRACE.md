# Task 20.1 Onboarding Runtime Trace

Date: 2026-07-14

Scope: Task 20.1 Milestone A failure trace for real device onboarding, workspace redirect, and dashboard evidence.

## Runtime Used

- Frontend: `http://localhost:5173`
- Backend: `http://127.0.0.1:4000`
- Database: temporary local PostgreSQL runtime at `127.0.0.1:55432`, schema pushed for this task session
- Browser evidence: Playwright MCP from this Codex session only
- Local Playwright fallback: not used

## Playwright MCP Evidence

- Route opened: `http://localhost:5173/assets/devices/new?vendor=linux`
- Auth API: `GET /api/auth/me` returned `200 OK`
- Onboarding API: `POST /api/device-onboarding/sessions` returned `201 Created`
- Credential API: `GET /api/credentials` returned `200 OK`
- Console errors on the onboarding route: none observed
- Snapshot symptom: page remained on the protected-route loading text `Verifying secure session...` during MCP snapshot capture even though authenticated API calls returned successfully.

## Database Evidence

Runtime database query showed:

```json
{
  "devices": [],
  "credentials": []
}
```

This means there is no persisted Device and no saved Credential Reference available for the required real connector-backed onboarding sequence.

## Current Result

The successful Task 20.1 acceptance flow is not complete. The system can start an authenticated onboarding session, but it cannot truthfully prove `connectorInvoked=true`, Device persistence, animated success notification, automatic redirect, or workspace opening without a real reachable target and a saved credential reference.

## Required Blockers

- Missing real reachable device target.
- Missing saved Credential Reference.
- No Device persisted in the runtime database.
- No connector-backed test/discovery/commit evidence exists for Task 20.1 yet.

## Frontend Gaps Observed

- The current commit handler redirects immediately after a completed commit and does not provide a verifiable animated success notification before or after navigation.
- The button text does not exactly match the Task 20.1 required labels.
- The frontend status union omits backend statuses such as `credential_missing`, `credential_invalid`, and `preview_failed`.
- The onboarding route needs another MCP pass after implementation because the snapshot showed the protected-route loading surface despite successful API calls.

## Backend Gaps Observed

- The service records connector-backed completion only after the full test, discovery, preview, and commit path.
- Failure responses return structured errors, but the latest session state is not returned with each failed step.
- The public session shape does not expose all requested Task 20.1 synchronization fields such as `sessionId`, `revision`, `nextAllowedActions`, `blockingReason`, `platformDetected`, and top-level `connectorInvoked`.

