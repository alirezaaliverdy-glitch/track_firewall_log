# Deployment

## Primary zero-configuration production path

The root docker-compose.yml is the supported clone-and-run production entrypoint:

    docker compose up -d

Clone the current production branch with:

    git clone --depth 1 --branch main --single-branch https://github.com/alirezaaliverdy-glitch/track_firewall_log.git
    cd track_firewall_log
    docker compose up -d --build

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

## Local phone access on Windows

The browser address must use the computer's current LAN address; an old DHCP address will stop working after the network changes. Run the following helper once from the repository. It requests Windows administrator approval, opens only TCP port 80 to `LocalSubnet`, verifies HTTP 200, and prints the current phone URL:

    powershell -ExecutionPolicy Bypass -File scripts/deploy/enable-mobile-lan-access.ps1

The phone and computer must be on the same network. For PWA installation and access across different networks, use the production HTTPS gateway or a private HTTPS overlay such as an administrator-enabled Tailscale Serve endpoint.

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

## Automatic deployment from `main`

The `CI` workflow deploys pushes to `main` after the frontend, backend, and Compose checks all pass. On the existing production host it fast-forwards the checkout and rebuilds `firewall-web` and `firewall-api` in the running `firewall-soar` project, using `docker-compose.yml` together with the host's `docker-compose.override.yml`. It checks that the existing database volume and server-local Caddy configuration are present before changing containers, validates the effective Compose and Caddy configuration, waits for health, then probes API/database readiness and the HTTPS dashboard through `gateway`. It never removes volumes. A deployment is skipped if a newer `main` commit has superseded the commit that passed CI.

This host's override supplies the API egress network, ACME challenge and Let's Encrypt certificate mounts, and `./Caddyfile.production.local:/etc/caddy/Caddyfile:ro` for the gateway. Keep the override, `Caddyfile.production.local`, and certificate directories on the host; do not commit certificates or private keys. The `.local` file carries this host's trusted public TLS configuration while the tracked `Caddyfile.production` remains the portable internal-CA default for a fresh clone. The deploy script refuses tracked server-side edits, so make server-specific Caddy changes in the local file.

Configure these values in the repository's GitHub `production` environment before expecting automatic deployment:

- Secrets `PRODUCTION_SSH_HOST`, `PRODUCTION_SSH_USER`, `PRODUCTION_SSH_KEY`, and `PRODUCTION_DEPLOY_PATH`.
- Secret `PRODUCTION_SSH_KNOWN_HOSTS` containing the verified SSH host key line for the host and port.
- Optional variable `PRODUCTION_SSH_PORT` (defaults to `22`; this host uses `9008`). For a nonstandard port, the known-hosts entry must use `[host]:port`.

The SSH user must own or be authorized to update the checkout, fetch the public repository, and run Docker Compose. The existing host also needs `jq` so the script can verify that the effective Compose configuration mounts its local Caddyfile. Keep SSH reachable from GitHub Actions runners or provide an approved runner/network path. On the existing host, HTTPS is served by the same `firewall-soar` gateway that the deployment updates; verify its certificate and dashboard route after each release.

The initial backend image build can take more than ten minutes while Alpine installs Chromium. CI keeps the SSH connection alive and emits a periodic progress line during the build; the production job permits up to 45 minutes. Do not interpret a fast-forwarded checkout alone as a successful release: the deploy marker and health checks are written only after the containers are healthy.

The server must have at least 2 GiB free before a release begins; the deploy script refuses to start below that floor to protect the live database and gateway from a full root filesystem. A first build can temporarily need more than 3 GiB because the old and new Chromium-enabled API images coexist. Increase the server filesystem if this headroom cannot be maintained. Only disposable build/package caches were cleared during the 2026-10-06 recovery; runtime volumes and certificate files were preserved.

## Advanced CI deployment

GitHub workflows keep immutable-image staging, production release, and rollback flows. Their SSH, registry, database, authentication, and encryption values must be supplied through GitHub Environments or the target host secret manager. These external-secret requirements do not apply to the primary root compose.

Production image tags should remain immutable version or commit tags. The rollback workflow redeploys the previously recorded tag without rebuilding it.
