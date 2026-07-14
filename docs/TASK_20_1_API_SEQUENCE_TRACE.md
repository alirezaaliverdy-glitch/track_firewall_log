# Task 20.1 API Sequence Trace

Date: 2026-07-14

## Observed Browser API Sequence

Playwright MCP opened the onboarding route and observed this backend sequence:

1. `GET /api/auth/me` -> `200 OK`
2. `GET /api/auth/me` -> `200 OK`
3. `POST /api/device-onboarding/sessions` -> `201 Created`
4. `GET /api/credentials` -> `200 OK`

No authentication API `5xx` responses were observed during this route load.

## Expected Successful Sequence

Task 20.1 requires this real sequence before completion can be claimed:

1. Start onboarding session.
2. Save connection answers with a stored credential reference.
3. Run connector-backed connection test.
4. Detect supported platform.
5. Run connector-backed read-only discovery.
6. Build preview from real discovery.
7. Commit Device.
8. Persist Device and related workspace state.
9. Return `connectorInvoked=true`, `deviceId`, and workspace route.
10. Render animated success notification.
11. Automatically redirect to Device workspace.
12. Render Device workspace from persisted backend data.
13. Render Dashboard charts from real backend data.

## Current Sequence Stop

The current runtime stops before step 2 because the database has no saved Credential Reference and no real target has been provided. Continuing to connector invocation without those inputs would be a false-positive acceptance result.

