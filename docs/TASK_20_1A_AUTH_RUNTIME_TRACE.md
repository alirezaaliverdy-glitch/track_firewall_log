# Task 20.1A Authentication Runtime Trace

Date: 2026-07-14

Scope: Milestone A authentication failure and browser gate trace.

## Startup Authentication Failure

`buildApp()` was reproduced against unreachable `127.0.0.1:5432` before any edits.

Failure path:

```text
buildApp
  -> runStartupDatabaseQuery("Authentication bootstrap", bootstrapAdmin)
  -> bootstrapAdmin
  -> prisma.appUser.count()
  -> Operation has timed out
  -> Authentication bootstrap failed: database connection did not become ready.
```

The failure occurs before the backend can safely serve authenticated routes when the default database endpoint is unavailable.

## Current Auth Route Behavior

Current login route:

```text
POST /api/auth/login
  authenticate(username, password)
  createSession(user.id)
  set firewall_session cookie
```

Current session route:

```text
GET /api/auth/me
  getSessionUser(cookie)
```

Current limitation:

- Auth route handlers do not currently translate database-unavailable failures into a structured 503 contract.
- Invalid credentials are a normal 401.
- Startup bootstrap failure prevents the normal auth service from becoming available when PostgreSQL is permanently unavailable.

## Playwright MCP Gate

Playwright MCP tools were available in this exact Codex session and were invoked before implementation.

MCP opened:

```text
http://localhost:5173/
```

Observed:

```text
Page URL: http://localhost:5173/
Page Title: log-app
Visible surface: authenticated Persian dashboard shell
```

MCP network evidence in the existing browser session:

```text
GET /api/auth/me -> 200
GET /api/assets -> 200
GET /api/security/findings -> 200
GET /api/monitoring/linux/summary -> 200
GET /api/product-state/navigation -> 200
```

This means the current MCP browser context is already authenticated through the currently running backend. The login failure is still reproduced at backend startup against the unreachable default PostgreSQL endpoint, but the browser session itself does not currently show the unauthenticated login failure.

## Current Acceptance Status

- Authentication startup failure reproduced: yes.
- Existing MCP session authenticated dashboard: yes.
- Fresh login after repair: pending Milestone C.
- Refresh session preservation after repair: pending Milestone C.
- No auth 5xx after repair: pending Milestone C.

