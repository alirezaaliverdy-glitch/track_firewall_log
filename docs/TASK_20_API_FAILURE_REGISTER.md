# Task 20 API Failure Register

Date: 2026-07-14

| API area | Baseline gap | Evidence | Required repair |
| --- | --- | --- | --- |
| Device onboarding aliases | Task 20 endpoint names are missing. | `backend/src/routes/device-onboarding.ts` has `/test`, `/detect`, `/preview`, not `/test-connection`, `/detect-platform`, `/build-preview`, or `/retry`. | Add aliases without removing existing routes. |
| Onboarding persistence | Sessions are in-memory. | `device-onboarding.service.ts` uses `const sessions = new Map`. | Persist sessions or clearly scope runtime evidence; final success needs durable Device persistence at minimum. |
| Diagnostics | Prechange had no persisted diagnostic session API. | No diagnostics route existed before Task 20. | Added `/api/diagnostics/sessions`; sessions persist in `AuditLog` while the dedicated domain-model migration remains deferred. |
| Check-Host | Prechange provider was not integrated. | No Check-Host adapter route/service was registered. | Added Check-Host JSON API invocation with bounded polling and persisted request IDs for DNS/HTTP/Ping/TCP. |
| Nmap | Worker not integrated. | `worker.service.ts` only handles upload analysis jobs. | Add isolated safe Nmap worker path; never execute from request handler. |
| Monitors | No real diagnostic monitor API/scheduler. | Existing Linux health monitor concepts are separate from Task 20 network monitors. | Add persisted monitor model, run records, and scheduler. |
| Product State | Tools are partial/non-executing. | `product-state.registry.ts` says workers are deferred. | Promote only after real backend/API/UI/test evidence. |

## Non-Failures

- `/api/product-state*` exists and is backend-owned.
- `/api/device-onboarding/sessions` exists.
- `/api/monitoring/linux/*` has optional-table fallback behavior from Task 19.2A.

## Real Provider Proof

`POST /api/diagnostics/sessions` for `example.com` returned HTTP 201 only after provider calls completed and persisted session `cmrkfksle0000zolvol4yk1ge`.

Provider evidence:

- DNS request ID: `446466a3k175`
- HTTP request ID: `446466cfk36b`
- Ping request ID: `446466e5k33e`
- TCP request ID: `4464670ck87e`
- `providerInvoked=true`
- source label: `Check-Host external nodes`
- persisted through `AuditLog` action `diagnostic_session`
