## 2026-09-16 - Rebuild dashboard as a live security command center

- Replaced the previous hero-heavy dashboard with a compact Persian-first command board inspired by the approved landing visual: daily security status, equipment, alerts, alert trend, device table, event-port activity, findings, operator priorities, execution trail, and Linux telemetry.
- Connected all figures to the existing asset, finding, event-summary, monitoring-worker, dashboard-activity, and Linux-health APIs. No placeholder metrics or fabricated chart points are shown; empty datasets render honest empty states.
- Added responsive presentation, real refresh behavior, 60-second read-only polling, and reduced-motion support. Corrected all drill-down links to use registered device and finding routes.
- Passed production build, targeted ESLint, UTF-8/i18n checks, health-gated Docker deployment, HTTP smoke checks, deployed-asset verification, and four-container health validation.
## 2026-09-16 - Landing product imagery and 3D interaction

- Replaced the landing's code-only product mockups with three polished, privacy-safe product images based on the current Firewall SOAR interface.
- Added 3D perspective/tilt, layered card depth, pointer lighting, responsive fallbacks, and richer capability copy while preserving the existing landing route, Persian-first typography, team section, and scroll reveals.
- Verified the production Docker build and health-gated web deployment. Both the landing and authenticated dashboard routes remain available through the main Nginx entrypoint.
## 2026-09-16 - Make the onboarding default actionable

- Removed the separate hidden `vendorConfirmed` state that contradicted the visible Linux platform default on the generic registration route.
- Bound the vendor checkmark, selected-vendor summary, and validation path to the same onboarding draft value, eliminating the no-op-looking Continue button while preserving vendor switching.
- Updated the focused source contract, completed the frontend production build, deployed the web image, and verified healthy HTTP responses for onboarding and API readiness.

## 2026-09-13 - Verify complete Sophos user-consumption reporting

- Opened the live Sophos reports and generated both the application-based user-usage view and the user session-accounting view for the requested two-day range.
- Expanded the report display from the default top five to all available rows and confirmed that application-based reporting is the appropriate primary view for total internet consumption by identity.
- Confirmed that session accounting provides upload/download and used-time detail but does not represent all bytes visible in application traffic reporting; historical unidentified traffic remains unattributable.
- Left all live configuration unchanged and did not persist user names, usage values, report exports, credentials, cookies, or raw logs in repository documentation.

## 2026-09-12 - Publish Sophos CA trust through workstation-only GPO

- Used the explicitly authorized domain administrator through tunneled WinRM and identified the existing domain/workstation scope without altering accounts or default policies.
- Created a separate domain-linked GPO with individual computer Apply permissions for ten Windows workstations and read-only Authenticated Users access.
- Retrieved only public Sophos CA certificates. Matched the live HTTPS interceptor issuer to SecurityAppliance SSL CA and published both it and the Default CA as verified serialized root-policy blobs.
- Added Firefox enterprise-root trust integration; no HTTPS validation, DNS, gateway, firewall or captive-portal authentication bypass was introduced.
- Tried both WinRM and RPC management paths for endpoint refresh/verification; all workstation endpoints were unavailable. End-to-end workstation certificate application and browser acceptance remain unverified, with an explicit computer-policy refresh handoff.
- Removed the credential-free temporary automation and restored the pre-existing browser helper. No secrets or raw operational logs were persisted. Preserved the pre-existing handoff-file deletion and unrelated working-tree changes.

## 2026-09-11 - Preserve scheduler inputs and expose queued work

- Scoped parameter initialization to an actual device/catalog selection change, so polling and time edits no longer erase operator input.
- Removed the redundant native confirmation dialog from schedule submission while preserving the backend confirmation contract.
- Added a read-only scheduled-task projection to Action Center with sanitized parameters, device context, scheduled metadata, and `queued` lifecycle semantics.
- Included queued schedules in the history view and summary counters; the due-time worker remains responsible for creating and executing the real controlled ActionPlan.
- Added integration assertions for list/detail queue visibility and UI regressions around time direction, retained inputs, and single-step submission.

## 2026-09-11 - Make Cisco asset details visual and operational

- Exposed a safe, bounded projection of the structured Cisco collection instead of reducing collected data to capability badges.
- Built a Persian-first Cisco dashboard for port health, hardware, resources, VLAN/routing/neighbor visibility, and service/configuration posture.
- Merged Cisco interface summary and switchport evidence by canonical interface identity and enriched the full interface list with description, IP, VLAN, speed, duplex, admin state, and link state.
- Kept missing data explicit and provided a direct connector-backed refresh without fabricating status.
- Prevented raw CLI, command evidence, and credential-shaped fields from reaching the new vendor-detail response.
- Deployed both project-scoped containers through their health-gated rebuild scripts and verified HTTP 200 for the asset route and API health.

## 2026-09-01 - Calm and performance-bound motion

- Reduced the shared top motion rail's active particles and extended its animation cadence without removing route-specific visual identity.
- Replaced animated scanner layout movement and dashboard width/height effects with transform/opacity paths, added paint containment, and removed mobile-only decorative animation work.
- Lowered the dashboard scene's simultaneous packet/threat count and added focused regression contracts for density, cadence, mobile reduction, and expensive filter avoidance.

## 2026-08-31 - Contextual motion across every product tab

- Introduced one lightweight `SectionMotion` system at the authenticated shell boundary so all product pages receive a route-aware visual without duplicating page code.
- Added distinct motion behaviors for topology sync, threat scanning, telemetry, controlled execution, AI conversation, attacker radar, account access, diagnostics, email delivery, rules, findings, onboarding, and Linux monitoring.
- Upgraded the dashboard defense scene and removed all captions beneath its animated network elements.
- Updated the Persian copy contract to reflect the already-completed removal of dead global search/notification controls from the operational top bar.
- Passed 6/6 focused tests, TypeScript, ESLint, production build, UTF-8, i18n, frontend smoke, Docker health checks, and deployed route probes.

## 2026-08-29 - Multi-recipient email management and delivery history

- Replaced the single recipient input with a compact add/remove list supporting up to ten unique validated addresses.
- Added PostgreSQL migration `20260829193000_multiple_security_email_recipients`; legacy `recipientEmail` remains synchronized for compatibility while the new recipient array drives delivery.
- Fan-out delivery now creates a separate durable ledger record and recipient-aware fingerprint for every destination. Retry preserves the destination stored when the alert occurred.
- Rebuilt recent delivery history around operator questions: why it was sent, where it was sent, which vendor/device triggered it, when it ran, its state, attempts, next retry, and readable failure reason.
- Added normalization and UX contracts; focused tests pass 14/14.

## 2026-08-29 - Dedicated email-alert workspace and sidebar UX repair

- Fixed the half-collapsed desktop navigation by resizing the shell grid together with the sidebar, hiding text/children completely, centering icons, adding directional controls/tooltips, and persisting the operator preference.
- Added implemented `/security/email-alerts` frontend/product-state navigation and moved all Gmail, recipient, alert-level, test-send, vendor-test, retry-state, and delivery-history UI out of Detection Rules.
- Simplified the connected Gmail experience so operators see the verified identity rather than disabled email/password inputs. Added three immediate status cards and a clear empty/history state.
- Passed frontend and backend builds, targeted lint, UTF-8/i18n, 13 focused tests, 191-item catalog validation, healthy API/web deployment, HTTP route checks, and deployed navigation verification.

## 2026-08-29 - Durable offline email recovery and five-vendor live test

- Replaced the five-attempt email retry ceiling with a persistent PostgreSQL queue for transient internet, DNS, timeout, SMTP connection, and temporary SMTP rejection failures. Retry continues indefinitely with a maximum 30-minute backoff and runs even if another monitoring stage fails.
- Separated permanent Gmail authentication/configuration failures into `blocked`, expanded delivery deduplication to queued/blocked attempts, exposed queue state and next retry in Detection Rules, and added periodic UI refresh.
- Added protected `/api/security/alerts/email/test-vendors` and a Persian UI action that exercises an enabled high/critical rule template for each primary vendor without creating fake Findings.
- Sent five real deployed Gmail tests successfully for Linux, MikroTik, FortiGate, Cisco, and pfSense (`5 sent / 0 failed`), in addition to the successful generic test; no credentials or recipient address were logged.
- Passed focused tests 9/9, backend/frontend builds and targeted lint, 191-item catalog validation, healthy API/web Docker deployment, and bounded project-image replacement.

## 2026-08-29 - In-app Gmail App Password connection

- Replaced the server-only SMTP dead end with an admin-only Gmail registration surface in Detection Rules, including a direct Google App Password link, guided setup, masked secret input, connection verification, connected identity, disconnect, alert recipient/severity, and test send.
- Added encrypted per-user sender credentials and a schema migration. The plaintext App Password is never persisted outside AES-256-GCM encrypted storage and is omitted from every API response; logging redaction explicitly covers the request field.
- Added authenticated SMTP connection verification without sending a message, per-channel Gmail delivery/retry, safe server-SMTP fallback, actionable Persian error messages, and the missing RBAC mutation declarations that caused `forbidden`.
- Added focused contracts for the 16-character App Password format, SMTP AUTH, permission coverage, and secret-log redaction.
- Rebuilt and deployed the API and web images, applied the Gmail sender migration, verified both containers healthy, and ran an authenticated temporary-admin smoke that proved the new Gmail mutation reaches validation instead of returning `forbidden`; cascade cleanup left zero smoke users.

## 2026-08-29 - Continuous five-vendor monitoring and immediate detection email repair

- Root cause: no background scheduler consumed `EventCollectorState`; collectors only ran manually, only Linux was registered, collector ingest hardcoded the Linux vendor, and one email path omitted its DetectionRule. The page therefore described automatic behavior that the runtime did not provide.
- Added an API-owned, non-overlapping monitoring worker with automatic collector-state reconciliation, due-time scheduling, five-second detection evaluation, sanitized health, clean shutdown, and bounded SMTP retry.
- Added read-only SSH log collection for Linux, MikroTik, FortiGate, Cisco, and pfSense using registered vendor-safe commands and existing stored credentials. Changed collector states to default enabled and migrated existing states once; later operator disable remains persistent.
- Corrected collector event identity and time semantics so repeated polling does not inflate counts, revive old evidence, or generate repeated alerts. Detection execution is serialized to prevent concurrent Finding upsert races.
- Changed mail eligibility from the old 15-item subset to every enabled rule meeting the configured `high + critical` or `critical` threshold, while preserving cooldown and restart-safe event-set deduplication. Added Persian labels, device identity, delivery retry state, and channel error health.
- Added truthful live worker state to `/security/rules`. Passed all builds and focused quality gates, then deployed healthy API/web images. An isolated PostgreSQL and real local SMTP socket proved 5-event thresholding, two qualifying high-severity emails, no duplicate after a second process phase, and cleanup of all test state/database.
- A sanitized deployed-container readiness probe showed that this installation still has no SMTP host/sender configured. The code and local SMTP delivery are verified, but external delivery remains configuration-blocked until server SMTP values are supplied; no secret value was inspected or emitted.

## 2026-08-28 - Real vendor detection rules and Persian email alerts

- Added 25 curated, event-backed Linux/MikroTik/FortiGate/Cisco/pfSense rules with stable vendor predicates while preserving existing general detection coverage in its own tab.
- Fixed rule-state persistence and Finding inflation by preserving operator toggles, evaluating bounded time windows, and adding only previously unseen event references.
- Added database-backed email recipient/severity settings, SMTP/STARTTLS delivery, fully Persian messages, test-send health, sanitized error status, restart-safe unique delivery deduplication, and a persisted per-rule-window cooldown.
- Restricted automatic mail to an explicit allowlist of 15 important high-confidence vendor rules; general, non-priority, medium, and low rules remain visible as Findings without sending mail.
- Connected API ingestion, collector completion, and persisted suspicious Linux live telemetry to immediate rule evaluation.
- Simplified the Detection Rules page into vendor tabs, five compact rules per vendor, real thresholds/standards, manual execution, and a responsive email setup panel.
- Proved the runtime with a local SMTP socket, Docker PostgreSQL, real events, Finding persistence, an API restart, no repeated email, cleanup/restoration, builds, lint, and health checks.

## 2026-08-23 - Resilient AI assistant provider runtime

- Traced the assistant's 502 response through UI, API, provider configuration, Docker DNS, host proxy reachability, and a sanitized real provider probe without exposing credentials or logs.
- Replaced the stale Hyper-V IP dependency with Docker's stable host-gateway mapping and made proxy restarts reuse the same ignored credential, validate listener ownership, and verify the actual Node listener.
- Corrected OpenRouter-compatible defaults, allowed fallback models after model/policy-level 403 responses, and added a deterministic Persian offline response when all external models fail. Controlled execution semantics remain unchanged.
- Added safe runtime diagnostics and operator documentation. The diagnostic reports status/model/provider/fallback/message presence only and never prints the API key or generated response.
- Rebuilt only `firewall-api`, health-gated the replacement, reclaimed the superseded image, and verified both real OpenRouter output (`fallbackUsed=false`) and a forced transport failure (`provider=mock`, `fallbackUsed=true`) return assistant messages.

## 2026-08-23 - User-friendly execution review and bounded web images

- Extracted the execution confirmation into a focused responsive component and removed the raw implementation matrix from the operator's main decision path.
- Kept target, risk, backup, expected impact, editable operational parameters, command preview, permission errors, and technical traceability while moving commands/details into optional disclosures.
- Filtered system-owned ActionPlan fields before rendering editable controls; real execution still requires a valid preview, explicit confirmation, `intent=execute`, PolicyGuard, a registered connector, and audit/result evidence.
- Added and exercised a health-gated PowerShell web deployment helper that removes only the prior `firewall-web` image ID after replacement. It handles Docker already reclaiming the previous ID and never performs global prune or forced image removal.
- Passed frontend typecheck/build, targeted lint, three focused source contracts, i18n/UTF-8 guards, nginx validation, container health checks, and the deployed `/firewall/actions` HTTP check.

## 2026-08-23 - Cross-device web, PWA, and native mobile readiness

- Audited the shared shell and primary Dashboard, Assets, Security, Monitoring, Actions, Assistant, Integrations, Tools, Settings, login, and Local Mobile Runtime surfaces for phone/tablet constraints, then added a centralized responsive layer without changing execution behavior.
- Replaced the text-only mobile navigation with four primary icon destinations and a `More` Drawer trigger; added Escape handling, safe areas, touch targets, iOS input sizing, keyboard-aware viewport metadata, responsive panels/forms/tabs/dialogs, and reusable table overflow behavior.
- Fixed subpath PWA installation and offline shell behavior by using `VITE_BASE_PATH` consistently in HTML, Router, manifest, service-worker registration, shell cache, and navigation fallback. Added correct nginx PWA MIME/cache handling and skipped service workers in native Capacitor.
- Repaired the malformed Android root Gradle structure and aligned it with Capacitor's AGP 8.13.0 while preserving JDK 21, SDK 36, secret-driven signing, local SSH, secure vault, and SQLite wiring. Sync succeeded; local Gradle assembly remains externally blocked by 404 responses for AGP from Google Maven.
- Passed root/subpath frontend builds, TypeScript, ESLint, PWA/mobile/security/release source contracts, locale and UTF-8 guards. Rebuilt/recreated Docker and verified HTTP 200. Chrome CDP device emulation confirmed no global overflow at 360, 390, and 768px.

## 2026-08-23 - Operator-friendly Action Center

- Replaced the oversized generic header with a compact controlled-operations header that explains the real five-step execution lifecycle and separates preview from device-changing execution.
- Added real summary counts for review-ready, executing, succeeded, and failed ActionPlans; reorganized target/action selection and connection readiness into one responsive workspace; and made the searchable queue visible without an extra disclosure click.
- Consolidated selected ActionPlan review into one panel while preserving parameter correction, explicit execution review, real connector invocation, retry/re-run, full result/evidence navigation, device navigation, pagination, and audit-safe history clearing.
- Added source contracts for the new layout and passed TypeScript, targeted ESLint, focused Action Center/history tests, locale parity, Persian-copy, UTF-8, and the production Vite build.
- Rebuilt the Docker frontend image, recreated only `firewall-web` and `main-nginx`, verified both healthy, confirmed HTTP 200 on `/firewall/actions`, and confirmed the deployed JS/CSS include the new console layout.

## 2026-08-23 - Actionable Linux fleet monitoring

- Rebuilt `/monitoring/linux` around responsive server cards, real health/resource rings, attention-first ordering, search/status filters, and safe single/all-device read-only collection instead of the compressed RTL table.
- Rebuilt `/monitoring/linux/:deviceId` as an inline operational detail view with real Snapshot facts, service/port/firewall indicators, stored warnings, and 24-hour CPU/RAM/Disk trend charts backed by the existing metrics endpoint.
- Preserved the vendor overview and controlled execution model. The UI discloses missing observability storage and missing telemetry without fabricating healthy values.
- Rebuilt and recreated only `firewall-web` and `main-nginx` with `--no-deps`; all stack services are healthy, `/firewall/monitoring/linux` returns HTTP 200, and the deployed assets contain the fleet, device-detail, trend, filter, and responsive rules.

## 2026-08-20 - Simple standards-aligned vendor monitoring workspace

- Rebuilt `/monitoring` as a compact five-vendor workspace with only vendor/device selection, one Daily Check action, a colorful four-segment health ring, four vendor-specific essential cards, the latest result, and direct Linux advanced-monitoring access. The prior vendor tabs, summary-card row, and expandable domain list were removed.
- Added non-secret device readiness to the Daily Check API and standards metadata to every profile section. Actual domain status is read only from a connector-invoked parsed result; definitions and missing data remain unknown/manual instead of becoming healthy.
- Preserved real Daily Check creation for Linux, MikroTik, and FortiGate. Cisco and pfSense remain honest manual profiles with complete vendor-focused checklists and no misleading execution button.
- Added focused source contracts for five-vendor coverage, the four-card projection, removal of the long domain list, and result integrity. TypeScript, targeted ESLint, the production frontend build, locale guards, and UTF-8 validation pass. Database-coupled legacy tests remain gated by the required isolated `TEST_DATABASE_URL`.
- Rebuilt and recreated only `firewall-web` and `main-nginx` with `--no-deps`; both became healthy, `/firewall/monitoring` returned HTTP 200, and the deployed bundle contains the four vendor-specific cards and color-ring implementation.

## 2026-08-19 - Complete self-hosted authentication and account security

- Preserved the existing opaque-cookie, PostgreSQL session, CSRF, Origin, and RBAC architecture while completing login UX, error recovery, session management, password change, security audit, proxy-aware client identity, and expiry handling.
- Added `GET /auth/sessions`, per-session revoke, logout-all, and change-password contracts. Password update and global session invalidation are atomic; session tokens/hashes and password fields are never returned or logged.
- Added a Persian-first responsive login surface with English switching, accessible errors, Caps Lock feedback, service-retry state, and a real account-security Settings page for live sessions and password management.
- Hardened abuse controls with bounded inputs, dummy bcrypt comparison for unknown users, IP+identity and per-IP spraying limits, maximum active sessions, token rotation, idle filtering, safe forwarded-IP trust, and authentication audit events.
- Validation passed: backend build; frontend production build/typecheck; targeted ESLint; focused security tests 10/10; locale parity/Persian copy; UTF-8. Docker deploy was not performed because service recreation required explicit downtime approval; image build also encountered two registry network failures. A local real-DB smoke was attempted but the database is reachable only inside the Docker network, and no temporary user was created.

## 2026-08-12 - Device-scoped findings and exact evidence integrity

- Added a device selector under the vendor selector so operators can distinguish multiple Linux servers by registered name and management address, review all servers or one server, and see device-scoped findings and metrics.
- Removed evidence association by similar stored text. The evidence endpoint now accepts only exact finding references scoped to the finding device, reports resolved and unresolved reference counts, deduplicates identical raw records, and falls back to explicitly labeled stored evidence when the original event has expired.
- Tightened Linux SSH/sudo patterns, rejected successful sudo-session records, deduplicated overlapping live streams, and made finding persistence idempotent when re-analysis has no new event reference.
- Validated the backend build, full frontend production build, targeted ESLint, seven focused contracts/rule assertions, locale parity, Persian primary copy, and UTF-8. Docker deployment and deployed-browser verification still require an available privileged execution approval because the environment's automatic-approval usage limit rejected the rebuild request.

## 2026-08-11 - Selectable vendor finding views

- Fixed the findings selector being derived only from vendors already present in the finding result set, which made Linux the sole option when all current findings were Linux findings.
- Kept Linux, MikroTik RouterOS, FortiGate, pfSense, and Cisco selectable with honest zero counts, preserved strict one-vendor queue filtering, appended unexpected vendors that have real findings, and added a Persian/English vendor-specific no-findings state.
- Rebuilt and recreated the Docker frontend and nginx. Validation passed through frontend build, ESLint, locale and UTF-8 guards, five focused tests, and authenticated desktop/mobile Chrome interaction over the deployed localhost route with all five switches working and no console, HTTP, or overflow errors.

## 2026-08-11 - Vendor-specific findings and traceable raw evidence

