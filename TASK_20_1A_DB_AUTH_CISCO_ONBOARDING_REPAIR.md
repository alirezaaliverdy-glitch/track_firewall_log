# TASK 20.1A — PostgreSQL/Prisma Readiness, Authentication Recovery, and Real Cisco Onboarding Completion

## Project

`track_firewall_log`

## Mission

Repair the current database/authentication failure first, then complete the real Cisco device onboarding flow end-to-end before any motion-background or visual-only work continues.

This task is complete only when all of the following are proven:

1. PostgreSQL is reachable and stable.
2. Prisma stays connected.
3. `/api/health/ready` repeatedly returns 200.
4. Authentication succeeds.
5. The authenticated dashboard opens through Playwright MCP.
6. The Cisco onboarding sequence runs through all required backend steps.
7. `connectorInvoked=true`.
8. Real Cisco platform evidence is returned.
9. A Device row is persisted.
10. `/assets/devices/:deviceId` opens.
11. The animated success notification appears.
12. Automatic redirect to the Device workspace succeeds.

An HTTP 200 from `/answers` is not successful onboarding.

---

# Current confirmed failures

## Database/authentication

Observed backend errors:

```text
Prisma P1017
DriverAdapterError: ConnectionClosed
Connection terminated due to connection timeout
Invalid prisma.appUser.count() invocation
bootstrapAdmin()
Authentication bootstrap failed: database connection is not ready
```

Observed frontend error:

```text
Unable to connect to the authentication server
```

## Onboarding

The existing onboarding flow can load Credential References and submit:

```text
POST /api/device-onboarding/sessions/:sessionId/answers
→ 200
```

but still does not prove:

```text
/test-connection
/detect-platform
/discover
/build-preview
/commit
```

and no real Device persistence is confirmed.

---

# Known real onboarding target

Use only this explicitly approved lab target:

```text
Address: 192.168.7.12
Port: 22
Vendor: Cisco
Platform: Cisco IOS-XE via SSH
Credential Reference display name: cisco-f2 — admin
```

Rules:

- use only the existing backend Credential Reference ID;
- never read, print, expose, modify or log the underlying secret;
- read-only Cisco discovery only;
- do not change device configuration.

---

# Mandatory preparation

Before editing, read completely:

- `AGENTS.md`
- `CODEX_HANDOFF.md`
- `docs/PROJECT_MEMORY_INDEX.md`
- `docs/CURRENT_STATUS.md`
- `docs/TASK_HISTORY.md`
- `docs/ARCHITECTURE_MAP.md`
- `TASK_19_PRODUCT_CONVERGENCE.md`
- `TASK_19_1_RUNTIME_CONVERGENCE_AND_CRITICAL_REPAIR.md`
- `TASK_20_REAL_NETWORK_OPERATIONS.md`
- `TASK_20_1_ONBOARDING_WORKSPACE_DASHBOARD.md`
- current Prisma client and adapter implementation
- current PostgreSQL pool implementation
- current backend startup/bootstrap code
- current auth service
- current readiness/liveness routes
- current onboarding backend routes/services
- current onboarding frontend workflow
- current Credential Reference service
- current connector registry
- current Cisco connector
- current Device persistence and workspace routes
- current tests and browser evidence

Inspect:

```powershell
git status --short
git log --oneline -15
cd backend
npx prisma validate
npx prisma migrate status
cd ..
```

Do not discard untracked task/evidence files.

---

# Playwright MCP gate

Use Playwright MCP from this exact Codex session.

Before implementation:

1. enumerate exposed MCP tools;
2. invoke the Playwright MCP browser tool;
3. open `http://localhost:5173`;
4. record URL, title, visible text and screenshot/snapshot;
5. reproduce the login failure;
6. reproduce the onboarding failure after login is restored.

Do not use local Playwright, shell browser automation or another browser as a substitute.

If MCP is unavailable, stop with:

```text
MCP_SESSION_NOT_AVAILABLE
```

---

# Safety rules

1. Do not read, print, modify or commit `.env`.
2. Do not expose passwords, private keys, tokens or raw Credential secrets.
3. Do not run destructive database commands.
4. Do not run:
   - `prisma migrate reset`
   - `db push --force-reset`
   - destructive SQL
   - `git reset --hard`
   - `git clean -fd`
5. Do not change the real Cisco configuration.
6. Do not weaken global SSH policy.
7. Do not claim success from HTTP 200 alone.
8. Do not claim login success unless MCP proves authenticated Dashboard access.
9. Do not claim onboarding success unless Device persistence and workspace navigation are proven.
10. Use separate commits for database/auth, onboarding, and success/workspace UX.

