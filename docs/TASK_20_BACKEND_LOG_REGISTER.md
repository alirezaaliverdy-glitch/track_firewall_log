# Task 20 Backend Log Register

Date: 2026-07-14

## Observed During Baseline

No backend log file was read to avoid accidentally exposing environment or secret-adjacent runtime data. Browser MCP reported a console log artifact at:

```text
.playwright-mcp/console-2026-07-14T08-56-03-974Z.log
```

The current app shell rendered authenticated Persian navigation. This register will be updated with sanitized backend observations as Task 20 provider, worker, persistence, and UI acceptance runs are executed.

## Sanitized Provider Invocation

`POST /api/diagnostics/sessions` with target `example.com` returned HTTP 201 after real Check-Host provider invocation. Persisted session ID:

```text
cmrkfksle0000zolvol4yk1ge
```

Recorded Check-Host request IDs:

```text
446466a3k175
446466cfk36b
446466e5k33e
4464670ck87e
```

No secrets or `.env` values were read or printed.

## Known Backend Runtime Risks

| Area | Risk | Current handling |
| --- | --- | --- |
| Prisma migration history | `npx prisma migrate status` reports all 34 migrations unapplied in local history. | No destructive recovery attempted. |
| Optional observability tables | Tables may be absent in local DB. | Task 19.2A fallback returns stable not-configured/partial state instead of repeated stack traces. |
| Diagnostics provider calls | Not implemented at baseline. | No false success claim. |
| Nmap worker | Not implemented at baseline. | No scan run. |

## Nmap Worker / Database Blocker

Nmap installation succeeded:

```text
Nmap version 7.80
```

Worker implementation was added, but live persistence proof is blocked by PostgreSQL connectivity failure. Sanitized errors observed:

```text
Prisma AuditLog count/create: P1008 / ETIMEDOUT / SocketTimeout
Direct pg connection: connect ETIMEDOUT 127.0.0.1:5432
Test-NetConnection 127.0.0.1:5432: failed
```

No `.env` value or credential was printed.