- Split the finding queue by detected vendor and added a Persian vendor profile summary for live log families, configuration snapshots, categories, and rule coverage. Generic seeded detections now include explicit vendor applicability.
- Rebuilt finding detail as an investigation workspace with vendor taxonomy, confidence/timestamps/context, on-demand actual-log retrieval, expandable LTR raw messages, copy support, redaction disclosure, snapshot evidence, honest unavailable states, and controlled ActionPlan handoff.
- Added the authenticated evidence endpoint and safe public vendor-profile endpoint. Evidence resolution is device-scoped and exact: referenced `SecurityEvent` IDs, deterministic telemetry IDs, exact persisted legacy evidence, then bounded telemetry IDs; it never associates logs by approximate time or text similarity.
- Repaired Linux live telemetry to persist and reference the same deterministic ID, added a durable Docker telemetry volume, and limited image ownership changes to writable storage.
- Validation passed through backend/frontend builds, ESLint, locale/UTF-8 guards, nine focused tests, safe authenticated API probes with automatic cleanup, healthy Docker services, and authenticated desktop/mobile Playwright against localhost with actual stored log rendering and no overflow or console errors.

## 2026-08-11 - Standards-aligned security operations workspace

- Replaced the sparse security overview with a real-data command center covering security posture, prioritized findings, affected assets, enabled detection coverage, incidents, and the six NIST CSF 2.0 functions.
- Removed non-actionable placeholder sections and avoided false compliance, ATT&CK, KEV, recovery, or vulnerability-management scores where the product does not yet store supporting evidence.
- Reworked findings into searchable, filterable investigation cards and detection rules into colored, motion-enabled operational cards with real enable/disable endpoints. Added Persian presentation for the currently stored rule and finding vocabulary while preserving raw identifiers and backend detection logic.
- Rebuilt and recreated the Docker frontend, refreshed main nginx, and validated production builds, locale/UTF-8 guards, focused source contracts, authenticated desktop/mobile Playwright interactions, real API responses, motion, responsive layouts, and final container health.

## 2026-08-11 - Guided device onboarding and vendor catalog UX

- Reworked device onboarding into a visually guided identity, credential/test, and review workflow while preserving the real onboarding session and controlled connector contracts.
- Added color-coded vendor choices, automatic platform feedback, required-field helpers, encrypted-credential guidance, endpoint preview, verification result treatments, motion, responsive layouts, and reduced-motion fallbacks.
- Replaced the flat vendor list with a readiness overview and vendor-specific visual cards showing connector availability, operational scope, and honest registration eligibility. Removed the registration CTA from pfSense because its connector is planned rather than executable.
- Rebuilt and recreated the Docker frontend and refreshed main nginx. Validation passed through frontend build, Docker build, locale/UTF-8 guards, focused onboarding tests, nginx checks, HTTP health probes, and authenticated Playwright desktop/mobile interaction tests with no overflow or console errors.

## 2026-08-11 - Login autofill appearance repair

- Root cause: the login inputs styled their normal background, but did not override the browser's autofill pseudo-state, so stored credentials rendered with a light background in Chrome/Edge.
- Added a login-scoped autofill surface, foreground, and caret override without changing authentication behavior or other application inputs.
- Validation: `pnpm build` passed; the `firewall-web` image was rebuilt, `firewall-web` and `main-nginx` were recreated and became healthy, and the exact `http://localhost/firewall/` response served a 200 CSS asset containing the autofill fix.

## 2026-08-09 - Complete ActionPlan history clearing

- Changed the admin history-clear operation from a terminal-status allowlist to all non-executing ActionPlans, fixing draft, needs-input, preview-ready, confirmed, and skipped records remaining visible after clear.
- Preserved currently executing operations and retained ActionPlan/audit records through archive metadata instead of physical deletion.
- Updated the confirmation dialog, result count, API response typing, and source contract coverage to match the new behavior.

## 2026-08-09 - Action Center credential execution repair

- Root cause: `docker-compose.firewall.yml` loaded `backend/.env`, but the `firewall-api.environment` entry `CREDENTIAL_ENCRYPTION_KEY: ${CREDENTIAL_ENCRYPTION_KEY:-}` had higher precedence and replaced the valid env-file secret with an empty string when compose interpolation did not receive that variable.
- Removed only the empty compose override and added a source-level regression test that requires the backend env file while rejecting a service-level credential-key override. No environment file or credential value was changed or exposed.
- Recreated `firewall-api`, verified it healthy, and confirmed the affected device credential can be resolved. Retried the failed `linux_check_user_groups` ActionPlan through the exact `/firewall-api` nginx route, generated a preview, explicitly confirmed execution, and received `succeeded`, `connectorInvoked=true`, `exitCode=0`, non-empty stdout, and no stderr or integrity error.

## 2026-08-09 - AI chat nginx 504 follow-up

- Root cause: `main-nginx` closed `/firewall-api/ai/chat` after its default 60-second upstream read timeout, but the backend's configured OpenRouter model and sequential fallback attempts can legitimately exceed 60 seconds.
- Added explicit 10-second proxy connect and 150-second proxy send/read timeouts to the firewall API reverse-proxy location. The backend provider timeout and controlled execution behavior were not changed.
- Recreated `main-nginx` and tested the exact authenticated browser route. `/firewall-api/ai/chat` returned application/json HTTP 200 with a real Persian answer in 26.3 seconds; the response was not HTML and temporary auth/chat records were deleted.

## 2026-08-09 - OpenRouter Docker AI chat repair

- Root cause: the application request, system prompt, compact evidence, model, fallback list, and API key were valid. OpenRouter denied every container request, including `/api/v1/key`, because Docker Desktop bypassed the active host VPN and exposed an Iran egress address; the identical host request exited through Germany and returned 200.
- Added optional authenticated proxy transport to the OpenAI-compatible provider, retained JSON response mode, added explicit content length and OpenRouter attribution headers, and made 401/403 fail fast instead of retrying unrelated fallback models.
- Added a restricted local CONNECT relay and launcher. It binds to the internal Hyper-V Default Switch, uses a generated runtime credential under ignored `.runtime`, accepts only private clients, and can tunnel only to `openrouter.ai:443`.
- Updated firewall compose to load the optional ignored runtime proxy environment without changing or exposing the existing backend environment file.
- Validation: backend build passed; API image rebuilt without cache and rebuilt after final transport corrections; API container recreated and healthy; raw chat/completions from the running container returned 200; the exact provider returned structured Persian output; authenticated `/api/ai/chat` returned 200 and `بله، چت هوش مصنوعی فعال و آماده به کار است.` Temporary auth/chat records were deleted after the test.
- Test limitation: the focused existing provider test was attempted and safely stopped at `TEST_DATABASE_URL_REQUIRED`; the repository has no configured isolated test database.

## 2026-07-29 - AssetPlatform schema drift runtime repair

- Root cause: asset pages called `prisma.asset.findMany()`, but Prisma Client expected `AssetPlatform.assetRoleId` while the deployed Docker database only had the original `AssetPlatform` columns.
- Added additive migration `20260729083000_asset_platform_role_relation` for the nullable role relationship column and FK.
- Rebuilt/recreated `firewall-api`; startup migration applied successfully, seed skipped idempotently, and API started normally.
- Validation: Prisma validate, backend build, Docker API build/recreate, final healthy compose stack, authenticated `admin/admin123456` smoke for login/assets/navigation/devices, and empty Prisma migrate diff.

## 2026-07-29 - Production bootstrap seed flow

- Root cause: Docker could start the app but a fresh database had no login user unless `ADMIN_PASSWORD` was manually provided before first startup.
- Added a compiled Prisma seed script that creates the first admin only when `AppUser` is empty, hashes the generated password with bcrypt, and skips idempotently when users/admins already exist.
- Removed initial admin creation from API startup; startup now only verifies the auth database is reachable. Production hardening no longer depends on `ADMIN_PASSWORD`.
- Updated Prisma 7 seed configuration and Docker command ordering to `migrate deploy -> db seed -> node dist/server.js`.
- Added a dedicated bootstrap storage volume and runtime directory ownership so the generated initial credential file is persistent and writable by the non-root `node` user.
- Validation: backend build, Prisma validate, focused Phase R0 security test, no-cache firewall-api Docker build, compose up/recreate, final healthy stack, seed idempotency logs, and bootstrap credential file existence check without printing contents.

## 2026-07-28 - Docker firewall-api Prisma runtime repair

- Root cause: the runtime image installed only production dependencies while `prisma` was still classified as a dev dependency, then the container startup command called Prisma before the API could start.
- Moved `prisma` to backend production dependencies and updated the backend pnpm lock importer so pnpm v10 `--prod` installs the CLI.
- Updated the backend Docker runtime to use installed binaries directly, copy Prisma 7 runtime config, and provide the compiled database URL helper required by `prisma.config.ts`.
- Fixed the follow-up fresh-lab startup failure without hardcoding credentials: lab/development skips initial admin bootstrap if `ADMIN_PASSWORD` is unset; production still requires proper secrets.
- Validation: `pnpm prisma validate`; backend `npm run build`; `docker compose -f docker-compose.firewall.yml build --no-cache firewall-api`; `docker compose -f docker-compose.firewall.yml up -d`; `docker logs firewall-api --tail 100`; final compose status healthy.

## 2026-07-19 - AI Assistant structured ActionPlan architecture

- Added the shared AI structured planner that decomposes selected-device requests into backend-validated vendor steps instead of requiring every workflow to exist as one catalog item.
- Preserved execution controls: AI plans never include executable raw CLI, unsupported steps are blocked, missing fields are surfaced for guided input, and backend Action Center remains the only execution path after preview and approval.
- Updated chat routing to keep informational requests chat-only, preserve existing guided workflows behind explicit confirmation, and attach structured plan metadata to supported/custom proposals.
- Updated Action Center review UI to show structured step status, missing parameters, blocked reasons, catalog/action ids, and backend registry execution status.
- Validation: backend npm run build; root npm run build; focused backend planner/routing/target-device/vendor-isolation/Action Center/guided tests 96/96; backend command catalog validation; root i18n, UTF-8, workflow guard; git diff check.

## 2026-07-19 - AI Assistant ActionPlan creation regression

- Fixed the regression from the guided-routing guard where valid implemented catalog actions with missing parameters no longer created ActionPlans.
- Resolver now checks selected-device supported catalog matches before guided fallback, keeps generic/custom fallback blocked, and maps Cisco VLAN creation by exact `cisco.create-vlan` operation instead of `generic_security_action`.
- AI chat and `/api/commands/ai-propose` create proposed ActionPlans for verified connector-backed catalog matches while preserving missing-field metadata and requiring explicit guided/action-center completion before preview or execution.
- Validation: backend npm run build; root npm run build; backend focused regression test 6/6; backend AI target-device test 13/13; backend command catalog validation; git diff --check. Full backend npm test stopped at the required TEST_DATABASE_URL_REQUIRED guard.

## 2026-07-19 - AI Assistant guided-action redirect fix

- Reproduced the current flow in source from prompt handling through selected-device context, resolver normalization, ActionPlan/session creation, and Assistant navigation. The unintended redirect came from backend chat allocating a guided session plus frontend submit handling navigating immediately when session data existed.
- Restricted resolver fallback so generic/custom intent types cannot bind to vendor catalog rows with `generic_security_action`; this prevents unsupported/custom Cisco-style requests from becoming executable-looking catalog actions.
- Removed Assistant chat-side Guided Action session creation and limited guided-start candidates to verified, implemented, connector-backed catalog actions for the selected device with missing required parameters. Existing Action Center review/approval/execution remains unchanged.
- Removed frontend auto-start/auto-navigation from submit handling. The Assistant now clears stale guided/action state on chat clear, prompt submit, and target switch, shows an explicit start button only for eligible multi-step parameter collection, and navigates only after that click.
- Validation: backend npm run build; frontend pnpm build; backend source test `tsx --test test/ai-target-device-context.test.ts` 13/13; backend npm run validate:command-catalog; root npm run test:i18n; root npm run test:utf8; root npm run test:workflows; git diff --check. Backend npm test was attempted and correctly refused without TEST_DATABASE_URL.

## 2026-07-19 - AI Assistant target-device context

- Added a target-context builder for AI Assistant prompts and wired chat context creation to selectedDeviceId on every request.
- Restricted resolver catalog fallback so selected Cisco, FortiGate, MikroTik, and Linux targets cannot inherit another vendor's stale action match.
- Cleared prior intent, ActionPlan handoff, and guided-action state on target switch and new prompt; unsupported actions now suggest valid actions for the selected device only.
- Validation: backend npm run build; frontend npm run build; backend npx tsx --test test/ai-target-device-context.test.ts; backend npm run validate:command-catalog; root npm run test:i18n; root npm run test:utf8; root npm run test:workflows; git diff --check.

## 2026-07-19 - Cisco IOS Classic localized workspace

- Localized the Cisco device workspace state model and overview cards for connection, verification, inventory, health, interfaces, capability summary, raw diagnostics, and Action Center/backup entry points.
- Added Persian/English parity keys for Cisco capability states and removed user-visible internal connectorInvoked expressions from onboarding/action result surfaces.
- Validation: root npm run build; root npm run test:i18n; root npm run test:utf8; internal-expression scan.

## 2026-07-19 - Cisco IOS Classic Action Center integration

- Added controlled Cisco Action Center operations for IOS Classic and IOS-XE through the existing registry/planner/catalog/connector path, including read-only show commands, backup, and scoped safe-write workflows.
- Updated PolicyGuard to validate Cisco generic catalog actions against registered Cisco SSH devices and credentials, and routed sensitive configuration evidence through Cisco CLI redaction.
- Validation: backend npm run build; backend npm run validate:command-catalog; focused Cisco Action Center test 4/4; focused Cisco source/mocked tests 15/15.

## 2026-07-19 - Cisco IOS Classic inventory and capabilities

- Added safe optional IOS Classic command collection through the existing SSH2 command path and stored structured collection/profile evidence under Device capabilities.
- Broadened Cisco read-only capability/platform metadata to include IOS Classic and adjusted workspace/Asset projection to use saved collection evidence when cache tables are absent.
- Validation: backend npm run build; backend npm run validate:command-catalog; focused Cisco tests 18/18.

## 2026-07-19 - Cisco IOS Classic discovery and verification

- Root cause addressed: IOS Classic detection was successful, but platform support was restricted to cisco-ios-xe, so connected devices were classified as connected_unsupported before inventory and verification could progress.
- Added IOS Classic to the existing Cisco automation support boundary, carried safe identification commands through onboarding, and persisted parsed initial system/interface facts into the existing Device capabilities payload.
- Validation: backend npm run build; focused Cisco ssh2/source/parser tests 16/16; git diff --check. DB-backed interactive connector test refused to run without TEST_DATABASE_URL, preserving the safety gate.

## 2026-07-19 - Cisco legacy IOS SSH compatibility

- Converted the opt-in legacy Cisco SSH algorithm override into a named Legacy Cisco IOS Compatibility Profile.
- Added explicit support for `diffie-hellman-group14-sha1`, `ssh-rsa`, and SHA-1 HMAC negotiation while keeping the modern profile unchanged and preserving per-device/session approval.
- Strengthened focused connector/source coverage and ran a sanitized real registered-device SSH test; the connector authenticated, opened a privileged shell, and returned the read-only platform command, then retained the existing `connected_unsupported` classification for classic/non-IOS-XE Cisco.
# Task History

## 2026-08-11 - Persian dashboard redesign and real Linux health charts

- Replaced the English-heavy operational dashboard with a Persian-first SOC/Mini-SOAR overview based on focused dashboard patterns from Grafana, Datadog, Elastic Security, and Wazuh.
- Reduced the page to key health indicators, an actionable attention queue, one animated multi-ring chart per registered Linux server, and recent executions.
- Used persisted connector-backed Linux health data for health score, CPU, memory, and disk; exposed all Linux devices and derived offline/stale state without inventing values or auto-running connectors on page load.
- Added bilingual action titles and 74 matched dashboard locale keys per language.
- Validation passed: backend build, frontend TypeScript, production Vite build, i18n parity, Persian copy, UTF-8, focused backend dashboard tests, and Playwright desktop/mobile chart, motion, RTL, localization, and overflow checks.
- Follow-up deployment rebuilt and recreated `firewall-api` and `firewall-web`, recreated `main-nginx` after its upstream addresses changed, and verified the exact `/firewall/dashboard` route. Browser cache revalidation was added after Playwright proved an old cached HTML shell could still request obsolete dashboard chunks despite new Docker images.
- Repaired live Linux status hydration: the dashboard now refreshes missing/stale connector-backed snapshots on entry and exposes an explicit all-server refresh while retaining last-known data on partial failure. Real Docker/SSH verification returned 200 for both registered servers and populated health, CPU, memory, and disk rings.
- Rebuilt the asset overview around four essential counts, an actionable attention strip, search/filter controls, and a compact inventory with colored vendor/platform icons. Localized and simplified the full equipment table, repaired direct SPA routing for `/assets` and `/assets/devices`, and removed mock/non-actionable overview panels.
- Validation passed: production build, i18n, UTF-8, Docker health and HTTP routes, Playwright desktop/mobile, two live server refreshes, animated ring values, asset filtering/search, Persian equipment headers, icon variants, and overflow checks.

## 2026-07-19 - Phase B: device onboarding and workspace simplification

- Simplified the existing Device Onboarding page without adding APIs or stores: identity, credential/test, review, verified commit, and explicit unverified registration all continue through the current onboarding-session contract.
- Added structured frontend onboarding error handling using backend error codes, while keeping detailed diagnostics behind Advanced and preserving connector-backed success semantics.
- Simplified Device Workspace to the six Phase B tabs, moved vendor capability sections to Advanced, and made missing collection data explicit rather than showing invented zero values.
- Extended Workflow Lab with verified/unverified workspace fixture states and added balanced English/Persian locale coverage plus source-level mocked Phase B tests.
- Validation: root npm run build; root npm run test:i18n; root npm run test:utf8; root npm run test:workflows; backend npm run build; backend npm run validate:command-catalog; backend npx tsx --test test/phase-b-onboarding-workspace-source.test.ts; git diff --check.

## 2026-07-19 - Workflow foundation Phase A

- Added WorkflowStepper, WorkflowStateCallout, WorkflowReviewSummary, WorkflowResultTimeline, and WorkflowPrimaryAction as reusable presentation-only workflow primitives.
- Added /tools/workflow-lab as a DEV-only fixture page with Persian RTL and English LTR examples for the required onboarding, action, planned Cisco, and unsupported states.
- Added locale keys and a source validation script proving the lab route is not exposed through production navigation/Product State and performs no API/execution calls.
- Preserved frontend/backend compatibility, full Persian RTL support, Action Center architecture, existing API contracts, Prisma schema, connectors, PolicyGuard, and protected lab execution behavior.
- Validation: npm run build, npm run test:i18n, npm run test:utf8, npm run test:workflows, git diff --check, and production bundle route-string check passed; only the known Vite large-chunk warning remains.

## 2026-07-18 - Device UX repair Phase A: test data safety and removal regression

- Audited Phase 1 and the Device/Asset paths without modifying the committed Cisco connector work. Confirmed the equipment page reads Asset records, while deletion removes only Device and Prisma nulls the Asset link.
- Replaced the derived historical test database behavior with an explicit safety gate. Missing/invalid/equal/historical test targets are rejected without exposing connection credentials; Prisma test initialization enforces the same gate.
- Added pure safety/contract/source-chain tests plus an isolated DB integration reproduction for create/link -> DELETE 204 -> orphan Asset still returned by `/api/assets`. Cleanup is limited to the exact generated IDs.
- Defined and documented Device ownership, Asset projection/removal semantics, and independent inventory/connection/verification/management statuses. No schema, visible onboarding, Cisco fallback, Phase B behavior, deployment, migration, or database mutation occurred.
- Validation: seven pure Phase A tests, backend build, Prisma validate, locale/Persian checks, UTF-8, and diff check. With no `TEST_DATABASE_URL`, the DB-writing regression and full DB suite correctly stop at `TEST_DATABASE_URL_REQUIRED` before any write.

## 2026-07-18 - Repair bundle Phase 1: reliable interactive Cisco connector

- Replaced exec-only Cisco SSH with a single PTY interactive session supporting prompt detection, enable mode through a separate encrypted Credential reference, paging disable/handling, command echo cleanup, keyboard-interactive auth, keepalive, independent timeouts, output bounds, and deterministic cleanup.
- Added a typed sanitized diagnostic contract and propagated it through the Cisco wrapper and onboarding test endpoint. Added explicit supported/unsupported/failed connection semantics and opt-in per-device legacy algorithm compatibility without weakening defaults.
- Added deterministic stream tests and real in-process SSH2 password/private-key fixtures with runtime-generated keys; repaired the stale `DeviceConnector` test import and made the onboarding integration fixture use collision-free test addressing and cleanup.
- Passed Phase 1 scoped lint, backend/frontend builds, full backend 250/250, i18n and UTF-8. Global lint remains blocked by unrelated pre-existing issues. No deployment, migration execution, production mock, real-device mutation, or secret inspection was performed. Stopped before Phase 2.

## 2026-07-18 - Device onboarding required-name UX repair

- Inspected the exact persisted failed onboarding Session and confirmed the backend rejected an empty `name`; the apparent `edge-switch-01` value was only a visually ambiguous placeholder.
- Marked required fields, clarified the name example, added pre-request validation, placed the error inside the connection form, and focused/scrolled the invalid control.
- Added regression coverage. Focused onboarding tests passed 9/9; backend and frontend builds passed. No device, credential, connector, migration, or execution-policy behavior changed.