---

# MILESTONE A — Reproduce and document the database failure

Create:

- `docs/TASK_20_1A_DB_RUNTIME_TRACE.md`
- `docs/TASK_20_1A_AUTH_RUNTIME_TRACE.md`
- `docs/TASK_20_1A_STARTUP_SEQUENCE.md`

Trace:

1. backend process startup;
2. PostgreSQL service reachability;
3. Prisma client construction;
4. pg Pool construction;
5. PrismaPgAdapter construction;
6. `buildApp`;
7. `bootstrapAdmin`;
8. AppUser query;
9. process signal handlers;
10. watch-mode restarts;
11. pool/client disconnect paths.

Record:

- whether PostgreSQL is running;
- whether port 5432 is reachable;
- whether connection timeout occurs before/after pool creation;
- whether multiple pools or Prisma clients exist;
- whether shutdown hooks close shared resources too early;
- whether tsx watch restarts cause overlapping cleanup/startup;
- whether startup bootstrap happens before readiness;
- whether retries are bounded;
- whether errors are duplicated.

Do not edit until the failure is reproduced and traced.

Commit:

```text
docs: trace postgres prisma authentication failure
```

---

# MILESTONE B — Stabilize PostgreSQL, pg Pool and Prisma lifecycle

## Required architecture

There must be:

```text
one backend process
→ one shared pg Pool
→ one shared PrismaPgAdapter
→ one shared Prisma client
```

Do not instantiate independent Prisma clients or pg Pools across services/routes/tests unless explicitly isolated for tests.

## Required fixes

1. Centralize pool/client creation.
2. Ensure the Pool is not closed while startup queries are running.
3. Ensure shutdown hooks execute only on real process termination.
4. Make shutdown idempotent.
5. Avoid duplicate listeners during watch-mode reload.
6. Ensure a new watch-mode process does not inherit a resource already being closed.
7. Add bounded transient retry for:
   - `P1017`
   - `ConnectionClosed`
   - connection timeout
   - connection reset
8. Retry policy:
   - maximum 5 attempts;
   - exponential backoff;
   - jitter;
   - concise single-line structured logs;
   - no infinite retry.
9. Permanent failure must keep readiness false and stop normal startup cleanly.
10. Do not hide root cause with a broad catch returning fake success.

## Health endpoints

Create or repair:

```text
GET /api/health/live
GET /api/health/ready
```

### Liveness

Returns 200 when the backend process/event loop is alive.

### Readiness

Must perform a real lightweight database operation.

Example response:

```json
{
  "status": "ready",
  "databaseReady": true,
  "checkedAt": "..."
}
```

Failure:

```json
{
  "status": "not_ready",
  "databaseReady": false,
  "reasonCode": "DATABASE_UNAVAILABLE",
  "retryable": true,
  "checkedAt": "..."
}
```

Status code:

- 200 when ready;
- 503 when not ready.

## Acceptance

Prove:

- backend remains running for at least 3 minutes;
- readiness is called at least 10 times over that period;
- every successful response is 200;
- no P1017/ConnectionClosed loop;
- no repeated stack trace storm;
- AppUser query succeeds;
- no premature Pool close.

Commit:

```text
fix: stabilize postgres prisma and backend readiness
```

---

# MILESTONE C — Repair authentication startup

## Bootstrap rules

`bootstrapAdmin()` must:

1. run only after database readiness;
2. be idempotent;
3. avoid duplicate user creation;
4. avoid blocking the entire app indefinitely;
5. fail startup clearly when the database is permanently unavailable;
6. not print secrets;
7. not query repeatedly in a tight loop.

## Auth route rules

- login returns real structured success/failure;
- database unavailable returns a clear 503 error;
- invalid credentials remain a normal authentication error;
- frontend must distinguish:
  - auth failure;
  - backend unavailable;
  - database unavailable;
  - request timeout.

## Playwright MCP acceptance

1. Open login page.
2. Use the existing user-entered credentials.
3. Submit.
4. Verify:
   - auth API succeeds;
   - session/cookie/token is created through the existing mechanism;
   - Dashboard opens;
   - refresh preserves the session;
   - no auth API 5xx;
   - no unexpected console error.

Create:

- `docs/TASK_20_1A_LOGIN_MCP_RESULTS.md`

Commit:

```text
fix: restore authentication after database readiness
```

---

# MILESTONE D — Trace and repair authoritative onboarding

## Required endpoint sequence

