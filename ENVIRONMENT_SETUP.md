# Environment Setup

This project uses explicit environment profiles to keep development, staging, and production behavior separate.

## Profiles

- Development: local Vite and backend dev servers, `APP_PROFILE=lab`, protected lab execution defaults remain enabled.
- Staging: production-like Docker stack, `APP_PROFILE=staging`, no lab unrestricted management by default.
- Production: Docker stack with `NODE_ENV=production` and `APP_PROFILE=production`; startup fails on missing or weak required variables.

## Frontend

Copy one frontend example from `config/env/` into your local shell or CI environment:

- `config/env/frontend.development.env.example`
- `config/env/frontend.staging.env.example`
- `config/env/frontend.production.env.example`

Required production frontend variables:

- `VITE_APP_ENV=production`
- `VITE_BASE_PATH`
- `VITE_API_BASE_URL`

Do not define secret-like values with a `VITE_` prefix. Vite embeds `VITE_` values in browser assets.

## Backend

Copy one backend example from `config/env/` and replace all placeholder values:

- `config/env/backend.development.env.example`
- `config/env/backend.staging.env.example`
- `config/env/backend.production.env.example`

Required production backend variables:

- `NODE_ENV=production`
- `APP_PROFILE=production`
- `DATABASE_URL`
- `CORS_ORIGIN`
- `CREDENTIAL_ENCRYPTION_KEY`
- `ADMIN_PASSWORD`
- `AUTH_SESSION_SECRET`

Production startup fails when required values are missing, weak, default, or configured for local development origins/credentials.

## Compose Files

- `docker-compose.development.yml`: local PostgreSQL for development.
- `docker-compose.staging.yml`: staging web/API/database stack with required staging secrets supplied by environment.
- `docker-compose.firewall.yml`: production web/API/database stack with required production secrets supplied by environment.

Examples:

```bash
docker compose -f docker-compose.development.yml up -d
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build
docker compose --env-file .env.production -f docker-compose.firewall.yml up -d --build
```

Real `.env` files are intentionally ignored by Git. Commit only example files.

## Validation

Frontend:

```bash
pnpm run validate:env:frontend
pnpm exec tsc -b
npm run build
pnpm run test:smoke:frontend
```

Backend:

```bash
cd backend
pnpm run validate:env
pnpm run build
pnpm run test:smoke
```