## 2026-07-15 - Operator-first Action Center repair

- Rebuilt the Action Center around the normal operator path: Device, Credential Reference, action, and one Execute click. Added default immediate execution and optional preview mode while retaining every ActionPlan API, direct route, history row, PolicyGuard check, and connector audit.
- Added the Connection card, persisted status refresh, exact failure/Retry behavior, successful-attempt timestamps, responsive enterprise layout, and closed Advanced Details JSON disclosure.
- Registered read-only Cisco show-version through the existing IOS-XE SSH transport and fixed vendor-scoped generic-action convergence plus connector-failure invocation evidence.
- Authenticated Playwright exercised all requested paths. Linux service status, Linux daily check, and FortiGate VPN succeeded with `connectorInvoked=true`; FortiGate zone and Cisco show version invoked their real connectors and surfaced exact live-target failures; preview-only created no connector invocation.
- Validation passed: catalog 138; backend build and 237/237 tests; frontend build; locale/Persian/UTF-8 checks; diff check; Playwright desktop/mobile RTL/LTR acceptance; Prisma current; dry-run reconciliation changed zero rows.
- Database preservation: Device 4, Asset 7, DeviceCredential 4, Finding 5 stayed unchanged. Seven acceptance ActionPlans were retained by design, moving the task baseline from 126 to 133 without deleting or rewriting prior history. No migration, restore, seed, destructive SQL, or secret access occurred.

## 2026-07-14 - Master repair Phase 2

- Migrated the application from manual pathname matching to React Router while preserving ActionPlan result and guided-action deep links.
- Added real 404 behavior and stable `data-page-id` markers for all feature routes and special routes.
- Replaced direct URL mutation/popstate navigation with router navigation and converted the generated shell navigation to `Link`.
- Strengthened Product State parity to exactly 53 unique keys with exact frontend/backend route equality.
- Validation passed: backend build; focused route/product-state/deep-link tests; frontend build; locale and UTF-8 checks; diff check; authenticated Playwright 404/Dashboard/Assets acceptance. Database counts remained unchanged.

## 2026-07-14 - Master repair Phase 1

- Completed the non-destructive Phase 0 identity/dump gate and normal-runtime convergence.
- Pinned Vite to strict port 5173, forced local development API calls through `/firewall-api`, removed stale 5174 default origins, and added redacted datasource/schema readiness to health.
- Validation: backend build; focused auth/product-state tests; frontend build; locale parity; UTF-8 guard; diff check; 10/10 readiness; Playwright login identity and same-origin proxy observation.
- Existing database counts remained unchanged. No migration, restore, seed, destructive SQL, `.env` access, or connector execution occurred.

Entries are chronological and compact. Validation reflects what was known at the end of each task.

## Task 20.1A - DB/Auth Repair and Cisco Onboarding Blocker (2026-07-14)

- Summary: executed Milestones A-C in order: reproduced the default PostgreSQL/Prisma startup failure, repaired readiness/live/auth database failure handling, and captured MCP authentication evidence.
- Reproduction: `postgresql-x64-18` was running but `127.0.0.1:5432` TCP failed; `prisma migrate status` returned a schema engine error; `buildApp()` failed at `bootstrapAdmin()`/`prisma.appUser.count()` with operation timeout.
- Backend: added `/api/health/live`; aligned `/api/health/ready` to the Task 20.1A shape; moved startup DB retry to a shared helper with 5 attempts, exponential backoff and jitter; reduced Prisma startup stack noise; kept one shared pg Pool, PrismaPg adapter, and Prisma client; auth database failures now return structured 503.
- Proof: backend built; healthy runtime on `127.0.0.1:55432/firewall_log_auth` produced 10/10 live 200 and 10/10 ready 200 over 181 seconds, plus a clean 10-sample body check with `databaseReady=true`.
- MCP: `/login` and `/dashboard` opened in the authenticated Persian shell with `/api/auth/me` 200. Manual credential entry was not replayable because the exposed MCP tool surface lacks fill/type/click commands and the browser session was already authenticated.
- Blocker: the active stable runtime database has no saved Credential References, so the required `cisco-f2 — admin` reference is missing. Task 20.1A stops here by its saved-Credential-Reference stop condition; Cisco onboarding, connector invocation, Device persistence, animated success, redirect, and workspace proof are not claimed.
- Commits: `afbdd4c docs: trace postgres prisma authentication failure`; `f09bb4a fix: stabilize postgres prisma and backend readiness`; `9b55d87 fix: restore authentication after database readiness`.

## Task 20.1 - Onboarding Workspace Dashboard Trace (2026-07-14)

- Summary: executed the Task 20.1 Milestone A failure trace after reading the required prompt/spec/docs, using only Playwright MCP for browser evidence.
- Browser: MCP opened `http://localhost:5173/assets/devices/new?vendor=linux`; page title was `log-app`; authenticated API calls returned 200/201; the live form and `Credential reference` selector were visible; console errors were zero.
- Backend/database: runtime database had no Devices and no saved Credential References, so real connector-backed onboarding cannot proceed honestly.
- Docs: added runtime, API sequence, frontend state, and backend state traces under `docs/TASK_20_1_*`.
- Safety/blocker: no `.env`, secret, destructive Prisma command, local Playwright fallback, fake device, or fake connector success was used. Full Task 20.1 remains blocked until a real target and saved credential reference are available.
- Commit: `cc3bd67 docs: trace task 20.1 onboarding failure`.

## Task 20 - Backend readiness and auth startup repair (2026-07-14)

- Summary: paused Task 20.1 feature work to investigate the current backend startup/auth failure around Prisma `AppUser` bootstrap and login's auth-server connection error.
- Reproduction: `buildApp()` fails during `bootstrapAdmin()`/`prisma.appUser.count()` with database connection timeout; `/api/health/ready` returns structured 503 while the DB is unavailable.
- Backend: changed Prisma setup to one shared `pg` Pool plus one shared Prisma client, removed Fastify app-close database disconnect, moved database shutdown to process termination, added narrow transient startup retry, and added `GET /api/health/ready`.
- Runtime recovery: local PostgreSQL service `postgresql-x64-18` remains externally unreachable to Node/Prisma (`ETIMEDOUT` on port 5432), and service/process restart was denied by Windows permissions. A user-owned temporary PostgreSQL 18 cluster was initialized under `.runtime/postgres-task20-auth`, started on `127.0.0.1:55432`, and the backend was started with only process `DATABASE_URL` overridden to the healthy temporary database.
- Validation: `npx prisma validate`, `npx prisma generate`, backend build, frontend build, and backend `npm test` passed (209/209) against the healthy temporary database. Playwright MCP confirmed authenticated `/api/auth/me` 200, dashboard API 200 responses, visible admin shell, and no console errors on `/dashboard`.

## Task 20 - MCP Baseline and Onboarding API Compatibility (2026-07-14)

- Summary: began Task 20 with the mandatory prechange gate, proved current-session Playwright MCP availability, and aligned onboarding API names with the Task 20 contract without changing protected execution behavior.
- Browser: MCP opened `http://localhost:5173/`, page title `log-app`, and captured authenticated Persian shell evidence in `.playwright-mcp/page-2026-07-14T08-56-05-007Z.yml`.
- Docs: added Task 20 prechange runtime baseline, MCP proof, route/control baseline, API failure register, and backend log register.
- Backend: added `/test-connection`, `/detect-platform`, `/build-preview`, and `/retry` aliases for onboarding sessions; retry is structured and does not fabricate progress from a draft.
- Safety: no `.env`, secret, destructive DB command, Nmap scan, Check-Host call, external provider invocation, or device mutation occurred in this slice.
- Validation: Prisma validate passed; backend build passed; focused onboarding/workspace suite passed 9/9; `git diff --check` passed with line-ending warnings only. Migration status remains the known unapplied-history baseline.

## Task 20 - Check-Host Diagnostics Workspace (2026-07-14)

- Summary: replaced the public `/tools` placeholder with a real Check-Host-backed diagnostic session API, Tools UI, direct tool routes, and persisted history through the existing `AuditLog` table.
- Backend: added `/api/diagnostics/sessions` create/list/get, target classification, private/reserved target rejection with `providerInvoked=false`, Check-Host DNS/HTTP/Ping/TCP JSON invocation with bounded polling, provider request IDs, and database persistence.
- Frontend: `/tools`, `/tools/network-check`, `/tools/history`, and related tool routes render a target input, suggestions, provider source, invocation flag, request IDs, latest result, and history. Nmap and monitors remain visibly gated until their worker/scheduler milestones.
- Real provider proof: `example.com` persisted session `cmrkfksle0000zolvol4yk1ge` with Check-Host request IDs `446466a3k175`, `446466cfk36b`, `446466e5k33e`, and `4464670ck87e`, all with `providerInvoked=true`.
- Browser: MCP opened `/tools` and `/tools/history`; `/tools/history` visibly rendered `Target: example.com`, the request IDs, and the history table.
- Validation: focused diagnostics tests passed 3/3; backend build passed; frontend `npx pnpm@10 build` passed with the existing chunk-size warning.

## Task 20 - Safe Nmap Worker Implementation Attempt (2026-07-14)

- Summary: installed real Nmap 7.80 and implemented the safe worker path, but did not complete acceptance because PostgreSQL persistence became unreachable.
- Backend: added fixed-profile Nmap worker execution through `spawn` without shell concatenation, policy rejection for private/unsafe targets, XML parsing for host/address/port/service data, retry around `AuditLog` persistence, and `/api/diagnostics/nmap` routes.
- Frontend: `/tools/nmap` now has target/profile controls and Nmap history/result rendering for `workerInvoked`, profile, scan ID, host state, addresses, and ports.
- Safety: arbitrary flags, private targets without scope, URL/host:port/CIDR Nmap targets, and unsafe profiles are rejected. No exploit scripts or intrusive NSE profiles were added.
- Blocker: PostgreSQL service remained `Running` but stopped completing TCP connections; direct `pg` and Prisma calls timed out. Service restart/control was denied. Nmap scans against `scanme.nmap.org` reached the worker but could not persist, so `workerInvoked=true` acceptance is not claimed.
- Validation: backend build passed; frontend build passed with the existing chunk warning; focused diagnostics tests passed source/policy/parser cases and failed DB-persistence cases due the local PostgreSQL timeout.

## Task 19.2A - Runtime Repair and Full Audit (2026-07-14)

- Summary: repaired onboarding runtime state, Dashboard diagnostic routing, and optional Linux monitoring schema handling while keeping external diagnostics/Nmap unstarted.
- Onboarding: added explicit persisted states, recoverable failure states, preview and cancel APIs, and UI controls that separate answer save, connection test, platform detection, discovery, preview, and final save.
- Proof: focused backend regression exercises Cisco onboarding end to end with connector invocation, IOS-XE evidence, platform detection, preview readiness, stored Device creation, and final completed state.
- Dashboard/tools: quick actions now route to `/assets/devices/new`, `/tools/network-check`, `/tools`, and `/assets/devices`; non-executing tools routes are registered in the route table and Product State contract.
- Monitoring: missing optional observability tables now return `observability.state=not_configured` with one warning instead of repeated Prisma relation failures.
- Docs: added the requested Task 19.2A runtime baseline, failure trace, control/API matrices, acceptance matrices, and browser-results limitation files.
- Browser: connected Playwright MCP/current authenticated session was unavailable to this tool surface, so browser acceptance is explicitly not claimed and replay steps are recorded.

## Task 19.2-A - Visible Device Registration Entry Points (2026-07-14)

- Summary: restored obvious Add Device access without starting the diagnostics/Nmap milestones.
- Frontend: added Dashboard `ثبت دستگاه جدید` and quick action links; added vendor-specific onboarding labels for Cisco, FortiGate, MikroTik, and Linux; preserved the single onboarding engine at `/assets/devices/new` and vendor-prefilled `/assets/vendors/:vendorKey/devices/new`.
- Product State: advanced contract version to `19.2-A` and made `assets.device_onboarding_new` visible in generated Assets navigation because backend, API, route, UI, and tests are implemented.
- Tests: updated Product State/onboarding regressions to assert Add Device is visible and vendor CTAs are present.
- Browser: connected Playwright MCP tools were not exposed in this session. Local `npx playwright` with system Chrome/Edge reached only the unauthenticated login gate, so authenticated visual acceptance remains to be rerun with the connected MCP session.
- Validation/safety: Prisma validate, focused backend tests 9/9, backend build, frontend build, i18n/primary-copy, UTF-8, and diff check passed. No `.env`, credentials, connector execution, migration mutation, external diagnostics, or Nmap work occurred.

## Task 19.1 Runtime convergence follow-up - ActionPlan stale repair (2026-07-13)

- Summary: changed stale approved ActionPlans from a terminal HTTP 409 into automatic canonical revision regeneration and continued controlled execution on the newest revision.
- Backend: regenerates validation/preview/approval state, records revision history and convergence audits, and preserves the real connector/audit/result success boundary.
- Contracts: Assistant publishes one authoritative creation/manual/execution/lifecycle contract; Execute clients resolve the latest plan and include its revision.
- Tests: stale input now proves revision 2, approved/executing revision 2, completed state, no stale failure, exactly one connector invocation, and `connectorInvoked=true`; full backend suite passed 205/205.
- Browser: in the existing authenticated Playwright context, Persian Assistant created the port-546 plan, exact Action Center Execute returned HTTP 200, the Linux connector produced a verified-no-change result, the result route opened, and console errors remained zero.
- Validation/safety: Prisma validate, backend/frontend builds, catalog 137, i18n/primary-copy, UTF-8, and diff check passed. No secret, `.env`, migration, destructive database command, or unrelated mutation was accessed.

## Task 19.1 Milestone R-G - Global Control Audit and Playwright Acceptance (2026-07-13)

- Summary: audited all primary/direct routes and safe visible controls, completed global Persian/English and responsive acceptance, and documented the remaining live-target blockers.
- Frontend: disabled and explained unavailable global search/notifications; localized shell accessibility, Action Center fallback/topic, Assistant disabled-send, and monitoring preset copy through dictionaries.
- Tests: added the Persian primary-route copy/disabled-control guard to `npm run test:i18n`.
- Browser: 14 routes passed at 1440x900 FA, 1280x800 FA, 390x844 FA, 1440x900 EN, and 390x844 EN. Safe control clicks produced no failed API response or console error.
- Safety/blocker: no R-G device mutation, migration, credential access, or production integration call. New Linux/Cisco live onboarding remains blocked by missing explicit targets and credential references, so all five live flows are not claimed complete.
- Validation: Prisma validate/generate; backend build; serial backend 204/204; catalog 137; frontend build; i18n/primary-copy; UTF-8; diff check. Root lint retains pre-existing failures outside this slice.

## Task 19.1 Milestone R-F - Asset Workspace Analytics and Vendor Tabs (2026-07-13)

- Summary: completed the read-only device workspace with stored-data chart series, time ranges, and capability-gated vendor tabs.
- Backend: added health/connector/availability/resource/finding/action/change series and fixed related records to match either device or linked asset identity.
- Frontend: added responsive charts, 1h/6h/24h/7d/30d controls, recent-change annotations, honest no-data cards, and vendor capability tabs with reason/requirement/next action.
- Runtime: the Linux 30-day view shows recorded high findings and succeeded actions; absent health/resource history remains visibly empty. No data was synthesized.
- Browser: desktop/mobile Persian RTL and English LTR passed for workspace overview, time-range change, and CPU capability state without overflow or console errors.
- Validation: serial backend 204/204, focused R-F test, backend/frontend builds, Prisma validate, command catalog 137, i18n 73, UTF-8, and diff check passed. No connector, device, migration, or credential mutation occurred.

## Task 19.1 Milestone R-E - Action Center and Assistant UX (2026-07-13)

- Summary: localized the primary Action Center/Assistant workflows and made canonical revision, runtime resolution, verification, and structured recovery understandable in the normal UI.
- Action Center: localized headers, summaries, filters, table, states, risk, controls, and plan dialog; added explicit verified-no-change state; kept exact URL/selection; refreshed selected plan/audit immediately after connector success.
- Errors: removed raw backend URLs from user-facing action errors and retained structured stale recovery metadata and a review/new-revision recovery control.
- Assistant: localized target selection, refresh summary, clear chat, new request, send, Safety Boundary, and AI Provider in Persian/English.
- Browser: authenticated desktop/mobile Persian RTL and English LTR checks passed on Assistant and exact ActionPlan; one selected row, no page/dialog overflow, and zero console errors. No connector call was made in R-E.
- Validation: focused R-E tests 2/2, serial full backend suite 203/203, backend/frontend builds, Prisma validate/generate, i18n parity 73, UTF-8 guard, and diff check passed. Read-only migration status retained the known unapplied baseline.

## Task 19.1 Milestone R-D - Canonical Revision and Connector Repair (2026-07-13)

- Summary: repaired the backend-generated stale-plan failure by resolving and hashing one canonical runtime contract before preview, approval, and execution.
- Backend: added immutable revision/approval snapshots, structured genuine-stale conflicts, close-port catalog/template resolution, repeated-request reuse, and deterministic Assistant resolution without an external provider round trip.
- Connector: Linux close-port detects the active firewall adapter, inspects matching allow rules, performs only required removals, verifies effective state, and returns `verified_no_change` only after real connector invocation.
- Browser: the reviewed port-545 plan executed through Action Center and was then re-verified idempotently; stored evidence is revision 1, approved revision 1, status succeeded, UFW, outcome `verified_no_change`, and `connectorInvoked=true`. A repeated Persian Assistant request reused the same plan ID.
- Tests: added canonicalization, immutable revision, structured conflict, adapter parser, capability registration, and idempotent reuse regressions. Focused backend suite passed 19/19; serial full backend suite passed 201/201; catalog validation passed 137 items; frontend build, i18n 73, UTF-8, Prisma, and diff checks passed.
- Safety: no `.env` access, credentials, migration, destructive database command, raw AI shell execution, or unrelated mutation was introduced.

## Task 19.1 Milestone R-C - Exact Assistant-to-ActionPlan Navigation (2026-07-13)

- Summary: replaced DOM-only handoff with exact `/actions/:actionPlanId` routing durable across direct load, reload, selection, focus, close, and history.
- Backend: added structured `ACTION_PLAN_NOT_FOUND` 404 semantics for direct plan lookup.
- Frontend: unified exact-plan handoff across Assistant, Catalog, Daily Check, Linux Service Health, and Guided Actions; added status/revision details and missing-plan recovery.
- Tests/browser: added route/API regressions and verified desktop English plus 390px Persian RTL with no overflow or duplicate selected row.
- Safety: no action was executed; the stale plan has `connectorInvoked=false` and no success is claimed.
- Follow-up: R-D canonical resolution, immutable approved revision, stale repair, and repeated-request behavior.

## Milestone 19A - Full Audit and UI/Backend Synchronization (2026-07-13)

- Summary: audited the full requested browser/UI/API/backend surface, introduced Product State Contract `19A.1`, and made desktop/mobile primary navigation derive from verified backend state.
- State fixes: removed planned Settings, mock sync/integration children, unverified Cisco, and route aliases from primary navigation without deleting their honest direct/contextual routes.
- Backend: added product-state types, registry/validator, vendor/integration projections, and five read-only API endpoints.
- Frontend: replaced duplicated readiness/navigation flags with stable feature keys, consumed contract-generated navigation, added fail-closed navigation behavior, and added a Vite development proxy matching the deployed `/firewall-api` boundary.
- Docs: added browser baseline, feature gap register, UI/backend contract gap report, and Product State Contract; updated live project memory and structural maps.
- Tests: added four regressions for forbidden-state/readiness mismatches, navigation exclusions, cross-layer feature-key alignment, and API projection consistency.
- Browser: authenticated desktop 1440x900 and mobile 390x844 verification passed for all 16 requested routes in Persian RTL and English LTR; no console errors, failed requests, HTTP >=400 responses, or horizontal overflow were observed.
- Safety: no device mutation, migration mutation, credential access, connector execution, or later-milestone implementation occurred. The existing execution-success invariant remains unchanged.
- Validation: Prisma validate/generate, backend build, backend tests 190/190, catalog validation 136 items, frontend build, i18n 73 keys, UTF-8 guard, and diff check passed. Root lint retained the known pre-existing 66 errors/4 warnings; `docs:check` retained the pre-existing exact-heading mismatch.
- Commit: separate Milestone 19A commit.

## Task 18.2 Safe Autonomous H1-H6 (2026-07-13)

- Summary: executed safe autonomous hardening from `TASK_18_2_SAFE_AUTONOMOUS_MODE.txt` without restarting completed 18.1/18.2A work and without touching credentials or destructive database paths.
- H1/H2: completed browser and Prisma baseline analysis. Migration recovery is blocked because a verified nonzero backup could not be produced; no migration-history writes were run.
- H3: hardened vendor/navigation UX and committed `b84891e`.
- H4: hardened mock integration UX and committed `aabf035`.
- H5: improved dashboard/Linux observability UX and committed `87ceb22`.
- H6: polished Persian/RTL asset labels and updated live project memory docs. Safety semantics remain unchanged.
- Playwright MCP: checked dashboard, assets, sync, vendor, Cisco, Linux monitoring, and integration routes on desktop/mobile with no visible mojibake, replacement character, fake mock apply button, dead controls, or horizontal overflow on the verified surfaces.
- Validation: Prisma validate/generate, backend build, command catalog validation, frontend build, i18n parity, UTF-8 guard, and whitespace check passed. Migration status remains blocked by baseline recovery; root lint still has pre-existing lint debt.