```text
POST /api/device-onboarding/sessions
POST /api/device-onboarding/sessions/:sessionId/answers
POST /api/device-onboarding/sessions/:sessionId/test-connection
POST /api/device-onboarding/sessions/:sessionId/detect-platform
POST /api/device-onboarding/sessions/:sessionId/discover
POST /api/device-onboarding/sessions/:sessionId/build-preview
POST /api/device-onboarding/sessions/:sessionId/commit
GET  /api/device-onboarding/sessions/:sessionId
POST /api/device-onboarding/sessions/:sessionId/retry
POST /api/device-onboarding/sessions/:sessionId/cancel
```

`/answers` must only validate and persist answers.

It must not be treated as final completion.

## Required state machine

```text
draft
answers_saved
connection_testing
connection_verified
platform_detecting
platform_detected
discovery_running
discovery_completed
preview_ready
saving
completed
```

Failure states:

```text
validation_failed
credential_missing
credential_invalid
connection_failed
platform_unsupported
discovery_failed
preview_failed
save_failed
cancelled
```

## Hard invariants

- `connection_verified` requires `connectorInvoked=true`.
- `platform_detected` requires real device evidence.
- `discovery_completed` requires persisted discovery output.
- `preview_ready` requires backend preview.
- `completed` requires persisted Device row.
- duplicate clicks are idempotent;
- duplicate Device rows are prevented;
- frontend renders authoritative backend state;
- stale session revision returns structured recovery;
- no fake optimistic completion.

## Frontend controls

The UI must clearly expose:

```text
ذخیره اطلاعات
تست اتصال
تشخیص پلتفرم
کشف اطلاعات و قابلیت‌ها
ساخت پیش‌نمایش
ثبت دستگاه
```

A single orchestrated button is acceptable only if every internal step and failure is visible.

Commit:

```text
fix: complete authoritative device onboarding sequence
```

---

# MILESTONE E — Credential Reference and Cisco connector proof

## Credential Reference

- frontend sends only Credential Reference ID;
- backend resolves the secret;
- secret never appears in browser, API response, audit or logs;
- missing/deleted/invalid references return structured failure;
- Credential Reference state is visible.

## Cisco SSH compatibility

The target may require legacy SSH negotiation.

Requirements:

1. Do not weaken global SSH defaults.
2. Add an explicit per-device compatibility profile.
3. Allow only exact reviewed KEX/host-key algorithms required by the target.
4. Record a security warning and audit event.
5. Prefer modern algorithms first.
6. Use legacy fallback only for the approved Cisco target/profile.
7. Read-only commands only.

Read-only command set:

```text
show version
show inventory
show ip interface brief
show interfaces status
show vlan brief
show etherchannel summary
show spanning-tree summary
show ip route
show access-lists
```

## Failure behavior

If connection fails, return:

- exact negotiation or authentication category;
- sanitized technical reason;
- whether retryable;
- user-visible remediation;
- `connectorInvoked` state.

Do not return only “connection failed”.

## Proof

Required:

- selected connector ID;
- connector type;
- `connectorInvoked=true`;
- start/end timestamps;
- sanitized command evidence;
- platform evidence;
- no secret leakage.

Commit:

```text
fix: prove cisco credential and connector execution
```

---

# MILESTONE F — Persist Device and open workspace

`POST /commit` must:

1. validate session revision;
2. verify prior successful states;
3. persist Device;
4. persist vendor/platform metadata;
5. persist discovery snapshot;
6. link Credential Reference ID;
7. link site/location/environment;
8. write audit event;
9. return Device ID;
10. return workspace URL.

Response:

```json
{
  "status": "completed",
  "deviceId": "...",
  "workspaceUrl": "/assets/devices/<deviceId>",
  "messageKey": "deviceRegistration.success"
}
```

Required proof:

- Device row exists;
- Device ID is stable after refresh;
- Device appears in Assets list;
- `/assets/devices/:deviceId` opens;
- duplicate commit does not create another Device.

Commit:

```text
fix: persist onboarded cisco device and workspace
```

---

# MILESTONE G — Animated success and automatic redirect

After real successful commit:

1. Show animated success notification at the top.
2. Show Device name and Vendor.
3. Use `role="status"` and `aria-live="polite"`.
4. Respect `prefers-reduced-motion`.
5. Allow manual close.
6. Auto-dismiss after 4–6 seconds.
7. Preserve notification across navigation.
8. Automatically navigate after approximately 800–1200 ms to:
   `/assets/devices/:deviceId`
9. Browser back must not resubmit onboarding.
10. Refresh must open Device workspace directly.

Persian copy:

```text
دستگاه با موفقیت ثبت شد
Cisco IOS-XE آماده مدیریت است.
```

Commit:

```text
feat: add verified device registration success flow
```

---

