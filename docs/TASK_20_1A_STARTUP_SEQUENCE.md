# Task 20.1A Startup Sequence

Date: 2026-07-14

## Current Backend Startup

```text
node/tsx starts backend/src/server.ts
  -> import env/config
  -> import db/prisma singleton module
     -> create shared pg Pool lazily through getPgPool()
     -> create PrismaPg adapter with disposeExternalPool=false
     -> create or reuse global PrismaClient
  -> register process.once(SIGINT)
  -> register process.once(SIGTERM)
  -> buildApp()
     -> validate command catalog
     -> create Fastify instance
     -> register helmet/cors/cookie/multipart
     -> register error handler
     -> run authentication bootstrap if authRequired
        -> bootstrapAdmin()
           -> prisma.appUser.count()
           -> maybe create admin user
     -> register auth routes
     -> register protected API preHandler
     -> register health routes
     -> register feature routes
     -> register onClose for Linux log streams only
  -> app.listen()
```

## Current Failure Location

When the default PostgreSQL endpoint is unavailable, startup fails here:

```text
bootstrapAdmin()
  -> prisma.appUser.count()
  -> Operation has timed out
```

`runStartupDatabaseQuery()` retries this operation four times. After the final failed attempt it throws:

```text
Authentication bootstrap failed: database connection did not become ready.
```

## Current Resource Lifecycle

```text
db/prisma.ts owns:
  shared pg Pool
  PrismaPg adapter
  shared PrismaClient
  shutdownDatabase()

app.ts owns:
  Fastify app construction
  route/plugin registration
  stopAllLinuxLogStreams() on Fastify close

server.ts owns:
  process signal handlers
  app.close()
  shutdownDatabase()
  process exit
```

## Current Gaps Against Task 20.1A

- `/api/health/live` route is missing.
- `/api/health/ready` exists but does not return the exact `databaseReady`, `checkedAt`, `reasonCode`, and `retryable` shape.
- Startup retry count is 4, while Task 20.1A requires max 5 attempts.
- Backoff is linear and lacks jitter; Task 20.1A requires exponential backoff with jitter.
- Prisma error logging still emits repeated stack snippets during startup failures.
- Auth route database failures are not currently normalized into structured 503 responses.
- Startup readiness and bootstrap are not separated into a reusable readiness helper that can be shared by health and bootstrap.

## Confirmed Non-Issues In Current Source

- No duplicate `new PrismaClient` instances were found in `backend/src`.
- No duplicate `new Pool` instances were found in `backend/src`.
- Fastify `onClose` does not close the database pool.
- Shutdown is idempotent at the database helper level.
- Process signal handlers use `process.once`, not repeated `process.on`.

