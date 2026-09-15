# Phase F — Production Deployment, Documentation and Clean Bundles

## Production Docker

Add `docker-compose.production.yml` without breaking current development compose files.

Requirements:

- PostgreSQL is not published to the host; use internal network only.
- Secrets come from Docker secrets or deployment environment, never hardcoded defaults.
- Backend/frontend run as non-root where possible.
- Health checks use existing live/ready endpoints.
- Add restart policy, resource limits and log rotation.
- Use separate public and private networks.
- Backend is the only service allowed to reach connector networks.
- Do not mount source code or `.env` into production containers.
- Use immutable image tags in the runbook.

## Review bundle cleanup

Create:

- `scripts/create-review-bundle.ps1`
- optional cross-platform Node equivalent

Exclude:

- `.git/`
- `.runtime/`
- `backups/`
- `node_modules/`
- `dist/`
- `storage/`
- `coverage/`
- `.playwright-mcp/`
- `.env*`
- database files/dumps
- logs and temporary files

The script must print included/excluded paths and refuse to include secrets.

Do not delete local runtime/backup data automatically. Only remove it from source tracking/review bundles after confirming it is not required.

## Single source of truth

Create/update:

- `docs/CURRENT_ARCHITECTURE.md`
- `docs/CURRENT_CAPABILITIES.md`
- `docs/KNOWN_LIMITATIONS.md`
- `docs/SECURITY_INVARIANTS.md`
- `docs/MOBILE_READINESS.md`

Mark old task documents as `ARCHIVED — DO NOT IMPLEMENT` or move them under `docs/archive/`.

Split oversized `CODEX_HANDOFF.md` into concise current state + linked phase history. Do not let stale TODOs claim that implemented credential encryption or workflow features are absent.

## Health expansion

Extend existing health endpoints, do not replace them:

- live: process only
- ready: database/schema plus required startup dependencies
- internal subsystem summary: AI provider configured, connector registry loaded, command policy registry loaded

Do not expose secrets, raw connection strings or sensitive network inventory in public health output.

## Commit

`chore(prod): harden deployment docs and review bundles`
