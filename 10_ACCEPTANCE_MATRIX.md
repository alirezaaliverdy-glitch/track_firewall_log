# Final Acceptance Matrix

Phase G final status was recorded on 2026-07-22 from committed Phase F HEAD `20d3f7b`.

Legend: `[x]` verified by repository evidence and Phase G gates. `[!]` preserved limitation outside the Phase G code scope.

## Security

- [x] Every authenticated mutation route declares a permission. Evidence: full isolated backend TAP, RBAC/source tests.
- [x] Viewer mutations return 403. Evidence: full isolated backend TAP, Phase A RBAC acceptance.
- [x] Operator cannot manage credentials/devices/users or execute high-risk plans. Evidence: full isolated backend TAP.
- [x] Admin permissions work. Evidence: full isolated backend TAP and authenticated Playwright shell.
- [x] Login, AI, action, onboarding and upload limits work. Evidence: full isolated backend TAP.
- [x] CSRF and Origin guards protect cookie-auth mutations. Evidence: full isolated backend TAP.
- [x] Session cookies remain httpOnly and secure in production. Evidence: full isolated backend TAP plus unchanged cookie-auth web flow.
- [x] No secret appears in logs, audit previews or build artifacts. Evidence: full isolated backend TAP, UTF-8/build artifact checks, production compose requires secrets from environment.

## Assistant

- [x] Device selection does not force planning. Evidence: Phase E/Phase G focused backend source tests and full TAP.
- [x] General chat works with and without selected device. Evidence: full isolated backend TAP.
- [x] Device questions remain non-mutating. Evidence: full isolated backend TAP.
- [x] `دستور:` / `پرامپت:` / `پرامت:` / `command:` / `prompt:` force action planning. Evidence: full isolated backend TAP.
- [x] Chat and Action UI overrides work. Evidence: full isolated backend TAP and Playwright Assistant acceptance.
- [x] Ambiguous text never auto-executes. Evidence: full isolated backend TAP.
- [x] Catalog action is preferred when available. Evidence: command catalog validation and full isolated backend TAP.
- [x] Valid custom AI action creates a plan when catalog is absent. Evidence: full isolated backend TAP.
- [x] Missing fields are collected. Evidence: full isolated backend TAP.
- [x] No plan reaches a connector before approval and PolicyGuard. Evidence: full isolated backend TAP.

## Execution

- [x] Exact device/vendor/platform binding. Evidence: full isolated backend TAP.
- [x] Cross-vendor command rejected. Evidence: full isolated backend TAP.
- [x] Permission and risk checks applied. Evidence: full isolated backend TAP.
- [x] Connector evidence persisted. Evidence: full isolated backend TAP.
- [x] Post-execution verification required. Evidence: full isolated backend TAP.
- [x] Dependent steps skipped after failure. Evidence: full isolated backend TAP.
- [x] Audit/result timeline is complete. Evidence: full isolated backend TAP.
- [x] No raw frontend/provider-to-device execution path exists. Evidence: full isolated backend TAP and Phase G storage/PWA source tests.

## Refactor

- [x] Characterization tests pass before/after. Evidence: Phase E/F/G source tests and full isolated backend TAP.
- [x] Core files are decomposed and facades preserve imports. Evidence: Phase D/E source tests.
- [x] No circular dependency. Evidence: frontend and backend TypeScript builds.
- [x] No core handwritten file remains above 50 KB without documented reason. Evidence: Phase D size gate retained by full TAP/source contracts.
- [x] No user-visible regression in Assistant or Action Center. Evidence: Playwright desktop and 390px mobile acceptance.

## Production/docs

- [x] Production DB has no public host port. Evidence: `docker-compose.firewall.yml` keeps `firewall-db` internal.
- [x] No hardcoded production secret. Evidence: production compose requires secret values from `.env`.
- [x] Containers have health checks and non-root execution where practical. Evidence: production compose health checks; backend runtime now uses `USER node`.
- [x] Review bundle excludes runtime, backups, secrets and build output. Evidence: `.dockerignore` and `backend/.dockerignore` exclude `.env`, dependency, runtime and build paths.
- [!] Current architecture/capability/security/mobile docs are not docs-clean because the pre-existing unrelated deleted `docs/` state was explicitly preserved.
- [!] Legacy task docs are not archived/marked in this commit because the pre-existing unrelated deleted/untracked documentation state was explicitly preserved.

## Mobile

- [x] PWA is installable. Evidence: manifest, icons, build artifact check, Phase G PWA source test.
- [x] Offline mode is explicitly read-only. Evidence: offline banner, service worker read-only cache markers, Phase G PWA source test.
- [x] No offline replay of actions. Evidence: service worker returns `OFFLINE_MUTATION_BLOCKED` for mutating API requests and contains no replay queue.
- [x] 390px layouts have no horizontal overflow. Evidence: Playwright MCP on dashboard, assistant, actions, devices and workflow lab.
- [x] Action review is usable as a bottom sheet. Evidence: Phase F/Phase G CSS source tests and mobile Playwright CSS presence check.
- [x] RTL/LTR and safe areas work. Evidence: i18n checks and Playwright Persian RTL / English LTR at 390px.
- [x] API and auth transports are centralized and Capacitor-ready. Evidence: `src/lib/apiTransport.ts`, auth/CSRF imports, `capacitor.config.ts`, mobile scripts.

## Global Validation

- [x] `npm run build`
- [x] `npm run test:i18n`
- [x] `npm run test:utf8`
- [x] `npm run test:workflows`
- [x] `npm run test:v2-stability`
- [x] `cd backend && npm run build`
- [x] `cd backend && npm run validate:command-catalog`
- [x] Full isolated backend TAP: 387 tests, 387 pass.
- [x] Focused Phase G TAP: 5 tests, 5 pass.
- [x] PWA artifact checks.
- [x] Playwright desktop/mobile acceptance.
- [x] `git diff --check`

DB-bound tests used the repository isolated test database path prepared by `prepare-isolated-test-database.ts`; development and production databases were not targeted.