## Encoding Repair - Persian UTF-8/Mojibake Guard (2026-07-12)

- Summary: repaired Persian mojibake introduced by trusting legacy PowerShell-rendered output and added a permanent validation guard.
- Areas: app route/sidebar labels, shell search/language text, backend Persian auth response, AI duration aliases, Persian command catalog product documentation, `.editorconfig`, and UTF-8/mojibake validation script.
- Validation: `npm run test:utf8`; `npm run test:i18n`; backend `npm run build`; backend `npm test` passed 186/186; root `npx pnpm@10 build` passed with the existing Vite large-chunk warning; `git diff --check` passed with line-ending warnings only; Playwright MCP desktop/mobile encoding verification passed.
- Commit: separate encoding repair commit.
## Task 18.2A - Cisco IOS-XE Read-only Foundation and Linux Observability (2026-07-12)

- Summary: implemented Milestone 18.2A only: vendor/platform/capability framework, Cisco IOS-XE read-only foundation, parser fixtures, capability APIs/UI, Linux health metrics schema/APIs/UI, migration, tests, docs, and MCP browser evidence.
- Backend: added vendor registries, Cisco platform detection, Cisco IOS-XE parser/template/connector foundation, capability discovery/cache APIs, Linux health parser/scorer/collector/service/routes, and migration `20260712192000_task18_2a_vendor_linux_observability`.
- Frontend: added Cisco vendor capability pages and Linux health pages under the Milestone 18.1 app shell without replacing existing execution routes.
- Safety: Cisco mutations are planned/non-executable only; no arbitrary AI CLI, no `.env` access, no secret exposure, and no success semantics without connector invocation.
- Docs/browser: added Task 18.2 discovery, baseline, final browser results, Cisco source/architecture/capability/lab docs, vendor framework docs, Linux observability docs, and desktop/mobile MCP screenshots under `docs/evidence/task-18-2/`.
- Validation: `npx prisma validate`; `npx prisma generate`; backend `npm run build`; backend `npm test` passed 186/186; backend `npm run validate:command-catalog` passed 136 items; root `npm run test:i18n` passed 73 keys; root `npx pnpm@10 build` passed with the existing Vite large-chunk warning.
- Playwright MCP: authenticated desktop/mobile verification passed for dashboard, assets, devices, monitoring, Linux monitoring, actions, assistant, integrations, and Cisco vendor routes; no console/network errors or horizontal overflow remained.
- Commit: pending.

## Task 19.1 Milestone R-A - Runtime Failure Reproduction (2026-07-13)

- Summary: used a new authenticated Playwright MCP context to reproduce the Task 19.1 blockers from the current committed state and recorded the required runtime, broken-control, and API failure registers.
- Routes: `/dashboard`, `/assets`, `/assets/devices`, `/assets/vendors`, `/assets/vendors/cisco`, `/assistant`, `/actions`, `/monitoring`, `/monitoring/linux`, `/security/findings`, `/security/rules`, `/integrations`, and `/settings`.
- Critical evidence: the controlled port-545 ActionPlan request returned 409 `COMMAND_PLAN_STALE`; plan status stayed `dry_run_ready`, and `connectorInvoked=false`.
- Repeated request evidence: Assistant returned `canCreateActionPlan=true` and manual-only at the same time, so no second ActionPlan was created.
- Other evidence: onboarding is unrouted, Cisco setup loops to a list without registration, Assistant cannot route to an exact plan, proposal JSON/API URLs leak into normal UI, and Persian surfaces use `lang=en dir=ltr` with extensive English copy.
- Safety: no `.env`, credential, migration, destructive database command, device mutation, or successful connector execution.
- Files: `docs/TASK_19_1_RUNTIME_BASELINE.md`, `docs/TASK_19_1_BROKEN_CONTROL_REGISTER.md`, `docs/TASK_19_1_API_FAILURE_REGISTER.md`, and project memory/handoff updates.
- Validation: `git diff --check` and `npm run test:utf8` passed. The repository has no `test:memory` script. R-A is committed separately before R-B starts.

## Task 19.1 Milestone R-B - Device Onboarding and Workspace Foundation (2026-07-13)

- Summary: restored backend-backed device onboarding, Product State route visibility, vendor/Cisco registration entry points, and the dedicated device workspace foundation.
- Backend: added ephemeral versioned onboarding sessions, answers/test/detect/discover/commit routes, credential-reference-only validation, live bounded Cisco read-only SSH probing, and a structured workspace aggregation API.
- Frontend: added one reusable onboarding page for all required routes, safe encrypted Credential creation via the existing API, vendor-prefilled entry points, and workspace tabs for overview/health/inventory/capabilities/findings/actions/history/configuration.
- Database safety: no migration or destructive operation. Optional Task 18.2 tables are detected and missing sections degrade instead of returning 500.
- Cisco safety: no target/credential was supplied, so no live success or device creation is claimed. Cisco mutation remains disabled.
- Product State: advanced to `19B.1`; onboarding/workspace features are implemented but contextual, not extra primary-navigation noise.
- Browser: desktop and mobile 390px routes passed with visible CTAs, correct prefill, no overflow, and no HTTP failure.
- Validation: `npx prisma validate`; backend build; full backend tests including Task 19.1 regressions; catalog 136; frontend build; i18n 73; UTF-8; diff check.
- Commit: separate R-B commit pending at the time of this entry.

## Task 18.0 - Security Platform Minimum Tangible Milestone (2026-07-12)

- Summary: implemented the first usable asset/security platform slice instead of attempting the full master roadmap at once.
- Backend: added asset intelligence models, import preview/apply, idempotent sync runs, device-to-asset linking, topology lookup, seeded detection rules, SecurityEvent ingestion, Finding correlation, and Finding-to-reviewed-ActionPlan handoff.
- Integrations: added mock NetBox and Wazuh adapters for health checks, sync preview, and idempotent sync without external credentials.
- Frontend: added compact grouped `/assets` and `/security` views plus header navigation entries.
- Docs: added platform expansion, asset intelligence, detection, findings, case-management, monitoring, search/correlation, topology/impact, AI orchestration, integrations, and UX information architecture docs.
- Safety: Finding-created ActionPlans are proposals only. No raw AI shell execution, no connector invocation from detections, no fake success, and no change to protected quick-controlled execution behavior.
- Migration: `20260712180000_platform_asset_security_milestone`.
- Validation: `npx prisma validate`; focused `task18-platform-milestone.test.ts` passed 5/5; backend `npm run build`; backend `npm run validate:command-catalog` (136 items); backend `npm test` passed 181/181; root `npm run test:i18n` passed 73 keys; root `npx pnpm@10 build` passed with the existing Vite large-chunk warning. Local `pnpm` was not on PATH.

## Task 17.8C - Linux Server Overview First Screen (2026-07-12)

- Summary: added a plain-language Server Overview as the default Device Monitoring screen so non-technical users see server health before logs/findings/advanced telemetry.
- Backend: added `/api/devices/:deviceId/telemetry/linux/overview` through the existing SSH connector. The read-only overview command collects host/OS/kernel/uptime, CPU/load/core count, memory/swap, disk usage, disk I/O hints, network interfaces, top processes, important service states, listening ports, and recent auth/security warnings.
- Parsing: added Ubuntu/Debian/RHEL-like overview parsing with partial command failure warnings, health summaries, service state normalization, security signals, and recent problem extraction. Missing optional commands do not fail the whole overview. Follow-up hardening makes missing/undefined stdout and missing sections return partial data with warnings instead of crashing.
- Frontend: `LinuxTelemetryPanel` now defaults to a Server Overview tab with cards for Overall Health, CPU, Memory, Disk, Network, Important Services, Security Signals, and Recent Problems. Live Monitoring and Results remain secondary tabs, and raw logs/storage internals/event IDs stay under Advanced diagnostics.
- UX: new labels are present in English and Persian; the existing deterministic Analyze behavior remains AI-optional and shows only a small AI-unavailable message.
- Tests: added focused source/parser coverage for the overview endpoint, missing command output, partial command failure handling, active/inactive/not_found service status parsing, default Server Overview tab, English/Persian labels, and AI-unavailable Analyze copy.
- Migrations: none.
- Validation: focused Task 17.8 tests (18/18); backend `npm test` (176/176); backend `npm run build`; backend `npm run validate:command-catalog` (136 items); root frontend build via `npx pnpm@10 build` passed with the existing Vite large-chunk warning. Local `pnpm` was unavailable, Corepack pnpm failed with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, and `npx pnpm@11.10.0` requires newer Node than local `v20.19.5`.

## Task 17.8B - Simplify Device Telemetry UX and Fix Analyze/Windows Storage (2026-07-12)

- Summary: simplified Device Telemetry for non-technical operators, made Analyze deterministic-first and AI-optional, and hardened Windows telemetry writes against EPERM/EBUSY rename locks.
- Backend: `/api/devices/:deviceId/telemetry/linux/analyze` now reads stored JSONL telemetry, rebuilds findings with the vendor finding engine, returns finding counts and `lastAnalyzedAt`, and exposes `aiSummary`, `aiAvailable`, and `aiError` without depending on `/api/ai/chat`.
- Storage: per-device queueing remains in place; temp files now follow `<deviceId>.<timestamp>.<random>.jsonl.tmp`, rename retries EPERM/EBUSY with backoff, and locked rename fallback appends the current event safely so monitoring continues.
- Frontend: `LinuxTelemetryPanel` now presents Connection, Live Monitoring, and Results as the primary flow. Raw logs, advanced sources, backend counters, storage warnings, detected SSH service details, and raw evidence are behind Advanced diagnostics or Show technical evidence.
- UX: Analyze no longer fails completely when AI is unavailable. The UI shows `AI explanation is unavailable. Local analysis is still available.` for optional AI absence and `Backend is not reachable. Check API server.` for real API reachability failure.
- Tests: added focused coverage for deterministic analyze without AI, findings from stored events, Windows EPERM retry, locked-rename append fallback, simplified three-step UI, hidden raw evidence, Advanced diagnostics, and Persian/English label presence.
- Migrations: none.
- Validation: focused Task 17.8 tests (14/14); backend `npm run build`; backend `npm test` (172/172); root `pnpm build` passed with the existing Vite large-chunk warning.

## Task 17.8 Follow-up - Windows-Safe Telemetry Storage Runtime Fix (2026-07-12)

- Summary: fixed the Windows live-monitoring persistence bug where JSONL rotation could fail with `ENOENT` during rename and leak raw storage errors into the monitoring experience.
- Backend: `BoundedTelemetryStore` now recreates the telemetry directory recursively before writes/reads/status checks, handles first writes for new devices safely, serializes writes per device, and uses unique same-directory temp files before atomic rename.
- Runtime behavior: storage write failures are logged as backend telemetry-storage warnings, live monitoring continues, and the UI receives only a clean telemetry warning instead of raw paths, rename messages, or stack details.
- Frontend: Device Monitoring storage counters now show `used ... of ...` for bytes/events, and new stream events update live event count, last event time, and stored event count before the next backend status refresh.
- Tests: added regressions for missing telemetry directory creation, first write for a new device, byte-limit rotation, Windows path-safe concurrent temp writes, and storage failure not breaking monitoring findings.
- Migrations: none.
- Validation: focused Task 17.8 tests (10/10); backend `npm run build`; backend `npm test` (168/168); root `pnpm build` passed with the existing Vite large-chunk warning.

## Task 17.8 - Production-Grade Linux Device Monitoring and Service Status Reliability (2026-07-12)

- Summary: added bounded Linux telemetry storage, expanded live stream parsing/sources, fixed service-status read semantics, and evaluated the external SSH automation repo without adopting it as a dependency.
- Backend: added `BoundedTelemetryStore` with configurable per-device byte/count/age retention, `TELEMETRY_*` env settings, storage status API, structured live event persistence, apache/fail2ban stream sources, and parser coverage for auth/sudo/service/web/fail2ban/kernel/docker signals.
- Linux service status: added strict service-name validation, structured systemd `show`/`is-active`/`is-enabled`, SysV fallback, weak `pgrep` fallback, normalized states, parser confidence/explanation/evidence, and ActionPlan success semantics that treat inactive/failed/not_found/unknown as successful read results when SSH ran successfully.
- Frontend: Device Telemetry now shows stream state, event count, active sources, last event time, storage usage/count limits, expanded source filters, grouped findings/evidence, and service-status result details.
- External repo: `SSH-Automation-For-Multiple-Servers` is MIT Python/Paramiko. Useful ideas are bounded fan-out, retry/backoff, timeouts, and structured per-host results. Rejected as dependency/code source due to hardcoded sample passwords, insecure `AutoAddPolicy`, sudo password shell piping, unbounded local logging, and mismatch with Node/Fastify connector-controlled ActionPlan architecture.
- Tests: added `task17-8-linux-monitoring.test.ts` for separate per-device byte-limit and count-limit bounded store rotation, stream parser coverage, finding dedupe/severity, service parser states including systemctl-unavailable SysV fallback, service-name safety, no placeholder command leakage, and connector/read-success semantics. Updated older static Linux connector expectations.
- Migrations: none.
- Validation: focused Task 17.8 tests (7/7); `npm run validate:command-catalog` (136 items); backend `npm run build`; backend `npm test` (164/164); root `npm run test:i18n` (73 keys); root `pnpm build` passed with the existing Vite large-chunk warning.

## Task 17.7 - FortiGate Full Action Library Execution Coverage and Real CLI Verification (2026-07-11)

- Summary: hardened FortiGate guided IPsec execution so real connector success must be followed by semantic FortiGate verification before the ActionPlan can succeed.
- VPN fixes: preserved `aes256-sha256` proposal generation, blocked DES/3DES/MD5/SHA1 proposals by default, changed mandatory verification to targeted FortiGate `show`/`get` commands, and removed fixed debug/diagnose syntax from the required path.
- Connector: added FortiOS stdout/stderr failure detection and post-execution verification for phase1, phase2, static route, bidirectional firewall policies, NAT/logging, and tunnel summary evidence.
- Catalog/UI: support-state remains default-deny and no longer uses a hard-coded VPN preview-only override; result formatting shows post-execution verification checks.
- Tests: added `task17-7-fortigate-execution-coverage.test.ts` for proposal regression, weak proposal blocking, route/policy verification failure, CLI failure detection, and FortiGate catalog inventory honesty; included it in `npm test`.
- Live smoke checklist: create address object, service object, zone, firewall policy, static route, VIP/port-forward, IPsec VPN, run read-only checks, verify with FortiGate `show`/`get`, and clean up only after explicit confirmation.
- Migrations: none.
- Validation: focused Task 17.7 tests (6/6); `npm run validate:command-catalog` (136 items); backend `npm run build`; backend `npm test` (158/158); root `npm run test:i18n` (73 keys); root `pnpm build` passed with the existing Vite large-chunk warning.

## Task 17.6C - Standard Guided Parameter Flow for Parameterized Actions (2026-07-11)

- Summary: standardized parameterized action handling so catalog-backed FortiGate, MikroTik, Linux, and future vendor actions open a guided ActionSession instead of staying as inline/raw preview cards.
- Backend: added generated `catalog:<commandId>` guided blueprints, normalized submitted params, rejected placeholder/example values, filtered UI/internal identifiers, and preserved default-deny support states during preview/build/execute.
- Frontend: Action Library cards show executable/preview/manual/unsupported state and route parameterized actions to `Configure / Create ActionPlan`; guided modal stores selected action/vendor/device in URL state and follows active RTL/LTR direction.
- AI: Command Catalog AI fallback and AI Assistant now route missing-parameter actionable tasks into the same guided flow. Deterministic guided routing avoids external AI provider calls for recognized guided intents.
- Safety: verified actions execute only after preview and confirmation through the existing PolicyGuard/connector/audit path. Preview-only/manual-only parameterized actions can build review plans but do not invoke connectors.
- Tests: added regressions for guided parameter collection, missing/invalid/placeholder blocking, connector invocation only after confirmation, preview/manual no-execute behavior, source checks for Action Library routing, and locale parity.
- Migrations: none.
- Validation: backend build; focused `task17-2`, `task17-3`, and `task16` guided/AI tests (33/33); backend catalog validation (136 items); backend full test suite (152/152); root i18n parity (73 keys); root `pnpm build` passed with the existing Vite large-chunk warning.
- Playwright MCP: requested by task but not exposed in this session; browser-level verification remains a follow-up.

## Task 17.6 - Disable Mandatory Action Backup Preflight (2026-07-11)

- Summary: removed automatic mandatory backup/export commands from Quick Controlled FortiGate and MikroTik execution paths; backup/export is optional/manual only.
- FortiGate: no longer injects `show full-configuration` into execution. Guided IPsec site-to-site VPN now builds, previews, and confirmed-executes without a backup/export preflight.
- Safety: retained PolicyGuard, validated parameters, registered templates/connectors, explicit `intent=execute`, connector invocation, audit logging, and evidence-based success. No secrets were added to persisted plans, audit, or output.
- Areas: FortiGate/MikroTik policy guards and SSH connectors, generic action execution metadata, FortiGate compiler/capability UX, Action Center readiness copy, and Task 17.6 regression coverage.
- Validation: focused `task17-2`, `task17-3`, and generic tests; backend catalog validation (136 items); backend build; full backend test suite; frontend `pnpm build` passed with existing Vite dynamic-import/chunk-size warnings.

## Task 17.5 Follow-up - AI Assistant Action Routing (2026-07-11)

- Summary: fixed AI Assistant actionable request routing so VPN chat requests create a guided ActionSession and open the Guided Action flow instead of returning only text.
- Routing: Persian and English VPN creation phrases, including `build vpn`, now map to `fortigate_guided_vpn_setup`; `/api/ai/chat` returns `actionSessionId`, `actionSession`, and `guidedActionUrl`.
- Frontend: the AI panel follows `guidedActionUrl`/`actionSessionId` and navigates to `/guided-actions/:sessionId`; required VPN fields are collected there before preview/action-plan creation.
- Safety: chat still never executes commands, never sends raw CLI, and never bypasses explicit confirmation, PolicyGuard, or connector execution. Missing fields block build-plan with validation instead of creating an executable plan.
- Areas: AI chat service, FortiGate guided intent resolver, AI response typing, AI assistant panel routing, guided/support-state tests.
- Changed files: `backend/src/services/ai-chat.service.ts`, `backend/src/guided-actions/vendors/fortigate/fortigate-blueprints.ts`, `backend/test/task17-2-guided-actions.test.ts`, `backend/test/task17-3-support-state-i18n.test.ts`, `src/components/ai/AiSecurityAssistantPanel.tsx`, `src/lib/ai.ts`, docs.
- Migrations: none.
- Validation: `cd backend && npm run build`; `cd backend && npm run validate:command-catalog` (136 items); `cd backend && npx tsx --test test/task17-2-guided-actions.test.ts test/task17-3-support-state-i18n.test.ts` (22/22); `cd backend && npm test` (147/147); root `pnpm build` passed with existing Vite dynamic-import/chunk-size warnings.
- Follow-up: add browser-level navigation coverage when tooling is available and expand automatic chat routing for additional guided action families as they are hardened.

## Task 17.5 - FortiGate Guided VPN Parameter Mapping and Execution Fix (2026-07-11)

- Summary: fixed the execution blocker where `guided_action_wizard` provenance leaked into FortiGate VPN execution parameters and was validated as an interface; added canonical guided VPN schema, normalization, validation, compiler coverage, live discovery fallback, UI interface suggestions, and clearer Action Center fix fields.
- Executable now: FortiGate IPsec Site-to-Site guided VPN only, through `fortigate_guided_vpn_setup` and `fortigate-ssh`, when canonical required fields and PSK `secretRef` are present and PolicyGuard passes.
- Still planned/preview-only: FortiGate SSL VPN, IPsec Remote Access, and any FortiGate VPN/catalog action without complete verified schema/template/connector/parser/precheck/post-verification.
- Safety: raw PSK remains transient only; previews show `set psksecret ********`; ActionPlan JSON, dry-run output, audit, rollback metadata, docs, and frontend persisted state do not store the clear PSK.
- Broken diff handling: replaced the broken preview/incomplete guided VPN execution mapping with the canonical schema + compiler + connector path; preserved the useful Task 17.3B action-library/i18n/support-state changes.
- Areas: FortiGate guided VPN schema, ActionPlan normalization/execution discovery fallback, PolicyGuard/FortiGate policy guard, FortiGate compiler, guided blueprint fields, Guided Action Wizard interface suggestions, Action Center validation repair, and guided VPN regression tests.
- Changed files: `backend/src/services/fortigate-guided-vpn.schema.ts`, `backend/src/services/action-plan.service.ts`, `backend/src/services/policy-guard.service.ts`, `backend/src/services/fortigate-policy-guard.service.ts`, `backend/src/services/fortigate-command-compiler.ts`, `backend/src/guided-actions/vendors/fortigate/fortigate-blueprints.ts`, `backend/test/task17-2-guided-actions.test.ts`, `src/components/guided-actions/GuidedActionWizard.tsx`, `src/components/actions/ActionCenterPanel.tsx`, `src/lib/commandCatalog.ts`, docs.
- Migrations: none.
- Validation: `cd backend && npm run build`; `cd backend && npm run validate:command-catalog` (136 items); `cd backend && npx tsx --test test/task17-2-guided-actions.test.ts test/task17-3-support-state-i18n.test.ts` (21/21); `cd backend && npm test` (146/146); root `npm run test:i18n` (72 keys); root `pnpm build` passed with existing Vite dynamic-import/chunk-size warnings.
- Follow-up: replace process-local PSK refs with a vault-backed temporary secret store, implement SSL VPN/remote-access templates/parsers before execution, and run browser-level validation when tooling is available.