# MILESTONE H — Device workspace and Dashboard proof

## Device workspace

Show only real persisted/collected data:

- Device name;
- Vendor;
- Platform;
- hostname;
- management IP;
- model;
- serial;
- version;
- uptime;
- CPU/memory where supported;
- interfaces;
- VLANs;
- trunks;
- EtherChannel;
- STP;
- route summary;
- ACL summary;
- findings;
- actions;
- collection freshness;
- evidence.

Unsupported metrics must show:

```text
برای این پلتفرم در دسترس نیست
```

not zero.

## Dashboard

Verify existing Task 20.1 charts are backed by persisted backend data:

- network health;
- device availability;
- findings severity;
- CPU/memory trend;
- latency/availability trend;
- vendor distribution;
- recent activity.

Do not generate random values.

Commit:

```text
fix: verify device workspace and dashboard data sources
```

---

# Full MCP acceptance

Use Playwright MCP only.

Test:

```text
/login
/dashboard
/assets
/assets/devices
/assets/devices/new
/assets/devices/:deviceId
/assets/vendors/cisco
/security/findings
/monitoring
/actions
/assistant
/tools
/settings
```

Viewports/locales:

- 1440×900 Persian
- 1440×900 English
- 1280×800 Persian
- 390×844 Persian
- 390×844 English

Verify:

- correct RTL/LTR;
- no page-level overflow;
- no dead controls;
- no unexpected 4xx/5xx;
- no current-flow console errors;
- no repeated onboarding submission;
- success animation;
- redirect;
- Device workspace;
- refresh persistence.

Create:

- `docs/TASK_20_1A_BROWSER_RESULTS.md`
- `docs/TASK_20_1A_ROUTE_ACCEPTANCE_MATRIX.md`
- `docs/TASK_20_1A_CONTROL_ACCEPTANCE_MATRIX.md`
- `docs/TASK_20_1A_FINAL_EVIDENCE.md`

---

# Required tests

## Backend

1. shared Prisma singleton;
2. shared pg Pool;
3. idempotent shutdown;
4. bounded startup retry;
5. readiness 200/503;
6. bootstrapAdmin idempotency;
7. login database-unavailable contract;
8. onboarding legal transitions;
9. Credential Reference resolution;
10. secret redaction;
11. connector invocation requirement;
12. platform evidence requirement;
13. discovery persistence;
14. preview creation;
15. Device commit;
16. duplicate commit idempotency;
17. stale revision recovery;
18. Cisco compatibility profile;
19. audit evidence;
20. workspace API.

## Frontend

1. login unavailable vs invalid-credential states;
2. authenticated refresh;
3. onboarding step progression;
4. exact endpoint sequence;
5. Credential Reference selection;
6. structured connection failure;
7. platform evidence render;
8. discovery render;
9. Preview;
10. commit;
11. animated success;
12. reduced motion;
13. redirect;
14. workspace;
15. no duplicate submission;
16. Persian/English;
17. mobile;
18. no raw JSON;
19. no page overflow.

---

# Validation commands

Backend:

```powershell
cd backend
npx prisma validate
npx prisma migrate status
npx prisma generate
npm run build
npm test
npm run validate:command-catalog
```

Frontend:

```powershell
cd ..
npx pnpm@10 build
npm run test:i18n
npm run test:utf8
npm run lint
```

Also:

```powershell
git diff --check
git status --short
git log --oneline -20
```

If full repository lint fails due to pre-existing debt:

- changed-file lint must pass;
- list legacy failures separately;
- do not hide new failures.

---

# Autonomous execution policy

Continue autonomously through safe work.

Do not ask for routine confirmations.

Stop only for:

1. destructive database operation;
2. MCP unavailable;
3. the approved Cisco target is unreachable;
4. the saved Credential Reference no longer exists;
5. a real device mutation would be required;
6. an ambiguous production migration is required.

Read-only Cisco discovery is approved.

---

# Final report

Report:

1. PostgreSQL root cause;
2. Prisma/Pool lifecycle fix;
3. readiness proof;
4. login proof;
5. onboarding session ID;
6. exact endpoint sequence;
7. Credential Reference ID used;
8. connector ID/type;
9. `connectorInvoked` result;
10. platform evidence;
11. discovery evidence;
12. Device ID;
13. workspace URL;
14. success animation evidence;
15. redirect evidence;
16. Dashboard data proof;
17. Playwright MCP evidence;
18. exact test counts;
19. build results;
20. migration status;
21. commit hashes;
22. remaining blockers;
23. final git status.

Do not claim completion unless readiness is stable, login succeeds, Device is persisted, and the workspace opens.
