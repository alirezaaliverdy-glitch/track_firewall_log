# Environment Setup

The project keeps development, staging, and production behavior separate while making the default production install self-contained.

## Default production startup

    docker compose up -d

The root compose builds both application images, generates persistent strong runtime secrets, waits for PostgreSQL, applies Prisma migrations, creates the initial administrator when needed, and exposes the application through HTTPS. A .env file is optional, not required.

Use https://SERVER_IP/firewall/ after docker compose ps reports the long-running services as healthy. Retrieve the one-time bootstrap credential from the deployment host with:

    docker compose exec firewall-api cat /app/storage/bootstrap/initial-admin.json

Production runs with NODE_ENV=production, APP_PROFILE=production, safe action execution defaults, a non-root API process, and private application/database networks.

## Optional root-compose overrides

The default values work without configuration. Operators may set these values in the server environment or a private .env file when needed:

- FIREWALL_HTTP_PORT and FIREWALL_HTTPS_PORT
- POSTGRES_DB and POSTGRES_USER
- BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_DISPLAY_NAME
- PUBLIC_APP_URL and CORS_ORIGIN
- AI_PROVIDER, OPENAI_BASE_URL, OPENAI_API_KEY, and OPENAI_MODEL
- collection, monitoring, upload, and SSH timeout values already declared in docker-compose.yml

Do not put credentials in variables prefixed with VITE_. Vite embeds those values in browser assets.

## Explicit alternative profiles

- docker-compose.development.yml: local development dependencies.
- docker-compose.staging.yml: staging stack with externally supplied staging values.
- docker-compose.production.yml: immutable-image production flow used by CI.
- docker-compose.firewall.yml: legacy production-compatible entrypoint with externally managed values.

Examples:

    docker compose -f docker-compose.development.yml up -d
    docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build
    docker compose --env-file .env.production -f docker-compose.production.yml up -d

The advanced staging/production profiles intentionally fail when their externally managed database, session, credential-encryption, administrator, image, or origin values are missing or weak. The root compose satisfies the same backend hardening requirements with generated file-backed secrets.

## Validation

Frontend:

    pnpm run validate:env:frontend
    pnpm exec tsc -b
    npm run build
    pnpm run test:smoke:frontend

Backend:

    cd backend
    pnpm run validate:env
    pnpm run build
    pnpm run test:smoke

Real .env files are intentionally ignored. Commit only documented examples.
