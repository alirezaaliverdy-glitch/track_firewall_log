# Phase 0 Non-Destructive Baseline (2026-07-14)

## Source identity

- Branch: `product-persian-command-catalog`
- HEAD: `168f585a5b040366ed02eaf8efaaa51e471736c6`
- Tracked changes: none at baseline capture.
- Untracked state: pre-existing audit/master/task documents and `.playwright-mcp` evidence. No pre-existing untracked file was modified or removed.

## Runtime identity

- Windows PostgreSQL service: `postgresql-x64-18`, running directly on Windows.
- PostgreSQL listener: PID `7688`, `0.0.0.0:5432` and `[::]:5432`.
- Backend before baseline: no listener/process. Normal `cd backend && npm run dev` was started and listens on `127.0.0.1:4000`.
- Frontend before baseline: no listener/process. Normal Vite runtime was started at `http://localhost:5173`.
- No duplicate backend/frontend process was found or stopped.
- Ports `5174` and other inspected application ports had no listener before startup.

## Database identity and preservation counts

The normal application datasource was queried through the existing application database configuration without printing credentials:

- Host: `127.0.0.1`
- Port: `5432`
- Database: `firewall_log_analyzer`
- Schema: `public`
- Current user: `postgres`
- Device: `3`
- Asset: `7`
- DeviceCredential references: `4`
- Finding: `5`
- ActionPlan: `124`
- AppUser: `1`

These nonzero historical records identify the required working database. Counts must be compared after every later phase.

## Frontend route inventory

- Authoritative audit inventory: 53 feature routes in `docs/project-audit/ROUTE_CONTRACT_MATRIX.csv` and `.md`.
- Current implementation source: `src/routes/appRoutes.tsx`.
- Current router is manual: `src/App.tsx` reads `window.location.pathname`; `matchRoute` falls back to the first route (Dashboard).
- Direct navigation remains in `ActionCenterPanel`, `ActionResultView`, `CommandCatalogPanel`, and multiple feature pages via `pushState`, `window.location.pathname`, or plain anchors.
- Planned/placeholder contracts remain for sites, networks, topology, events, rule detail, connector health, guided actions, and settings.
- Shared aliases remain for Actions, Monitoring, Cisco inventory, Tools, Integrations, and onboarding routes as documented in the route matrix.

## Backend route inventory

- Fastify route registrations are distributed under `backend/src/routes/` and registered by the backend application.
- The static audit identified 137 unique backend API paths.
- Live baseline: `/api/health/live` returned `200` with the live contract; `/api/health/ready` returned `200` with `databaseReady=true`.
- Protected resource probes (`/api/assets`, `/api/devices`, `/api/security/findings`, `/api/actions`) returned `401` without an authenticated browser/API session, as expected.

## Product State registry differences

- Frontend routes and backend Product State currently contain the same 53 feature identities, but they are separate hand-maintained sources without a comprehensive shared-manifest parity gate.
- `tools.nmap` is marked `planned`, `backendReady=false`, and `apiReady=false`, while source contains an Nmap route/worker implementation; runtime capability probing is absent.
- Multiple entries are marked tested/UI-ready while their route reuses a generic page without a distinct route contract (notably Actions pending/history and Monitoring device/daily-check aliases).
- Planned routes are still directly reachable, and some operational Dashboard controls link to planned Tools surfaces.

## Current failing routes and controls

- Connected Playwright MCP opened `/dashboard` at `http://localhost:5173` but rendered the login page, not Dashboard identity.
- Browser console reported 2 errors during that navigation.
- The connected browser session is not authenticated; credentials were not read from `.env` or entered.
- Therefore no protected route is accepted at baseline: correct page identity, data contract, controls, navigation, RTL/LTR, and backend requests remain unverified.
- Known source-level failures: unknown routes fall back to Dashboard; `pushState` navigation does not provide reactive routing; Actions pending/history and Monitoring aliases lack distinct contracts; Cisco devices shares overview; traceroute, IP info, subnet, monitors, and settings are placeholders/planned.

## Phase 0 dump gate

- Verified dump: `backups/phase0_firewall_log_analyzer.dump`
- The file was inspected read-only with PostgreSQL 18 `pg_restore --list`.
- Archive header: database `firewall_log_analyzer`, format `CUSTOM`, PostgreSQL/pg_dump `18.4`, and `364` TOC entries.
- The dump was not recreated, overwritten, restored, or modified.
- Phase 0 is complete. No migration/schema/data mutation was performed during the baseline.
