# Phase A — Security Foundation

## Objective
Implement centralized RBAC, route-specific rate limiting, CSRF/origin protection, and session hardening without changing normal user workflows.

## A1. Central permission model

Create a single permission registry, for example:

- `backend/src/security/permissions.ts`
- `backend/src/security/authorization.ts`
- `backend/src/plugins/authorization.plugin.ts`

Suggested permissions:

- `assistant.chat`
- `devices.read`
- `devices.manage`
- `credentials.manage`
- `actions.read`
- `actions.propose`
- `actions.approve`
- `actions.execute.readonly`
- `actions.execute.write`
- `actions.execute.high_risk`
- `audit.read`
- `security.policy.manage`
- `uploads.create`

Baseline role matrix:

- `viewer`: chat, read devices, read actions/results/audit; no mutations
- `operator`: viewer permissions + propose/approve/execute supported low/medium-risk actions; no credential management, user management, device deletion, or high-risk execution
- `admin`: all permissions

Requirements:

1. Add a typed `requirePermission(permission)` route preHandler/helper.
2. Apply permission metadata/guards to every authenticated mutation route.
3. Default-deny authenticated `POST/PATCH/PUT/DELETE` routes that have no explicit permission declaration. App startup or a test must fail if a mutation route lacks permission metadata.
4. Return standardized `403` JSON with `error`, `reasonCode`, `messageFa`.
5. Frontend may hide/disable unavailable controls, but server checks remain authoritative.
6. High-risk actions require `actions.execute.high_risk`.

## A2. Central rate limiting

Use `@fastify/rate-limit` or an equivalent maintained Fastify plugin.

Minimum policies:

- Login: 5 failures / 15 minutes per IP + normalized username
- AI chat: 30 requests / minute per authenticated user
- Action proposal/preview: 20 / minute per user
- Action execution: 5 / minute per user and selected device; prevent concurrent execution of the same plan/device
- Device onboarding/test connection: 10 / 10 minutes per user + target IP
- Upload: 10 / hour per user, while keeping existing byte/file limits

Requirements:

- Replace the route-local login `Map` with the centralized policy.
- Standardize `429` response and `Retry-After`.
- In production, expose an adapter boundary for a shared store such as Redis; in-memory is acceptable for local development.
- Never log passwords, session tokens, CSRF tokens, SSH keys, or provider keys.

## A3. CSRF and origin protection

For browser cookie-authenticated mutations:

1. Add exact allowlisted `Origin` validation.
2. Add a CSRF endpoint/token contract, preferably double-submit or a maintained Fastify CSRF plugin.
3. Require `X-CSRF-Token` on authenticated mutations.
4. Exempt health checks and unauthenticated login bootstrap only as required.
5. Logout must be protected as a mutation.
6. Frontend API client obtains/refreshes the token and attaches it automatically.
7. Return standardized `403 CSRF_VALIDATION_FAILED`.

Do not weaken `httpOnly`, `secure` in production, or `sameSite` cookie properties.

## A4. Session hardening

- Rotate session token after successful login and privilege changes.
- Add absolute expiry and idle timeout behavior.
- Add logout-all-sessions service for admin/user account management readiness.
- Record security-safe session metadata and prune expired sessions.
- Do not expose session token in API responses.

## Required tests

- viewer cannot call any mutation route
- operator cannot manage credentials or execute high-risk plans
- admin can perform authorized operations
- every mutation route has permission metadata
- login/AI/action/onboarding/upload limits return 429 correctly
- missing/wrong CSRF token fails
- disallowed Origin fails
- valid same-origin browser request succeeds
- auth, i18n, UTF-8, builds and existing focused tests remain green

## Commit

`feat(security): enforce RBAC rate limits and CSRF protection`
