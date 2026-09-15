# PHASE R — BACKEND SECURITY, EXECUTION CORRECTNESS, AND RELIABILITY

## Mission

Stabilize the existing backend before M10 or production release.

Do not add unrelated product features.
Do not change the mobile M0-M9 architecture unless required for shared SSH trust contracts.
Preserve unrelated dirty, deleted, and untracked files.

## Required starting path

```text
C:\Users\SurfaceLand\Desktop\track_firewall_log
```

Backend path:

```text
C:\Users\SurfaceLand\Desktop\track_firewall_log\backend
```

## Before modifying code

1. Read `BACKEND_TRIPLE_AUDIT_2026-07-25.md`.
2. Read `CODEX_HANDOFF.md`.
3. Record branch, HEAD, `git status --short`, Node, pnpm and Java versions.
4. Inspect the real `backend/package.json`; do not use the review ZIP package manifest.
5. Confirm whether `backend/prisma/migrations/20260718110000_cisco_enable_secret/migration.sql` exists.
6. Run baseline tests on an isolated database.
7. Create failing regression tests before behavior changes.
8. Do not execute commands against real production devices.

---

# R0 — Immediate Security Controls

## R0.1 SSH host-key trust

Implement one shared server-side SSH host-key trust service for:

- Cisco
- MikroTik
- FortiGate
- Linux
- Linux log collector

Requirements:

- SHA-256 fingerprint
- TOFU only with explicit approval
- persisted fingerprint
- hard failure on mismatch
- explicit replacement workflow
- audit trust/replacement/mismatch
- no global insecure algorithm downgrade
- compatibility override scoped per device
- tests with an SSH fixture

## R0.2 Central redaction

Create one shared redaction layer used before:

- DB audit persistence
- ActionPlan result persistence
- application logs
- AI context
- telemetry evidence
- API response projection

Cover:

- password
- passphrase
- private keys
- PSK
- API keys
- tokens
- vendor secrets
- terminal control sequences
- oversized output

No raw secret may be persisted.

## R0.3 Production profile hardening

- Treat `NODE_ENV=production` OR `APP_PROFILE=production` as production.
- Production CORS must contain only explicit configured origins.
- Lab quick mode must hard-fail in production.
- Require strong secrets and non-default DB credentials.
- Add startup configuration summary without secret values.

## R0.4 Migration repair

- Repair or remove the empty Cisco enable-secret migration correctly.
- Never edit already-applied migrations without proving they were never deployed.
- Add clean-database migration test.
- Add upgrade-path migration test.

Commit R0 in focused commits.

---

# R1 — Action Execution Correctness

## R1.1 Provider-first custom plan

When structured provider output exists, it owns:

- commands
- typed parameters
- missing fields
- risk
- verification
- rollback
- expected impact

Backend validates it.

Fallback synthesis is used only when provider structured output is absent.

Do not merge unrelated fallback missing fields into provider plans.

## R1.2 Grammar-aware vendor policy

Replace tiny regex allowlists with layered validation:

1. structural validation
2. vendor/platform parser
3. mode/context state machine
4. read-only/mutation classification
5. capability validation
6. dangerous operation denial
7. parameter completeness
8. risk
9. permission
10. verification

Catalog absence alone is not a rejection reason.

## R1.3 Real permission enforcement

Either:

- add official vendor custom permissions to the Permission type and enforce them; or
- remove the fake vendor permission metadata and use a documented generic permission model.

No unenforced security metadata.

## R1.4 Maker-checker

For medium/high/critical writes:

- requester cannot approve their own plan
- approver identity must be a real user ID
- high/critical requires privileged role
- critical supports second approval policy
- material changes invalidate approvals

## R1.5 Backup and verification

Implement explicit backup states:

- completed
- not required
- unsupported with approved break-glass
- failed

High/critical execution must not continue with only a warning.

Create typed verification evidence:

- check ID
- command
- expected
- observed
- parser
- timestamp
- success
- source hash

Do not infer evidence count from one JSON object.

---

# R2 — Reliability and Scale

## R2.1 Distributed idempotency and locking

Replace in-memory execution lock with Redis or PostgreSQL advisory locking.

Bind to:

- ActionPlan ID
- Device ID
- execution attempt
- idempotency key

Add TTL and crash recovery.

## R2.2 Durable queue

Replace `setImmediate()` queue with:

- PostgreSQL queue using `FOR UPDATE SKIP LOCKED`, or
- BullMQ/Redis

Implement:

- lease
- heartbeat
- retry
- dead letter
- startup reconciliation
- idempotent completion

## R2.3 Action Center data access

- DB-side filter and pagination
- no hard deletion of audit history
- archive/tombstone
- configurable retention
- immutable security audit

## R2.4 Telemetry storage

Replace full-file rewrite on every append with:

- segmented append-only storage and rotation, or
- database/time-series storage

Add:

- concurrency safety
- malformed-record isolation
- retention proof
- load test

## R2.5 Deployment

- migration as a separate deployment job
- health/readiness checks
- multi-replica tests
- object storage strategy for uploads
- graceful shutdown and execution recovery

---

# R3 — Maintainability

- Create one canonical `ActionDefinition`.
- Derive AI catalog, UI schema, compiler, risk, permission, verification and rollback from it.
- Extract shared SSH transport.
- Split files over 500 lines by responsibility.
- Version JSON payload schemas and add upcasters.
- Mark mock integrations clearly as non-production.

---

# Mandatory three-pass validation after every phase

## Pass A — Build and baseline

Run the scripts that actually exist in the real repository:

- root install with frozen lockfile
- root build
- backend install with frozen lockfile
- Prisma generate
- Prisma validate
- backend build
- isolated full backend tests
- catalog validation
- `git diff --check`

## Pass B — Security regression

Required tests:

- first-use SSH fingerprint approval
- trusted fingerprint reconnect
- mismatch hard fail
- fingerprint replacement audit
- no secret in DB audit/result/log/AI context
- production profile mismatch
- strict production CORS
- self-approval denied
- stale/replayed approval denied
- high/critical without backup denied

## Pass C — Reliability regression

Required tests:

- duplicate execution
- two replicas
- restart while queued
- restart while executing
- lock expiration
- queue retry/dead-letter
- telemetry retention/load
- audit archive
- clean DB migration
- existing DB upgrade migration

Repeat A, B and C three times for flaky-test detection.
Do not claim success if a test is skipped without documenting why.

---

# Commit sequence

1. `test(backend): characterize security and execution gaps`
2. `feat(security): pin and verify ssh host keys`
3. `feat(security): redact persisted execution evidence`
4. `fix(config): enforce production profile boundaries`
5. `fix(prisma): repair migration chain`
6. `fix(actions): normalize provider plans without fallback drift`
7. `feat(actions): enforce permissions maker-checker backup verification`
8. `feat(runtime): add durable locking and jobs`
9. `refactor(actions): converge canonical action definitions`
10. `test(backend): complete three-pass stabilization acceptance`

Before every commit:

- print staged file list
- exclude prompt bundles and unrelated docs
- run scoped tests
- preserve unrelated work

---

# Definition of done

Phase R is complete only when:

- SSH MITM is blocked.
- No raw secret is persisted.
- Production cannot start with unsafe profile settings.
- Provider plans are not contaminated by fallback fields.
- Vendor custom operations use semantic policy validation.
- Permission metadata is enforced.
- Self-approval is blocked where required.
- High/critical backup policy is real.
- Verification evidence is typed.
- Execution is idempotent across replicas.
- Jobs survive restart.
- Audit cannot be casually deleted.
- Clean and upgrade migrations pass.
- All three validation passes pass three consecutive times.
