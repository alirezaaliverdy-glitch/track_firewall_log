# Task 20.1A Database Runtime Trace

Date: 2026-07-14

Scope: Milestone A reproduction and trace for PostgreSQL, Prisma, pg Pool, and backend startup readiness.

## Required Pre-Edit Reproduction

The default PostgreSQL endpoint is not reachable from this Codex session:

```text
Test-NetConnection 127.0.0.1:5432 -> TcpTestSucceeded=False
Windows service postgresql-x64-18 -> Running, Automatic
```

Prisma validation succeeds because it only validates the schema:

```text
cd backend
npx prisma validate -> valid
```

Prisma migration status fails against the configured default PostgreSQL endpoint:

```text
Datasource db: PostgreSQL database firewall_log_analyzer at localhost:5432
Error: Schema engine error
```

Backend startup was reproduced in a separate process with a localhost:5432 database URL override so the currently running app was not disturbed and `.env` was not read or printed:

```text
buildApp()
  -> bootstrapAdmin()
  -> prisma.appUser.count()
  -> Operation has timed out
  -> Authentication bootstrap failed: database connection did not become ready.
```

Observed elapsed time: about 4.6 seconds.

## Current Pool and Client Construction

Current implementation:

```text
backend/src/db/prisma.ts
  getPgPool()
    -> globalThis.pgPool ?? new pg Pool()
  new PrismaPg(pool, { disposeExternalPool: false })
  globalThis.prisma ?? new PrismaClient({ adapter })
```

The desired single-process shape mostly exists:

```text
one backend process
  -> one shared pg Pool
  -> one shared PrismaPgAdapter
  -> one shared Prisma client
```

The adapter itself is module-scoped, not globally named, but it wraps the shared Pool.

## Current Startup Sequence

```text
backend/src/server.ts
  process.once(SIGINT)
  process.once(SIGTERM)
  buildApp()
    validate command catalog
    register core plugins
    runStartupDatabaseQuery("Authentication bootstrap", bootstrapAdmin)
      bootstrapAdmin()
        prisma.appUser.count()
    register routes
  app.listen()
```

The AppUser query happens before route registration completes and before the server starts listening. When PostgreSQL is unavailable, normal startup stops.

## Shutdown Paths

Current shutdown paths:

```text
server.ts signal handlers
  app.close()
  shutdownDatabase()

server.ts startup catch
  shutdownDatabase().catch(...)
  process.exit(1)

app.ts onClose
  stopAllLinuxLogStreams()
```

The Fastify app close hook no longer closes the database, which avoids the earlier premature app-close adapter shutdown. `shutdownDatabase()` is idempotent through `globalForPrisma.prismaShutdown`.

## Current Failure Classification

- PostgreSQL Windows service is running.
- Port 5432 is not reachable from this session.
- Connection timeout occurs during the startup AppUser query after Pool/adapter/client construction.
- No independent Prisma clients or pg Pools were found in `backend/src`.
- No Fastify `onClose` database disconnect was found.
- Startup retries are bounded, but currently use 4 attempts rather than the Task 20.1A-required maximum of 5 attempts with exponential backoff and jitter.
- The Prisma client logs repeated stack snippets for each failed attempt. This is not yet the concise single-line structured startup log required by Task 20.1A.
- `/api/health/live` is not implemented yet.
- `/api/health/ready` exists, but its response shape is not the exact Task 20.1A readiness contract.

## Root Cause So Far

The current reproduced failure is not caused by multiple Prisma clients or an app-close hook ending the shared pool. It is caused by the default PostgreSQL endpoint on `127.0.0.1:5432` not accepting TCP connections, followed by startup auth bootstrap querying `AppUser` before the database becomes reachable.