## Task 17.3 - Safe Vendor Action Library + Global i18n (2026-07-11)

- Summary: introduced authoritative support state (`verified | preview_only | manual_only | unsupported`), moved prepared actions to `/action-library`, blocked non-verified execution/dry-run generation server-side, and added global i18n plumbing with fa/en locale files and language direction switching.
- Areas: catalog types/evaluator/validator/resolver, command-catalog and action routes, ActionPlan service execution gates, AI resolver/AI-created plan metadata, Action Library UI, app header/navigation/language selector, locale files, parity script, and regression tests.
- Migrations: none.
- Support-state rules: verified requires validated input schema, registered compiler/template, compatible connector/planner, semantic result parser, precheck, and post-verification; otherwise the item is preview-only/manual-only/unsupported and cannot execute.
- Actions downgraded from executable: FortiGate full-control/write/unfinished library entries without all verified requirements, including VLAN/interface changes, zones, address/service objects, policies, VIP/IPPool, route/DNS/NTP changes, IPsec/SSL VPN changes, admin changes, VDOM, HA, and SD-WAN operations. FortiGate VPN guided wizard remains preview-only.
- Safety: Quick Controlled still applies only after support-state verification and does not bypass selected device, validation, compatibility, environment restrictions, PolicyGuard, audit, or real connector invocation. Manual/preview-only plans never send commands to SSH.
- Validation: `npm run validate:command-catalog` passed with 136 items; backend `npm run build` passed; backend `npm test` passed 145/145; root `npm run test:i18n` passed with 56 parity keys; root `pnpm build` passed with existing dynamic-import/chunk-size warnings.
- Commit: not created per user instruction.
- Follow-up: complete locale-key migration for older legacy frontend panels and add browser-level Playwright tests for RTL/LTR switching and library filtering when tooling is available.

## Task 17.2C - Guided Build-Plan Preview for FortiGate VPN (2026-07-09)

- Summary: fixed completed FortiGate VPN wizard build-plan so partial/planned execution templates create a preview-only ActionPlan instead of a useless 409.
- Areas: `backend/src/guided-actions/session-service.ts`, `backend/src/guided-actions/vendors/fortigate/fortigate-blueprints.ts`, Prisma schema/migration, `backend/src/services/action-plan.service.ts`, `src/components/guided-actions/GuidedActionWizard.tsx`, `src/components/actions/ActionCenterPanel.tsx`, `src/lib/actionApprovalState.ts`, tests and docs.
- Safety: execution remains disabled for preview-only guided plans; no raw AI commands, no connector invocation from wizard, no fake success, and PSK/password values are masked/excluded from persisted preview data.
- Validation: `npm run prisma:generate`; local enum migration apply; backend `npm run build`; backend `npm test` passed with 140/140; root `pnpm build` passed with existing chunk-size/dynamic-import warnings.
- Commit: pending.

## Task 17.2B - Force Multi-Step Requests into Guided Wizard (2026-07-09)

- Summary: removed the no-device chat dead-end for guided workflows. VPN/VDOM/Zone/Policy/VIP/NAT/VLAN/Route-style creation requests now return `guided_workflow`, start an ActionSession, and open the Persian wizard with device selection as step one when needed.
- Areas: `backend/src/ai/ai-template-resolver.ts`, `backend/src/routes/command-catalog.ts`, `backend/src/routes/action-sessions.ts`, `backend/src/guided-actions/session-service.ts`, `src/components/ai/AiSecurityAssistantPanel.tsx`, `src/components/commands/CommandCatalogPanel.tsx`, `src/components/guided-actions/GuidedActionWizard.tsx`, tests and docs.
- Safety: no guided request creates a normal ActionPlan before wizard completion; partial/planned workflows still do not fake execution or success; protected quick-controlled lab behavior remains unchanged.
- Validation: backend `npm run build`; backend `npm test` passed with 139/139; root `pnpm build` passed with existing chunk-size warning.
- Commit: pending.

## Task 17.2A - Guided Workflow Routing for Multi-Step Requests (2026-07-09)

- Summary: fixed multi-step operational routing so VPN/VDOM/Zone/Policy/VIP/NAT/Route/VLAN creation requests open Guided Action Wizard instead of producing generic/custom ActionPlans with unknown vendor.
- Areas: `backend/src/ai/ai-template-resolver.ts`, `backend/src/routes/command-catalog.ts`, `backend/src/services/ai-chat.service.ts`, `backend/src/guided-actions/`, `src/lib/ai.ts`, `src/lib/commandCatalog.ts`, `src/components/ai/AiSecurityAssistantPanel.tsx`, `src/components/guided-actions/GuidedActionWizard.tsx`, `src/App.tsx`, docs and tests.
- Safety: selected device is resolved from DB, no raw AI execution was added, guided partial/planned workflows do not fake ActionPlans, and success semantics still require real connector invocation.
- Validation: `npm run validate:command-catalog`; backend `npm run build`; backend `npm test` passed with 139/139; root `pnpm build` passed with the existing Vite chunk-size warning. Playwright MCP was unavailable.
- Commit: pending.

## Task 17.2 - Global Guided Action System + FortiGate Workflow Registry (2026-07-09)

- Summary: added backend global guided-action blueprints, ActionSession APIs, FortiGate workflow registry, fixed FortiGate/Linux port-status intent routing, and added a Persian guided wizard in Command Catalog.
- Areas: `backend/src/guided-actions/`, `backend/src/routes/action-sessions.ts`, `backend/src/ai/ai-template-resolver.ts`, `backend/src/ai/persian-intent-router.ts`, `backend/src/routes/command-catalog.ts`, `src/lib/guidedActions.ts`, `src/components/guided-actions/GuidedActionWizard.tsx`, docs and tests.
- Safety: ActionSession never executes; execution remains Action Center confirmed execution only. Partial/planned FortiGate workflows do not fake commands or success. Secrets remain masked and PSK uses `pskSecretRef`.
- Validation: `npm run validate:command-catalog`; `npm run build`; `npm test` passed with 133/133; root `pnpm build` passed with existing large-chunk warning.
- Commit: this Task 17.2 commit.

## Task 17.1 - FortiGate Full Control Engine (2026-07-09)

- Summary: added a FortiGate full-control registry, expanded catalog/template registration to CRUD/read/write coverage across the requested FortiGate domains, added compiler support for the new action names, and mapped key Persian operational requests to executable `fortigate-ssh` ActionPlans.
- Areas: `backend/src/fortigate/full-control-registry.ts`, FortiGate compiler/catalog/template registry/policy support, Prisma enums and migration, Persian intent router, Action Result formatter, product/status docs.
- Safety: preserved quick-controlled execution, FortiGate SSH connector invocation, PolicyGuard/audit, no success without `connectorInvoked=true`, and raw secret rejection for PSK-sensitive VPN flows.
- Validation: `npm run prisma:generate`; `npm run validate:command-catalog` (136 items); `npm run build`; `npm test` (125/125); `npx prisma db execute --file prisma/migrations/20260709120000_task17_1_fortigate_full_control/migration.sql`; root `pnpm build` passed with the existing large-chunk warning.
- Commit: pending.

## Task 17.0 - FortiGate Management Foundation (2026-07-08)

- Summary: completed the FortiGate read-only command library, shared normalized parsers, eight-section evidence-based Daily Check, Persian central resolver mappings, and structured result tables/findings.
- Safety: no new write action; fixed template compilation, PolicyGuard, audit, real connector invocation, secret redaction, and protected lab settings remain intact.
- Validation: Prisma generation, command catalog (63 items), backend TypeScript build, backend tests (125/125), and frontend `pnpm build` passed with the existing large-chunk warning.
- Migration: `20260708183000_task17_fortigate_management_foundation` applied locally.
- Commit: this Task 17.0 commit.

## Task 17.1 - FortiGate Intent Routing and Result UX (2026-07-08)

- Summary: unified FortiGate operational requests under the central AI resolver, added four executable read-only templates, structured FortiGate result parsing, corrected Daily Check severity semantics, and improved Persian result summaries/counts.
- Validation: catalog valid with 57 items; dedicated FortiGate resolver/compiler tests 4/4; backend build/full tests and `pnpm build` passed. Playwright MCP was unavailable in this session.
- Migration: `20260708150000_fortigate_readonly_intents` applied locally.
- Commit: pending.

## Task 17 - FortiGate SSH Read-only Discovery and Daily Check (2026-07-08)

- Summary: promoted FortiGate to an interactive `fortigate-ssh` connector with prompt/pagination handling, structured discovery parsing, and connector-backed Persian Daily Check v1.
- Areas: FortiGate connector/compiler/catalog, Prisma action enums, Daily Check engine/profile, Persian result formatter, tests and docs.
- Validation: Prisma generation, catalog validation (53 items), backend build and existing suite passed; dedicated FortiGate tests passed; frontend build passed.
- Commit: `d30adac Add FortiGate SSH discovery and daily check`.

## Task 10 - Project Integrity and Production Safety (2026-07-01)

- Summary: hardened config and env handling while preserving quick-controlled lab behavior.
- Areas: configuration, Docker/env safety, UI notice.
- Validation: relevant builds/tests passed.
- Commit: `Stabilize project config and production safety`
- Follow-up: living project memory.

## Task 11.0 - Codex Memory and Living Status (2026-07-01)

- Summary: introduced AGENTS, status/history/architecture docs, and snapshot helper.
- Areas: root docs and scripts.
- Validation: documentation/script review.
- Commit: `Add Codex project memory and living status docs`
- Follow-up: keep memory synchronized after tasks.

## Tasks 12-12.5 - Telemetry, Multi-Vendor Analysis, Evidence Packs (2026-07-02)

- Summary: added Linux snapshot/live telemetry, real-time findings, multi-vendor analysis/hardening, compact AI context, and the central orchestrator prompt.
- Areas: telemetry, assessments, AI context/prompts, frontend panels, tests.
- Validation: backend/frontend builds passed; suite reached 83/83.
- Commits: `Add Linux security telemetry foundation`; `Add actionable real-time Linux security monitoring`; `Add multi-vendor analysis and hardening engine`; `Add compact AI evidence packs and orchestrator prompt`
- Follow-up: feed non-Linux collectors into the shared engine.

## Task 13 - Vendor-Aware Telemetry and Findings Engine (2026-07-03)

- Summary: added vendor profiles, normalized Finding persistence, aggregation/suppression, APIs/SSE, and proposal-only remediation.
- Areas: Prisma, telemetry engine/routes/UI, AI context, tests.
- Validation: backend 88/88; backend/frontend builds passed.
- Commit: `Add vendor-aware telemetry findings engine`
- Follow-up: add real vendor collectors/parsers.

## Task 14 - Persian Backend-First Command Catalog (2026-07-04)

- Summary: established Persian catalog product mode, device-aware search, ActionPlan handoff, and proposal-only AI fallback.
- Areas: catalog types/data/routes/UI, product docs/tests.
- Validation: backend 90/90; backend/frontend builds passed.
- Commit: `Add Persian backend-first command catalog foundation`
- Follow-up: require real templates for executable labels.

## Task 14.1 - Real Validated Vendor Commands (2026-07-04)

- Summary: added implementation states, parameter validation, template registry, catalog validator, and honest executable/manual/planned UI states.
- Areas: catalog, templates/connectors, Prisma, Action Center, tests.
- Validation: catalog validation, builds, and backend 93/93 passed.
- Commit: `Enforce real validated vendor command catalog`
- Follow-up: complete Action Center handoff.

## Task 14.1B - Catalog Action Center Handoff (2026-07-04)

- Summary: preserved full catalog metadata, resolved templates safely, and opened newly created plans in Action Center.
- Areas: catalog resolver/routes, quick execute, frontend handoff/tests.
- Validation: catalog validation; backend 97/97; builds passed.
- Commit: `Fix catalog Action Center quick-execute flow`
- Follow-up: make lifecycle/result evidence honest.

## Tasks 14.1C-14.1D - Real Execution Lifecycle and Preview Fix (2026-07-04)

- Summary: separated preview from execution, added stable fingerprints/explicit intent, persisted real output, and required connector invocation for success/result navigation.
- Areas: action lifecycle, catalog resolution, result UI, regression tests.
- Validation: catalog validation; backend progressed to 103/103; builds passed.
- Commits: `Fix prepared command execution lifecycle and results`; `Fix prepared command preview execution transition`
- Follow-up: unify supported AI actions with catalog templates.

## Task 14.1E - Lab-Unrestricted AI/Catalog Execution (2026-07-04)

- Summary: mapped supported AI intents to registered Linux templates and kept single-confirmation lab execution without bypassing connector/audit controls.
- Areas: Prisma action types, catalog/templates, Linux connector, intent parsing, policy/tests.
- Validation: catalog 41 items; backend 105/105; builds passed.
- Commit: `Enable lab execution for supported AI actions`
- Follow-up: vendor-aware Daily Check.

## Task 15.1 - Multi-Vendor Daily Check (2026-07-05)

- Summary: added ten vendor profiles; Linux/MikroTik use real read-only templates while other vendors remain manual-only; improved grouped Daily Check results.
- Areas: Daily Check engine/routes/UI, templates/connectors, migration/tests/docs.
- Validation: catalog/builds passed; backend suite passed after local test migration.
- Commit: `Add vendor-aware daily checks and execution mapping`
- Follow-up: add real connectors before promoting manual profiles.

## Task 15.0 - Harden Project Memory and Codex Handoff (2026-07-07)

- Summary: created fixed-structure live handoff and memory index; refreshed status/architecture/codebase/product docs; hardened snapshot and memory checks.
- Areas: `AGENTS.md`, `CODEX_HANDOFF.md`, `docs/`, `scripts/`, root `package.json`.
- Validation: snapshot and memory check passed; backend build and 109/109 tests passed; frontend build passed with the existing chunk-size warning.
- Commit: `Harden project memory and Codex handoff system`
- Follow-up: UTF-8 cleanup and continued vendor connector integration.

## Task 16A - AI Resolver, Assistant Contract, and Catalog Fallback Hardening (2026-07-07)

- Summary: added a central AI-to-template resolver, hardened structured AI chat responses, fixed Command Catalog AI fallback modes, and updated the catalog UI/client to reflect executable/manual/missing-input states honestly.
- Areas: `backend/src/ai/ai-template-resolver.ts`, `backend/src/routes/ai.ts`, `backend/src/routes/command-catalog.ts`, `backend/src/services/ai-chat.service.ts`, `src/lib/ai.ts`, `src/lib/commandCatalog.ts`, `src/components/commands/CommandCatalogPanel.tsx`, Task 16 backend tests.
- Validation: backend build/tests and frontend build passed.
- Commit: completed previously from latest committed state.
- Follow-up: finish Daily Check, Service Health, result UX, and docs.

## Task 16B - Daily Check, Linux Service Health, and Result UX Hardening (2026-07-07)

- Summary: completed vendor-aware Daily Check profiles/engine, added Persian Daily Check UI and Linux Service Health UI, wired Linux service-health actions into catalog/templates/planner/connector, enforced new-tab result opening with popup fallback, and rebuilt Action Result formatting for key Linux/MikroTik actions.
- Areas: `backend/src/daily-check/`, `backend/src/commands/catalog/index.ts`, `backend/src/commands/execution/execution-template-registry.ts`, `backend/src/connectors/vendors/linux-edge.planner.ts`, `backend/src/connectors/linux-ssh.connector.ts`, `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260707160000_task16_linux_service_health/`, `src/components/daily-check/DailyCheckPanel.tsx`, `src/components/services/LinuxServiceHealthPanel.tsx`, `src/components/actions/ActionCenterPanel.tsx`, `src/components/actions/ActionResultView.tsx`, `src/features/actions/actionResultFormatter.ts`, `src/lib/actionResultNavigation.ts`, `src/lib/dailyCheck.ts`, backend tests/docs.
- Validation: `cd backend && npm run prisma:generate`; `cd backend && npm run validate:command-catalog`; `cd backend && npm run build`; `cd backend && npm test`; `cd backend && npx prisma db execute --file prisma/migrations/20260707160000_task16_linux_service_health/migration.sql`; `pnpm build` all passed. Frontend build kept the existing Vite chunk-size warning only.
- Commit: pending.
- Follow-up: UTF-8 cleanup in legacy areas and applying the Task 16 enum migration on every shared/local environment.

## Task 16.2 - Command Search AI Fallback Executable Actions (2026-07-07)

- Summary: fixed `/api/commands/ai-propose` so Command Catalog no-result Ask AI requests route through the central AI template resolver before manual fallback, pass selected device/vendor/search context, and create executable ActionPlans for supported Linux/MikroTik templates.
- Areas: `backend/src/ai/ai-template-resolver.ts`, `backend/src/routes/command-catalog.ts`, `backend/src/services/action-plan.service.ts`, `backend/test/task16-ai-resolver-and-fallback.test.ts`, `src/lib/commandCatalog.ts`, `src/components/commands/CommandCatalogPanel.tsx`, `src/components/charts/TopPortsChart.tsx`.
- Validation: `cd backend && npm run build`; `cd backend && npm test` passed with 117/117 tests; root frontend build passed with the existing large-chunk warning. `pnpm` was unavailable in this shell, so root `npm run build` was used after repairing local dependencies.
- Commit: pending.
- Follow-up: continue UTF-8/mojibake cleanup separately; do not change protected quick-controlled lab execution behavior.

## Task 16.3 - Persian Intent Understanding and Executable Action Creation (2026-07-07)

- Summary: added deterministic Persian intent routing before AI/manual fallback, promoted mapped template aliases such as `linux_list_open_ports`, fixed stale `sourceIp` validation for open-port listing, and made AI chat plus Command Search AI fallback create executable `ai_mapped_template` ActionPlans.
- Areas: `backend/src/ai/persian-intent-router.ts`, `backend/src/ai/ai-template-resolver.ts`, `backend/src/routes/command-catalog.ts`, `backend/src/services/ai-chat.service.ts`, `backend/src/services/action-plan.service.ts`, `backend/src/services/policy-guard.service.ts`, `backend/src/commands/catalog/`, `backend/src/commands/execution/`, Linux/MikroTik connectors, Prisma schema/migration, Task 16 tests, frontend action result/action typing.
- Validation: `cd backend && npm run prisma:generate`; `cd backend && npm run validate:command-catalog`; `cd backend && npx prisma db execute --file prisma/migrations/20260707183000_task16_3_persian_intent_aliases/migration.sql`; `cd backend && npm run build`; `cd backend && npm test` passed with 119/119 tests; `pnpm build` unavailable, `corepack pnpm build` failed with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, root `npm run build` passed with the existing large-chunk warning.
- Commit: pending.
- Follow-up: apply the Task 16.3 enum migration on other local/shared databases before creating the new alias ActionTypes there.

## Task 16.3A - Runtime AI Fallback Validation and Source Param Fix (2026-07-07)

- Summary: tested the no-result Command Catalog flow for `وضعیت پورت های باز رو نشون بده` against the local Linux device route path, fixed stale control-source normalization into `sourceIp`, kept executable metadata params clean, and changed Action Center execute buttons to the exact label `تایید و اجرا`.
- Areas: `backend/src/services/policy-guard.service.ts`, `backend/src/services/action-plan.service.ts`, `backend/test/task16-ai-resolver-and-fallback.test.ts`, `src/components/actions/ActionCenterPanel.tsx`, docs.
- Validation: route-level flow verified search count 0 -> AI fallback executable `linux_list_open_ports` -> validation passed -> quick execution succeeded with `connectorInvoked=true` and visible `ss/netstat` output; `cd backend && npm run build`; `cd backend && npm run validate:command-catalog`; `cd backend && npm test` passed with 119/119 tests; root `npm run build` passed with the existing Vite large-chunk warning. `pnpm` is not available on PATH in this shell.
- Commit: pending.
- Follow-up: Playwright MCP browser tooling was not exposed in this session; rerun click-level browser validation when that tool is available.

## Task 17.3B - Safe Vendor Action Library, Real FortiGate IPsec, Global i18n (2026-07-11)

