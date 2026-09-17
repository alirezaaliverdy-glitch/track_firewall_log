# Final Acceptance Matrix

Phase H final status was recorded on 2026-07-23 from committed Phase G HEAD `c79f47c` through H8.

Legend: `[x]` verified by repository evidence and Phase H gates. `[!]` preserved limitation outside the Phase H code scope.

## Security

- [x] Every authenticated mutation route declares a permission. Evidence: full isolated backend TAP, RBAC/source tests.
- [x] Viewer mutations return 403. Evidence: full isolated backend TAP, Phase A RBAC acceptance.
- [x] Operator cannot manage credentials/devices/users or execute high-risk plans. Evidence: full isolated backend TAP.
- [x] Admin permissions work. Evidence: full isolated backend TAP and authenticated Playwright shell.
- [x] Login, AI, action, onboarding and upload limits work. Evidence: full isolated backend TAP.
- [x] CSRF and Origin guards protect cookie-auth mutations. Evidence: full isolated backend TAP.
- [x] Session cookies remain httpOnly and secure in production. Evidence: full isolated backend TAP plus unchanged cookie-auth web flow.
- [x] No secret appears in logs, audit previews or build artifacts. Evidence: full isolated backend TAP, UTF-8/build artifact checks, production compose requires secrets from environment.
- [x] Approvals bind to preview/result state using plan, device, platform, parameter, generated-step, risk, preview, canonical, and expiry metadata. Evidence: Phase H approval/result-state TAP and full isolated backend TAP.
- [x] Offline approval and offline execution are blocked. Evidence: Phase H mobile hardening TAP and PWA source/artifact checks.

## Assistant

- [x] Device selection does not force planning. Evidence: Phase H selected-device characterization and full isolated backend TAP.
- [x] General chat works with and without selected device. Evidence: full isolated backend TAP.
- [x] Device questions remain non-mutating. Evidence: full isolated backend TAP.
- [x] Persian command markers plus `command:` / `prompt:` force action planning. Evidence: full isolated backend TAP and UTF-8 guard.
- [x] Chat and Action UI overrides work. Evidence: full isolated backend TAP and Playwright Assistant acceptance.
- [x] Ambiguous text never auto-executes. Evidence: full isolated backend TAP.
- [x] Catalog action is preferred when available. Evidence: command catalog validation and full isolated backend TAP.
- [x] Valid custom AI action creates a plan when catalog is absent. Evidence: Phase H generic custom action tests and full isolated backend TAP.
- [x] Generic Cisco VLAN action requests create supported plans and no longer regress to review-only/manual-only output. Evidence: Phase H Cisco characterization and implementation TAP.
- [x] Read-only live monitoring intent can create a monitoring ActionPlan without connector execution. Evidence: Phase H monitoring pipeline TAP.
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
- [x] Parameter correction is backend-schema-driven before execution. Evidence: H4 parameter workspace source tests and full isolated backend TAP.
- [x] Execution persists verified result states and evidence counts. Evidence: H6 approval/result-state TAP and full isolated backend TAP.

## Refactor

- [x] Characterization tests pass before/after. Evidence: Phase H Cisco/custom action characterization, Phase E/F/G source tests, and full isolated backend TAP.
- [x] Core files are decomposed and facades preserve imports. Evidence: Phase D/E source tests.
- [x] No circular dependency. Evidence: frontend and backend TypeScript builds.
- [x] No core handwritten file remains above 50 KB without documented reason. Evidence: Phase D size gate retained by full TAP/source contracts.
- [x] No user-visible regression in Assistant, Action Center, parameter workspace, or monitoring result routes. Evidence: focused Phase H tests, frontend build, and Playwright desktop/390px mobile acceptance.

## Production/docs

- [x] Production DB has no public host port. Evidence: `docker-compose.firewall.yml` keeps `firewall-db` internal.
- [x] No hardcoded production secret. Evidence: production compose requires secret values from `.env`.
- [x] Containers have health checks and non-root execution where practical. Evidence: production compose health checks; backend runtime now uses `USER node`.
- [x] Review bundle excludes runtime, backups, secrets and build output. Evidence: `.dockerignore` and `backend/.dockerignore` exclude `.env`, dependency, runtime and build paths.
- [x] Final acceptance matrix records Phase H gates and remaining limitations. Evidence: this file and `CODEX_HANDOFF.md`.
- [!] Current architecture/capability/security/mobile docs are not docs-clean because the pre-existing unrelated deleted `docs/` state was explicitly preserved.
- [!] Legacy task docs are not archived/marked in this commit because the pre-existing unrelated deleted/untracked documentation state was explicitly preserved.

## Mobile

- [x] PWA is installable. Evidence: manifest, icons, build artifact check, Phase G/Phase H PWA source tests.
- [x] Offline mode is explicitly read-only. Evidence: offline banner, service worker read-only cache markers, Phase G PWA source test.
- [x] No offline replay of actions. Evidence: service worker returns `OFFLINE_MUTATION_BLOCKED` for mutating API requests and contains no replay queue.
- [x] Mobile action approval/execution requests include idempotency keys. Evidence: H7 mobile hardening TAP.
- [x] Mobile action notifications and action deep links have stable contracts. Evidence: H7 mobile hardening TAP.
- [x] 390px layouts have no horizontal overflow. Evidence: Playwright MCP dashboard acceptance and frontend build.
- [x] Action review is usable as a bottom sheet. Evidence: Phase F/Phase G CSS source tests and mobile Playwright CSS presence check.
- [x] RTL/LTR and safe areas work. Evidence: i18n checks and Playwright Persian RTL / English LTR acceptance history.
- [x] API and auth transports are centralized and Capacitor-ready. Evidence: `src/lib/apiTransport.ts`, auth/CSRF imports, `capacitor.config.ts`, mobile scripts.

## Global Validation

- [x] `npm run build`
- [x] `npm run test:i18n`
- [x] `npm run test:utf8`
- [x] `npm run test:workflows`
- [x] `npm run test:v2-stability`
- [x] `cd backend && npm run build`
- [x] `cd backend && npm run validate:command-catalog`
- [x] Full isolated backend TAP: 403 tests, 403 pass.
- [x] Focused Phase H TAP: 54 tests, 54 pass.
- [x] Product-state focused TAP: 5 tests, 5 pass.
- [x] PWA artifact checks.
- [x] Playwright desktop/mobile acceptance: dashboard loaded at `http://localhost:5173/dashboard`, title `log-app`, zero browser console errors.
- [x] `git diff --check`

DB-bound tests used the repository isolated test database path prepared by `prepare-isolated-test-database.ts`; development and production databases were not targeted.
