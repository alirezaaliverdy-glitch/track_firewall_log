# Deployment Foundation

Phase 07 keeps application behavior unchanged and adds deployment safety around the existing React/Vite frontend, Fastify backend, PostgreSQL database, and nginx reverse proxy.

## Current Docker Audit

- Frontend image: `Dockerfile.frontend` builds the Vite app with build-time `VITE_APP_ENV`, `VITE_BASE_PATH`, and `VITE_API_BASE_URL`, then serves the static artifact through `nginx.firewall-web.conf` on port 50.
- Backend image: `backend/Dockerfile` builds TypeScript, generates Prisma client artifacts, runs as the non-root `node` user, and starts with `pnpm prisma migrate deploy && pnpm start`.
- Database: compose files use `postgres:16-alpine` with named volumes. Staging and production require external passwords through environment variables.
- nginx: `nginx.firewall-main.conf` exposes `/firewall/` and `/firewall-api/` and keeps API routing behind the reverse proxy.

## Environment Separation

- Development: `docker-compose.yml` and `docker-compose.development.yml` remain local database-focused compose files.
- Staging: `docker-compose.staging.yml` runs the full stack from explicit immutable app image tags and uses `APP_PROFILE=staging`.
- Production: `docker-compose.production.yml` is the primary production compose file. `docker-compose.firewall.yml` remains a production-compatible compose entrypoint.
- Example configuration is split under `config/env/`. These files are placeholders only; real secrets stay in GitHub Environments, host environment files, or the deployment host secret manager.

## Image Tag Policy

- Do not publish or deploy `latest`.
- Staging images are tagged with the exact commit SHA from `develop`.
- Production images are tagged with the version tag, for example `v1.2.3`, and also with the commit SHA for traceability.
- Compose requires `FRONTEND_IMAGE`, `BACKEND_IMAGE`, and `DEPLOY_VERSION`; missing values fail before deployment.

## GitHub Actions

- `CI` (`.github/workflows/production-ci.yml`) installs dependencies, validates env, typechecks, tests, builds, and validates compose syntax.
- `Staging Deployment` (`.github/workflows/deploy-staging.yml`) builds and pushes SHA-tagged images from `develop`, then deploys to the `staging` GitHub Environment.
- `Production Deployment` (`.github/workflows/production-release.yml`) builds and deploys only from version tags matching `v*.*.*`, with the `production` GitHub Environment gate.
- `Rollback Deployment` (`.github/workflows/rollback-deployment.yml`) redeploys the previous recorded image tag for staging or production.

## Required External Secrets

Configure these as GitHub Environment secrets, not repository files:

- Staging: `STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY`, `STAGING_DEPLOY_PATH`, `STAGING_GHCR_USER`, `STAGING_GHCR_TOKEN`.
- Production: `PRODUCTION_SSH_HOST`, `PRODUCTION_SSH_USER`, `PRODUCTION_SSH_KEY`, `PRODUCTION_DEPLOY_PATH`, `PRODUCTION_GHCR_USER`, `PRODUCTION_GHCR_TOKEN`.
- Runtime container secrets such as `DATABASE_URL`, `POSTGRES_PASSWORD`, `CREDENTIAL_ENCRYPTION_KEY`, `ADMIN_PASSWORD`, and `AUTH_SESSION_SECRET` must exist on the deployment host or in its secret manager.

## Rollback

Deployment stores `.deploy/current-version` and `.deploy/previous-version` on the target host after a successful `docker compose up`.

Manual rollback uses the `Rollback Deployment` workflow. It does not build new images; it redeploys the previous recorded tag with `scripts/deploy/rollback-one-version.sh`.

To keep rollback available, do not prune the previous application images immediately after deployment.