- Summary: repaired the broken Task 17.3 vendor-library/i18n/support-state attempt, moved prepared actions to `/action-library`, enforced default-deny support states, and made FortiGate IPsec Site-to-Site guided VPN executable through `fortigate-ssh`.
- FortiGate executable mode: only `fortigate_guided_vpn_setup` with `vpnType=ipsec_site_to_site` and PSK auth is verified. It requires tunnel name, WAN interface, LAN interface, remote gateway, local and remote subnet lists, proposal, temporary PSK `secretRef`, and optional static-route/firewall-policy/NAT/logging/enable flags.
- FortiGate planned modes: SSL VPN and IPsec Remote Access remain preview-only/planned. FortiGate catalog/guided actions without full schema/template/connector/parser/precheck/post-verification are not executable.
- Safety: raw PSK is never stored in ActionPlan JSON, dry-run output, frontend state, audit, or docs. A process-local 30-minute temporary `pskSecretRef` is resolved only during connector execution; backup preflight output is redacted.
- Areas: FortiGate compiler/connector/policy guard, guided FortiGate blueprints, temporary secret service, action catalog/template registry, support-state catalog gate, command catalog routes, ActionPlan service, Action Library UI, App shell i18n, Action Center readiness UX, locale files/parity script, backend tests.
- Changed files: `backend/src/services/fortigate-command-compiler.ts`, `backend/src/services/ephemeral-secret.service.ts`, `backend/src/connectors/fortigate-ssh.connector.ts`, `backend/src/actions/fortigate-action-catalog.ts`, `backend/src/services/fortigate-policy-guard.service.ts`, `backend/src/guided-actions/vendors/fortigate/fortigate-blueprints.ts`, `backend/src/commands/execution/execution-template-registry.ts`, `backend/src/commands/catalog/*`, `backend/src/routes/actions.ts`, `backend/src/routes/command-catalog.ts`, `backend/src/services/action-plan.service.ts`, `backend/src/ai/ai-template-resolver.ts`, `backend/test/task17-2-guided-actions.test.ts`, `backend/test/task17-3-support-state-i18n.test.ts`, `src/App.tsx`, `src/components/commands/CommandCatalogPanel.tsx`, `src/components/actions/ActionCenterPanel.tsx`, `src/lib/actionApprovalState.ts`, `src/lib/commandCatalog.ts`, `src/main.tsx`, `src/i18n/**`, `scripts/check-locale-parity.mjs`, `package.json`, `pnpm-lock.yaml`, `backend/package.json`.
- Migrations: none.
- Validation: `cd backend && npm run build`; `cd backend && npm run validate:command-catalog` (136 items); `cd backend && npx tsx --test test/task17-2-guided-actions.test.ts test/task17-3-support-state-i18n.test.ts` (20/20); `cd backend && npm test` (145/145); `npm run test:i18n` (72 keys); `pnpm build` passed with existing Vite dynamic-import/chunk-size warnings.
- Follow-up: replace process-local PSK refs with a persistent vault integration; implement SSL VPN and remote-access templates/parsers before making them executable; complete dedicated legacy i18n/mojibake cleanup; run browser click validation when tooling is available.

## Task 18.1 Milestone A - Product IA, Routing, App Shell, Feature Split (2026-07-12)

- Summary: completed Milestone A scope from `TASK_18_1_PLATFORM_UX_ARCHITECTURE.md`: discovery, lightweight routing, app shell/navigation, feature folder split, and design tokens.
- Frontend: added `src/routes/appRoutes.tsx`, `src/components/layout/AppShell.tsx`, `src/design-system/*`, `src/features/assets/*`, `src/features/security/*`, and route pages for dashboard, monitoring, actions, assistant, integrations, and settings.
- Backward compatibility: `/action-library`, `/guided-actions/:sessionId`, and `/actions/:id/result` continue to work.
- Safety: no backend execution policy, ActionPlan lifecycle, connector, PolicyGuard, lab mode, or secrets changed.
- Browser MCP: inspected requested routes with the MCP browser before implementation; auth gate prevented authenticated page inspection without credentials, and the only console errors were expected 401 auth checks. Screenshots were saved in `.playwright-mcp/`.
- Validation: `npx pnpm@10 build` passed with the existing large-chunk warning after npm cache escalation. Backend validation was not required because backend/package code was not changed.
- Commit: pending.
## Database/Auth Runtime Repair (2026-07-14)

- Summary: fixed the normal backend dev runtime database mismatch that caused Prisma `ConnectionClosed`/timeout behavior during auth bootstrap and made the login UI report an unreachable auth server.
- Root cause: dotenv-backed normal runtime resolved the old local PostgreSQL target instead of the reachable local service/database. Prisma config and app env now share the same resolver.
- Areas: `backend/src/config/database-url.ts`, `backend/src/config/env.ts`, `backend/prisma.config.ts`, handoff/status docs.
- Evidence: normal `cd backend && npm run dev` stayed running; `/api/health/ready` returned 200 ten times; direct `prisma.appUser.count()` succeeded; Playwright MCP opened the authenticated Dashboard and saw auth/assets/security/monitoring/product-state API calls return 200 with zero current console errors.
- Validation: `cd backend && npx prisma validate`; `cd backend && npx prisma generate`; `cd backend && npm run build`; backend test matrix passed 209/209 with `npx tsx --test --test-concurrency=1 ...`; `npx pnpm@10 build` passed with the existing chunk-size warning.
- Commit: pending.

## Runtime Auth/CORS Follow-up (2026-07-14)

- Summary: stopped duplicate backend dev processes, verified the normal PrismaPgAdapter/pg Pool connection source, and fixed browser authentication for the active frontend port.
- Root cause: the database source now resolves correctly, but the active frontend was running on 5174 while backend CORS defaults only allowed 5173, so MCP/browser auth calls were blocked from the dashboard. Duplicate/hot-restarted backend processes also produced misleading transient timeout symptoms during probing.
- Areas: `backend/src/config/env.ts`, handoff/status docs.
- Evidence: one normal backend dev process; `/api/health/ready` 200 ten times; `prisma.appUser.count()` succeeded; `/api/auth/login` returned 200; Playwright MCP opened `http://localhost:5174/dashboard` and saw auth/assets/security/monitoring/product-state API calls all 200 with zero current console errors.
- Commit: pending.

## Database Runtime Port Correction (2026-07-14)

- Summary: corrected normal backend database resolution for Windows PostgreSQL on `127.0.0.1:5432` without Docker, temporary shell overrides, migrations, seeds, db push, reset, or destructive SQL.
- Root cause: `backend/src/config/database-url.ts` still had stale temporary-runtime normalization that rewrote local `firewall_log_analyzer` to `firewall_log_auth` and forced port `55432`; on the real Windows PostgreSQL listener this produced Prisma `P1003` because the rewritten database did not exist there.
- Areas: `backend/src/config/database-url.ts`, handoff/status docs.
- Evidence: shared resolver reports `127.0.0.1:5432/firewall_log_analyzer`; normal `cd backend && npm run dev` starts one backend app process on port 4000; `/api/health/ready` returned 200; `/api/auth/login` returned 200; `/api/auth/me` returned 200; `/api/assets` returned 200 with 7 assets; `/api/credentials` returned 200 with 4 credential references.
- Validation: `cd backend && npm run build` passed.
- Limitation: Playwright MCP dashboard verification could not be completed because the Playwright MCP tools were not exposed in this turn after targeted discovery.

## Device Onboarding Final Repair (2026-07-15)

- Root cause: the onboarding UI exposed unsupported API choices, sessions were memory-only, credential-decrypt failures were not safely classified, and verified persistence crossed multiple non-atomic writes.
- Implemented honest unverified registration, persisted sessions, SSH-only verified onboarding, sanitized recovery states, and one atomic verified persistence transaction.
- Closed internal-router reloads, default full-suite discovery/serialization, onboarding lifecycle/rollback tests, and source/migration BOM enforcement.
- Authenticated Playwright acceptance passed and its single created Device/Asset pair was cleaned up without changing historical protected counts.
- Commits: `57ad699`, `17f264a`, `6e1c26e` (Phase 4; amended hash reported in final handoff if changed).

## Device Workspace / Action Center Repair - Phase 1 (2026-07-15)

- Implemented the four required Device verification endpoints and device-scoped orchestration over the persisted onboarding session engine.
- Added concurrency protection, persisted attempt-start evidence, sanitized status/history projection, and focused backend contract coverage.
- Validation: backend build passed; onboarding final repair tests 8/8 passed; new verification tests passed. No migration, dump operation, or protected-record write was performed.

## Device Workspace / Action Center Repair - Phase 2 (2026-07-15)

- Added the Device Workspace verification client contract, localized control panel, credential reference selector, session step controls, sanitized error display, and persisted history.
- Validation: frontend build, locale parity, Persian primary-route copy, UTF-8 guard, diff check, and authenticated Playwright at 1366x768 passed.

## Device Workspace / Action Center Repair - Phase 3 (2026-07-15)

- Added the backend Action Center projection, lifecycle normalization, fail-closed success evidence rule, filtered summaries, sanitized detail payload, guarded cancellation, and retry-as-new-plan behavior.
- Validation: backend build; Action Center contract tests 3/3; existing Action Center UX/source tests 3/3; authenticated browser GET returned 200 with the full 124-plan summary. No existing ActionPlan was mutated.

## Device Workspace / Action Center Repair - Phase 4 (2026-07-15)

- Added a responsive Action Center client/workspace and moved ActionPlan creation to an accessible top-level catalog panel.
- Preserved React Router deep links and connected every required control to an existing safe workflow or the new Action Center contract.
- Validation: frontend build, locale parity, Persian copy, UTF-8 guard, diff check, and authenticated Playwright layout/control/deep-link checks passed.

## Device Workspace / Action Center Repair - Final Acceptance (2026-07-15)

- Reproduced and repaired the Device Workspace verification gap and the clipped, non-lifecycle Action Center in four separately committed phases.
- Proved truthful device behavior with two real Cisco SSH connector attempts: both timed out, both recorded `connectorInvoked=true`, neither promoted the Device to verified, and the persisted history survived backend restart.
- Proved successful execution with a temporary read-only Linux ActionPlan through preview, confirmation, connector execution, evidence, and result inspection. The succeeded result had `connectorInvoked=true`; the exact tagged plan was deleted afterward, restoring ActionPlan count to 124.
- Verified Action Center all/pending/history/detail/not-found routes, unsupported-action fail-closed behavior, complete controls, RTL/LTR, and responsive 1366x768, 1440x900, and 1920x1080 layouts with authenticated Playwright.
- Validation: backend build; backend tests 236/236; final repair contract 3/3; frontend build; locale parity 97 keys; Persian copy; UTF-8 450 files; Prisma schema current; dry-run Device/Asset audit `changed=0`; `git diff --check`.
- Preservation: Device 4, Asset 7, DeviceCredential 4, Finding 5, ActionPlan 124. No migration was created or required.
- Honest blocker: the configured Cisco host `192.168.7.12` does not answer SSH before timeout, so live successful Cisco verification remains unavailable despite proven connector invocation and recovery behavior.
## 2026-07-15 - Urgent Action Center operator flow

- Replaced immediate one-click creation/execution with preview then explicit confirmation over the real quick-execute endpoint.
- Added primary New Action and lifecycle-specific Confirm and Execute, Retry, and Run again controls.
- Promoted connector evidence and stdout/stderr to the visible result surface while retaining raw payloads under Advanced Details.
- Extended retry-as-new-plan to succeeded records without altering completed history.
## 2026-07-15 - Action detail null-payload regression

- Reproduced `connectorResult: null` on existing planned ActionPlan `cmrlyhzyg001sqklvahjmseq2` and traced the crash to `ActionCenterWorkspace` reading `.stdout` on null.
- Added Action Center response normalization for legacy/null JSON, lifecycle, device, support, controls, connector evidence, and audit fields.
- Authenticated Playwright read-only acceptance covered planned, failed, and succeeded records plus New Action visibility and responsive overflow.
## 2026-07-15 - Assistant to executable Action Center flow

- Root cause: backend projected `canPreview=true` for proposed Assistant plans, but the new Action Center rendered no Preview control for selected historical/deep-linked plans.
- Added top-level selected-action controls and wired preview to the existing quick-execute preview intent.
- Browser-proved Assistant -> Action Center -> Preview -> Confirm and Execute -> succeeded Linux connector result; temporary records were removed afterward.
## 2026-07-15 - User-friendly Action result navigation

- Connected the operator-first Action Center Confirm/Execute control to the existing deep-linkable result page.
- Preserved the real quick-execute backend call, ActionPlan history, execution safety checks, and connector-evidence success invariant.
- Proved the navigation in authenticated Playwright with a real Linux connector execution, then deleted only the temporary acceptance ActionPlan.
## 2026-07-15 - Repair Action Center history execution dead end

- Reproduced the screenshot behavior and connected history selection to the top review card through focus/scroll handling.
- Added lifecycle-specific history CTA copy and repaired duplicate result-row React keys.
- Proved the full Persian AI-created action flow in authenticated Chrome, including real Linux execution, result-route navigation, connector evidence, and cleanup.
## 2026-07-15 - Complete Asset Sync feature repair

- Rebuilt the three-card Asset Sync surface with visible progress, sanitized errors, preview rows, confirmation, idempotent mock apply, and structured results.
- Preserved the product-state truth boundary: NetBox/Wazuh are working mock workflows, not falsely advertised production integrations; Device sync is a real internal reconciliation.
- Verified focused backend integration behavior and all three cards in authenticated Chrome at 1366x768 without console errors or overflow.
## 2026-07-15 - Simplify device/vendor and ActionPlan management

- Linked vendor cells to vendor overview pages and added device edit/delete controls to the primary workspace.
- Added the admin-only confirmed ActionPlan terminal-history deletion endpoint and UI while retaining non-terminal actions.
- Verified real temporary-device create/edit/delete through backend APIs and all non-destructive UI confirmations in authenticated Chrome.

## 2026-07-18 - Simplify inventory, onboarding, Cisco compatibility, and action execution

- Root causes: Device deletion left Asset-backed equipment visible; onboarding mixed operator fields with connector internals; Cisco compatibility needed a scoped legacy retry path; action execution still had legacy popup/direct-list paths.
- Implemented archive-from-inventory behavior, duplicate prevention, simplified onboarding/list/overview UI, modern-first Cisco legacy retry with explicit approval, and a focused Action Center review/confirm/result flow.
- Validation: Prisma schema validation, backend build, command catalog validation, frontend build, locale parity checks, UTF-8 guard, diff check, and focused Cisco/non-database tests where possible.
- Skipped database-bound tests that require an isolated TEST_DATABASE_URL; no destructive database command or migration execution was run.
## 2026-07-18 - Real dashboard activity and Cisco operation registry

- Root causes: the dashboard activity surface was placeholder text rather than an operational projection; Cisco execution was hard-coded around one show-version action and the older Cisco action catalog was empty.
- Added a dashboard activity service/route and frontend dashboard feed for executions, successful/failed actions, pending approvals, device registrations, and configuration changes.
- Added a Cisco operation registry, generated command/action catalog entries, expanded read-only IOS-XE command templates, and updated planner/connector execution to select operations by catalog metadata through Action Center.
- Planned Cisco configuration/admin areas were registered as non-executable roadmap definitions only; no weak SSH algorithms, raw commands, migrations, or destructive database operations were added.
- Validation: Prisma schema validation, command catalog validation, backend build, frontend build, i18n, UTF-8, diff check, and Cisco fixture tests passed; DB-bound catalog/support tests stopped at TEST_DATABASE_URL_REQUIRED.
## 2026-07-19 - Cisco legacy onboarding and idempotent registration repair

- Fixed Cisco onboarding so the explicit per-session legacy compatibility option reaches the existing ssh2 connector as append-only legacy algorithms, while modern SSH remains the default and authentication failures do not trigger a legacy retry.
- Test Connection now persists truthful connector invocation and sanitized diagnostics, including connectorInvoked, legacyCompatibilityRequested, legacyCompatibilityApplied, connectionPhase, and structured Cisco error codes.
- Successful Cisco SSH now opens an interactive shell, disables paging, runs show version, detects IOS-XE, IOS Classic, NX-OS, and ASA separately from automation support, and lets unsupported-but-connected platforms proceed to unverified review.
- Device registration now normalizes management IPs and transactionally reuses/reactivates matching Device/Asset records, preserving history. True unrelated ownership returns DEVICE_MANAGEMENT_IP_CONFLICT for the UI conflict actions.
- Validation in progress includes backend build, frontend build/typecheck, Cisco ssh2 fixture tests, onboarding boundary tests, i18n, UTF-8, workflow, and diff checks. No secrets or .env values were printed or changed.

## 2026-07-19 - AI Assistant vendor context loss regression

- Root cause: deterministic Assistant resolution received selected device/vendor data inconsistently and fell back to prompt/catalog inference, so non-Cisco selected targets could resolve as `unknown` or custom proposals.
- Implemented a shared target-context resolver path that receives selected device vendor/platform/capabilities/supported actions/device id and matches only the selected device's supported action catalog.
- Restored ActionPlan creation for supported executable target actions while keeping unsupported/custom/unmatched prompts inside Assistant chat.
- Added regression coverage for MikroTik SSH port change, Cisco VLAN creation, FortiGate policy creation, Linux supported service status, unknown/custom chat-only behavior, and cross-vendor prompt text not overriding selected device context.
- Validation: backend build, command catalog validation, targeted backend tests, frontend build, i18n, UTF-8, workflow, and diff check passed. Full backend suite was attempted and failed because the local isolated test database `firewall_log_analyzer_test` does not exist.

## 2026-07-19 - AI Assistant custom ActionPlan fallback

- Root cause: the guided-routing repair intentionally blocked unmatched/custom prompts, but the product now needs selected-device operational custom requests to become reviewable ActionPlans for every vendor.
- Implemented a shared, vendor-agnostic fallback in the chat service after catalog resolution: if a selected-device request is operational, has no executable catalog/support match, and has no missing fields, create a `custom_vendor_action` ActionPlan.
- Preserved the safety boundary by making fallback plans manual review only: no connector, no execution template, no preview/execution flags, no Guided Action session, and `executable=false`.
- Kept informational/status prompts chat-only and kept supported MikroTik/Cisco/FortiGate/Linux catalog actions on the existing executable ActionPlan path.
- Added regression coverage that the chat service creates review-only custom ActionPlans while the resolver still avoids fake executable catalog matches.
- Validation: backend build, targeted AI routing/context tests, frontend build, i18n, UTF-8, workflow, and diff check passed. Full backend suite was attempted with an isolated test URL but failed because `firewall_log_analyzer_test` is not present and several older unrelated source-contract tests fail.

## 2026-07-19 - AI Assistant selected-vendor ActionPlan coverage follow-up

- Root cause: the previous fallback still depended on a short operational-verb list and only covered the chat service, so selected-device overview prompts and `/commands/ai-propose` could still return the old "not ready" shape.
- Added a resolver-level default read-only target action for selected-device overview/status/health requests. It picks only read-only supported actions with connector and execution-template metadata from the selected device's supported action list.
- Broadened chat fallback matching to device planning signals such as router/device/status/health/about, so device-scoped unmatched requests create a review-only `custom_vendor_action` ActionPlan.
- Added the same review-only custom ActionPlan creation to `/api/commands/ai-propose` after executable catalog matching fails.
- Preserved controlled execution: custom AI proposals are Action Center records for review, but cannot preview/execute until a verified backend template/connector contract exists. Existing supported vendor actions still execute through the normal ActionPlan, PolicyGuard, connector, and audit path.
- Added regression coverage for MikroTik overview -> `mikrotik_daily_check`, selected-device default read-only mapping, and command-catalog custom ActionPlan fallback.
- Validation: backend build, command catalog validation, targeted AI routing/context tests, frontend build, i18n, UTF-8, workflow, and diff check passed. Full backend suite was attempted and failed only in the known environment/unrelated areas: 235/301 passed, 66 failed because the isolated test database is absent plus older source-contract tests.

## 2026-07-19 - AI Assistant arbitrary selected-device ActionPlans

- Root cause: the widened fallback was still gated by prompt wording. A selected device was present, but arbitrary Persian text without the expected signal terms bypassed review-only ActionPlan creation.
- Removed the prompt-text signal gate from chat fallback. After selected-device catalog matching fails, the Assistant now creates a review-only `custom_vendor_action` ActionPlan for the selected vendor as long as resolver-required fields are complete.
- Kept the execution boundary intact: fallback plans have no connector, no execution template, no Guided Action session, and cannot be previewed/executed as raw AI output. Supported catalog matches still use the existing ActionPlan, approval, PolicyGuard, connector, and audit pipeline.
- Added regression coverage for the screenshot-style MikroTik prompt `کار هامو نشون بده` and updated source-contract coverage for unconditional selected-device fallback.
- Validation: targeted AI routing/context tests (24/24), backend build, command catalog validation (191 items), frontend build, i18n, UTF-8, workflow, and diff check passed.
- Full backend `npm test` was attempted and stopped at `TEST_DATABASE_URL_REQUIRED`; the project safety guard prevented using the local development database.

## 2026-07-19 - AI Assistant read-only/mutating catalog routing

- Root cause: target-catalog scoring did not separate read-only questions from mutating requests. A Cisco VLAN count/list question could be interpreted as the multi-step `create-vlan` operation, and a cross-vendor "create" phrase could score unrelated mutating actions on the selected target.
- Added read-only/mutating intent gates in the shared resolver, removed generic verbs from action-token scoring, required domain/title/alias evidence, and normalized Persian VLAN spellings to the same `vlan` token.
- Added regression coverage for Cisco `چند تا vlan دارم` and `چن تا ویلن دارم`, both resolving to `cisco.show-vlan-brief`, plus the existing Cisco create VLAN and MikroTik cross-vendor safeguards.
- Updated Action Center presentation so metadata-backed Cisco operation titles are shown instead of the generic wrapper action type.
- Validation: targeted AI routing/context tests (27/27), backend build, command catalog validation (191 items), frontend build, i18n, UTF-8, workflow, and diff check passed. Full backend `npm test` stopped at `TEST_DATABASE_URL_REQUIRED`.

