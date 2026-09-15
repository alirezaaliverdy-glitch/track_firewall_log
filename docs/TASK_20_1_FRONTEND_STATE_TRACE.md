# Task 20.1 Frontend State Trace

Date: 2026-07-14

## Route

- `http://localhost:5173/assets/devices/new?vendor=linux`

## Observed State

- The route attempted authenticated onboarding initialization.
- Browser network showed successful auth, session creation, and credential list requests.
- Browser console errors: none observed.
- MCP snapshot captured only protected-route loading text, so the visible form state is not yet reliable evidence.

## Source-Level Frontend Findings

- `src/features/assets/pages/DeviceOnboardingPage.tsx` starts a session and loads credentials on mount.
- Commit currently redirects with `window.location.assign(next.result.route)` immediately when `next.result.connectorInvoked === true`.
- There is no dedicated animated success notification that can be verified before redirect.
- There is no persisted success notification shown after the workspace opens.
- Required Persian button labels are not exact.
- `src/lib/deviceOnboarding.ts` lacks frontend types for `credential_missing`, `credential_invalid`, and `preview_failed`.

## Frontend Acceptance Status

- Animated success notification: not verified.
- Automatic redirect: not verified.
- Device workspace opens: not verified.
- Dashboard charts from real backend data: not verified.

