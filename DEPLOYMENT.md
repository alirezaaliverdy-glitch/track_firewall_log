# Deployment

## Primary zero-configuration production path

The root docker-compose.yml is the supported clone-and-run production entrypoint:

    docker compose up -d

It builds the frontend and backend from the checked-out commit, starts PostgreSQL, runs Prisma migrations and the idempotent bootstrap seed, then exposes the application through Caddy on HTTP/HTTPS. No .env file is required for this default path.

The secrets-init one-shot service creates strong random PostgreSQL, session, and credential-encryption secrets in the private firewall_runtime_secrets volume. Existing non-empty secrets are preserved across restarts. PostgreSQL, the API, and the web container are not published directly; only the Caddy gateway exposes ports 80 and 443.

The initial administrator credential is generated once and stored in the private firewall_bootstrap volume. Retrieve it on the deployment host with:

    docker compose exec firewall-api cat /app/storage/bootstrap/initial-admin.json

Change that password immediately. Do not copy the file into the repository or operational tickets.

The default gateway uses Caddy's internal CA so an IP-only deployment can start without external certificate provisioning. Install that CA on managed clients or terminate trusted TLS at an approved upstream proxy for warning-free browser access.

## Runtime topology

- Frontend: Dockerfile.frontend builds the Vite artifact and nginx serves it internally on port 50.
- Backend: backend/Dockerfile builds TypeScript and Prisma, runs as the non-root node user, and starts through backend/docker-entrypoint.sh.
- Database: postgres:16-alpine uses a persistent named volume and a generated file-backed password.
- Gateway: Caddyfile.production exposes /firewall/ and /firewall-api/, redirects HTTP to HTTPS, and adds security headers.
- Networks: PostgreSQL and the API are restricted to the internal backend network. Only Caddy publishes host ports.

Every long-running service has a health check. Compose waits for the database, API, and frontend readiness before the gateway starts.

## Environment separation

- Default production: root docker-compose.yml is the complete self-contained stack.
- Development: docker-compose.development.yml supports explicit local development workflows.
- Staging: docker-compose.staging.yml uses APP_PROFILE=staging and externally supplied values.
- Advanced production and CI: docker-compose.production.yml and docker-compose.firewall.yml remain available for prebuilt immutable images and externally managed secrets.

The config/env examples are placeholders for advanced deployments. Real secrets must never be committed.

## Update and data safety

    git pull --ff-only
    docker compose up -d --build

Back up the named database, bootstrap, uploads, telemetry, Caddy, and runtime-secret volumes before host migration. Never use docker compose down -v on a production host unless permanent data deletion is intentional.

## Advanced CI deployment

GitHub workflows keep immutable-image staging, production release, and rollback flows. Their SSH, registry, database, authentication, and encryption values must be supplied through GitHub Environments or the target host secret manager. These external-secret requirements do not apply to the primary root compose.

Production image tags should remain immutable version or commit tags. The rollback workflow redeploys the previously recorded tag without rebuilding it.