## 2026-07-19 - AI Assistant custom ActionPlan proposal scoring repair

- Root cause: after the custom ActionPlan fallback was added, target-catalog scoring could still treat weak overlap as a supported action match. Cisco generic wrappers were especially vulnerable because `generic_security_action` leaked `security` into match evidence.
- Fixed the shared resolver to normalize separators in action ids/types, ignore generic wrapper action types as evidence, require exact phrase evidence or stronger lexical evidence, and keep selected-device scoped supported actions as the only match source.
- Added regression tests for three unprepared prompts each on Cisco, MikroTik, FortiGate, and Linux; all must stay custom/manual with `catalogCommandId=null`.
- Enriched chat-created custom ActionPlans with AI proposal details in parameters and metadata while preserving the existing Action Center, approval, PolicyGuard, connector, and audit pipeline.
- Validation: targeted AI routing/context tests (31/31), backend build, command catalog validation, frontend build, i18n, UTF-8, and workflow checks passed. Full backend suite still requires an existing isolated test database.

## 2026-08-24 - Explicit AI Assistant modes and parameterized Action Center workflow

- Replaced the three-way Auto/Chat/Action selector with explicit Chat and Action modes.
- Made Chat a hard no-planning path while retaining selected-device context for normal conversation.
- Made Action require a target and hand parameterized draft plans to a sequential Action Center parameter workspace; parameterless operations continue directly to preview/review.
- Added server-side inferred missing-field schemas, safe custom-plan rebuilding, and a controlled Linux create-user plan with username collection and verification.
- Preserved the product execution boundary: no raw AI command execution, no connector invocation before explicit user confirmation, and unsupported operations remain non-executable until registered.
- Passed 37 focused tests, builds, catalog/i18n/UTF-8/lint checks, real OpenRouter probe, Docker runtime smoke, route/health checks, and bounded API/web image replacement.

## 2026-08-24 - AI Assistant conversation-first visual redesign

- Removed the duplicated page hero and reorganized the assistant around the chat canvas rather than operational diagnostics.
- Added a compact, responsive Chat/Action and device toolbar, friendly mode-specific examples, improved RTL message bubbles, multiline input, visible selected-device context, and concise controlled-execution status.
- Moved advanced analysis, security summary, provider metadata, safety detail, and technical ActionPlan data behind progressive-disclosure sections.
- Kept Action parameter collection and Action Center review routes unchanged; this task made no backend or execution-policy changes.
- Passed targeted ESLint, TypeScript, the production frontend build, locale/UTF-8 guards, Docker health and route checks. Deployment replaced only the superseded `firewall-web` image.

## 2026-08-25 - Executable AI ActionPlans across vendor connectors

- Fixed the root routing defect that sent unmatched Action-mode requests directly to `manualReview` without invoking the AI provider.
- General/custom intents can now become `custom_vendor_action` plans backed by the selected Linux, MikroTik, FortiGate, or Cisco SSH connector and registered custom execution template.
- Added creation-time backend Policy validation, normalized connector metadata, fail-closed handling for unsafe/ambiguous commands, and removal of review-only fallback ActionPlans from both Assistant and command-proposal routes.
- Fixed parameter correction so completed custom drafts refresh commands, verification, normalized parameters, support state, and executability before preview.
- Fixed the Action Center frontend guard that previously blocked all custom action types even when their connector contract was verified.
- Added regression coverage for cross-vendor validation, read-only Linux status, unknown-request fail-closed behavior, AI route contracts, and Action Center executable/incomplete UI states.
- Passed 53 focused tests, backend/frontend builds, catalog validation, healthy Docker deployments, and bounded old-image cleanup. Full DB tests require an explicit safe `TEST_DATABASE_URL`; real-provider probing was skipped after the security reviewer rejected a credential-bearing `0.0.0.0` host proxy.

## 2026-08-25 - Action execution result UX

- Rebuilt `/actions/:actionId/result` as a concise, output-first execution report.
- Added normalized rendering for connector `commands[]` plus legacy direct output, with independent stdout/stderr panels, exit status, empty-output handling, and clipboard support.
- Moved secondary execution metadata behind progressive disclosure and removed the always-visible empty structured-output message.
- Updated result-view contracts and the generic formatter so successful executions do not show a redundant next-step warning.
- Passed the frontend build, targeted lint, UTF-8 validation, focused UI contract and output-normalization tests; deployed a healthy Docker web image with bounded old-image cleanup.

## 2026-08-25 - Action result post-interruption verification

- Re-ran the result-page acceptance path after connectivity was restored, including an isolated PostgreSQL fixture and fake Linux connector execution that invoked the connector once and persisted real stdout.
- Hardened responsive containment for the standalone result shell and long command/stdout/stderr content.
- Verified the rendered interface with Chrome device emulation at phone, tablet, and desktop widths; all application elements remained inside the viewport.
- Rebuilt and health-checked the Docker web service. `/firewall/`, the result deep-link, and `/firewall-api/health` returned HTTP 200, and only the current project web image remains tagged.

## 2026-08-26 - Unified attacker intelligence and Integrations replacement

- Deleted the Integrations page/routes/navigation group and registered `/attackers` as a fully implemented product-state feature.
- Added `/api/security/attackers` and `/api/security/attackers/:ip` plus a cross-vendor aggregation service backed by valid open Findings and normalized SecurityEvents.
- Added honest local-only enrichment, deterministic scoring, affected asset/device/vendor coverage, MITRE/activity facts, and redacted evidence without inventing Geo/ASN data.
- Built a compact responsive Persian-first workspace with search/vendor/severity/scope filters, three key metrics, review cards, detailed evidence, and a useful empty state linking to Findings.
- Added source-contract and database-backed API regression tests. The isolated real-data test created Linux and MikroTik devices/assets/findings/events, proved cross-vendor aggregation and private/public classification, rejected a log-only IP, verified filtering/details/404, and proved secret redaction before cleaning the exact temporary database and test image.
- Validation: backend build, frontend build, targeted ESLint, UTF-8 guard, i18n checks, 9 focused product/API tests, frontend smoke (6 routes), deployed HTTP 200 page, authenticated API guard 401, healthy Docker API/web, and bounded old-image cleanup.

## 2026-08-27 - Apply bundled Persian font across the application

- Registered the local IRANYekan Farsi-numeral font with `@font-face` and applied it consistently to the app root and all interactive controls.
- Preserved monospace typography only for command/log/code surfaces.
- Passed frontend ESLint/TypeScript and production build. Deployed with `scripts/deploy/rebuild-firewall-web.ps1`; the container became healthy and live page/CSS/font probes all returned HTTP 200.

## 2026-08-30 - Replace placeholder settings with managed user access

- Replaced the unused settings experience with two focused tabs: admin-only user/access management and personal account security.
- Added persisted section grants, admin user-management APIs, audit records, password-policy checks, session revocation after access changes, and last-admin/self-lockout protections.
- Added central API section enforcement, filtered product navigation, direct-route frontend guards, role presets, searchable account rows, responsive access cards, and password-reset/account-status controls.
- Redesigned the sidebar with per-section color identities, minimal motion, a clearer active state, a profile footer, a correct compact mode, and reduced-motion compliance.
- Validation: backend TypeScript build, frontend ESLint and production build, 5/5 focused access tests, Prisma migration status, read-only live service smoke, healthy API/web containers, HTTP 200 health/settings probes, and HTTP 401 for unauthenticated `/admin/users`.

## 2026-08-30 - Allow six-character initial account passwords

- Lowered only the managed-account create/reset and login minimum to six characters; personal self-service password changes remain at twelve characters.
- Updated the settings form constraints and Persian/English validation copy to match the backend contract.

## 2026-08-30 - Restrict session termination to administrators

- Added an admin-only permission for session listing, single-session revocation, and logout-all while preserving normal logout and password changes for all roles.
- Gated the API read route explicitly and removed session controls from non-admin settings UI.

## 2026-08-30 - Add vendor-scoped trusted source IPs

- Added persisted admin-managed IP allowlisting to the attacker workspace with exact address validation, vendor scope, labels, responsive controls, audit logging, and mutation authorization.
- Open matching Findings are suppressed at creation time, and attacker aggregation filters both Findings and supporting events through the same exact IP/vendor matcher to prevent authorized SSH clients from being shown as attackers.
- Validation: Prisma client generation, backend TypeScript build, frontend production build, targeted ESLint, and 2/2 focused source-contract tests.

## 2026-08-30 - Make detection monitoring event-driven and load-bounded

- Replaced page-triggered global scans with event-triggered, per-device debouncing and a bounded two-worker dispatcher. Detection uses only the active rules' maximum time window and the monitor fallback selects changed device IDs from an incremental cursor.
- Added persisted adaptive collector counters, exponential quiet/error backoff, stable jitter, single-cycle protection, and recent-dispatch deduplication. Email retries remain part of every monitor cycle.
- Validation: Prisma generation, backend/frontend TypeScript builds, targeted ESLint, and 2/2 focused adaptive-scheduling and architecture tests.

## 2026-08-30 - Replace the application top bar with operational context

- Removed non-functional search/notification controls and consolidated duplicate account controls into a compact progressive-disclosure menu.
- Added current workspace identity, a small backend health signal, selected-device navigation, a primary New Action shortcut, language switching, settings, and logout with responsive icon-first layouts.
- Validation: frontend production build, targeted AppShell ESLint, and focused top-bar source contract.
# 2026-08-30 — Android v1.0.0 foundation

- Kept the existing Capacitor/React codebase and implemented the missing production boundary: selectable Backend URL, readiness verification, native Bearer sessions in Secure Storage, session revocation compatibility, and safe server switching.
- Preserved browser Cookie/CSRF behavior and all authorization/PolicyGuard rules. Added a fixed Capacitor origin to CORS without weakening configured browser origins.
- Separated Android network policies: HTTPS-only main/release configuration and local HTTP only in Debug. Added versioned APK build automation plus architecture and end-user installation documentation.
- Validation: frontend production build, backend TypeScript build, focused Android session/security tests (2/2), Gradle Debug/Release unit tests, package/manifest processing, and `assembleDebug` passed. The generated v1.0.0 debug APK is v2-signed, targets SDK 36, supports min SDK 24, and has SHA-256 `90274E6091843DC8745D3988C04D15E323EC8819E17B017FF59BADDB3746C92D`.

## 2026-08-31 - Repair Android navigation, content, and login viewport

- Replaced per-module build-time API URLs with the native-aware central API URL across 23 frontend clients. This fixes empty product navigation and missing data after a successful Android login.
- Hardened the mobile drawer against persisted collapsed desktop state, restored nested links while open, closed the account overlay before navigation, and constrained the account sheet to the phone viewport.
- Removed the Android WebView autofill overpaint trigger, disabled native autofocus, constrained login flex inputs, and accepted the server-supported six-character login password.
- Released Android `1.0.1` (`versionCode 10001`). Frontend build, targeted ESLint, 4/4 focused tests, Gradle Debug/Release tests, and `assembleDebug` passed; APK SHA-256 is `369D453FC50F5BFC18D308BBD9781485132ED1315F0423E53CFFA76722803E63`.
## 2026-08-31 - Repair multi-turn Assistant chat

- Fixed the Chat mode's one-shot behavior by forwarding a sanitized 12-turn conversation window and the current selected-vendor context to the AI provider.
- Added a dedicated chat-only system contract for natural Persian follow-ups and an explicit prohibition on ActionIntent/ActionPlan creation in Chat mode; Action mode behavior was preserved.
- Made the offline fallback return vendor-aware conversational responses and made the UI auto-scroll to the latest reply.
- Added `task37-assistant-conversation-mode.test.ts` and updated the existing routing contract for the stateful provider request.
- Rebuilt and health-checked `firewall-api` and `firewall-web`; both local endpoints returned HTTP 200. External OpenRouter smoke was skipped to avoid unapproved disclosure of device context.
## 2026-08-31 - Redesign dashboard with restrained network-defense motion

- Added `NetworkDefenseMotion`, a responsive router-to-firewall-to-server visualization with slow allowed-packet flow, blocked-threat signals, live status tone, and real dashboard counts.
- Added a dedicated dashboard stylesheet with compact cards, responsive two-column information hierarchy, subtle motion, and a complete reduced-motion fallback.
- Reduced the primary dashboard to four KPIs, combined priority and recent activity into one scan-friendly row, and limited Linux charts to the three devices needing the most attention while preserving navigation to the full fleet.
- Added `task38-dashboard-motion-ux.test.ts`; frontend build, TypeScript, targeted lint, UTF-8, and the focused tests passed.
- Rebuilt and deployed the web container, verified all four Docker services healthy, checked the live dashboard route and hashed motion assets over Nginx, and passed the six-route production smoke test. Backend compilation also passed; the protected full suite was not run without its isolated test database identity.

## 2026-08-31 - Require real AI responses in Assistant Chat

- Diagnosed repeated Chat replies as the deterministic offline fallback being shown after the host OpenRouter proxy disappeared during a Docker restart.
- Added automatic direct-HTTPS failover when the optional proxy transport is unavailable, and made Chat reject missing/failed live providers instead of returning a canned answer. Action mode behavior remains unchanged.
- Removed a conflicting JSON-analysis instruction from Chat prompts, kept vendor/device context and bounded history, slightly increased conversational temperature, and made provider failure visible in the UI.
- Split provider readiness into configured/live/unavailable states and made live Chat rate-limit errors explicit without synthetic replies.
- Passed 24 focused tests, backend/frontend builds and lint, deployed healthy API/web images, and verified a real sanitized multi-turn OpenRouter response with `fallbackUsed=false`, including while the proxy was intentionally offline.

## 2026-09-01 - Scope Assistant sessions and intents to their owner

- Confirmed and fixed an authenticated insecure-direct-object-reference path across Assistant sessions and their action intents.
- Bound session creation/reuse and every session/intent read or mutation to `request.authUser.id`; unauthorized IDs now behave as missing.
- Added `ai-session-ownership-security.test.ts`; all 3 focused contracts and the backend TypeScript build passed.

## 2026-09-01 - Clear known production dependency advisories

- Upgraded patched frontend and backend direct dependencies and added narrowly scoped package-manager overrides for vulnerable transitive packages.
- Migrated the Vite config to its current ESM API and removed an unused duplicate React transform plugin.
- Reduced the root production audit from 30 findings and the backend production audit from 15 findings to zero known vulnerabilities.
- Validation: root and backend production audits, Prisma generation, frontend/backend builds, and focused security contracts passed.

## 2026-09-01 - Block Nmap DNS rebinding and reserved targets

- Added comprehensive reserved-address classification for IPv4, IPv6, and IPv4-mapped IPv6 diagnostic targets.
- Resolved domain scan targets before worker launch, rejected any answer set containing a private/reserved address, and passed only the pinned verified public address to Nmap.
- Added regression coverage for mapped loopback, documentation networks, public DNS pinning, private DNS answers, and mixed DNS answers; refreshed the stale Dashboard navigation assertion to match the current simplified dashboard.
- Validation: backend build and the complete isolated Task 20 diagnostics suite passed.

## 2026-09-01 - Keep Android tabs visible and stop login keyboard jumps

- Added an authorization-aware local navigation fallback so temporary product-state/API failures cannot blank the drawer or bottom tabs.
- Made the mobile bottom navigation explicitly five-column and retained server navigation as the authoritative enhanced contract once it loads.
- Added native-only login viewport stabilization and Android `adjustResize`, avoiding card re-centering and expensive background movement while the keyboard opens.
- Bumped the Android debug package to 1.0.2 and produced the verified APK with SHA-256 `18728497D8A5F4BF1C232C0A32D5A498819D19D81031D06050560C7F9B5A213A`.
- Validation: frontend lint/build, 6 focused mobile contracts, Gradle Debug/Release tests, Capacitor sync, and Debug APK assembly passed.

## 2026-09-04 - Add graphical vendor port topology

- Promoted `assets.topology` from planned to implemented and added it to the Assets navigation as `Ports & connections`.
- Added read-only topology/discovery APIs and audited, `devices.manage`-protected manual override APIs without introducing a schema migration; existing `Asset`/`AssetInterface` records are reused.
- Added bounded interface inference for stored Linux, MikroTik, FortiGate, and Cisco inventory plus LLDP/CDP/neighbor-shaped evidence. Manual overrides survive rediscovery and internal editor user IDs are not returned to clients.
- Built a code-native 3D faceplate and port editor with vendor color profiles, accurate discovered port names, clearly inferred placeholders, peer/status summaries, responsive layouts, and reduced-motion fallback.
- Validation: backend build, frontend targeted lint, TypeScript and production build, and focused Task 39 tests (6/6).

## 2026-09-04 - Add inspectable service ports to topology

- Added clickable, graphically distinct service endpoints alongside physical ports, including Linux listening address/process evidence, RouterOS management services, FortiGate policy-service objects, and bounded explicit-port fallback for other vendor inventories.
- Added audited and `devices.manage`-protected service correction APIs. Overrides live in existing asset metadata, preserve discovered evidence, accept operator notes, support manual entries, and can be removed without changing the actual device configuration.
- Added a visible-tab-only refresh strategy: lightweight stored-data reads every 45 seconds and a live check only for the currently selected Linux device every 120 seconds. Parsing and rendering are capped at 256 endpoints.
- Validation: backend TypeScript build, frontend lint/TypeScript and UTF-8 checks, and Task 39 contracts (9/9), including vendor semantics and bounded performance.
- Repaired the direct-link Nginx boundary for `/firewall/assets/topology`, which otherwise collided with Vite's `/firewall/assets/` bundle namespace.

## 2026-09-04 - Remove duplicate service-port cards

- Canonicalized service endpoint identity to protocol and port, merging duplicate IPv4/IPv6 and repeated discovery evidence in linear time.
- Preserved each unique bind address/process/source in an inspectable binding list and added a compact binding count to the graphical card.
- Kept TCP and UDP endpoints distinct, retained manual correction compatibility, and added a regression test for dual-stack port 80 plus protocol-separated port 53.
- Validation: backend build, root TypeScript, targeted frontend lint, diff check, and Task 39 contracts (10/10).

## 2026-09-04 - Reduce false attacker classifications and improve vendor tracking

- Traced the live `alireza` report to source-IP findings, not username classification: `5.115.146.191` had normal successful `alireza` sessions plus failed `root` attempts, while duplicate collector formats inflated the raw count.
- Added logical authentication-attempt deduplication across Linux, MikroTik, FortiGate, Cisco, and pfSense rules and stopped new-source success anomalies from independently qualifying an IP as an attacker.
- Added an explainable assessment block and renamed the workspace to suspicious sources, making the human-review boundary and evidence counts explicit.
- Expanded vendor coverage from five to six rules each with bounded, high-signal reconnaissance/IDS patterns.
- Reworked detection and attacker aggregation hot paths to use vendor/IP buckets and preloaded device/asset maps rather than repeated full scans and N+1 lookups.
- Validation: backend/frontend builds and targeted lint passed; all 16 focused security tests passed after aligning the legacy scheduling fixture with adaptive jitter/backoff behavior.

## 2026-09-05 - Create customer-facing Persian PDF

- Produced an eight-page A4 Persian brochure that explains the product for non-technical customers and presents the currently implemented capabilities without unsupported claims.
- Covered the operational value, five-vendor monitoring, thirty base vendor rules, findings/evidence, resilient email delivery, suspicious-source review, port topology, AI conversation/action separation, controlled execution, RBAC/audit, Android access, and rollout prerequisites.
- Included honest boundaries for device-specific support, log quality, optional Gmail/AI configuration, and the need for human review.
- Delivered editable HTML plus a 2.02 MB PDF with an embedded Persian font; all eight pages passed visual layout review.

## 2026-09-05 - Restyle Assistant chat from supplied template

- Replaced the busy avatar-and-metadata message rows with spacious alternating blue user and violet assistant cards matching the supplied visual direction.
- Preserved conversation semantics, timestamps for assistive/hover access, multiline wrapping, and long-message expansion without changing AI requests or controlled ActionPlan behavior.
- Added responsive logical alignment so Persian and English layouts remain natural while phone bubbles expand to 92% of the available width.
- Validation: TypeScript, targeted ESLint, UTF-8 guard, production frontend build, diff check, 2 focused source contracts, healthy Docker web deployment, and HTTP 200 Assistant/API probes passed.

## 2026-09-05 - Make Assistant assessment accurate and explainable

- Scoped Full Analysis to the active device end to end and reset stale reports whenever the selected target changes.
- Restricted incident risk inputs to recent unresolved records, capped each score component, separated ordinary sensitive-port traffic from correlated security findings, and exposed a transparent score breakdown.
- Added bounded connector reads, fresh/error snapshot filtering, deduplication, coverage percentage, and confidence labels.
- Bound Hardening Suggestions to the exact assessment ID and removed automatic IP-block/custom-execution suggestions that lacked confirmed evidence or a registered catalog action.
- Added a dedicated structured report component with device/vendor tabs, collected-versus-missing evidence, ordered findings, explainable recommendations, and clear manual/ActionPlan states.
- Passed 22 focused backend/UI/API contracts, backend and frontend builds, ESLint, and UTF-8 validation. Full-suite unrelated legacy source assertions remain outside this task's staged scope.
## 2026-09-06 - Create product valuation and revenue report

