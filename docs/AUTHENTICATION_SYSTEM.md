# Authentication System

## Scope

The application uses a self-hosted, database-backed authentication system. There is no public registration flow and no email-based password reset. The first administrator is created only by the controlled bootstrap seed when the user table is empty.

## Request flow

```text
Browser startup
  -> GET /api/auth/session-status
  -> unauthenticated: load only the login surface
  -> authenticated: lazy-load the protected application

Login
  -> normalize and bound inputs
  -> combined IP and IP+username rate limits
  -> constant-work password verification
  -> issue a random opaque session token
  -> store only its HMAC hash in PostgreSQL
  -> rotate any session already present in the browser
  -> set an HttpOnly, SameSite=Lax, high-priority cookie
  -> audit the security-safe outcome

Authenticated mutation
  -> validate session and idle/absolute expiry
  -> validate trusted Origin
  -> validate session-bound CSRF token
  -> validate central RBAC permission
  -> execute the route
```

## API contract

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Authenticate and create/rotate a session |
| `GET` | `/api/auth/session-status` | Restore browser authentication state without returning 401 for an anonymous visitor |
| `GET` | `/api/auth/me` | Return the authenticated public user projection |
| `GET` | `/api/auth/csrf` | Return a token bound to the current session |
| `GET` | `/api/auth/sessions` | List the current user's live sessions without exposing token hashes |
| `DELETE` | `/api/auth/sessions/:id` | Revoke one session owned by the current user |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `POST` | `/api/auth/logout-all` | Revoke every session for the current user |
| `POST` | `/api/auth/change-password` | Verify the current password, update its bcrypt hash, and revoke every session atomically |

All authenticated mutations require CSRF and a declared central permission. Account/session operations use `auth.session.manage`, which is available to viewer, operator, and admin roles for their own account.

## Password handling

- Passwords are never stored or returned in plaintext.
- Password hashes use bcrypt; new password hashes use cost 12.
- Authentication accepts bounded inputs only and performs a dummy bcrypt comparison for unknown usernames to reduce timing-based username discovery.
- A new password must contain 12–128 characters, must not contain the username, must not be in the small blocked-common-password set, and must differ from the current password.
- `password`, `currentPassword`, `newPassword`, cookies, and authorization headers are explicitly redacted from application logs.
- Successful password change and session revocation never expose a session token in JSON.

## Session handling

- The browser receives a 256-bit random opaque token.
- PostgreSQL stores only `HMAC-SHA-256(AUTH_SESSION_SECRET, token)`.
- Sessions have configurable absolute and idle expiry.
- `lastSeenAt` is refreshed at most once per minute to avoid unnecessary database writes.
- Expired or idle sessions are rejected and removed.
- Active sessions are capped per user; the oldest excess sessions are removed.
- Password changes revoke all sessions inside the same database transaction as the password update.
- The account workspace shows browser/OS summary, network address, creation time, last activity, absolute expiry, and whether the session is current.

## Login abuse controls

Two independent 15-minute in-memory policies apply:

- Five attempts for one IP and normalized username pair.
- Twenty-five attempts across usernames from one IP, limiting username-spraying attacks.

The API returns `429`, a `Retry-After` header, a stable reason code, and a localized safe message. The current store is process-local and appropriate for this single-instance deployment. A multi-replica deployment must replace it with a shared atomic store.

The API trusts forwarded addresses only when `TRUST_PROXY=true`, and then only from loopback, link-local, or private network proxies. The Docker profile enables this because `main-nginx` is the only published API entry point.

## Browser behavior

- The protected application is not loaded until session restoration succeeds.
- An API/network failure is shown as a retryable authentication-service error; it is not silently treated as a logged-out state.
- Any later authenticated API `401` clears the local user state and returns the operator to login.
- Login is Persian-first with an English switch, correct RTL/LTR behavior, Caps Lock notice, accessible error associations, password visibility control, browser autofill styling, and mobile/short-viewport scrolling.
- The Settings route is the account-security workspace rather than a placeholder.

## Audit events

Security-safe audit records are created for successful, failed, and rate-blocked login attempts; logout; global logout; session revocation; and password-change outcomes. Audit metadata can contain outcome, client address, and a bounded user-agent string, but never passwords, cookie values, CSRF tokens, or token hashes.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `AUTH_SESSION_SECRET` | development-only fallback | HMAC key; production validation requires an explicit safe value |
| `AUTH_SESSION_TTL_HOURS` | `12` | Absolute session lifetime |
| `AUTH_SESSION_IDLE_MINUTES` | `120` | Idle timeout |
| `AUTH_MAX_ACTIVE_SESSIONS` | `10` | Maximum live sessions per user |
| `TRUST_PROXY` | `false` outside Compose | Accept forwarded client addresses from trusted private proxies |

No environment value or credential is displayed by the UI or recorded in this document.

## Recovery boundary

Public registration and email/SMS reset are intentionally absent. This is an administrative security appliance, so account recovery requires a separate controlled administrator workflow rather than an unauthenticated public endpoint. The production bootstrap seed remains idempotent and creates an administrator only when the user table is empty.
