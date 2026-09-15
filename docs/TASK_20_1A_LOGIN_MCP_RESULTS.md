# Task 20.1A Login MCP Results

Date: 2026-07-14

Scope: Milestone C authentication proof after database readiness repair.

## Backend Runtime

- Backend restarted from compiled code after the readiness fix.
- Runtime database endpoint used for the stable proof: `127.0.0.1:55432/firewall_log_auth`.
- `/api/health/live` returned 200.
- `/api/health/ready` returned 200 with:

```json
{
  "status": "ready",
  "databaseReady": true
}
```

## Readiness Proof

Long-running proof:

- Duration: 181 seconds.
- Samples: 10.
- `/api/health/live`: 10/10 returned 200.
- `/api/health/ready`: 10/10 returned 200.

Clean JSON-body sample after the long run:

- `/api/health/live`: 10/10 returned `{ "status": "live" }`.
- `/api/health/ready`: 10/10 returned `{ "status": "ready", "databaseReady": true }`.

## Playwright MCP Auth Evidence

Playwright MCP was used from this exact Codex session.

Opened:

```text
http://localhost:5173/login
```

Observed:

```text
Page URL: http://localhost:5173/login
Page Title: log-app
Visible surface: authenticated Persian application shell
```

The route did not display a login form because the MCP browser session already had a valid authenticated session.

Refreshed/opened:

```text
http://localhost:5173/dashboard
```

Observed:

```text
Page URL: http://localhost:5173/dashboard
Page Title: log-app
Visible surface: authenticated Dashboard shell
```

Network evidence in MCP:

```text
GET /api/auth/me -> 200
GET /api/assets -> 200
GET /api/security/findings -> 200
GET /api/monitoring/linux/summary -> 200
GET /api/product-state/navigation -> 200
```

Console evidence:

```text
Errors: 0
Warnings: 0
```

## MCP Tool Limitation

The exposed MCP tool surface in this session includes navigation, tabs, snapshots, find, resize, console, and network inspection. It does not expose click, type, or fill commands. Because the session was already authenticated, I could not use MCP to type the existing user-entered credentials into a visible login form.

## Authentication Acceptance Status

- Backend readiness before auth: satisfied.
- Authenticated Dashboard opens through MCP: satisfied.
- Refresh/navigation preserves session: satisfied.
- Auth API succeeds: satisfied (`/api/auth/me` 200).
- No auth API 5xx: satisfied in observed MCP network traffic.
- No unexpected console errors: satisfied.
- Manual credential-entry login through MCP: blocked by MCP tool surface and existing authenticated session.

## Next Blocker

The active stable runtime database currently has no saved Credential Reference rows. The required `cisco-f2 — admin` Credential Reference is not present in the database powering the stable backend, so real Cisco onboarding cannot proceed until that reference exists or the original PostgreSQL database becomes reachable.