- Researched current official pricing for Wazuh Cloud, Datadog Cloud SIEM, Elastic Security, PRTG, Domotz, PagerDuty, Tines, and OpenAI API usage, plus U.S. BLS analyst compensation and a private-SaaS ARR-multiple benchmark.
- Built a transparent economic model with a $191,095 loaded annual SOC-analyst benchmark, FTE-capacity sensitivity, module-level value allocation, recommended Starter/Growth/Enterprise pricing, ROI scenarios, and three customer-count/ARR cases.
- Added explicit non-equivalence, no-double-counting, no-guaranteed-headcount, no-guaranteed-revenue, and pre-ARR valuation limitations.
- Delivered an 11-page Persian PDF, editable HTML, calculation CSV, and internal research ledger; visually reviewed every page.

## 2026-09-06 - Manage ports directly from the graphical topology

- Added same-page interface enable/disable, address, and description controls backed by controlled Cisco/FortiGate/MikroTik execution paths; no Action Center navigation is required.
- Added inline preview, one user confirmation, connector-result enforcement, audit retention, semantic read-back, and automatic rediscovery after a successful change.
- Added Linux firewall allow/deny controls for discovered service ports and MikroTik management-service toggles while clearly separating listener state from firewall reachability.
- Preserved Linux interface IP evidence and prevented manual inventory status from being presented as live device status.
- Registered the missing MikroTik interface/service templates and FortiGate interface alias/read-back verification. Vendor profiles without a verified write connector stay inventory-only.
- Validation: Task 39 topology contracts 14/14, isolated FortiGate/MikroTik contracts 17/17, command catalog 197/197, backend/frontend builds, targeted ESLint, and UTF-8 checks passed.
- Deployed project-scoped API/web images and confirmed all four Docker services healthy, topology and health routes HTTP 200, and the private topology endpoint HTTP 401 without authentication.

## 2026-09-06 - Refresh Linux ports from authoritative live state

- Added a lightweight selected-device Linux refresh endpoint protected by `devices.manage`; it persists a sanitized collection timestamp/source and writes an audit record without triggering a multi-device scan.
- Made fresh live listener output replace stale snapshot listeners and added regressions proving that a closed port is not merged back from older telemetry.
- Collected active UFW/firewalld/nftables/iptables allow rules alongside `ss` listeners, preserving the semantic difference between an allowed firewall port and a process that is actually listening.
- Updated the topology UI to refresh immediately, every 60 seconds while visible, and on tab focus, with a no-overlap guard and an in-progress state.
- Verified the deployed path against the registered Linux device. The current server response still contains TCP/8080 bound to `127.0.0.1`, so its card is correct until the owning process stops listening; firewall closure alone does not remove a listener.
- Validation: 17/17 focused tests, backend build, frontend targeted lint/build, API/web image rebuilds, and Docker health checks passed.

## 2026-09-08 - Remove the shared decorative motion bar

- Removed `SectionMotion` from `AppShell`, which removes the supplied router/shield/server bar from every shell-backed page in one place.
- Deleted the now-unused component and CSS animation bundle; page-local motion and functional status visuals remain unchanged.
- Replaced the old motion-presence tests with regression checks for a clean single content region and absence of the global rail files/hooks.
- Validation: focused contracts 2/2, targeted frontend lint, source reference scan, and production frontend build passed.

## 2026-09-08 - Repair MikroTik topology discovery path

- Added bounded MikroTik SSH-port recovery for configured-port drift, with authenticated RouterOS discovery required before persisting the recovered port.
- Added sanitized connection failure reasons to topology discovery and actionable Persian/English UI messages for credential, authentication, and TCP path failures.
- Live diagnosis found `m` configured on unreachable port `4432`; port `2222` reaches SSH but the device's assigned credential is rejected. The code does not silently substitute another device's credential or claim discovery success.
- Validation: 29 focused MikroTik/topology tests, backend build, frontend targeted lint/build, and deployed API diagnosis passed.

## 2026-09-08 - Add controlled device power actions to topology

- Added same-page, admin-only device power controls with preview, explicit confirmation, connector-result enforcement, and audit logging.
- Added executable Linux reboot/shutdown, MikroTik reboot/shutdown, FortiGate reboot/shutdown, and Cisco delayed reload contracts. Interactive FortiOS `y/n` and Cisco `[confirm]` prompts are handled by registered connectors.
- Used delayed dispatch for Linux and Cisco so the action result can be recorded before the management connection drops; MikroTik/FortiGate accept only the expected clean SSH disconnect as successful dispatch.
- Did not expose fake actions for platforms without a verified connector or reliable command; Cisco shutdown and all pfSense/generic power controls remain unavailable.
- Validation: focused topology/power tests 22/22, related connector/execution tests 37/37, catalog 203/203, backend/frontend builds, and targeted frontend lint passed. Real power commands were intentionally not executed against registered devices.

## 2026-09-08 - Replace placeholder vendor panels with connector evidence

- Fixed verified onboarding so Linux, MikroTik, and FortiGate live discovery survives registration in the established per-vendor status cache.
- Rebuilt the workspace projection around successful connector evidence and removed action-history inference and no-data vendor rows.
- Hid optional identity, interface, health, capability, and raw diagnostic content when the underlying collection is absent; added a same-page live refresh for supported non-Cisco connectors.
- Added focused projection coverage for successful/stale MikroTik data and sparse FortiGate data.

## 2026-09-08 - Make Cisco registration resilient and explicit

- Added deterministic collision-free naming for newly entered credentials while keeping the encrypted secret and selected credential reference behavior unchanged.
- Added a domain error for Prisma `P2002` name conflicts and returned structured, sanitized 409/400 responses instead of raw database diagnostics.
- Removed the misleading implicit Linux choice on generic registration: the operator must click Linux, Cisco, FortiGate, or MikroTik before continuing.

## 2026-09-08 - Repair direct asset workspace navigation

- Added an extensionless-path SPA boundary ahead of the shared Vite asset namespace and removed the `^~` precedence that prevented application-route matching.
- Added regression coverage proving application routes and fingerprinted static assets keep separate handling.

## 2026-09-08 - Make legacy Cisco registration recoverable

- Diagnosed the supplied Cisco endpoint at the SSH negotiation layer without authenticating or running commands; its offer matches the existing explicit compatibility profile.
- Surfaced the per-device Cisco compatibility switch and added a one-click retry from the negotiation error instead of leaving the operator with a generic failure.
- Kept the modern-first and explicit-downgrade boundary intact; 8 focused tests plus frontend TypeScript/lint passed.
## 2026-09-08 - Add secure credential lifecycle management

- Added an admin credential workspace for encrypted reference creation, metadata editing, secret/key rotation, usage visibility, and explicit deletion.
- Kept stored secrets write-only: update forms do not fetch or reveal existing passwords, private keys, or passphrases.
- Guarded deletion of assigned credentials and detached primary/Cisco enable references transactionally after an explicit force confirmation.
- Linked device onboarding to the credential workspace and added focused regression coverage.
## 2026-09-08 - Simplify device registration and editing

- Added a compact device/target context bar and fast navigation to identity and connection steps.
- Added edit-specific copy and save actions, automatic new-credential mode for empty stores, and responsive mobile layout.
- Prevented stale connection verification from remaining visible after connection-affecting fields change.

## 2026-09-08 - Cisco live inventory refresh and status repair

- Traced the apparent Cisco failure to an old failed `DeviceStatusCheck` overriding newer successful connector evidence; the device had already collected valid IOS identity and interface inventory.
- Added an actual Cisco SSH2 read-only capability refresh, structured/sanitized failure responses, current success/failure status checks, richer cached facts, and a direct refresh control in the device workspace.
- Removed raw Cisco CLI persistence from new onboarding/refresh evidence by applying connector redaction before storage.
- Verified against the registered switch without printing credentials or raw CLI: collection completed in about 8.5 seconds with 54 interfaces and 5 VLANs, and the workspace now reports `online/verified` with collected inventory.

## 2026-09-08 - Canonical Cisco topology and interface states

- Replaced recursive Cisco capability scanning with explicit parsing of the normalized IOS interface tables.
- Added canonical Cisco interface naming, complementary row merging, parser coverage for description/VLAN/duplex/speed, and separate operational/admin status semantics.
- Batched topology persistence and removed stale inferred records while preserving operator overrides.
- Added a user-friendly Cisco inventory summary and interface table, including direct access to the graphical faceplate.
- Passed backend build, frontend production build, 18 topology tests, 8 Cisco connector/parser tests, Docker health checks, and a sanitized live-switch rediscovery.

## 2026-09-09 - Add scheduled vendor tasks and execution history

- Added durable Prisma models and a production migration for scheduled tasks, individual run records, calendar choice, local date/time metadata, ownership, confirmation evidence, status, and linked ActionPlans.
- Added authenticated CRUD/control APIs, section and mutation permission policies, a bounded background worker, crash recovery, duplicate-run prevention, owner/role revalidation, and sanitized failure history.
- Reused the existing catalog-first controlled execution path rather than accepting shell input: a due task creates a fresh ActionPlan and only reports success after real connector verification.
- Added a lazy-loaded responsive Persian workspace with device/action selectors, dynamic catalog parameters, Jalali/Gregorian input, dual-date display, pause/resume/run-now/cancel controls, status counters, and execution history links.
- Tested the persisted lifecycle against the isolated PostgreSQL test database (5/5), validated Prisma and all 203 catalog commands, passed backend/frontend production builds, deployed both project Docker images, and confirmed the migration plus scheduler worker in the live container.

## 2026-09-09 - Restrict schedules to meaningful vendor changes

- Removed observation-only commands from scheduled-task selection and grouped the verified mutating catalog actions by operational purpose.
- Enforced the effectful-only rule in creation, due/manual execution, and worker startup so direct API calls or old schedules cannot bypass it.
- Added a Persian, 24-hour hour/minute picker plus 24-hour Jalali/Gregorian summaries without AM/PM.
- Added regression coverage for UI filtering, all four write-enabled vendors, API rejection of a read-only Linux command, and the existing controlled lifecycle.

## 2026-09-09 - Refine scheduler time entry and scrolling

- Replaced browser-native time option lists with inline Persian numeric hour/minute fields and removed the always-visible confirmation row.
- Preserved the execution safety boundary through one concise final-action confirmation before the confirmed schedule request is sent.
- Made upcoming tasks, history, and archived entries share one bounded internal scroll area while keeping the tab controls fixed.
- Prevented the application sidebar from exposing a second browser-native scrollbar and applied consistent lightweight scrollbar styling globally.
- Passed targeted ESLint, production frontend/backend builds, all 7 isolated scheduler tests, and deployed a healthy web image with HTTP 200 page/health smoke checks.

## 2026-09-12 - Requested Sophos internet accounts and usage-report handoff

- Created 11/11 requested local internet users using the authenticated Sophos administration form, with native input/change events, submitted saves, and real user-table verification for each record.
- Assigned User type, Open Group, and the supplied shared email; disabled IPsec, L2TP, and PPTP access. Verified the representative saved account's email, type, group and disabled VPN settings.
- Preserved existing user accounts, authentication-required internet enforcement and accounting behavior. Sophos normalizes login IDs to lowercase; supplied password capitalization was retained in memory only.
- Opened the actual User data transfer report and verified date range generation, uploaded/downloaded/total data and used-time headings, plus CSV/PDF/HTML exports. Usage instructions do not claim historical anonymous traffic can be attributed retroactively.
- Removed the temporary credential-free creation harness after completion and restored the pre-existing browser helper. No passwords or account credential lists were recorded in repository artifacts.

## 2026-09-12 - Captive portal sign-out and automatic-discovery follow-up

- Changed and reloaded Sophos web-authentication settings: display web page after login disabled, inactivity logout enabled at 15 minutes, HTTPS preserved.
- Performed a bounded live session test using a random-password non-admin temporary local account and a representative LAN source. Observed LOGIN/redirect before login, LIVE with access after login, then LOGIN and renewed redirect after explicit logout.
- Removed only the newly-created test account, cleared its browser secret, removed the credential-free temporary test harness, and restored the pre-existing browser helper after use.
- Verified redirect responses for Windows and Firefox captive-detection HTTP probes.
- Diagnosed the remaining search-first HTTPS obstacle: Google HTTPS is intercepted to the portal, but normal client certificate validation rejects the untrusted Sophos root. Installing the corresponding signing CA on managed domain endpoints remains necessary; no endpoint/GPO deployment or domain-workstation acceptance test occurred.
- No application code, deployment, MikroTik segmentation policy, or existing real user account changed.

## 2026-09-12 - Live Sophos LAN/transit connectivity repair

- Confirmed Sophos itself could reach the MikroTik transit router and the internet; the LAN failure was not a missing WAN route.
- Confirmed domain DNS forwarding reached the Sophos LAN interface but did not leave WAN under the identity-required internet rule.
- Added `INFRA | Domain DNS outbound`: LAN, domain DNS server only, WAN, DNS service only, accept with traffic logging and no interactive user requirement.
- Added `LAN | Transit router ping`: LAN, transit router only, PING service only, accept with traffic logging. Left the default outbound masquerading and user-authentication rules unchanged.
- Verified bidirectional DNS traffic through Sophos WAN, representative LAN transit ping 3/3, preserved domain DNS, external DNS resolution, automatic HTTP redirect to the LAN captive portal, and local application HTTP 302.
- Preserved the MikroTik direct-LAN-to-WAN drop rule and all unrelated working-tree changes. No domain workstation credential login was tested.

## 2026-09-11 - Revert icon/theme experiment and complete attacker intelligence

- Reverted `feat add soft 3d icon pack and light theme` with a dedicated Git revert, preserving all unrelated working-tree work and restoring the prior UI in the healthy web container.
- Replaced generic FortiGate line parsing with bounded FortiOS key/value normalization, including `remip` handling for SSL-VPN, real interface/target metadata, normalized vendor outcomes, and explicit threat-family event types.
- Extended the curated detector library for FortiGate administrator/VPN failures, IPS/DoS/malware/botnet/WAF signals, local-in probes, and deny bursts; added Linux web-probe and firewall-deny burst coverage without promoting isolated background traffic.
- Tightened attacker qualification so successful logins, configuration/audit events, and Linux session timeouts cannot independently become attackers. Thresholded authentication attempts are logically deduplicated per vendor.
- Added a concise response workflow and vendor-aware threat/containment presentation to the attacker detail panel, with controlled ActionPlan handoff for Linux, MikroTik, and FortiGate.
- Added regression coverage for FortiOS IPS, SSL-VPN, deny, DoS, malware, botnet and WAF normalization; UFW port direction; session-timeout false positives; and Linux/FortiGate response-plan creation.
- Verification: isolated PostgreSQL tests 6/6, backend/frontend builds, catalog 203/203, targeted ESLint, and whitespace checks passed.

## 2026-09-13 - Repair LAN phone registration through Sophos

- Inspected Sophos conntrack and Issabel PJSIP state without persisting raw packet captures or credentials.
- Confirmed the dedicated LAN-to-Issabel firewall objects were valid, then moved the rule ahead of the user-authenticated internet rule so non-interactive phones match it consistently.
- Disabled the conflicting no-SNAT experiment and retained symmetric masquerading through the Sophos transit interface.
- Applied the documented Sophos VoIP stability settings: UDP stream timeout 150 seconds and SIP helper unloaded; removed only matching UDP/5060 conntrack entries so new sessions used the corrected policy.
- Verified the corrected flow as firewall rule ID 5 plus NAT rule ID 2. Multiple endpoints registered immediately, and active contacts stayed reachable after a 75-second observation window that exceeded the former failure interval.
- Turned off temporary PJSIP packet logging and left unrelated firewall, MikroTik, Issabel, and application settings unchanged.

## 2026-09-15 - Add controlled Sophos Firewall support

- Registered a Sophos XML API connector and planner, API-based onboarding, capability/status persistence, vendor workspace projection, and command-catalog routing.
- Implemented read-only discovery for core SFOS network/security objects and normalized interface UP/DOWN plus administrative state for the graphical topology.
- Added six registered Sophos operations: inventory, interface enable/disable, interface IPv4 update, and firewall-rule enable/disable. Mutations include current-state capture and verified readback.
- Validation completed: backend TypeScript build, frontend production build, and command catalog validation for 209 entries.
## 2026-09-16 - Linux SSH onboarding diagnostics repair

- Proved the public SSH endpoint is reachable and negotiates OpenSSH correctly, while both the application password attempt and a non-interactive local-key attempt are rejected at authentication.
- Preserved the Linux connector's stage-level evidence through onboarding failures and returned the specific sanitized code SSH_AUTH_FAILED to the client.
- Rebuilt and health-gated the API container against the existing database volume; the application remains healthy and the remaining operator action is to rotate/re-enter the correct alireza password or an authorized private key.

## 2026-09-16 - Restore latest UI and add the public product landing

- Identified that the running frontend image had been built from the older `track` checkout although the active Compose stack belonged to `track_firewall_log_latest-safe-snapshot`.
- Rebuilt from the latest snapshot, recreated only `firewall-web` under the canonical Compose project, and refreshed `main-nginx`; the current Persian interface replaced the stale English login build.
- Added `/landing` as the only new public route and redirected the base application path to it; `/dashboard` and every operational route remain authenticated.
- Implemented a shorter four-part product story: hero, three current-product views, controlled execution workflow, and team profile. The views mirror current dashboard, ActionPlan, PolicyGuard, connector/audit, and multi-vendor asset concepts without exposing live data.
- Used the supplied team portrait and the application's bundled IRANYekan font. Added responsive design, smooth scroll reveals, pointer glow, and reduced-motion fallback.
- Updated the deployment script to pin Compose project `track_firewall_log`, preventing a source-folder name from creating a separate network during future frontend rebuilds.
- Validation: Docker frontend production build passed; `firewall-web` and `main-nginx` became healthy; local landing and dashboard routes returned HTTP 200. No Docker archive was saved to Desktop.

## 2026-09-16 - Match the live dashboard to the command-center reference

- Kept the real-data dashboard introduced in the first pass and refined its proportions, visual hierarchy, gradients, states, table density, and responsive breakpoints to match the approved reference more closely.
- Added a sticky desktop AI-assistant rail with real `/ai/chat` requests in Chat mode, operational context chips, suggested questions, loading/error states, and a compact message composer.
- Added prefilled handoff into the full assistant while keeping all effectful work behind the existing reviewable ActionPlan and Action Center boundary.
- Kept the operations and Linux sections linked to their real detail pages and retained the 60-second dashboard refresh plus manual collection controls.
- Verified the production TypeScript/Vite build in Docker, targeted ESLint, UTF-8 and i18n checks, then rebuilt only `firewall-web` using the guarded deployment script.
- Confirmed HTTP 200 for `/firewall/dashboard` and `/firewall/api/health`, verified the deployed assistant assets, and confirmed `firewall-web`, `firewall-api`, `firewall-db`, and `main-nginx` are healthy.
## 2026-09-18 - Zero-configuration production Compose

- Replaced the database-only root compose with a complete clone-and-run production deployment.
- Added persistent random secret generation without committing credentials or requiring an .env file.
- Added a non-root API entrypoint that loads file-backed secrets, deploys Prisma migrations, runs the idempotent bootstrap seed, and starts the service.
- Added a Caddy HTTPS gateway that exposes only ports 80/443 while keeping PostgreSQL, API, and web services private.
- Rewrote the Persian quick-start and aligned deployment/environment documentation with docker compose up -d.
- Smoke-tested a clean isolated deployment, HTTPS UI/API routing, redirect behavior, initial administrator login, and authenticated session.

## 2026-09-19 - Add company ownership and tenant-safe asset management

- Introduced `Company` as the ownership boundary between `AppUser` and operational devices/assets, with token-scoped company, device, topology, workspace, onboarding, and asset APIs.
- Added company create/edit/archive/restore flows to the asset screen and company selection to device registration. Company archival and permanent user deletion use dedicated impact dialogs and typed confirmation instead of browser-native confirms.
- Implemented recoverable company deletion and support restoration, plus a deliberately separate admin-only permanent purge. Database cascades remove dependent operational inventory when a company or user is permanently deleted.
- Converted asset identity uniqueness and IP address handling to company scope, allowing separate customers to use the same RFC1918 addresses without overwriting each other's inventory.
- Added legacy backfill in the bootstrap seed and a migration with explicit foreign keys, composite indexes, and cascade rules.
- Verified with production backend/frontend builds, catalog validation (209/209), a clean PostgreSQL migration, and a focused database integration test (1/1) spanning tenancy, soft delete, restore, and both company/user cascades.

## 2026-09-19 - Strengthen vendor connection methods

- Researched vendor-supported SSH/CLI, REST/API, NETCONF/YANG, RESTCONF/YANG, SNMPv3, Syslog, gNMI, and agent approaches and recorded an honest per-vendor connection matrix.
- Added connection-method APIs plus a guided onboarding selector with recommended methods, prerequisites, readiness states, automatic protocol/port mapping, and responsive cards.
- Implemented and registered a read-only MikroTik RouterOS v7 REST connector with timeouts, response bounds, structured errors, stored-credential resolution, safe discovery, and explicit rejection of write operations.
- Tested the live registered MikroTik, Cisco, and Linux devices through the application connector boundary; all three SSH connection/discovery checks succeeded without logging or persisting supplied secrets.
- Built backend and frontend production images, passed the focused registry/connector tests, and kept the active API, web, database, and gateway containers healthy.
