## 2026-09-16 - Real-data security command dashboard

- Rebuilt the authenticated dashboard in the landing showcase visual language while keeping every operational value connected to the existing backend APIs.
- Added live daily-service health, asset/vendor availability, open finding severity, a 24-hour stacked finding trend, real destination-port event counts, prioritized device status, latest findings, controlled-action priorities/history, and real Linux health/resource rings.
- Added explicit empty/error states, manual refresh, 60-second background refresh for non-mutating operational reads, responsive layouts, and reduced-motion behavior. Stale Linux health continues to use the established bounded collection path.
- Preserved controlled execution semantics: the dashboard only links to Action Center and reports existing backend activity; it does not execute AI text or bypass preview, confirmation, PolicyGuard, connectors, or audit.
- Validation passed: Docker production build, targeted dashboard ESLint, UTF-8 scan across 387 files, locale parity across 860 keys, Persian primary-route copy checks, deployed dashboard HTTP 200, API health HTTP 200, and healthy web/API/database/main-Nginx containers.
## 2026-09-16 - Three-dimensional product landing showcase

- Reworked the public Persian landing page around three privacy-safe product views derived from the real application: the unified operations dashboard, controlled Action Center, and monitoring/AI assistant workspace.
- Added responsive perspective, pointer-reactive tilt, layered depth, restrained light reflection, scroll blur-to-clear reveals, and reduced-motion/mobile fallbacks.
- Expanded product copy to accurately describe multi-vendor assets, continuous monitoring, explainable detections, the Persian command catalog, reviewable AI proposals, PolicyGuard, real connector invocation, and audit results.
- The frontend production build passed inside Docker. `firewall-web`, `main-nginx`, `firewall-api`, and `firewall-db` are healthy; `/firewall/landing`, `/firewall/dashboard`, and all three landing image assets return HTTP 200.
## 2026-09-16 - Repair the device-onboarding Continue step

- Fixed a UI/state mismatch on generic device registration: Linux was displayed as the active platform but remained internally unconfirmed, so valid name, address, and port values could not advance to credentials.
- The default Linux vendor is now the real selected radio option from initial load, remains visibly checked, and can still be replaced with Cisco, FortiGate, MikroTik, or Sophos before continuing.
- The frontend production build passed and the updated web container is healthy; both the onboarding route and API readiness endpoint return HTTP 200.

## 2026-09-13 - Sophos per-user reporting verification

- Generated the live Sophos `User app risks & usage` report for 2026-09-12 through 2026-09-13 and expanded it to all available user rows. Confirmed that this view contains materially more traffic than the session-accounting-oriented `User data transfer report`.
- Verified that identified usernames, Active Directory identities, local captive-portal users, and an `Unidentified` bucket are present. The unidentified historical traffic cannot be reassigned to users retroactively.
- Confirmed the complete operator workflow: Applications & web, User app risks & usage, date range, Generate, 200 records, sort by Bytes, then CSV/PDF/HTML. Use User data transfer separately when upload/download split and session duration are required.
- No firewall, authentication, logging, retention, DNS, gateway, account, or policy setting was changed. No report export or raw user-activity log was persisted in the repository.

## 2026-09-12 - Sophos domain certificate trust policy deployed

- Connected to the authorized Windows domain controller through the existing private SSH tunnel and WinRM; no ESXi console or public Windows management exposure was needed.
- Created and linked a separate `IT - Sophos Captive Portal Trust` computer GPO. Apply permission is restricted to the ten discovered Windows workstations; Authenticated Users retains read-only permission, excluding servers and domain controllers from application.
- Distributed public-only Default and SecurityAppliance SSL CA certificate policy blobs; both were read back successfully. A live LAN TLS probe confirmed that HTTPS interception uses the latter CA, not just the Default CA.
- Enabled Firefox Windows enterprise-root integration in the same GPO. Preserved domain DNS, browser certificate validation, default domain policies, firewall identity enforcement and MikroTik bypass prevention.
- Endpoint acceptance remains pending: none of the ten workstation WinRM or RPC endpoints was reachable from the DC. Policy publication and scope are verified, but no workstation application or domain-browser search/login result is claimed. Connected clients can refresh computer policy with `gpupdate /target:computer /force` and reopen their browser.

## 2026-09-12 - Requested Sophos internet accounts and usage-report handoff

- Created all 11 explicitly requested local accounts through Sophos user forms; each creation was verified in the actual user table with User type and Open Group membership.
- Applied the user-supplied shared email and credential instructions without persisting passwords. A representative saved account confirmed the email and disabled IPsec/L2TP/PPTP access; no administrator accounts were created.
- Verified the live reporting path: Reports > Applications & web > Show > User data transfer report, with FROM/TO and Generate, per-user data transfer, uploaded/downloaded data and used time, and CSV/PDF export.
- Removed the credential-free temporary form automation and restored the pre-existing browser helper after use. No application runtime or firewall enforcement policy changed.

## 2026-09-12 - Captive portal sign-out and automatic-discovery follow-up

- Persisted captive-portal behavior that retains its sign-out screen after login, with a 15-minute inactivity logout fallback. HTTPS remains enabled.
- Tested a temporary non-admin account from a representative LAN server: redirect before login, authenticated access after login, successful logout, and redirect again after logout. Removed the temporary account and its in-memory/browser test credential.
- Verified Windows and Firefox HTTP captive-detection requests are redirected. Google HTTPS also receives the portal response when certificate validation is bypassed for diagnosis, but normal validation fails with an untrusted-root error.
- Remaining deployment requirement: distribute the actual Sophos signing CA to domain clients, and verify the affected workstation's browser/network-detection policy. No domain-client trust changes were made or claimed.

## 2026-09-12 - Live Sophos LAN/transit connectivity repair

- Added a narrowly scoped Sophos DNS exception for the domain DNS server; workstation internet authentication remains enforced.
- Added a separate LAN-to-transit-router ICMP echo rule. The existing MikroTik direct-LAN-to-WAN bypass block remains enabled.
- Verified from a representative LAN server: transit-router ping 3/3, internal and external DNS responses, HTTP captive-portal redirect, and the local application login response.
- No workstation domain-user login was performed; that end-to-end acceptance step still requires a domain workstation/user.
- No application code or deployment changed. The pre-existing deleted `CODEX_HANDOFF.md` was not recreated.

## 2026-09-11 - Scheduler form persistence and Action Center queue

- Corrected the Persian 24-hour time field's visual order while retaining RTL labels and summaries.
- Stopped periodic device-list refreshes and time edits from resetting already-entered operation parameters.
- Made the final schedule button the single explicit confirmation: it submits `confirmed=true` directly without a second browser dialog.
- Projected active scheduled tasks into both the Action Center queue and history with the Persian lifecycle state `در انتظار اجرا`, without creating a premature ActionPlan or enabling early execution.
- Validation: backend build, targeted frontend ESLint, and the isolated scheduler lifecycle suite passed 7/7.

## 2026-09-11 - Graphical Cisco asset intelligence workspace

- Replaced the Cisco capability-label-heavy overview with a responsive operational dashboard backed by the latest verified connector collection.
- Added graphical port-state distribution, live device resource meters, identity and hardware inventory, VLANs, routes, ARP/MAC totals, CDP/LLDP neighbors, and security/service coverage.
- Canonicalized abbreviated and expanded Cisco interface names so IP, link, VLAN, speed, duplex, and description evidence appears on one interface row instead of being split.
- Added an explicit live refresh action and an honest empty state when no verified Cisco collection exists.
- Added a bounded backend projection that removes raw CLI, command evidence, and credential-like fields before returning rich vendor details to the browser.
- Validation: backend/frontend production builds, targeted ESLint, diff checks, and 3 focused Cisco asset tests passed; API/web images were health-gated and the deployed asset page plus API health returned HTTP 200.

## Calm, load-bounded motion cadence (2026-09-01)

- Slowed the contextual top rail to 10-18 second primary cycles, halved its moving packet/signal count, moved the scanner to transform/opacity-only animation, and isolated painting with CSS containment.
- Mobile now disables mesh drift, floating signals, and spark effects while preserving the core route animation; `prefers-reduced-motion` still provides the fully static fallback.
- Reduced the dashboard defense scene to two incoming packets, one outgoing packet, one curved packet, and two threats. Scanner, packet, halo, telemetry, and orbit cycles now run roughly two times slower and avoid animated blur, width, and height changes.

## Contextual motion system across product tabs (2026-08-31)

- Added a compact, code-native motion rail to every shell-backed product route. Dashboard, assets, security, monitoring, actions, Assistant, attackers, settings, and tools each use their own color, icon set, and motion language; email alerts, detection rules, findings, onboarding, Linux monitoring, and action details receive more specific scenes.
- Kept the motion purely visual with no captions below its elements, responsive sizing for phone/tablet, and a static `prefers-reduced-motion` fallback.
- Enriched the dashboard network-defense scene with curved packet routes, an ambient scanner, moving path dashes, defense-gate pulses, blocked-threat impacts, and node telemetry while removing the labels/footer beneath the animated nodes.
- Validation passed: TypeScript, targeted ESLint, frontend production build, UTF-8 and i18n checks, 6/6 focused motion tests, six-route frontend smoke, healthy Docker deployment, and HTTP 200 for dashboard, Assistant, and API health.

## Multi-recipient email alerts and explainable delivery history (2026-08-29)

- Email alert settings now support up to ten validated, deduplicated recipients. Existing single-recipient data is migrated automatically, Gmail connection defaults its sender as the first recipient only when the list is empty, and every real detection is delivered and tracked independently per recipient.
- The email workspace now provides an add/remove recipient manager, recipient count, save/test controls for the complete list, and a responsive delivery history with status filters.
- Each history entry exposes the real rule/Finding reason, destination email, vendor, device, event count, attempt count, send time, next retry, and a localized failure explanation. The API returns the stored delivery recipient and enriches recent ledger rows from their Finding and DetectionRule records.
- Transient-failure guarantees remain intact: each recipient gets its own durable fingerprint and queue row, and retries use the originally recorded recipient after connectivity returns.

## Email alerts workspace and complete sidebar collapse (2026-08-29)

- Moved Gmail registration, recipient/severity settings, simple/five-vendor tests, and the persistent delivery ledger out of Detection Rules into the dedicated implemented `/security/email-alerts` route and **Email alerts** security navigation item.
- Simplified the connected state: the App Password form and disabled duplicate fields disappear after verification, leaving a compact sender identity, explicit disconnect, three status summaries, alert settings, test actions, and delivery history.
- Fixed desktop sidebar collapse at its layout root. The shell column now changes from 280px to 76px, labels/children are fully hidden, icons stay centered with titles, the toggle uses directional panel icons, and the preference persists safely in local storage. Mobile drawer behavior remains full-width.
- Validation passed: frontend TypeScript/lint/production build, backend build, command catalog validation (191 items), UTF-8 and locale checks, focused navigation/email/detection tests 13/13, healthy API/web deployments, HTTP 200 for both security routes, and deployed product-navigation verification.

## Durable detection-email queue and five-vendor live delivery (2026-08-29)

- Temporary loss of internet, DNS, SMTP connectivity, timeouts, and SMTP 4xx rejections now persist each detection delivery as `pending` in PostgreSQL. Retry has no attempt-count cutoff, uses bounded exponential backoff up to 30 minutes, survives container restarts, and executes independently even when another monitoring-cycle step fails.
- Authentication and invalid App Password errors are classified as permanent `blocked` deliveries so the UI asks for connection repair instead of retrying invalid credentials forever. Pending, blocked, and sent states, attempt count, and next retry are visible in Detection Rules and refresh automatically.
- Added an admin-only five-vendor test action and UI button. The deployed Gmail connection sent five real messages successfully: Linux, MikroTik, FortiGate, Cisco, and pfSense all returned `sent` with zero failures; the earlier generic real test also succeeded and automatic delivery is enabled.
- Validation passed: focused detection/SMTP/retry/RBAC tests 9/9, backend build and targeted lint, command catalog validation (191 items), frontend TypeScript/lint/production build, healthy API/web Docker deployment, and sanitized real Gmail delivery verification. No credential or recipient secret was printed.

## In-app Gmail sender registration (2026-08-29)

- Detection Rules now contains a complete Gmail connection workflow: sender address, Google App Password entry, real SMTP authentication verification, connection health, removal, recipient/severity settings, and test delivery.
- Fixed the previous `forbidden` response by declaring all email mutations in the central RBAC policy. Only administrators with a valid session and CSRF token can create, test, change, or remove an email sender.
- Gmail App Passwords are normalized from Google's spaced 16-character format, encrypted with the server credential encryption key, stored only in PostgreSQL, redacted from request logs, and never returned to the browser. Removing a connection clears the encrypted secret and disables automatic mail.
- Each alert channel now resolves its own Gmail sender first and retains server SMTP as an optional fallback. Continuous rule delivery and the durable retry queue use the same per-channel credential.
- Validation passed: Prisma schema/generation, backend build, command catalog, frontend typecheck/lint/production build, focused SMTP/RBAC tests 8/8, Docker API/web health-gated rebuild, deployed migration status, HTTP 200 page/health, authenticated CSRF smoke, expected Gmail validation 400 instead of `forbidden`, and zero temporary test accounts after cleanup. A real external Gmail login still requires the operator's own App Password and was intentionally not attempted with fabricated credentials.

## Continuous five-vendor detection and immediate email delivery (2026-08-29)

- The deployed API now owns a continuous security-monitor worker. It reconciles supported devices, runs due read-only collectors, evaluates all enabled rules every five seconds, and retries transient SMTP failures with a bounded five-attempt backoff; page visits are no longer part of the runtime trigger.
- Added registered SSH log collectors for Linux, MikroTik RouterOS, FortiGate, Cisco IOS/IOS-XE, and pfSense. Collector states are enabled by default, preserve an operator disable after migration, honor per-device intervals, and expose last success/sanitized failure through `/api/security/monitoring/status` and the Detection Rules page.
- Collector ingestion now preserves the real canonical vendor, parses common ISO/FortiGate/RouterOS/syslog timestamps, uses exact timestamp-plus-line fingerprints, and does not refresh/count a previously read line. Old backlog is excluded by event time, preventing false first-poll alerts and repeated mail.
- Every enabled detection rule at or above the saved email severity now sends immediately; the former 15-rule mail allowlist no longer suppresses valid high-severity detections. Delivery remains cooldown- and event-fingerprint-deduplicated across overlapping runs and API restarts. Failed sends remain visible, update channel health, and are retried without blocking Finding persistence.
- The Persian-first UI now reports whether the worker is actually running, monitored/supported device coverage, last detection, collector failures, enabled email channels, and the real all-rules email behavior.
- Validation passed: Prisma generation/schema, backend build, command catalog, frontend typecheck/lint/i18n/UTF-8/production build, focused tests 7/7, Docker API/web rebuild and health checks, deployed route/health HTTP 200, worker startup without cycle failure, isolated PostgreSQL five-event detection, two Persian SMTP messages for two high-severity rules, restart-safe zero duplicates, and exact isolated-database cleanup.
- Current deployed configuration check is intentionally sanitized and reports `smtpHostConfigured=false` and `senderConfigured=false`. The runtime path is working, but real external mail cannot leave this installation until an operator supplies server-side SMTP settings and uses **Send test**; no credentials were read or printed during validation.

## Real vendor detection rules and restart-safe Persian email alerts (2026-08-28)

- `/security/rules` now adds 25 event-backed rules: five each for Linux, MikroTik, FortiGate, Cisco, and pfSense. Every vendor rule has a predicate, time window, threshold/grouping, severity, standards mapping, and official reference. Existing general rules remain available and executable in a separate General tab.
- Rule enable/disable state is persistent. Seeding updates metadata without forcing `enabled=true`, fixing the previous behavior that silently re-enabled rules whenever the page loaded.
- Detection now uses exact event IDs and bounded windows. Re-running detection no longer inflates Finding counts; only new evidence updates a Finding.
- Detection is invoked immediately after API event ingestion, collector batches, and persisted suspicious Linux live-stream signals; email delivery is not dependent on opening the Detection Rules page.
- Added a PostgreSQL-backed email channel and delivery ledger, native SMTP/STARTTLS client, admin-only recipient/severity settings, test delivery, fully Persian alert subject/body, sanitized failures, and a unique event-set fingerprint that prevents duplicate email both across overlapping rules and API restarts. Email is limited to 15 explicit high-confidence rules; non-priority and medium/low rules remain Finding-only. A persisted rule-window cooldown prevents repeated mail for new events in the same alert episode.
- The page is now a compact vendor-tab workspace with five focused rows per vendor, real thresholds, standards badges, a manual detection run, and responsive email configuration.
- Validation passed: Prisma schema, backend/frontend builds, targeted lint, focused unit/socket tests, real Docker migration/health checks, a real PostgreSQL five-event threshold test, and a two-phase SMTP test around an actual API restart. One Persian email was delivered before restart and zero after restart; delivery count stayed `1`, and all test data/settings were cleaned/restored.

## Resilient AI assistant provider runtime (2026-08-23)

- Fixed the deployed assistant's 502 failure. The API container still referenced a stale Hyper-V adapter address after Windows changed it from `172.20.x.x` to `172.25.x.x`; Docker now resolves the stable `host.docker.internal:host-gateway` mapping instead of storing a volatile host IP.
- Hardened the restricted OpenRouter host proxy: it binds for Docker access, preserves its ignored random credential across restarts, rejects foreign port owners, starts the real Node executable, permits private clients only, and tunnels only `openrouter.ai:443`. No Windows Scheduled Task or firewall rule was installed.
- OpenAI-compatible defaults now consistently pair `openrouter/free` with `https://openrouter.ai/api/v1`. A 403 from one model no longer prevents trying configured fallback models; only authentication failure 401 stops the external attempt sequence.
- Added an honest deterministic offline fallback. If every external model is unavailable, the assistant still returns a Persian evidence summary or controlled structured proposal, marks `provider=mock`, `fallbackUsed=true`, retains the provider error in status, and never bypasses ActionPlan, PolicyGuard, Connector, confirmation, or audit controls.
- Validation passed: backend TypeScript build, three focused proxy/provider/fallback contracts, locale and UTF-8 guards, real external `openrouter/free` response with an assistant message, forced-offline fallback response, healthy API container, HTTP 200 on `/firewall/assistant`, and no dangling API image after safe deployment.

## User-friendly execution review and bounded web images (2026-08-23)

- Replaced the dense raw ActionPlan confirmation table with a compact decision surface: operation title, target device, localized impact level, backup requirement, expected outcome, and only genuine operator-editable parameters.
- Generated commands and implementation details remain available in collapsed disclosures without overwhelming the primary decision. The modal has Escape/backdrop close behavior, an independently scrollable body, a fixed decision footer, and a phone/tablet bottom-sheet layout.
- Internal identity and capability fields such as `deviceId`, `vendor`, `actionType`, support metadata, and execution flags are no longer editable. The controlled `Preview -> explicit confirmation -> PolicyGuard -> registered Connector -> Audit/Result` path and protected-lab behavior are unchanged.
- Added `scripts/deploy/rebuild-firewall-web.ps1` as the required local web deployment path. It records the running image, builds and health-checks the replacement, and removes only the exact superseded `firewall-web` image when it still exists and no container uses it; global image/system/builder pruning is intentionally forbidden.
- Validation passed: TypeScript, targeted ESLint, execution-review/Docker cleanup contracts, locale parity, Persian-copy and UTF-8 guards, production frontend build, healthy Docker web/nginx configuration, and HTTP 200 on `/firewall/actions`.

## Cross-device web, PWA, and native mobile readiness (2026-08-23)

- Added one responsive shell layer for desktop, tablet, and phone: compact sticky top bar, safe-area-aware Drawer, a five-item icon bottom navigation (`Dashboard`, `Assets`, `Monitoring`, `Actions`, `More`), touch-safe controls, mobile keyboard sizing, single-column forms/dialogs, and independent horizontal table scrolling.
- Made the full `/firewall/` deployment path PWA-safe. Router, manifest, icons, service-worker registration, offline navigation fallback, and cache keys now resolve from the configured base path; native Capacitor WebViews do not register the browser service worker.
- Added stable relative PWA identity/scope and corrected nginx manifest MIME plus service-worker cache headers. The Docker image was rebuilt and `firewall-web` recreated; web, nested SPA routes, manifest, service worker, and API health all return HTTP 200.
- Repaired the Android root Gradle file, which had incorrectly become a Cordova library module. Capacitor sync detects SQLite, secure storage, and local SSH. Source/mobile security tests pass, but this Windows host could not download AGP 8.13.0 because the configured official Google Maven endpoint returned 404, so a fresh APK binary was not produced locally. iOS packaging still requires macOS/Xcode.
- Validation passed: root and `/firewall/` production builds, TypeScript, targeted ESLint, 12 focused PWA/mobile/release contracts, locale parity, Persian-copy, UTF-8, and real Chrome device emulation at 360×800, 390×844, and 768×1024 with viewport/body/page widths equal and no global overflow. Deployment and operator instructions are in `docs/MOBILE_READINESS.md`.

## Operator-friendly Action Center (2026-08-23)

- Rebuilt `/actions` as a compact operations console with a truthful controlled-execution flow, live lifecycle summary, focused operation composer, device connection-readiness panel, one consolidated review surface, and an always-visible searchable operations queue.
- Removed the three duplicated selected-action/result surfaces and the oversized empty connection presentation. Device identity and verification facts now appear only after target selection; parameters, connection tests, retry, preview, explicit confirmation, execution, result links, device workspace links, filtering, paging, and history clearing remain available.
- Preserved the existing `Catalog -> ActionPlan -> Preview -> explicit user confirmation -> PolicyGuard -> registered Connector -> Audit/Result` contract. Preview still uses `intent=preview`; real execution still uses `intent=execute`, role checks, connector evidence, polling, and the existing protected-lab behavior.
- Added a dedicated responsive RTL/LTR stylesheet for desktop, tablet, and phone layouts. Frontend typecheck, targeted ESLint, locale/UTF-8 guards, focused Action Center contracts, and the production frontend build pass.
- Rebuilt and recreated only `firewall-web` and `main-nginx`; both containers are healthy, `/firewall/actions` returns HTTP 200, and the deployed assets contain the new operations layout.

## Actionable Linux fleet monitoring (2026-08-23)

- Replaced the unusable RTL Linux table with responsive device cards showing identity, management host, connection/health state, score, CPU, memory, disk, and collection freshness without overlapping columns.
- Added fleet search, status filters, attention-first ordering, per-device refresh, refresh-all with partial-failure disclosure, and honest observability-schema messaging.
- Device detail now projects real HealthSnapshot metrics, operational service/port/firewall signals, stored warnings, and 24-hour CPU/RAM/Disk trends from persisted MetricSample rows. Missing evidence remains unknown rather than healthy.
- The five-vendor overview remains the entry point for Linux, MikroTik, FortiGate, Cisco, and pfSense; the advanced route is explicitly Linux-only because those persisted telemetry contracts currently exist only for Linux.
- Validation passed: frontend typecheck/build, targeted ESLint, monitoring contracts 3/3, locale/UTF-8 guards, Docker production build, healthy web/nginx/API/db containers, route HTTP 200, and deployed bundle/CSS verification.

## Simple standards-aligned vendor monitoring workspace (2026-08-20)

- Replaced the stacked Linux telemetry and Daily Check surfaces on `/monitoring` with one compact vendor/device workflow. The overview now contains only two selectors, one action, a four-segment health ring, four essential cards, and the latest result link; advanced Linux detail remains on its dedicated route.
- Linux, MikroTik, FortiGate, Cisco, and pfSense project their detailed profiles into four vendor-specific essentials: device health, performance, network, and security. The underlying profiles retain their standards-aligned detailed sections.
- Device connection readiness, profile coverage, ActionPlan lifecycle, and connector-backed health results are displayed as separate facts. A checklist definition, missing evidence, or a pre-connector failure can no longer appear as a healthy result.
- Linux, MikroTik, and FortiGate retain real catalog/connector execution. Cisco and pfSense are explicitly manual guidance until executable connectors exist. The protected Preview/Confirm/PolicyGuard/Connector/Audit workflow is unchanged.
- Validation passed: TypeScript, targeted ESLint, focused monitoring contracts 2/2, production frontend build, locale/UTF-8 guards, Docker image build, healthy web/nginx containers, deployed route HTTP 200, and deployed bundle/CSS verification.

## Complete self-hosted authentication and account security (2026-08-19)

- Login is Persian-first and bilingual, responsive, autofill-safe, accessible, Caps Lock aware, and reports invalid credentials, database startup, network failure, and retry windows without leaking account existence.
- Existing opaque PostgreSQL sessions now add browser-token rotation, bounded active sessions, constant-work unknown-user verification, combined credential-stuffing/username-spraying limits, safe proxy IP handling, automatic UI sign-out on expired sessions, and explicit password-field log redaction.
- Settings is now an account-security workspace with identity details, active-session metadata, current-session detection, individual revocation, global logout, password strength guidance, and an atomic password change that revokes all sessions.
- Backend build, frontend production build/typecheck, targeted ESLint, 10 focused security contracts, 859-key locale parity/Persian-copy validation, and the 589-file UTF-8 guard pass. No schema migration was required.
- Deployment remains pending: container recreate was rejected because it can cause brief downtime, Docker image build then failed twice on registry DNS/TLS connectivity, and the local functional smoke could not reach the Docker-only PostgreSQL network. Running containers were not changed.

## Device-scoped findings and exact evidence integrity (2026-08-12)

- Findings now have a second investigation scope below vendor: all devices in the family or one registered device. The selector combines inventory devices with devices represented by stored findings, shows name, management address, and per-device finding count, and scopes cards and severity metrics to the selected server.
- Raw vendor logs are now returned only when the finding contains an exact event reference that resolves within the same device. The legacy similar-text fallback was removed, duplicate raw records are collapsed, unresolved historical references are disclosed instead of being replaced, and primitive stored evidence is honestly labeled as stored evidence rather than a configuration snapshot.
- Linux live parsing now keeps SSH authentication and sudo authentication rules mutually exclusive, ignores successful `sudo session opened` records, deduplicates the same raw event received through overlapping streams, and prevents repeated analysis or repeated snapshots from incrementing a finding without a new exact event reference.
- Evidence presentation exposes resolved/total reference integrity and remains redacted on demand. This supports NIST SP 800-53 Rev. 5.1 AU-3 expectations for event type, time, location/source, outcome, and associated identity, and NIST CSF 2.0 Detect outcomes without claiming certification.
- Local validation: backend build and full frontend production build; targeted ESLint; focused evidence/device contract tests 7/7; 799-key locale parity and Persian-copy guard; 588-file UTF-8 guard. Database-backed suites remain correctly gated by the repository's required isolated `TEST_DATABASE_URL`. Docker rebuild was requested but the execution environment rejected privileged access because its automatic-approval usage limit was exhausted; deployed-browser validation remains pending that explicit approval.

## Selectable vendor finding views (2026-08-11)

- The findings vendor selector now always exposes the product's five primary device families: Linux, MikroTik RouterOS, FortiGate, pfSense, and Cisco. Vendor visibility no longer depends on already having at least one stored finding.
- Zero-finding vendors show a real zero count, their own detection profile and evidence sources, and a vendor-specific empty state. Findings remain strictly scoped to the selected vendor, while unknown future vendors with stored findings are appended without hiding their data.
- Validation: frontend ESLint and production build; locale parity, Persian-copy, and UTF-8 guards; focused vendor/evidence tests 5/5; Docker frontend rebuild and web/nginx recreate; authenticated Chrome/Playwright on deployed localhost selected all five vendors, verified Persian counts `7/0/0/0/0`, checked the vendor-specific empty state, switched FortiGate at 390px width, found no console/API errors, and measured zero global horizontal overflow.

## Vendor-specific findings and traceable raw evidence (2026-08-11)

- Security findings are now reviewed one vendor at a time. The active Linux, MikroTik, FortiGate, pfSense, and scaffolded Cisco profiles expose their own live-log families, snapshot sources, rule categories, and vendor-safe detection applicability instead of presenting a mixed generic queue.
- Finding detail now shows vendor/category/source, confidence, affected asset, first/last observation, technical context, MITRE tags when stored, and an on-demand evidence workspace. The evidence API resolves only explicitly referenced events, exact legacy evidence matches, or the bounded telemetry record; it redacts secret-like values and distinguishes raw events, stored evidence, configuration snapshots, and unavailable legacy evidence without fabrication.
- Linux live streaming now gives the finding engine the same deterministic event ID persisted by the bounded telemetry store. Docker persists that store in `firewall_telemetry`, and the API image only changes ownership on writable storage instead of recursively changing the full application tree.
- Validation: backend and frontend production builds; focused vendor/evidence and security UI tests 9/9; ESLint; 788-key locale parity and Persian copy guard; 588-file UTF-8 guard; Docker API/web/db/nginx healthy; authenticated evidence probes with exact ID/raw-text equality and cleanup; existing data projects 12 traceable raw events across two findings plus three honest snapshots; authenticated Playwright Core on the deployed localhost route with seven finding cards, six visible raw event rows, Persian RTL, raw-log LTR, redaction notice, no console errors, and zero horizontal overflow at desktop and 390px mobile.

## Standards-aligned security operations workspace (2026-08-11)

- The security area now uses the NIST CSF 2.0 lifecycle as an operational capability map across Govern, Identify, Protect, Detect, Respond, and Recover. Implemented capabilities link to real product workflows; recovery is explicitly shown as unmeasured, and the UI states that it is not a certification or compliance score.
- The overview is backed by stored findings, active assets, detection rules, and incidents. It provides a real severity ring, focused critical/high and affected-asset metrics, enabled-rule coverage, an ordered immediate-action queue, detection readiness, and active response workload. Legacy placeholder distribution and recent-action prose panels were removed.
- Findings now have Persian search over localized and raw evidence, severity/status filters, affected-asset context, timestamps, and compact review cards. Detection rules now have localized names/descriptions, colored severity/state cards, real enabled coverage, and enable/disable controls connected to the existing security rule API.
- NIST CSF 2.0 and CIS Controls v8.1 informed the visible lifecycle, asset inventory, audit/detection, and response structure. MITRE ATT&CK technique coverage and CISA KEV prioritization remain explicit evidence gaps instead of fabricated metrics.
- Validation: frontend ESLint; production TypeScript/Vite build locally and in Docker; 723-key locale parity and Persian primary-copy guard; 586-file UTF-8 guard; security UI source tests 4/4; deployed web/API HTTP 200; both nginx configurations valid; authenticated Playwright over overview/findings/rules with six NIST functions, 16 real rules, Persian evidence search and content, working filters, active motion, no API/console errors, and zero horizontal overflow on desktop and 390px mobile.

## Guided device onboarding and vendor catalog UX (2026-08-11)

- Device registration is now a focused three-step experience with a persistent Persian guide, visual vendor selection, inline required-field guidance, automatic platform preview, secure credential-mode cards, connection-target preview, and explicit verified/unverified review states. The existing session, connector test, discovery, preview, and commit contracts are unchanged.
- The vendor catalog now explains connector readiness through colored vendor identities, motion-enabled readiness cards, connector badges, capability meters, and clear registration availability. Only Linux, Cisco, FortiGate, and MikroTik expose guided registration; pfSense correctly remains a roadmap-only entry without a misleading registration action.
- Both pages are responsive at desktop and 390px mobile widths, retain accessible radio/status semantics, respect reduced-motion preferences, and have complete Persian/English locale parity.
- Validation: frontend ESLint with no errors; production TypeScript/Vite build locally and inside Docker; 605-key locale parity and Persian primary-copy guard; 584-file UTF-8 guard; onboarding contract source tests 3/3; Playwright against the deployed localhost routes with five vendor cards, four valid registration paths, animated card entry, vendor switching, form-state retention, and zero horizontal overflow; web/API HTTP 200; both nginx configurations valid; `firewall-web` healthy.

## Live Linux refresh and focused asset inventory (2026-08-11)

- The dashboard now renders stored Linux health immediately, detects missing resource metrics or snapshots older than 15 minutes, and performs connector-backed read-only collection in the background. Operators can also refresh every Linux server explicitly; partial failures keep the latest usable data visible with an honest warning.
- The asset overview now keeps only active inventory counts, attention state, search/filter controls, and the essential equipment identity, management address, last verification, health, and workspace link. Decorative/mock sync panels and the non-actionable missing-site summary were removed.
- Asset and equipment views are localized, responsive, and use colored Linux, network, security, wireless, and generic equipment icons. Direct `/firewall/assets` and `/firewall/assets/devices` requests now resolve through the SPA instead of colliding with Vite's `assets` directory.
- Validation: frontend production build; 548-key locale parity and Persian primary-copy guard; 584-file UTF-8 guard; healthy Docker stack; direct dashboard/assets/devices HTTP 200; real SSH refresh responses 200 for both Linux servers; two charts with four animated real-data rings each; six active asset rows; working attention/search filters; Persian equipment headers; no legacy English asset labels; and no horizontal overflow at desktop or 390px mobile widths.

## Persian operations dashboard and Linux fleet rings (2026-08-11)

- The dashboard is now Persian-first and focused on four operator needs: key operational state, immediate attention items, per-server Linux health, and recent controlled executions. Repetitive workflow/vendor/history panels and non-essential shortcut clutter were removed.
- Every registered Linux server is returned by the monitoring summary. Each server receives a real multi-ring SVG chart from its latest stored health score and CPU, memory, and disk metrics; offline and stale states are projected honestly and missing telemetry stays unknown.
- Dashboard action titles are returned in Persian and English so the UI selects the active locale. Persian dates and digits, RTL layout, responsive behavior, accessible chart labels, animated ring transitions, and reduced-motion behavior are included.
- Docker deployment rebuilt and recreated the API and web services, then refreshed main nginx to resolve the new upstream container addresses. The web nginx now forces browser revalidation under `/firewall/` so a previously cached HTML shell cannot pin old hashed dashboard chunks after deployment.
- Validation: backend build; frontend TypeScript and production build; locale parity and Persian primary-copy checks; UTF-8 guard; focused dashboard workflow tests; Docker services healthy; API and web HTTP 200; deployed ring CSS present; Playwright on the exact localhost URL showed the new Persian heading, no legacy workflow heading, two real Linux server charts, animated rings, and no horizontal overflow.

## Login autofill appearance repaired (2026-08-11)

- Browser-filled username and password values now keep the login form's dark surface instead of receiving Chrome/Edge's light autofill background.
- The override is scoped to login inputs and preserves readable text and caret colors across autofill hover and focus states.
- Validation: frontend production build passed; the `firewall-web` image was rebuilt, `firewall-web` and `main-nginx` were recreated and became healthy, and the deployed `/firewall/` page returned the autofill override from its CSS asset with HTTP 200.

## Complete ActionPlan history clearing (2026-08-09)

- Action Center history clearing now archives every non-executing ActionPlan regardless of lifecycle, rather than only terminal database statuses. Draft, needs-input, preview-ready, confirmed, succeeded, failed, skipped, and cancelled records all disappear from the Action Center after confirmation.
- In-flight executions remain visible until they finish, and audit evidence remains stored. The confirmation dialog and completion notice now describe the actual behavior and report the archived count.

## Action Center credential execution repaired (2026-08-09)

- ActionPlans, previews, PolicyGuard, templates, and connector selection were working, but `firewall-api` could not decrypt device credentials at execution time.
- Compose loaded `backend/.env` and then replaced its valid `CREDENTIAL_ENCRYPTION_KEY` with an empty interpolated value from the higher-precedence `environment` block. The empty override was removed; the environment file and secret were not modified.
- Validation passed through the real nginx/API workflow: health 200, retry 200, preview 200, SSH connector execution 200 with `succeeded`, `connectorInvoked=true`, `exitCode=0`, non-empty stdout, and a successful Action Center result projection.

## AI chat nginx 504 repaired (2026-08-09)

- Browser AI chat was still failing at the reverse proxy after the OpenRouter transport repair: `main-nginx` used its default 60-second upstream read timeout while the backend can spend up to 30 seconds on each configured fallback model.
- The firewall API proxy now uses a 10-second connect timeout and 150-second send/read timeouts, keeping the nginx deadline above the backend's bounded provider/fallback window.
- Validation passed: nginx config test; main-nginx recreate; healthy compose services; authenticated Persian POST through the exact `/firewall-api/ai/chat` route returned JSON HTTP 200 in 26.3 seconds with a non-empty answer; no HTML gateway response; temporary test sessions removed.

## OpenRouter Docker AI chat repaired (2026-08-09)

- The AI endpoint 403 was an OpenRouter edge-policy denial caused by Docker bypassing the host VPN: host traffic exited through Germany and succeeded, while container traffic exited directly through Iran and was denied before API-key or model processing.
- The backend OpenAI-compatible transport now supports an explicit authenticated HTTP CONNECT proxy, preserves structured JSON mode, sends deterministic request framing, and stops fallback attempts on authorization/security-policy 401/403 responses.
- The firewall compose stack can load an ignored runtime proxy environment file. The host relay binds only to the internal Hyper-V Default Switch, requires a generated credential, accepts private-source clients, and permits CONNECT only to `openrouter.ai:443`.
- Validation passed: backend build; no-cache Docker API build plus final rebuild; API container recreate and health 200; independent raw container OpenRouter chat/completions 200; exact provider response success; authenticated `/api/ai/chat` 200 with a real Persian answer and temporary-session cleanup. The focused legacy test remains gated by the repository's required isolated `TEST_DATABASE_URL`.

## AssetPlatform schema drift runtime repaired (2026-07-29)

- Asset-backed UI/API 500s were caused by a database/schema mismatch: `AssetPlatform.assetRoleId` existed in Prisma schema but not in the Docker database.
- Added and applied additive migration `20260729083000_asset_platform_role_relation`; the current Docker database now matches Prisma schema.
- Validation passed: Prisma validate, backend build, Docker API rebuild/recreate, healthy compose stack, authenticated login/assets/navigation/devices 200 probes, and empty Prisma migrate diff.

## Production bootstrap seed flow (2026-07-29)

- Initial admin creation is now owned by Prisma seed, not API startup or `ADMIN_PASSWORD`.
- Fresh Docker databases run `prisma migrate deploy`, `prisma db seed`, then start the API. The seed creates the first admin only when the user table is empty and skips existing users/admins.
- The generated first-admin credential is stored in the dedicated bootstrap storage volume at `/app/storage/bootstrap/initial-admin.json` with restricted permissions; logs do not include the password.
- Validation passed: backend build, Prisma validate, focused security test, no-cache firewall-api build, compose up, healthy API/DB/web/nginx, seed idempotency evidence, and bootstrap credential file existence check without printing the secret.

## Docker firewall-api runtime repaired (2026-07-28)

- The Docker backend production image now includes the Prisma CLI in production dependencies, so `prisma migrate deploy` is available after `pnpm install --prod`.
- The runtime command uses installed binaries directly and loads Prisma 7 datasource configuration from `prisma.config.ts`; no datasource URL was added to `schema.prisma`.
- Fresh lab compose databases start without hardcoded admin credentials by skipping initial admin bootstrap only in lab/development when `ADMIN_PASSWORD` is unset. Production secret enforcement remains unchanged.
- Validation passed: Prisma validate, backend build, no-cache firewall-api image build, compose up, final healthy status for API/DB/web/nginx, and API logs showing migrations complete plus health 200.

## AI Assistant structured ActionPlan architecture (2026-07-19)

- AI Assistant planning now separates plan creation from execution eligibility. Selected Device context is the source of truth for vendor/platform/capabilities, and generated steps are resolved only through that vendor's backend registry/templates.
- Structured AI plans record executable steps, missing parameters, blocked unsupported capabilities, dependencies, risk, verification, rollback metadata, approval requirement, and `rawCommandExecution=false`.
- Exact supported single actions still create executable ActionPlans through the existing Action Center path. Unmatched operational prompts create review-only structured ActionPlans; informational prompts remain chat-only.
- Action Center displays structured step status and keeps execution behind preview, explicit approval, PolicyGuard, connector invocation, and audit.
- Validation: backend build; frontend build; focused planner/routing/target-device/vendor-isolation/Action Center/guided tests 96/96; command catalog validation; i18n; UTF-8; workflow guard; git diff check.

## AI Assistant ActionPlan creation regression fix (2026-07-19)

- Supported selected-device catalog requests create proposed ActionPlans again, including parameterized actions that still need guided completion. Cisco `create VLAN` resolves only through the exact `cisco.create-vlan` operation, and FortiGate `create policy` resolves through the implemented FortiGate catalog before guided fallback.
- Unsupported/custom/unmatched prompts, including vague Cisco requests such as `configure something for me`, remain chat-only with no ActionPlan and no vendor generic catalog match.
- Chat still never creates a Guided Action session or redirects; guided collection remains behind explicit user action. Action Center, approval, PolicyGuard, connector invocation, audit, and protected lab execution settings are unchanged.
- Validation: backend build; frontend build; new AI ActionPlan routing regression test 6/6; existing AI target-device test 13/13; command catalog validation; `git diff --check`. Full backend `npm test` remains gated by missing isolated `TEST_DATABASE_URL`.

## AI Assistant guided-action redirect fix (2026-07-19)

- Assistant chat no longer creates Guided Action sessions or navigates based on returned session/action IDs. Guided navigation is behind an explicit start button only.
- Generic/custom fallback no longer promotes `generic_security_action` or `custom_vendor_action` into vendor catalog rows; unsupported, partial, custom, informational, and read-only prompts remain reviewable Assistant responses unless they map to a verified ActionPlan path.
- Guided-start eligibility is limited to the selected device as source of truth: verified catalog action, implemented, connector-backed, selected device supports the connector, and required parameters are still missing.
- Validation: backend build; frontend `pnpm build`; focused AI target-device tests 13/13; command catalog validation; i18n; UTF-8; workflow guard; `git diff --check`. Full backend `npm test` remains gated by missing isolated `TEST_DATABASE_URL`.

## AI Assistant target-device context fix (2026-07-19)

- The selected target device is now the AI Assistant source of truth. Each prompt rebuilds backend context from that Device and target-scopes vendor, platform, capabilities, health, inventory, connection state, routes, workflow state, and supported catalog actions.
- Stale Cisco/vendor context, previous intents, and previous guided-action state are no longer reused when the operator switches targets or sends a new prompt. Unsupported requests return selected-device suggestions instead of cross-vendor ActionPlans.
- Validation: backend build, frontend build, focused AI target-device context test 7/7, command catalog validation, i18n parity/Persian copy, UTF-8/mojibake, workflow guard, and git diff --check.

## Cisco IOS Classic localized workspace (2026-07-19)

- The device overview now separates connection, verification, inventory, capability, health, interfaces, and last successful collection. Cisco identifiers render LTR while Persian labels remain RTL and natural.
- Capability groups display typed states and partial/unsupported/failed distinctions rather than empty placeholders when collection has run. Action Center and result pages no longer expose internal connectorInvoked expressions in the main UI.
- Validation: frontend build, i18n parity/Persian copy, UTF-8 guard, and internal-expression scan.

## Cisco IOS Classic Action Center integration (2026-07-19)

- IOS Classic now uses the existing Action Center execution path for read-only diagnostics, backup, and scoped safe-write Cisco workflows. The generated catalog exposes required parameters and mutating risk correctly from the single Cisco operation registry.
- The Cisco planner and connector wrapper support server-built CLI specs, preview exact commands, require approval for writes, invoke the existing SSH2 interactive connector on execution, and redact sensitive configuration output before evidence is returned.
- Destructive/high-risk roadmap actions such as reload, erase, delete VLAN, bulk shutdown, and restore remain planned and non-executable until protected PolicyGuard contracts are explicitly completed.
- Validation: backend build, command catalog validation, focused Cisco Action Center mocked tests, and focused Cisco source/mocked connector tests.

## Cisco IOS Classic inventory and capability profile (2026-07-19)

- IOS Classic now has a typed read-only collection bundle for system, inventory, interfaces, health, network, configuration metadata, security/services, and per-device capability states.
- Saved Cisco capability evidence feeds the existing workspace projection and Asset sync without schema changes, duplicate APIs, or a second Cisco connector.
- Validation for this slice: backend build, command catalog validation, focused Cisco tests 18/18.

## Cisco IOS Classic discovery and verification (2026-07-19)

- IOS Classic no longer falls into connected_unsupported when SSH and read-only Cisco evidence succeed; it is supported alongside IOS-XE in the existing Cisco SSH2 connector path.
- Onboarding stores sanitized Cisco discovery evidence and initial parsed system/interface facts without exposing credentials or weakening global SSH algorithms.
- Current validation for this slice: backend build, focused Cisco ssh2/source/parser tests, and git diff --check. Database-backed connector tests still require an explicit isolated TEST_DATABASE_URL.

## Cisco Legacy IOS SSH Compatibility Fix (2026-07-19)

- The `legacy_cisco` profile is now the named Legacy Cisco IOS Compatibility Profile and explicitly prepends `diffie-hellman-group14-sha1`, `ssh-rsa`, CBC ciphers, and SHA-1 HMACs only for approved legacy Cisco devices.
- Modern-first Cisco SSH remains the default. Onboarding still retries legacy compatibility only after SSH negotiation failure and explicit operator approval; Action Center and protected execution behavior are unchanged.
- Real-device proof succeeded at the transport/auth/shell/read-only-command layers with sanitized evidence: `connectorInvoked=true`, `compatibilityProfile=legacy_cisco`, authenticated privileged shell, one platform command result, and existing `connected_unsupported` semantics for the detected non-IOS-XE platform.
# Current Project Status

## Phase B - device onboarding and workspace simplification (2026-07-19)

- Phase B only is complete on top of Phase A commit 11923753ea8e00feda6a4ff25a20b529ade47132; commit history was not rewritten.
- Device onboarding now uses a tighter three-step operator flow with localized copy, structured client-side error mapping, existing credential/session APIs, honest verified vs unverified registration, and Cisco legacy SSH approval only under Advanced.
- Device Workspace now exposes only Overview, Interfaces, Configuration, Actions, Monitoring, and History as primary tabs. Overview shows Connection, Identity, Interfaces summary, and Recommended next action, with no fake collection values.
- Workflow Lab now includes verified and unverified workspace fixture states in both Persian RTL and English LTR. Action Center architecture and backend execution policy remain untouched.
- Validation is green for the applicable Phase B scope: frontend build/typecheck, i18n parity/Persian copy, UTF-8, workflow-lab contract, backend build, command catalog validation, mocked/source Phase B tests, and diff check.

## Workflow Foundation Phase A - reusable UI and safe lab (2026-07-19)

- Phase A only is complete: reusable presentation primitives now exist in src/components/workflows/ and a fixture-driven DEV-only Workflow Lab is available at /tools/workflow-lab.
- The lab covers Persian RTL and English LTR visual states for device onboarding success/failure/unverified registration, action review/executing/success/failure, planned Cisco, and unsupported operations.
- No backend behavior, API contract, Prisma schema, connector, ActionPlan execution, Product State navigation, or protected lab execution setting changed.
- Validation is green: frontend typecheck/build, locale parity/Persian copy, UTF-8/mojibake, Workflow Lab dev-only source contract, diff check, and production bundle absence of the lab route string.

## Device UX repair Phase A - guarded data integrity (2026-07-18)

- Test execution now fails closed unless `TEST_DATABASE_URL` is explicitly isolated from `DATABASE_URL` and is not the historical `firewall_log_analyzer` database. Prisma test runtime uses only the verified test target.
- Equipment is currently an Asset-backed list. Device deletion returns 204, `Asset.deviceId` becomes null through `onDelete: SetNull`, and the orphan Asset remains visible from `/api/assets`; executable DB regression coverage records this exact sequence.
- The canonical Device/Asset contract and four independent status dimensions are documented and represented in backend types. Runtime removal behavior is intentionally unchanged until Phase B.
- Current environment has no test database identity (`TEST_DATABASE_URL` missing). Seven non-DB Phase A tests pass and the DB regression is safely refused before writes. Backend build and Prisma validation pass.

## Repair bundle Phase 1 - interactive Cisco SSH and diagnostics (2026-07-18)

- Cisco read-only operations now use a reusable PTY interactive shell with prompt synchronization, privileged EXEC handling, paging control, bounded output, stage-specific timeouts, keyboard-interactive auth, keepalives, and deterministic cleanup.
- Safe diagnostic evidence distinguishes DNS/TCP, SSH negotiation, authentication, shell, prompt, privilege, command, and platform detection failures. Classic IOS and NX-OS remain connected-but-unsupported instead of appearing disconnected.
- Legacy algorithms are opt-in per device and auditable; enable mode references a separate encrypted stored Credential. Defaults were not weakened and no migration was required.
- Validation: Phase 1 scoped lint, backend/frontend builds, 250/250 backend tests, i18n and UTF-8 passed. Global lint has unrelated baseline failures (65 backend; 89 root errors plus 6 warnings). Phase 2 is intentionally not started.

## Device onboarding required-name UX repair (2026-07-18)

- The reported onboarding 400 was traced to an empty device name; `edge-switch-01` was placeholder text rather than an entered value. The selected stored Credential was valid and present.
- Required identity fields are explicit, client-side validation prevents the invalid request, the error is visible inside the active form, and focus moves to the failing field.
- Backend validation and connector behavior are unchanged. Focused onboarding tests passed 9/9, and both builds passed.

## Operator-first Action Center (2026-07-15)

- Action Center now opens with Connection status and the direct Device -> Credential -> Action workflow. Execute immediately is the default; Preview only is optional; ActionPlan history remains available without dominating normal operation.
- Connection status exposes Test, Refresh, Retry, last success/failure, connector, SSH, and authentication state. Exact sanitized failures are visible, while raw JSON is confined to the closed Advanced Details disclosure.
- The Execute control calls the real create-plan and quick-execute backend endpoints and retains controlled planning, PolicyGuard, connector audit, and `connectorInvoked=true` success requirements.
- Cisco show-version is a verified read-only catalog/template/planner/connector path. Vendor-scoped convergence prevents unrelated generic manual actions from being promoted.
- Authenticated Playwright: Linux service status succeeded; Linux daily check succeeded; FortiGate VPN succeeded; FortiGate HA/VDOM/zone reached the connector and failed on the appliance's `show system vdom`; Cisco show version reached the connector and timed out. Exact failures and invocation evidence are persisted. Preview-only remained non-executing.
- English/Persian, LTR/RTL, 1440px/390px, no-overflow, default Execute, closed Advanced Details, direct history context, green Connected, and failed Retry states passed browser acceptance.
- Validation is green: backend build, catalog 138, backend 237/237, frontend build, locale parity, Persian copy, UTF-8, diff check, Prisma status, and dry-run reconciliation. All 35 migrations are current; no migration was added or applied.
- Protected counts: Device 4, Asset 7, DeviceCredential 4, Finding 5. ActionPlan is 133 after intentionally retaining seven current-task acceptance plans from the 126 browser baseline; existing history was preserved.
- Live blockers: FortiGate rejects one zone/VDOM read command in its current context; Cisco SSH times out. Neither path is reported as a successful device operation.

## Master repair convergence - Phase 2 (2026-07-14)

- Phase 2 router convergence is complete: React Router owns routing/navigation, unknown routes render a distinct 404, and all 53 feature routes have stable page identities.
- Frontend routes and backend Product State are guarded by exact 53-key and route parity tests.
- Authenticated Playwright verified the 404, Dashboard, and client-side Assets navigation with correct identities, RTL, no overflow, and real same-origin API traffic.
- Historical database counts remain unchanged. Next allowed work is Phase 3 Device/Asset and schema reconciliation.

## Master repair convergence - Phase 1 (2026-07-14)

- Phase 0 complete with a verified, untouched custom-format database dump and preserved historical counts.
- Phase 1 runtime convergence is implemented: backend 4000, strict Vite 5173, same-origin development proxy, one shared resolved datasource for Prisma/Pool, and redacted readiness identity with schema readiness.
- Database remains `127.0.0.1:5432/firewall_log_analyzer` (`public`); Device 3, Asset 7, DeviceCredential 4, Finding 5, ActionPlan 124.
- Next phase: replace the manual router with React Router and a shared route/feature manifest. Do not begin data repair before Phase 2 passes.

Last updated: 2026-07-14

## Task 20 - Real Network Operations Kickoff

- Task 20.1A is partially complete and currently blocked. Database/auth milestones A-C are committed (`afbdd4c`, `f09bb4a`, `9b55d87`), but real Cisco onboarding is stopped because the active stable runtime database has no saved Credential Reference rows and therefore does not contain the required `cisco-f2 — admin` reference for `192.168.7.12`.
- PostgreSQL default service remains unhealthy from this session: `postgresql-x64-18` is running but `127.0.0.1:5432` TCP fails. The healthy runtime used for proof remains the user-owned PostgreSQL on `127.0.0.1:55432/firewall_log_auth`.
- New readiness behavior: `/api/health/live` returns 200, `/api/health/ready` returns 200 with `databaseReady=true` when the DB is reachable and structured 503 otherwise. A 181-second proof produced 10/10 live 200 and 10/10 ready 200.
- MCP auth proof after the repair: `/login` and `/dashboard` opened in the authenticated shell with `/api/auth/me` 200. The MCP surface has no fill/type/click tool, so credential-entry replay could not be performed while the session was already authenticated. A transient `/api/assets` timeout/500 appeared once in backend logs after the MCP dashboard refresh and then retried successfully; do not claim complete no-5xx acceptance yet.
- Task 20.1 Milestone A trace is complete and committed as `cc3bd67`. Playwright MCP in this session opened `/assets/devices/new?vendor=linux`, title `log-app`, saw authenticated onboarding APIs succeed (`/api/auth/me` 200, session creation 201, credentials 200, product navigation 200), and found the live `Credential reference` selector with zero console errors.
- Full Task 20.1 acceptance is currently blocked, not complete: the runtime database has no saved credentials and no devices, and no real target/credential reference has been supplied. `connectorInvoked=true`, Device persistence, animated success, automatic redirect, workspace opening, and dashboard charts from the persisted device are not claimed.
- New evidence docs: `docs/TASK_20_1_ONBOARDING_RUNTIME_TRACE.md`, `docs/TASK_20_1_API_SEQUENCE_TRACE.md`, `docs/TASK_20_1_FRONTEND_STATE_TRACE.md`, and `docs/TASK_20_1_BACKEND_STATE_TRACE.md`.
- Backend startup/auth repair restored the current login path. The app now uses one shared Prisma client and one shared `pg` Pool, Fastify app close no longer disconnects the shared database adapter, process shutdown owns database teardown, startup auth bootstrap has a short transient retry, and `/api/health/ready` reports database readiness with 200/503 structured output.
- Local Windows PostgreSQL service `postgresql-x64-18` still reports `Running` but returns `no response`/`ETIMEDOUT` on port 5432, and Windows denied service/process restart. To restore login without touching `.env` or the protected service data directory, a user-owned temporary PostgreSQL 18 cluster was initialized under `.runtime/postgres-task20-auth`, started on `127.0.0.1:55432`, and the backend is running on port 4000 with only its process `DATABASE_URL` overridden to that healthy local database.
- Validation for the repair slice: `npx prisma validate`, `npx prisma generate`, backend `npm run build`, root `npx pnpm@10 build`, and backend `npm test` pass (209/209) against the healthy temporary database. Playwright MCP confirms `/api/auth/me` returns 200 in the authenticated shell, `/api/*` dashboard requests return 200, and `/dashboard` has zero console errors.
- Task 20 mandatory MCP gate passed in this session: Playwright MCP opened `http://localhost:5173/`, title `log-app`, and captured an authenticated Persian app shell snapshot.
- Baseline evidence is recorded in `docs/TASK_20_PRECHANGE_RUNTIME_BASELINE.md`, `docs/TASK_20_MCP_PROOF.md`, `docs/TASK_20_ROUTE_CONTROL_BASELINE.md`, `docs/TASK_20_API_FAILURE_REGISTER.md`, and `docs/TASK_20_BACKEND_LOG_REGISTER.md`.
- Onboarding API compatibility now includes Task 20 route names: `/test-connection`, `/detect-platform`, `/build-preview`, and `/retry`, alongside the existing Task 19.2A routes.
- Public diagnostics now have a real Check-Host-backed session API and Tools UI. `example.com` produced persisted session `cmrkfksle0000zolvol4yk1ge` with DNS/HTTP/Ping/TCP provider request IDs and `providerInvoked=true`; MCP verified `/tools/history` renders those IDs.
- This is not yet full Task 20 acceptance: dedicated diagnostic Prisma domain models, Nmap worker, monitor scheduler, integration expansion, and live device onboarding with a supplied target/credential are still not complete.
- Local Prisma migration history still reports 34 migrations unapplied; no destructive database recovery was attempted.
- Nmap 7.80 is now installed and a safe isolated worker implementation exists, but live `workerInvoked=true` persistence is blocked because local PostgreSQL stopped accepting TCP connections from this session. Do not mark Nmap acceptance complete until a scan record is persisted and visible.

## Task 19.2A - Runtime Repair and Full Audit

- Device onboarding has an explicit backend state machine from answer save through connection test, platform detection, discovery, preview, saving, and completion. Recoverable failure/cancel states are stored rather than silently falling back to `draft`.
- The misleading save-and-preview behavior is split: answers save to `answers_saved`, connector-backed discovery completes to `discovery_completed`, and an explicit preview action reaches `preview_ready`.
- Focused backend coverage proves Cisco onboarding connector invocation, platform detection evidence, Device persistence, and final `completed` state using a controlled connector-backed test double.
- Dashboard controls now route to implemented destinations: Add Device, quick network check, domain/IP check, and devices. `/tools` and `/tools/network-check` are present as non-executing diagnostic placeholders; no external scan/Nmap work has started.
- Linux monitoring returns a clean `observability.state=not_configured` contract when optional health tables are missing and logs only one concise warning instead of repeated Prisma errors.
- Task 19.2A audit evidence is recorded in `docs/TASK_19_2A_RUNTIME_BASELINE.md`, `docs/TASK_19_2A_ONBOARDING_FAILURE_TRACE.md`, `docs/TASK_19_2A_DASHBOARD_CONTROL_MATRIX.md`, `docs/TASK_19_2A_API_FAILURE_REGISTER.md`, `docs/TASK_19_2A_ROUTE_ACCEPTANCE_MATRIX.md`, `docs/TASK_19_2A_CONTROL_ACCEPTANCE_MATRIX.md`, and `docs/TASK_19_2A_BROWSER_RESULTS.md`.
- Connected Playwright MCP was not exposed to this Codex session, so current authenticated browser acceptance remains documented as pending rather than claimed.

## Task 19.2-A - Visible Device Registration

- Dashboard exposes `ثبت دستگاه جدید` as a primary action and quick actions now include registration, quick network test, domain/IP check, and device list access.
- Product State Contract is `19.2-A`; implemented Add Device is no longer hidden from generated Assets navigation.
- Assets navigation now includes Overview, Devices, Register device, and Vendors. Contextual onboarding routes remain backed by the existing reusable onboarding engine.
- Cisco, FortiGate, MikroTik, and Linux vendor pages show vendor-specific onboarding CTAs that preselect the vendor through `/assets/vendors/:vendorKey/devices/new`.
- No diagnostics, Check-Host, Nmap, scan authorization, monitoring, finding, connector execution, migration, destructive DB command, `.env`, or credential work was started.
- Validation is green for the touched scope: Prisma validate, focused backend Product State/onboarding tests, backend build, frontend build, i18n/primary-copy, UTF-8, and diff check. Connected Playwright MCP was unavailable; local Playwright screenshots only reached the login gate in a fresh context.

## Task 19.1 - Automatic ActionPlan revision convergence

- Genuine canonical input drift no longer ends execution with `COMMAND_PLAN_STALE` HTTP 409. The service regenerates and approves the newest revision, then continues through PolicyGuard and the registered connector.
- All frontend Execute entry points resolve and reference the latest stored revision. Older quick-execute revision input is safely converged to current state and audited.
- Assistant and Action Center share one backend-owned action contract covering plan creation, manual-only/executable state, execution support/mode, and lifecycle identity/revision/state.
- Functional stale-plan coverage passes at revision 2 with one fake connector invocation and `connectorInvoked=true`.
- Same-context authenticated Playwright passed Assistant -> exact Action Center -> Execute -> result for Linux port 546: quick-execute HTTP 200, status `succeeded` with verified no-change, no stale plan/409, zero console errors, and stored `connectorInvoked=true`.
- Current validation is green: Prisma, backend build, catalog 137, backend 205/205, frontend build, i18n/primary Persian copy, UTF-8, and diff check.

## Task 19.1 R-G - Global route/control acceptance

- All 14 requested routes pass authenticated Playwright at the five required locale/viewport combinations with exact route identity, correct RTL/LTR, no page overflow, no unexpected API failure, and no current-navigation console error.
- Enabled dead global controls were removed: search and notifications are disabled with localized explanations. Named Assistant/Action Center product copy and Linux monitoring presets are locale-backed; a regression guard covers 16 required Persian labels.
- Safe navigation, Action Center, Assistant, and mock integration preview controls were exercised without errors. Production integration Apply remains disabled and honest.
- Full live new-device onboarding is not accepted: no explicit new Linux or Cisco target plus credential reference was supplied. Cisco live connector success is therefore not claimed.
- R-G validation is green except the known repository-wide lint baseline. Prisma migration status remains unapplied and untouched; no destructive database action occurred.
- Separate evidence: `TASK_19_1_ROUTE_ACCEPTANCE_MATRIX.md`, `TASK_19_1_CONTROL_ACCEPTANCE_MATRIX.md`, and `TASK_19_1_BROWSER_RESULTS.md`.

## Task 19.1 R-F - Asset workspace analytics and vendor tabs

- Device workspaces now expose stored-data-only health, connector, availability, resource, finding, action, and change series with five time ranges.
- Device/asset linkage uses OR semantics for related findings/actions/collections, so records linked through either identity are visible.
- Workspace overview and health render six responsive charts; missing series remain explicit no-data states rather than fabricated trends.
- Vendor tabs are capability-gated. Linux has seven operational views; missing data explains reason, requirement, and next action. Cisco tabs derive from verified capability-cache domains.
- Authenticated Playwright passed desktop/mobile Persian RTL and English LTR for the Linux workspace, 30-day interaction, real finding/action points, and CPU no-data state without overflow or console errors.
- Validation passed: serial backend 204/204, backend/frontend builds, Prisma validate, command catalog 137, i18n 73, UTF-8, and diff check.
- R-G global route/control audit remains. R-F performed no connector/device/database mutation.

## Task 19.1 R-E - Action Center and Assistant UX

- Action Center primary workflow is locale-aware in Persian and English and exposes exact revision, runtime resolution, verification, preview/parameters, and audit context.
- Verified no-change outcomes are explicit; successful execution no longer leaves the selected dialog in an optimistic running state.
- Action API errors are URL-free and structured stale-revision recovery fields remain available to the UI.
- Assistant target/refresh/clear/new-request/send/safety/provider controls switch with the active locale.
- Authenticated Playwright passed desktop/mobile Persian RTL and English LTR for `/assistant` and `/actions/cmrix2ddb00ao2glvh3tagbe6` with no overflow or console errors. R-E performed no connector execution.
- Validation passed: serial backend 203/203, backend/frontend builds, Prisma validate/generate, focused R-E 2/2, i18n 73, UTF-8, and diff check. Migration status retains the known unapplied baseline and was not mutated.
- R-F and R-G remain. Asset charts/vendor tabs and the global control audit are not part of this commit.

## Task 19.1 R-D - Canonical ActionPlan revision and connector execution

- Canonical ActionPlan resolution, revision hashing, immutable approval snapshots, and structured stale-revision conflicts are implemented without a schema migration.
- `linux.close-port` is a verified catalog/template/Linux SSH connector capability with adapter-aware UFW, firewalld, nftables, and iptables inspection and effective-state verification.
- Repeated desired-state requests reuse a single succeeded plan only when the stored result proves `executed=true`, `connectorInvoked=true`, and an allowed completed/no-change outcome.
- The authenticated browser executed and re-verified the reviewed port-545 plan on the selected Linux device. Its current stored state is `succeeded`, revision 1, approved revision 1, UFW, `verified_no_change`, and `connectorInvoked=true`.
- Persian Assistant resolution now returns the exact reusable ActionPlan immediately without contradictory `missing_fields` state. Exact-plan desktop/mobile Persian/English rendering has no horizontal overflow.
- Validation is green: Prisma schema, backend build, serial backend suite 201/201, command catalog 137, frontend production build, i18n 73, UTF-8, and diff checks.
- R-E through R-G remain. Action Center localization and optimistic post-execution refresh belong to R-E.

## Task 19.1 R-C - Exact ActionPlan navigation

- Exact ActionPlan routing and selection are implemented across plan-creation entry points.
- Direct URL, reload, browser history, missing-plan recovery, desktop English, and mobile Persian RTL are Playwright-verified.
- The backend missing-plan response is structured and non-retryable; no raw API URL is rendered in this recovery state.
- R-D through R-G remain. The next milestone is R-D canonical ActionPlan revisioning and stale-plan repair.

## Milestone 19A - Product State and Navigation Synchronization

- Product capability state now has one backend-owned versioned contract instead of duplicated frontend `implemented`/`nav` flags.
- Read-only APIs expose the full contract and feature, navigation, vendor, and integration projections under `/api/product-state*`.
- Primary navigation is contract-generated and fail-closed. Every promoted route requires a real route plus backend/API/UI/test readiness; planned, unsupported, disabled, not-configured, and unverified states are rejected.
- Primary destinations are Dashboard; Assets overview/devices/vendors; Security overview/findings/rules; Monitoring overview/Linux; Actions; Assistant; and Integrations overview.
- Settings, mock sync, Cisco, NetBox/Wazuh children, Action aliases, and Monitoring aliases are no longer primary destinations. Their direct routes retain explicit planned, partial, unverified, or not-configured state.
- The four requested 19A reports/contracts are present under `docs/`, and the backend regression suite checks cross-layer feature identity and unsafe navigation mismatch.
- Authenticated Playwright acceptance passed on all 16 requested routes at desktop/mobile in Persian RTL and English LTR with no overflow or runtime/network errors. English shell/navigation is translated; full legacy feature-body translation remains deferred.
- Current validation: Prisma validate/generate pass; backend build and 190/190 tests pass; catalog 136 items passes; frontend build, i18n 73 keys, UTF-8 guard, and whitespace check pass. Existing root lint debt and the existing brittle handoff-heading `docs:check` mismatch remain non-19A blockers.
- Milestone 19B and all later convergence rewrites remain unstarted.

## Task 18.2 Safe Autonomous H1-H6

- Safe milestones H1, H3, H4, H5, and H6 are complete. H2 Prisma recovery is intentionally blocked until a verified nonzero database backup exists and migration-history writes are explicitly safe.
- Prisma baseline analysis found the database schema physically represented through `20260712180000_platform_asset_security_milestone`; `20260712192000_task18_2a_vendor_linux_observability` remains the pending migration. No `migrate resolve`, `migrate deploy`, reset, drop, truncate, or destructive migration command has been run in this safe-mode pass.
- Vendor UX is now honest in primary navigation and Cisco surfaces: read-only IOS-XE capability work is visible, broad Cisco mutations remain planned/non-executable, and planned-only pages are not advertised as primary destinations.
- NetBox and Wazuh integration routes are mock/preview-only and no longer expose fake apply controls.
- Dashboard and Linux monitoring now summarize Linux health in Persian-first operational language while keeping refresh read-only and connector-backed.
- Playwright MCP desktop/mobile checks passed on the hardened dashboard, asset, vendor, Linux monitoring, and integration routes with no visible mojibake, replacement character, dead controls, or horizontal overflow.
- Production blockers: complete a real database backup before H2 migration recovery, apply migration history safely after approval, keep Cisco mutations disabled until verified templates/parsers/prechecks/post-checks exist, and reduce pre-existing lint debt.

## Encoding Repair - Persian UTF-8/Mojibake Guard

- Persian UTF-8 repair is now the active stabilization change after Milestone 18.2A.
- Repaired corrupted Persian labels in the app shell/route registry, backend auth message, AI duration aliases, and the Persian command catalog product doc.
- Added `npm run test:utf8` to fail on known mojibake markers in `src`, `backend/src`, `docs`, and root Markdown task files.
- `.editorconfig` now enforces UTF-8, LF, and final newline for the project.
- Validation and Playwright MCP verification passed: Persian dashboard/sidebar/topbar text renders readably, no replacement character was found, and English mode switches through the UI language selector.
## Task 18.2A - Cisco IOS-XE Read-only Foundation and Linux Observability

- Milestone 18.2A is implemented as a narrow foundation: vendor/platform/capability framework, conservative Cisco platform-family detection, IOS-XE read-only capability metadata, parser fixtures, Cisco capability APIs/UI, Linux health metric schema, and Linux monitoring APIs/UI.
- Cisco status: IOS-XE read-only only. Implemented reads cover version/platform, inventory, CPU/memory, interface status/counters, IP interface brief, VLANs, trunks, EtherChannel, STP, routing table, and ACL inspection. Cisco writes remain planned/non-executable.
- Linux observability status: new metric/health tables and read APIs are available; refresh persists connector-backed metric samples and health snapshots after migration. Read endpoints degrade to unknown/empty data if the migration is pending instead of breaking the UI.
- New routes: `/assets/vendors`, `/assets/vendors/cisco`, `/assets/vendors/cisco/devices`, `/monitoring/linux`, and `/monitoring/linux/:deviceId`.
- New APIs: `/api/vendors*`, `/api/devices/:id/capabilities`, `/api/devices/:deviceId/capabilities/refresh`, and `/api/monitoring/linux*`.
- Playwright MCP final verification passed on authenticated desktop/mobile routes with RTL intact, no overflow, no console errors, and no failed/high-status network requests.
- Validation passed: Prisma validate/generate, backend build, backend full tests 186/186, command catalog validation 136 items, i18n parity 73 keys, and root `npx pnpm@10 build` with the existing chunk warning.

## Task 17.8 - Linux Monitoring and Service Status Reliability

- Task 18.0 adds the first compact Security Platform milestone. The app now has `/assets` and `/security` views backed by asset inventory models, idempotent import/sync, seeded security detection, asset-linked findings, and finding-to-reviewed-ActionPlan handoff.
- Asset intelligence now covers sites, locations, roles, vendors, platforms, assets, interfaces, IPs, prefixes, VLANs, relationships, tags, import sources, and sync runs. Existing Devices, SecurityEvents, Findings, and ActionPlans can link to an Asset.
- Mock NetBox and Wazuh integrations are available for health, sync preview, and idempotent sync. They demonstrate the integration contract only; no live external credentials are used.
- Security findings remain proposal-first. Creating an ActionPlan from a Finding does not execute a connector, does not mark success, and does not bypass preview, confirmation, PolicyGuard, audit, or the `connectorInvoked=true` success rule.
- Task 18.0 validation passed: `npx prisma validate`; focused `task18-platform-milestone.test.ts` (5/5); backend `npm run build`; backend `npm run validate:command-catalog` (136 items); backend `npm test` (181/181); root `npm run test:i18n` (73 keys); root frontend build via `npx pnpm@10 build` with the existing Vite large-chunk warning. Local `pnpm` was not on PATH.

- Task 17.8C adds a read-only Linux Server Overview first screen. Device Monitoring now opens on Server Overview by default and summarizes real server state before showing live monitoring, findings, raw logs, or advanced telemetry.
- `/api/devices/:deviceId/telemetry/linux/overview` collects Linux state over the existing SSH connector: host identity, OS/kernel/uptime, CPU/load/core count, memory/swap, mounted disks, disk I/O hints, network interfaces, top processes, important services, listening ports, and recent auth/security warnings. Individual unavailable commands return warnings and partial data instead of failing the whole overview.
- The overview UI presents plain-language cards for Overall Health, CPU, Memory, Disk, Network, Important Services, Security Signals, and Recent Problems, with English/Persian labels and RTL-friendly layout. Advanced technical details remain outside the first screen.
- Task 17.8C parser follow-up: the Linux Server Overview parser now treats missing/undefined command stdout and absent optional sections as partial overview data with warnings instead of crashing. It also keeps Ubuntu/Debian/RHEL-like parsing working and fixes service-state normalization so `inactive` is not misread as `active`.
- Task 17.8C validation passed: focused Task 17.8 tests (18/18); backend `npm test` (176/176); backend `npm run build`; backend `npm run validate:command-catalog` (136 items); root frontend build via `npx pnpm@10 build` with the existing Vite large-chunk warning. Local `pnpm` was not on PATH, Corepack pnpm failed with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, and `npx pnpm@11.10.0` requires newer Node than local `v20.19.5`.
- Task 17.8B simplified the Device Telemetry page into a non-technical three-step flow: Connection, Live Monitoring, and Results. The main screen now shows connected state, device IP/SSH port, last checked time, monitoring status, event count, last event, simple storage usage, and finding cards with problem/impact/evidence/recommended fix.
- Raw event streams, source presets, advanced source selection, storage warnings, backend counters, confidence/parser details, and technical evidence are now behind Advanced diagnostics or Show technical evidence.
- Analyze now works without AI. The Linux telemetry analyze endpoint rebuilds findings from stored telemetry with the deterministic vendor finding engine, returns counts and `lastAnalyzedAt`, and exposes `aiSummary`, `aiAvailable`, and `aiError` without blocking local analysis. The UI no longer calls `/api/ai/chat` for telemetry Analyze and shows a small AI-unavailable note instead of a scary network error.
- Windows storage handling now retries EPERM/EBUSY rename failures with backoff, uses `<deviceId>.<timestamp>.<random>.jsonl.tmp` temp names, and falls back to safe append when a locked rename cannot complete so monitoring keeps running.
- Follow-up runtime fix: telemetry persistence is now Windows-safe. The store recreates `backend/storage/telemetry` recursively before every append/read/status path, serializes writes per device, and uses unique same-directory temp files before atomic rename so first writes and concurrent stream events do not race on a shared `.tmp` file.
- Storage errors are separated from security evidence. Backend logs keep storage failure details under `[linux-telemetry-storage]`, while live monitoring surfaces only a clean telemetry warning and continues generating findings from live events.
- Device Monitoring storage counters now read as `used ... of ...` for bytes and event count. Incoming stream events update live event count, last event time, and stored event count immediately, followed by a backend storage-status refresh.
- Device Monitoring now has bounded per-device event storage. Live Linux events are stored as structured JSONL with max bytes/count/age retention and default 10 MB per device; old events rotate instead of growing without limit.
- Live Linux sources now cover auth, system, kernel, firewall, nginx, apache, fail2ban, and docker. Stream status remains controlled with one active session per device, timeout, warnings, SSE, and stop handling that closes remote SSH stream handles.
- The Linux live parser classifies authentication failures, sudo failures, service failures/restart loops, nginx/apache errors, fail2ban events, firewall blocks, kernel pressure/errors, and Docker daemon errors. Findings stay deduplicated through the vendor finding engine instead of producing one card per line.
- `linux_check_service_status` now uses structured service detection and parsing. Inactive, failed, missing, and unknown services are successful read results when SSH execution succeeded; only SSH/template/validation failures fail the ActionPlan. Result UI shows normalized state, exit code, confidence, explanation, systemd fields, and raw evidence.
- Device Telemetry UI now exposes live event count, stream state, active sources, last event time, bounded storage bytes/count, source/severity filters, grouped findings/evidence, and suggested ActionPlan creation.
- External repo `hiddent3rminal/SSH-Automation-For-Multiple-Servers` was evaluated and rejected as a dependency. It is MIT Python/Paramiko with useful fan-out/retry/result-collection ideas, but has hardcoded sample passwords, insecure host-key auto-add, sudo password shell piping, unbounded logs, and incompatible architecture.
- Validation passed: focused Task 17.8/17.8B tests 14/14 with byte/count retention, Windows storage retry/fallback, deterministic analyze, and simplified UI source coverage; backend build; backend full tests 172/172; frontend build with the existing large-chunk warning.

## Task 17.7 - FortiGate Execution Verification Hardening

- FortiGate guided IPsec VPN now keeps selected AES/SHA2 proposals intact (`aes256-sha256` remains `set proposal aes256-sha256`) and rejects DES/3DES/MD5/SHA1 proposals by default.
- FortiGate connector success is no longer enough for guided VPN success. The connector scans stdout/stderr for FortiOS CLI errors and requires semantic verification of phase1, phase2, static route when enabled, both VPN firewall policies when enabled, NAT/logging expectations, and tunnel summary output.
- Mandatory VPN verification uses targeted `show vpn ipsec phase1-interface <phase1Name>`, `show vpn ipsec phase2-interface <phase2Name>`, `show firewall policy | grep -f <vpnName>`, `get router info routing-table all | grep <remoteSubnet>`, and `get vpn ipsec tunnel summary`. Version-sensitive debug is not mandatory.
- Action Result formatting now shows FortiGate post-execution verification checks when present.
- Action Library support states remain honest: FortiGate actions are executable only when the shared verified requirements are present; unsupported or incomplete write actions stay preview/manual/non-executable.
- Live lab checklist is documented in the handoff; cleanup remains explicit-confirmation-only.
- Validation passed: focused Task 17.7 tests; backend catalog validation (136 items); backend build; backend full tests (158/158); locale parity (73 keys); frontend build with the existing large-chunk warning.

## Task 17.6C - Standard Guided Parameter Flow

- Parameterized catalog actions now route through a standard guided ActionSession flow using generated `catalog:<commandId>` blueprints. This applies across FortiGate, MikroTik, Linux, and future catalog vendors.
- Action Library cards no longer collect required parameters inline. Parameterized actions open the guided flow and preserve selected action/vendor/device in URL state; non-parameterized actions can still create plans directly.
- The guided flow validates required fields before preview/build-plan and rejects exact placeholder/example values. Secret fields are masked, and internal UI control identifiers are not accepted as execution params.
- AI Assistant and Command Catalog AI fallback now route recognized actionable tasks with missing parameters into the same guided flow instead of stopping at text-only or raw `needs_input` responses.
- Verified actions still require validator/template/compiler, connector, PolicyGuard, semantic result support, confirmation, audit, and real connector invocation. Preview-only/manual-only parameterized actions can build review plans but cannot execute.
- Guided UI follows the active `fa`/`en` direction setting; locale parity is maintained.
- Playwright MCP browser tooling is not available in this session, so browser-level acceptance remains pending.
- Validation passed: backend build; focused guided/support/AI regression tests (33/33); backend catalog validation (136 items); backend full test suite (152/152); root i18n parity (73 keys); root `pnpm build` with the existing Vite large-chunk warning.

## Task 17.6 - Optional/Manual Backup Export

- Quick Controlled execution no longer creates mandatory automatic backup/export preflight commands for FortiGate or MikroTik actions.
- FortiGate execution no longer uses `show full-configuration`; guided IPsec VPN can execute after the normal single confirmation without backup/export preflight.
- Backup/export is now clearly optional/manual. PolicyGuard, validation, registered connector/template requirements, audit logging, and real connector-result success conditions remain required.
- Validation passed: focused regression tests, backend catalog validation (136 items), backend build/full test suite, and frontend production build. The frontend build retains only its existing Vite dynamic-import/chunk-size warnings.

## Task 17.5 Follow-up AI Assistant Action Routing

- AI Assistant actionable VPN chat requests now route into the controlled guided flow instead of stopping at a text suggestion.
- Persian and English VPN intents, including `build vpn`, `create vpn`, `setup fortigate vpn`, and Persian VPN creation phrases, resolve to `fortigate_guided_vpn_setup`.
- `/api/ai/chat` creates a proposed ActionSession for guided workflows and returns `actionSessionId`, `actionSession`, and `guidedActionUrl`; the frontend opens `/guided-actions/:sessionId` automatically.
- Missing required VPN parameters are collected in the Guided Action form before preview. Immediate build-plan attempts without required fields return validation errors and create no executable ActionPlan.
- Safety boundary remains unchanged: chat creates only proposed controlled sessions, never raw CLI, never connector invocation, and never execution without explicit user confirmation, PolicyGuard, and the normal Action Center path.
- Migrations: none.
- Validation passed: backend build; catalog validation (136 items); targeted guided/support tests (22/22); backend full tests (147/147); frontend build with existing Vite warnings.
- Known limitations: browser-level navigation tests still need browser tooling; additional action families can reuse this session-routing pattern as their guided UX is hardened.

## Task 17.5 FortiGate Guided VPN Execution Fix

- FortiGate IPsec Site-to-Site guided VPN is now the only executable VPN mode: `fortigate_guided_vpn_setup` with `vpnType=ipsec_site_to_site`, PSK auth, canonical validated params, `fortigate-ssh`, dry-run preview, PolicyGuard, connector invocation, audit/result, and verification commands.
- Fixed the blocker where `guided_action_wizard` provenance leaked into execution parameters and was treated as `srcInterface`. The canonical fields are now `wanInterface` and `lanInterface`; internal UI/action tokens are rejected as FortiGate interfaces.
- The guided VPN compiler emits controlled FortiOS CLI for phase1-interface, phase2-interface, optional static route, optional managed address objects, LAN-to-VPN and VPN-to-LAN policies, verification commands, and rollback metadata.
- UI VPN fields are examples/placeholders only and support any valid customer values. Discovered FortiGate interfaces are offered as suggestions when available; manual entry remains allowed and is validated before execution.
- If cached FortiGate interface discovery is missing at execution time, the backend performs safe read-only discovery through `fortigate-ssh` before final PolicyGuard and before any write command.
- PSK is handled with a process-local temporary `pskSecretRef`. Raw PSK is not persisted in ActionPlan JSON, dry-run output, frontend persisted state, audit, rollback metadata, or docs. Preview redacts `set psksecret` as `********`.
- Action Center validation repair now presents `wanInterface`/`lanInterface` instead of generic `srcInterface` for guided VPN failures.
- Still planned/preview-only: FortiGate SSL VPN, IPsec Remote Access, and any FortiGate catalog/guided VPN action that lacks schema/template/connector/parser/precheck/post-verification.
- Migrations: none.
- Validation passed: backend build; catalog validation (136 items); targeted guided/support tests (21/21); backend full tests (146/146); fa/en key parity (72 keys); frontend build with existing Vite warnings.
- Known limitations: temporary PSK refs are process-local and expire; SSL VPN/remote-access execution still needs real templates/parsers; legacy i18n/mojibake cleanup remains a separate task.

## Task 17.3 Safe Vendor Action Library + Global i18n

- Added a catalog support-state contract: `verified`, `preview_only`, `manual_only`, `unsupported`. `implemented` is now implementation progress only, not execution permission.
- Verified execution requires all six requirements: validated input schema, registered compiler/template, compatible connector/planner, semantic result parser, precheck, and post-verification. Missing any requirement downgrades the item to `preview_only` or `manual_only`.
- Backend execution and dry-run preview generation reject non-verified catalog/guided ActionPlans. The primary rejection code is `CATALOG_COMMAND_NOT_VERIFIED` with stable `messageKey` metadata for frontend translation.
- Quick Controlled still removes only extra approval friction. It does not bypass support state, authorization, validation, device/vendor compatibility, environment restrictions, PolicyGuard, audit, or connector invocation.
- `/action-library` is the prepared-action surface. The dashboard no longer renders the full prepared-command catalog; it shows compact operational shortcuts/status instead.
- The Action Library is vendor-first: FortiGate, MikroTik, Linux, Cisco, pfSense, Generic. It includes device/search/category/risk/support-state/read-only/verified-only filters, device vendor override, compact cards, single-card expansion for params, and no raw CLI rendering.
- Added global i18n foundation using `i18next`/`react-i18next`, `src/i18n/locales/fa/common.json`, `src/i18n/locales/en/common.json`, localStorage language persistence, and `<html lang>`/`dir` switching. `npm run test:i18n` checks fa/en key parity.
- Actor identity for action routes now comes from authenticated request context (`request.authUser`) instead of request body.
- FortiGate VPN wizard remains preview-only. FortiGate write/full-control catalog entries without complete semantic parser/precheck/post-verification are downgraded to `preview_only`.
- Current verified actions: Linux catalog actions, MikroTik daily/check/block/backup actions, and FortiGate read-only/parser-backed actions (`daily-check`, interface/status/routing/license/admin/policy/VPN/HA-VDOM-zone show paths, plus verified show interfaces/firewall policies).
- Current preview-only actions: FortiGate full-control/write or unfinished action library entries including VLAN/interface changes, zones, address/service objects, policies, VIP/IPPool, routing/DNS/NTP changes, IPsec/SSL VPN changes, admins, VDOM, HA, and SD-WAN entries.
- Current manual-only actions: Linux restrict SSH/fail2ban review, MikroTik restrict management, Cisco/pfSense daily/manual reviews, FortiGate manual review items, and Generic security review. `mikrotik.change-ssh-port` remains `unsupported`.
- Migrations: none.
- Validation passed: `npm run validate:command-catalog`, backend `npm run build`, backend `npm test` (145/145), root `npm run test:i18n`, root `pnpm build` with existing Vite warnings.
- Known remaining work: finish migrating all legacy panel text to locale keys, add browser-level RTL/LTR and route tests when Playwright is available, and promote preview-only vendor actions only after the verified requirements are implemented.

## Task 17.2C Guided VPN Build-Plan Preview

- Completed FortiGate VPN guided sessions now build a useful preview-only ActionPlan instead of returning 409 when execution templates are incomplete.
- Preview-only VPN plans are persisted with `executionSupport=planned_or_partial`, `implementationState=partial`, `executable=false`, `source=guided_action_wizard`, missing template names, Persian structured preview, safe CLI outline, verification plan, and rollback plan.
- Action Center disables execution for preview-only guided plans and shows `این اکشن هنوز اجرای واقعی کامل ندارد.` while keeping preview/debug/verification data visible.
- Raw PSK/password values are not persisted in the plan preview; manual PSK input is represented only as `[secret]`.
- FortiGate VPN execution remains partial/planned until full Phase1/Phase2/route/policy templates and verification parser are verified. Protected quick-controlled execution behavior is unchanged.
- Validation passed: Prisma generation, local enum migration apply, backend build, backend tests 140/140, and frontend `pnpm build` with existing Vite warnings.

## Task 17.2B Guided Wizard First for Multi-Step Requests

- Multi-step creation requests now always route to `guided_workflow` before generic/manual fallback, including when no device is selected in the main chat.
- Missing selected device is handled inside the wizard. `/api/action-sessions/start` can create a pending session, and the first step is `device_selection` (`انتخاب دستگاه`); after selection, the backend resolves vendor/connector context from the DB.
- Bottom chatbot and Command Catalog AI fallback start an ActionSession and open `/guided-actions/:sessionId`; they do not create normal ActionPlans, `custom_vendor_action`, `generic_security_action`, or `unsupported_vendor` for guided workflows.
- ActionPlans are still created only after wizard completion and build-preview, then execution remains Action Center confirmation -> PolicyGuard -> connector -> audit/result.
- Validation passed: backend build, backend tests 139/139, and frontend `pnpm build` with the existing chunk-size warning.

## Task 17.2A Guided Workflow Routing Fix

- Multi-step operational requests are now guarded before generic AI/manual fallback. VPN, VDOM, Zone, Policy/Rule, VIP/NAT/Port Forward, Interface/VLAN, and Route creation phrases route to `guided_workflow` when a matching vendor blueprint exists.
- Selected device context is now sent from Command Search Ask AI and bottom chatbot, and the backend resolves `selectedDeviceId` against the DB before trusting UI vendor hints. FortiGate selected devices resolve to `fortigate`/`fortigate-ssh`; MikroTik resolves to `mikrotik`; Linux resolves to `linux`.
- If a guided request has no selected device, the resolver returns `clarification` with `اول دستگاه مقصد را انتخاب کن.` and creates no `vendor=unknown`, `custom_vendor_action`, or `unsupported_vendor` ActionPlan.
- Bottom chatbot guided requests now show the Persian multi-step message and `شروع ساخت مرحله‌ای`; clicking it starts an ActionSession and opens `/guided-actions/:sessionId`.
- Current guided workflow availability: FortiGate Policy/Zone/Route/VLAN/Object/Service are executable where existing compiler templates support them; FortiGate VPN and VDOM are partial/planned and do not build executable plans; MikroTik/Linux guided placeholders open the wizard but remain planned.
- Validation passed: catalog validation, backend build, backend tests 139/139, and frontend `pnpm build` with the existing large chunk warning.

## Task 17.1 FortiGate Full Control Engine

- FortiGate is no longer read-only in the command catalog. Full-control registry coverage now includes interfaces/VLANs, zones, address/service objects, policies, VIP/IP pools, routing/DNS/NTP, VPN, admin access, VDOM, HA, and SD-WAN.
- Every implemented FortiGate action is registered as connector-backed through `fortigate-ssh`; implemented actions no longer intentionally fall through to `manual_or_not_implemented` or `generic_security_action` when a template exists.
- Write flows keep the controlled Mini-SOAR path: structured ActionPlan, config snapshot/preflight, CLI preview/diff metadata, user confirmation, PolicyGuard, real connector execution, verification commands, audit, and rollback reference.
- Persian Command Search Ask AI and bottom chatbot continue to share `resolveAiTemplate`; key operational phrases now map to real FortiGate ActionPlans including interface status, allowaccess changes, zone creation, policy creation with missing-field prompts, and VPN status.
- Raw secrets remain blocked. VPN PSK handling requires `pskSecretRef`; plaintext PSK/API token/password/certificate material must not be emitted to UI/model logs.
- Validation passed: Prisma generation, command catalog validation (136 items), backend build, backend tests (125/125), local enum migration apply, and frontend `pnpm build` with the existing large-chunk warning.

## Task 17.2 Global Guided Action System

- Added a global Guided Action Blueprint system and ActionSession API. Multi-step requests now return `guided_workflow` instead of being forced into broken single-template missing-field plans.
- FortiGate guided workflow registry now covers policy creation, address object creation, service object creation, VIP/port forward, static route, IPsec VPN, SSL VPN, VLAN interface creation, and policy enable/disable/move.
- Executable FortiGate guided workflows are limited to compiler-backed templates. VPN/SSL VPN and incomplete multi-step variants remain partial/planned and do not fake ActionPlan success.
- The port-status bug is fixed: `وضعیت پورت هامو نشون بده` on Linux maps to `linux_list_open_ports`; on FortiGate maps to `fortigate_show_interfaces` and never invents `srcInterface`.
- Command Catalog Ask AI now returns the new modes: `executable_action_plan`, `needs_input`, `guided_workflow`, `clarification`, and `manual_or_not_supported`.
- Frontend Command Catalog opens a Persian guided action wizard for `guided_workflow` and hands built plans back to Action Center.
- Validation passed: command catalog validation, backend build, backend tests (133/133), frontend `pnpm build`.

## Task 17.3B Current Status (2026-07-11)

Product state: `/action-library` is now the prepared vendor-action surface; `/` remains a compact operational dashboard. The global header has Dashboard / Action Library navigation and a persisted language selector (`fa` RTL, `en` LTR).

Execution truth:

- Only `supportState=verified` can execute. `implemented` by itself is not enough.
- Verified requires validated params, registered compiler/template, compatible connector, semantic parser/result contract, precheck, and post-verification.
- Backend execution rejects non-verified catalog/guided plans even if an old client calls the API directly.
- Actor identity remains request-context driven; request bodies are not trusted for actor role/identity.

FortiGate VPN:

- Executable now: FortiGate IPsec Site-to-Site via guided action `fortigate_guided_vpn_setup` with `fortigate-ssh`.
- Required executable fields: tunnel name, WAN interface, LAN interface, remote gateway, local subnets, remote subnets, PSK secret reference, proposal, and optional policy/static-route/NAT/logging/enable-after-create flags.
- Compiler emits controlled FortiOS blocks for phase1-interface, phase2-interface, optional static routes, optional address objects, optional firewall policies in both directions, verification commands, and rollback metadata.
- PSK handling uses an in-memory temporary `pskSecretRef` with a 30-minute TTL. Raw PSK is not persisted in ActionPlan JSON, dry-run output, frontend state, audit logs, or docs. Preview redacts `set psksecret`.
- Still planned/preview-only: FortiGate SSL VPN and IPsec Remote Access. They are not executable until templates and verification parsers are implemented.

Known limitations:

- Temporary PSK refs are process-local and expire; rebuilding the ActionPlan is required after restart/expiry.
- Some legacy UI panels still have older hardcoded/mojibake strings and need a dedicated cleanup beyond this task.
- Frontend build still emits the existing Vite dynamic-import/chunk-size warnings.

Validation status:

- `cd backend && npm run build`: passed.
- `cd backend && npm run validate:command-catalog`: passed, 136 items.
- `cd backend && npx tsx --test test/task17-2-guided-actions.test.ts test/task17-3-support-state-i18n.test.ts`: passed, 20/20.
- `cd backend && npm test`: passed, 145/145.
- `npm run test:i18n`: passed, 72 keys.
- `pnpm build`: passed with existing Vite warnings.

## Task 17.0 FortiGate Read-only Intelligence

- FortiGate has real connector-backed read-only plans for system status, interfaces, routing/DNS, admin access, firewall policy/NAT/VIP, VPN, and HA/VDOM/zone.
- Daily Check returns eight concise Persian sections from the same normalized parsers used by individual ActionResults.
- Severity is evidence-based: unknown data is `not_checked`, unsupported CLI is `not_supported`, standalone HA is not critical, and invalid VM lab licensing is normally `needs_review`.
- Persian Ask AI/chat interface requests resolve to `fortigate_show_interfaces` with `fortigate-ssh` and a registered template.
- Protected quick-controlled lab execution and the `connectorInvoked=true` success requirement are unchanged.

Branch: `product-persian-command-catalog`

Product mode: `PRODUCT_MODE=persian_command_catalog`

## Product State

The project now behaves as a Persian-first Network & Security Command Center with the controlled path:

`AI/Catalog -> ActionPlan -> Preview -> User Confirm -> Connector -> Audit/Result`

Task 16 is functionally complete for:

- AI resolver / AI assistant contract / honest catalog AI fallback
- vendor-aware Daily Check foundations and Persian UI
- Linux Service Health templates, connector coverage, and UI
- result navigation in a new tab with popup-block fallback
- structured Action Result formatting for key Linux and MikroTik actions

Task 16.2 is complete for Command Catalog AI fallback: no-result `Ask AI` requests now use the central AI template resolver first and create executable ActionPlans when a registered template exists.

Task 16.3 is complete for deterministic Persian intent routing across AI chat and Command Search AI fallback. Simple Persian admin requests now map to executable template-backed ActionPlans before generic AI/manual fallback.

## What Works

- AI-supported Persian requests that map to registered templates create executable ActionPlans instead of vague manual proposals.
- Command Catalog AI fallback maps Persian Linux port-status phrases such as `وضعیت پورت های رو میخوام ببینم` to `linux_list_open_ports` with `executionTemplateRef=linux_list_open_ports` and `connectorType=linux-ssh`.
- Persian deterministic intent routing maps `وضعیت پورت های باز رو نشون بده` to executable `linux_list_open_ports` with empty params, `executionTemplateRef=linux_list_open_ports`, `connectorType=linux-ssh`, and metadata source `ai_mapped_template`.
- Linux mapped requests for firewall status, service status, sudo users, block IP, and open port now validate only the resolved template params. Open-port listing no longer requires `sourceIp`, `ipAddress`, or `port`.
- MikroTik mapped requests for management services, login logs, and block IP now use executable alias action types backed by registered RouterOS templates.
- Command Catalog AI fallback now returns honest modes: `executable_action_plan`, `needs_input`, `guided_workflow`, `clarification`, and `manual_or_not_supported`.
- Daily Check now uses vendor-aware profiles across Linux, MikroTik, FortiGate, Cisco, pfSense, Juniper, Palo Alto, Windows, Docker, and Kubernetes.
- Linux and MikroTik Daily Check remain the real connector-backed execution paths.
- Linux Service Health is available for running services, failed services, important services, and targeted service status checks.
- Action execution results open in a new tab from Action Center, with a visible fallback link if the browser blocks popups.
- Action Result view now shows Persian summary, execution status, device/vendor, duration, structured output, next actions, and collapsed raw output.
- Execution safety remains strict: `intent=execute`, resolved template, real connector invocation, persisted stdout/stderr/exitCode/duration, and no success without `connectorInvoked=true`.

## Partial or Open

- Older mojibake strings still exist in unrelated legacy UI/backend areas and need a dedicated encoding cleanup task.
- Daily Check for non-Linux/MikroTik vendors is honest manual-only today; it is not real execution yet.
- Frontend build still emits the existing large-chunk warning; this is not introduced by Task 16.
- The local database needed the Task 16 enum migration SQL executed for validation; other environments must also apply it before using the new Linux service-health actions.

## Known Bugs and Risks

- If another environment does not apply `20260707160000_task16_linux_service_health`, creating plans for new Linux service-health actions will fail at the database enum layer.
- Several legacy screens still mix older English text with Persian-first UI conventions.
- Success semantics must stay evidence-based; preview-only states must never be shown as successful execution.
- `command_search_ai_fallback` metadata is now treated as controlled catalog metadata only when it is implemented, connector-backed, and has a registered execution template.
- `ai_mapped_template` metadata is controlled only when it is implemented, connector-backed, has a registered execution template, and still passes PolicyGuard/connector checks.

## Vendor Status

| Vendor | implemented | manualOnly | planned | connector status | daily check status |
|---|---|---|---|---|---|
| Linux | Yes | Some catalog items | No | `linux-ssh` real connector | Real execution |
| MikroTik | Yes | Some catalog items | Some | `mikrotik-ssh` real connector | Real execution |
| FortiGate | Full-control catalog and read/write templates | Some legacy/manual review items | Some | `fortigate-ssh` interactive SSH connector | Real execution |
| Cisco | No | Yes | Some | connector not ready | Manual checklist |
| pfSense | No | Yes | Some | connector not ready | Manual checklist |
| Juniper | No | Yes | Some | connector not ready | Manual checklist |
| Palo Alto | No | Yes | Some | connector not ready | Manual checklist |
| Windows | No | Yes | Some | connector not ready | Manual checklist |
| Docker | No | Yes | Some | connector not ready | Manual checklist |
| Kubernetes | No | Yes | Some | connector not ready | Manual checklist |

## Next Recommended Task

1. Run a focused UTF-8/mojibake cleanup pass without touching execution policy.
2. Apply the Task 16 enum migration to every shared/local environment that uses the project database.
3. If product scope continues, deepen Linux/MikroTik result UX and start real connector work for the next vendor.

## Validation

- `cd backend && npm run prisma:generate`
- `cd backend && npm run validate:command-catalog`
- `cd backend && npm run build`
- `cd backend && npm test`
- `cd backend && npx prisma db execute --file prisma/migrations/20260707183000_task16_3_persian_intent_aliases/migration.sql`
- `cd backend && npx prisma db execute --file prisma/migrations/20260707160000_task16_linux_service_health/migration.sql`
- `cd backend && npx prisma db execute --file prisma/migrations/20260709120000_task17_1_fortigate_full_control/migration.sql`
- `pnpm build` or equivalent root build command when pnpm is unavailable

Validation status: passed. Frontend build still shows the existing Vite chunk-size warning only.

## FortiGate SSH Read-only Discovery and Daily Check (2026-07-08)

- `fortigate-ssh` now uses an interactive FortiOS shell, recognizes prompts, and advances `--More--` pagination automatically.
- Discovery collects and parses version, serial, hostname, operation mode, system time, license, CPU/memory/sessions, interfaces/IPs, default route, DNS, and administrators.
- `fortigate_daily_check` is a registered read-only ActionPlan template using eight approved commands and six Persian result sections.
- Success continues to require a real connector call with `connectorInvoked=true`.
- Persian operational intent routing now covers interface/management ports, route/DNS, license/FortiGuard, admin users, and Daily Check through the same central resolver used by chat and AI propose.
- Supported FortiGate results are structured and Persian-first. `License Invalid` is a lab warning (`needs_review`), unknown parsing is `not_checked`, and command unavailability is `not_supported`.

## Protected Behavior

Keep:

- `ACTION_EXECUTION_MODE=quick_controlled`
- `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`

In this lab mode, one user confirmation is enough for supported Linux/MikroTik templates, but selected device, validated parameters, registered template/connector, explicit `intent=execute`, real connector invocation, audit logs, and real execution results remain mandatory.

## Task 16.3 Runtime Validation Follow-up

- The local no-result Command Catalog flow for `وضعیت پورت های باز رو نشون بده` now creates and executes a real connector-backed `linux_list_open_ports` ActionPlan without stale `sourceIp` validation.
- Verified route-level flow: search count 0 -> AI fallback `mode=executable_action_plan` -> `actionType=linux_list_open_ports` -> `executionTemplateRef=linux_list_open_ports` -> `executionSupport=connector` -> `connectorType=linux-ssh` -> validation passed -> quick execution succeeded with `connectorInvoked=true` and visible `ss/netstat` output.
- Action Center execute buttons now show the exact Persian label `تایید و اجرا`.
- Top-level ActionPlan control metadata such as `source=ai_mapped_template` must not be canonicalized into network fields such as `sourceIp`.
- Additional validation: `cd backend && npm run build`; `cd backend && npm run validate:command-catalog`; `cd backend && npm test` passed with 119/119 tests; root `npm run build` passed with the existing Vite large-chunk warning. `pnpm` is not available on PATH in this shell.

## Task 18.1 Milestone A - Platform IA and App Shell

- The app now has a route registry and grouped shell for the Security Platform IA. `/dashboard`, `/assets`, `/assets/devices`, `/assets/devices/:assetId`, `/assets/sync`, `/security`, `/security/findings`, `/security/findings/:findingId`, `/security/rules`, `/monitoring`, `/actions`, `/assistant`, `/integrations`, and `/settings` are routable surfaces.
- Future pages are shown with planned badges instead of fake functionality.
- Asset and Security platform views are split into feature folders with hooks/components/pages. The old combined panel remains in the tree for compatibility but is no longer the main route surface.
- Design tokens were added for later Figma implementation without changing execution policy.
- MCP browser inspection before changes was limited by the auth gate; unauthenticated routes showed the login screen and expected 401 `/api/auth/me` errors.

## Task 19.1 R-A confirmed runtime blockers (2026-07-13)

- Device registration has no live route or CTA from Assets, Devices, Vendors, or the Cisco empty state.
- Cisco exposes implemented read capability metadata without a registered usable live connector/device path.
- Assistant exact-plan handoff is not route-based and does not preserve an ActionPlan ID.
- The port-545 Linux ActionPlan is rejected with `COMMAND_PLAN_STALE` before connector execution; `connectorInvoked=false` and no success is claimed.
- Repeating the same Assistant request reports `canCreateActionPlan=true` but renders manual-only and creates no second plan.
- Persian pages currently run with `lang=en dir=ltr` and several primary workflows remain English-heavy.
- R-A evidence is recorded in `docs/TASK_19_1_RUNTIME_BASELINE.md`, `docs/TASK_19_1_BROKEN_CONTROL_REGISTER.md`, and `docs/TASK_19_1_API_FAILURE_REGISTER.md`.
- Next controlled milestone is R-B; R-C through R-G have not started.

## Task 19.1 R-B current state (2026-07-13)

- Device onboarding and device workspace foundations are implemented; Product State Contract is `19B.1`.
- Onboarding uses credential references only, rejects plaintext secrets, and requires connector-backed test, supported detection, read-only discovery, preview, and save in order.
- Cisco IOS-XE has a bounded live read-only SSH path for onboarding. No live Cisco target was supplied, so runtime acceptance remains unverified and mutations remain disabled.
- Required registration CTAs and routes are visible and Playwright-verified on desktop/mobile without overflow or 4xx/5xx responses.
- Existing Linux Device IDs and Asset IDs resolve to the same structured workspace contract; missing optional observability tables degrade without a migration.
- R-C through R-G remain unstarted. The next milestone is R-C exact-plan navigation.
## Database/Auth Runtime Status (2026-07-14)

- Normal backend runtime is restored for `cd backend && npm run dev`.
- Shared database URL resolution now aligns Prisma CLI, PrismaClient, PrismaPgAdapter, and pg Pool on `127.0.0.1:55432/firewall_log_auth` for the local stale-runtime case.
- `/api/health/ready` is stable and verifies database connectivity before reporting ready.
- Authentication is reachable again: MCP showed authenticated `/api/auth/me` responses and the Dashboard opened from the live frontend without current console errors.
- Validation passed: Prisma validate/generate, backend build, serialized backend tests 209/209, and frontend build.

## Runtime Auth/CORS Follow-up (2026-07-14)

- Backend is running as one normal `npm run dev` process on port 4000.
- Current frontend origin `http://localhost:5174` is included in backend CORS defaults.
- Runtime proof passed: ready endpoint 10/10, Prisma `appUser.count()`, auth login 200, and MCP-authenticated dashboard on 5174 with no current console errors.

## Database Runtime Port Correction (2026-07-14)

- Normal `cd backend && npm run dev` now uses the existing dotenv database name and credentials on Windows PostgreSQL at `127.0.0.1:5432`.
- `backend/src/config/database-url.ts` no longer rewrites the local development database to the stale temporary `127.0.0.1:55432/firewall_log_auth` runtime; it only normalizes localhost to `127.0.0.1`.
- Verified runtime source: `127.0.0.1:5432/firewall_log_analyzer`.
- Proof passed: `Test-NetConnection 127.0.0.1 -Port 5432`, `/api/health/ready` 200, `/api/auth/login` 200, `/api/auth/me` 200, `/api/assets` 200 with 7 assets, and `/api/credentials` 200 with 4 credential references.
- Backend build passed. Playwright MCP dashboard verification is still pending because no Playwright MCP callable tools were exposed in this turn.

## Device Onboarding Final Repair (2026-07-15)

- Onboarding now has an explicit honest unverified path and a connector-backed verified path that cannot succeed unless `connectorInvoked=true`.
- Sessions persist across restarts; missing, expired, credential-invalid, duplicate, and transaction-rollback paths have focused coverage.
- The additive onboarding-session migration is applied and Prisma reports the schema up to date.
- Browser acceptance created exactly one Device and linked Asset, verified redirect/list state, then safely removed only those test records; protected counts returned to 3/7/4/5/124.

## Device Workspace / Action Center Repair (2026-07-15)

- Phase 1 device verification backend is implemented without a migration: the Device-scoped API reuses durable onboarding sessions and registered connectors.
- Failed real attempts remain unverified while preserving `connectorInvoked=true` when invocation occurred; successful verification still requires connector-backed test, detection, discovery, preview, and commit.
- Next phase: expose this contract as the prominent Connection & Verification workspace surface.
- Phase 2 is complete: the contract is now visible and operable on every managed Device Workspace in Persian and English, with responsive controls and history.
- Next phase: converge the Action Center lifecycle/backend projection.
- Phase 3 is complete: `/api/action-center` now supplies truthful lifecycle, summary, control-capability, detail/audit, retry, and cancellation contracts.
- Current live projection contains 124 preserved ActionPlans; any historical success lacking connector evidence is deliberately counted as failed.
- Next phase: replace the clipped legacy Action Center UI with the responsive workspace.
- Phase 4 is complete: Action Center now uses the lifecycle projection, shows at most 25 rows per page, and keeps execution controls visible in the detail panel.
- Direct routes, both locales, unsupported-action gating, and all three required desktop viewports have authenticated browser proof.
- Next phase: full validation, real connector acceptance, preservation proof, and final cleanup tests.
- Final acceptance is complete. Device Workspace real Cisco attempts invoke the registered connector and persist truthful failure evidence across restart; the current Cisco target times out and therefore remains unverified.
- A temporary read-only Linux ActionPlan completed the full Action Center lifecycle with `connectorInvoked=true`; its evidence/result views passed authenticated browser inspection and the tagged plan was precisely cleaned up.
- Final protected counts are Device 4, Asset 7, DeviceCredential 4, Finding 5, and ActionPlan 124. Prisma is current, the dry-run reconciliation changed zero rows, and no migration is required by this repair.
- Validation passed: backend build and 236/236 tests; frontend build; 97-key locale parity; Persian copy check; 450-file UTF-8 check; responsive authenticated Playwright acceptance; and diff check.
## 2026-07-15 - Action Center urgent execution path

- Implemented visible New Action, preview, Confirm and Execute, Retry, and Run again controls.
- Real execution continues through quick-execute and the UI exposes connector invocation, stdout/stderr, evidence, and final lifecycle status.
- Historical completed records remain immutable; rerun/retry creates a new ActionPlan.
- Browser acceptance remains pending because Playwright MCP navigation is unavailable in the current tool surface.
## 2026-07-15 - Action detail runtime compatibility repair

- Historical ActionPlans with nullable result/approval JSON are normalized before rendering.
- Authenticated Playwright proved planned, failed, and succeeded deep links at 1366x768 with no error boundary, console errors, or horizontal overflow.
- Existing ActionPlan records were read only; mutation-based preview/retry/execution acceptance was intentionally not run under the no-database-modification constraint.
## 2026-07-15 - Assistant Action Center handoff

- Proposed Assistant ActionPlans now show Generate Preview immediately at the top of their Action Center deep link.
- Preview transitions the same plan to visible Confirm and Execute; execution remains routed through quick-execute and requires connector evidence.
- Authenticated Persian browser acceptance succeeded against the registered Linux connector with real stdout and `connectorInvoked=true`.
## 2026-07-15 - Action result page handoff

- Confirmed Action Center executions now open the dedicated `/actions/:actionId/result` page after the backend quick-execute request settles.
- Failed connector executions also open the result page so sanitized error/output evidence remains visible.
- Focused contract tests, frontend/backend builds, and authenticated real-browser acceptance passed; temporary acceptance data was removed.
## 2026-07-15 - Action history controls are executable and visible

- Opening a history ActionPlan now brings its review/preview/execute controls into the viewport instead of leaving the user at the bottom of the history table.
- Row actions are lifecycle-aware and visually primary when operator approval is possible.
- Authenticated AI Assistant -> Action Center -> real connector -> result acceptance passed at 1366x768 with zero console errors; temporary runtime records were removed.
## 2026-07-15 - Asset synchronization workflow repaired

- `/assets/sync` now renders actual preview rows and structured operation results instead of instructing operators to inspect raw API/audit data.
- NetBox and Wazuh mock apply are explicitly review/confirm gated and idempotent; production connectivity remains disabled and clearly labeled until real endpoints and credential references exist.
- Device-to-Asset reconciliation is directly usable and reports scanned/created/updated totals. Focused API and authenticated browser acceptance passed.
## 2026-07-15 - Direct equipment management and history cleanup

- Equipment and vendor clicks now lead to useful summaries, and the device workspace has direct quick-edit and guarded-delete controls.
- Admins can clear completed ActionPlan history after explicit confirmation; active/pending actions are preserved.
- Focused API tests and authenticated 1366x768 browser acceptance passed without deleting existing user records.

## 2026-07-18 - Inventory/onboarding/Cisco/action UX repair

- Active inventory removal now uses archive semantics across Device and Asset instead of hard-deleting only Device rows.
- Device onboarding is a simplified three-step flow with inline credentials, real connection testing, unverified fallback, SPA navigation, and duplicate prevention.
- Cisco onboarding uses secure modern algorithms first and exposes legacy compatibility only behind an explicit Advanced approval path.
- Equipment list, device overview, and Action Center execution surfaces are simplified for operator use, with diagnostics and internals moved to Advanced sections.
- Validation passed for schema/build/catalog/i18n/UTF-8/diff checks; isolated-database tests remain skipped unless TEST_DATABASE_URL is provided.
## 2026-07-18 - Operational dashboard and Cisco capability architecture

- Dashboard is now operational-data backed: recent executions, success/failure, approvals, registrations, and configuration changes come from stored product records.
- Cisco support now has a central operation registry and generated catalog/action definitions. Implemented read-only IOS-XE commands execute through Action Center; configuration/admin areas remain planned and non-executable until safe contracts are added.
- `/api/vendors/cisco/devices` reports active registered Cisco devices from inventory/detection evidence instead of returning a mock empty list.
- Current validation passed for schema, catalog, backend/frontend builds, i18n, UTF-8, diff check, and Cisco parser/fixture coverage. Isolated DB tests still require TEST_DATABASE_URL.
## 2026-07-19 - Cisco legacy onboarding and idempotent registration repair

- Fixed Cisco onboarding so the explicit per-session legacy compatibility option reaches the existing ssh2 connector as append-only legacy algorithms, while modern SSH remains the default and authentication failures do not trigger a legacy retry.
- Test Connection now persists truthful connector invocation and sanitized diagnostics, including connectorInvoked, legacyCompatibilityRequested, legacyCompatibilityApplied, connectionPhase, and structured Cisco error codes.
- Successful Cisco SSH now opens an interactive shell, disables paging, runs show version, detects IOS-XE, IOS Classic, NX-OS, and ASA separately from automation support, and lets unsupported-but-connected platforms proceed to unverified review.
- Device registration now normalizes management IPs and transactionally reuses/reactivates matching Device/Asset records, preserving history. True unrelated ownership returns DEVICE_MANAGEMENT_IP_CONFLICT for the UI conflict actions.
- Validation in progress includes backend build, frontend build/typecheck, Cisco ssh2 fixture tests, onboarding boundary tests, i18n, UTF-8, workflow, and diff checks. No secrets or .env values were printed or changed.

## 2026-07-19 - AI Assistant vendor context routing

- Assistant action routing now preserves selected-device context through context building, intent resolution, target-scoped catalog matching, and ActionPlan creation.
- The selected device is the source of truth for vendor/platform/capabilities/supported actions; prompt text is not used to infer or switch vendor.
- Supported executable MikroTik, Cisco, FortiGate, and Linux target actions can create reviewable ActionPlans again. Unsupported/custom requests stay in Assistant chat with no ActionPlan or Guided Action redirect.
- Validation passed for backend build, command catalog validation, targeted routing/context tests, frontend build, i18n, UTF-8, workflow, and diff check. Full backend tests still need an existing isolated test database; the attempted run failed because `firewall_log_analyzer_test` is absent.

## 2026-07-19 - AI Assistant custom ActionPlan fallback

- Supported executable actions still resolve through the selected device catalog and create connector-backed ActionPlans.
- Operational custom/unmatched prompts for a selected device now create a review-only `custom_vendor_action` ActionPlan for Action Center review across vendors.
- The fallback is not executable: metadata records `manualOnly`, `executionSupport=manual`, `executable=false`, no connector/template, no preview, no execution, and no Guided Action session.
- Informational prompts remain chat-only because the fallback requires an operational verb.
- Validation passed for backend build, targeted AI routing/context tests, frontend build, i18n, UTF-8, workflow, and diff check. Full backend tests were attempted; 232/298 passed and 66 failed due to the missing isolated `firewall_log_analyzer_test` database and older unrelated source-contract expectations.

## 2026-07-19 - AI Assistant selected-vendor ActionPlan coverage

- Selected-device overview/status prompts now route to registered read-only vendor actions when available, so a MikroTik router overview becomes a safe `mikrotik_daily_check` ActionPlan candidate instead of the generic "not ready" response.
- Unmatched selected-device requests now create review-only custom ActionPlans from both chat and `/commands/ai-propose`; neither path returns `actionPlan: null` for a device-scoped custom proposal.
- Executability remains controlled by backend catalog metadata: verified support, connector support, registered execution template, selected device protocol, PolicyGuard, approval, audit, and connector evidence are still required.
- Raw AI-generated commands are still not executable. To make a new custom request executable, add a registered backend catalog item/template/connector handler for that vendor.
- Validation passed for backend build, command catalog validation, targeted AI routing/context tests, frontend build, i18n, UTF-8, workflow, and diff check. Full backend tests were attempted; 235/301 passed and 66 failed due to the missing isolated `firewall_log_analyzer_test` database and older unrelated source-contract expectations.

## 2026-07-19 - AI Assistant selected-device fallback widened

- The remaining chatbot failure was caused by the fallback guard still requiring a device keyword or operational verb. Prompts like `کار هامو نشون بده` with a MikroTik target did not satisfy that guard, so the Assistant answered "not ready" without creating an ActionPlan.
- Any request with a selected device now creates a review-only custom ActionPlan when no executable backend catalog action matches and resolver-required fields are complete.
- Existing supported actions are unchanged and still create executable connector-backed ActionPlans. Custom fallback plans are review-only and cannot execute raw AI commands.
- Validation passed: backend build, command catalog validation (191 items), targeted AI routing/context tests (24/24), frontend build, i18n, UTF-8, workflow, and diff check.
- Full backend `npm test` was attempted and stopped at `TEST_DATABASE_URL_REQUIRED`, so no local development database was touched.

## 2026-07-19 - AI Assistant intent split for read-only Cisco VLAN questions

- The latest chatbot defect was a resolver scoring issue: a read-only VLAN count/list question could match Cisco `create-vlan` because `vlan` was the strongest shared token and generic mutating verbs were counted as lexical evidence.
- The resolver now separates read-only and mutating requests before target-catalog selection, ignores generic verbs as match evidence, and requires a real domain/title/alias token match.
- Persian VLAN spellings (`ویلن`, `ویلان`, `وی لن`) normalize to `vlan`; `چند تا vlan دارم` and `چن تا ویلن دارم` resolve to the read-only executable `cisco.show-vlan-brief` plan, while `create VLAN 123` remains `cisco.create-vlan`.
- Action Center uses catalog metadata titles for generic Cisco wrappers, so the selected action and history rows show the operation title rather than `generic security action`.
- Validation passed: targeted AI routing/context tests (27/27), backend build, command catalog validation, frontend build, i18n, UTF-8, workflow, and diff check. Full backend test remains gated by missing `TEST_DATABASE_URL`.

## 2026-07-19 - AI Assistant custom proposal catalog scoring

- Fixed nearest-catalog coercion for unprepared selected-device prompts. The resolver no longer scores generic wrapper action types such as `generic_security_action`, and action id/type phrase matching now handles separators without falling back across vendors.
- Supported catalog actions still create connector-backed ActionPlan candidates; unmatched Cisco, MikroTik, FortiGate, and Linux requests now become review-only `custom_vendor_action` proposals with no catalog id, no template, and no connector execution.
- Custom proposal ActionPlans now carry expected impact, prechecks, verification, rollback, proposed intent, and explicit review-only/backend-execution-required metadata for Action Center review.
- Validation passed: targeted AI routing/context tests (31/31), backend build, command catalog validation (191 items), frontend build, i18n, UTF-8, and workflow checks.
- Full backend `npm test` remains blocked by missing `TEST_DATABASE_URL`; a DB-backed chat smoke could not run because `firewall_log_analyzer_test` does not exist, and live `/api/devices` returned unauthorized without a browser session.

## Explicit AI Chat/Action modes and Action Center parameter handoff (2026-08-24)

- Removed the visible Auto mode. Chat and Action now have independent, enforced backend contracts rather than relying on prompt heuristics.
- Chat uses the selected device/vendor evidence context but cannot create intents or ActionPlans. Action requires a selected target and always enters controlled planning.
- Parameterized actions create a draft ActionPlan and continue in a sequential, backend-schema-owned Action Center workspace. Parameterless actions remain ready for normal preview/review.
- Custom connector plans are rebuilt from declared operator fields and revalidated server-side; undeclared fields and raw AI shell are rejected. A controlled Linux local-user creation operation now demonstrates the full `username -> preview -> confirm -> connector -> audit/result` path.
- Validation passed: 37 focused tests, backend/frontend builds, 191-item catalog validation, targeted ESLint, locale/UTF-8 guards, real Docker runtime smoke, sanitized real OpenRouter response, healthy API/web containers, HTTP 200 application routes, and exact old-image cleanup.

## AI Assistant visual workspace redesign (2026-08-24)

- Replaced the stacked technical dashboard presentation with a conversation-first workspace: one compact header, explicit Chat/Action switch, readable device selector, focused message canvas, and a contextual side rail.
- Chat and Action now have mode-specific Persian empty states and examples. Message bubbles have clear user/assistant identity, correct RTL presentation, responsive widths, and a multiline composer with keyboard submission.
- Security summaries, advanced analysis, provider diagnostics, and plan internals remain available but are collapsed by default. Action state, missing parameters, and the Action Center handoff remain prominent when relevant.
- Responsive layout supports phone, tablet, and desktop breakpoints without changing the existing Chat/Action execution contracts.
- Validation passed: targeted ESLint, TypeScript, frontend production build, 859-key locale parity/Persian-copy guard, 599-file UTF-8 guard, healthy Docker deployment, and HTTP 200 for `/firewall/assistant`. The superseded web image was reclaimed through the bounded project deployment script.

## AI ActionPlan connector execution repair (2026-08-25)

- Removed the unsupported-action shortcut that bypassed the configured AI provider and created `manualReview` ActionPlans. Action mode now lets unmatched vendor operations produce a structured custom connector proposal.
- Custom AI plans are persisted only when the selected vendor/device, SSH connector, registered execution template, verification commands, and vendor Policy all validate. Rejected or ambiguous output creates no misleading non-executable ActionPlan.
- Parameterized custom operations remain connector-backed drafts. Action Center collects declared missing fields, rebuilds the plan server-side, refreshes executable metadata, and requires preview plus the existing single protected-lab confirmation before connector dispatch.
- Action Center UI now recognizes verified `ai_custom_connector_plan` records as executable instead of blocking every `custom_vendor_action` by type. Incomplete plans remain blocked until their declared fields are complete.
- Validation passed: 53 focused cross-vendor tests, backend and frontend builds, 191-item catalog validation, healthy API/web Docker deployment, HTTP 200 web/health checks, and bounded superseded-image cleanup. The full database test runner remains gated by `TEST_DATABASE_URL_REQUIRED`; a real OpenRouter probe was not run because the security reviewer rejected exposing the credential-bearing host proxy on `0.0.0.0`.

## Clear connector execution result presentation (2026-08-25)

- The Action result route now leads with the real connector response instead of a generic success summary. Every recorded command is shown separately with its template, exit code, success/failure state, stdout, stderr, and copy control.
- Direct legacy `stdout`/`stderr` results remain supported. Successful commands without text output receive an explicit empty-output explanation instead of a misleading missing-structured-data panel.
- Device, vendor, duration, and command count are condensed into the status header; action identifiers, executor, and stored lifecycle remain behind a collapsed technical-details section.
- Structured summaries, tables, findings, and genuinely relevant next actions remain available without duplicating the raw connector output. The layout is responsive from phone to desktop.
- Frontend production build, targeted ESLint, UTF-8 guard, focused result-view contract test, and command-output normalization checks passed. The Docker web container is healthy, and the bounded deployment script reclaimed only the superseded project image.

## Action result interruption recovery and responsive verification (2026-08-25)

- Revalidated the output-first Action result flow after the interrupted session with a database-isolated fake Linux connector execution. The connector ran exactly once and the successful ActionPlan persisted its real stdout.
- Added defensive width constraints to the result shell, command cards, command labels, and stdout/stderr panes so long connector output cannot widen or clip the phone layout.
- Browser device emulation confirmed exact, overflow-free layouts at 390x844, 768x1024, and 1440x1000. Frontend build, targeted ESLint, focused result-view contract, Docker build/health, and HTTP checks for the app, result deep-link, and API health all passed.
- The bounded web deployment left one current `firewall-log-analyzer-web:local` image; Docker had already reclaimed the superseded project image. No global prune was used.

## Unified attacker intelligence workspace (2026-08-26)

- Removed the Integrations navigation tab and its three frontend routes, replacing it with the implemented Persian-first `مهاجمان` workspace at `/attackers`.
- The backend qualifies source IPs only from open Findings with a valid `srcIp`; ordinary log presence alone never labels an address as an attacker. Qualified addresses are enriched across normalized events from every vendor, device, and asset in the shared telemetry store.
- The API aggregates deterministic risk, confidence, first/last seen, vendors, affected devices/assets, categories, MITRE tags, target IPs/ports, protocols, actions, usernames, event types, and redacted evidence. External Geo/ASN fields remain explicitly unavailable until a real provider is configured.
- The final UI is intentionally compact: one short header, three essential counters, one-line filters, readable attacker cards, a focused detail panel, and a small actionable empty state. Phone/tablet/desktop containment is covered at 1100, 650, and 390px breakpoints.
- Real isolated PostgreSQL/API testing passed across Linux and MikroTik Findings and events, including cross-vendor aggregation, public/private scope, vendor filtering, 404 for an unqualified log-only IP, and secret redaction. Product-state/source tests passed 9/9, backend/frontend builds and UTF-8/i18n/smoke checks passed, and deployed web/API containers reached healthy state. Bounded deployment reclaimed only superseded project images; no global prune was used.

## 2026-08-27 - Global IRANYekan typography deployed

- The bundled `iranyekanwebregularfanum.ttf` asset is now the global UI font for the document, React root, application shell, controls, selects, textareas, options, and modal/portal content.
- Technical command output (`code`, `pre`, `kbd`, and `samp`) intentionally keeps a monospace stack for operational readability.
- The production frontend build contains the font asset, and the Docker web container is healthy. Live HTTP checks returned 200 for the application, CSS bundle, and the 60,268-byte font file.
- The bounded web deployment workflow replaced the project web image without a global Docker prune; Docker had already reclaimed the superseded image.

## 2026-08-30 - User administration and animated navigation

- Settings is now an implemented, visible `Users and settings` center instead of a placeholder/local-mode entry. Admins can create accounts, assign `viewer`/`operator`/`admin` roles, restrict seven product sections, activate/deactivate accounts, and reset another user's password.
- Section access is enforced centrally on backend requests as a restrictive layer over role permissions. Navigation and direct frontend routes use the same grants; changes revoke the target user's sessions so new access takes effect on the next login.
- Safety invariants prevent self-demotion, self-deactivation, removal of the last active admin, empty non-admin access, weak initial/reset passwords, and non-admin use of user-management endpoints.
- The desktop sidebar is now compact, colorful and animated with a stable 76px collapsed state, clear active signals, identity footer, responsive mobile drawer behavior, and `prefers-reduced-motion` support.
- Migration `20260829213000_user_section_access` is deployed; existing accounts retain all seven sections. API and web containers are healthy, the database reports all 44 migrations applied, the live settings route returns 200, and unauthenticated user-management access returns 401.

## 2026-08-30 - Six-character managed account password

- Admin-created and admin-reset account passwords now accept any value from 6 to 128 characters, and authentication accepts the same minimum so six-character credentials can actually sign in.
- Personal password changes retain the stronger existing 12-character policy.

## 2026-08-30 - Administrator-only session termination

- Listing sessions, terminating an individual session, and signing out all sessions now require the admin-only `auth.session.terminate` permission.
- Ordinary logout and personal password change remain available to every authenticated role; non-admin settings no longer request or render session-management controls.

## 2026-08-30 - Vendor-scoped trusted source IPs

- The attacker workspace now includes a compact admin-only trusted-IP manager with exact IPv4/IPv6 validation, an optional label, and independent scopes for Linux, MikroTik, FortiGate, Cisco, pfSense, or every vendor.
- Adding an address suppresses its still-open matching Findings and excludes matching Findings and evidence events from attacker aggregation. Vendor scope is preserved, so trusting a Linux management IP does not hide activity from another vendor.
- The allowlist is persisted in `TrustedSourceIp`, protected by `security.policy.manage`, and create/delete actions are audited. Backend/frontend builds, targeted ESLint, and 2 focused regression tests passed.

## 2026-08-30 - Adaptive near-real-time detection monitoring

- New events now enter a 750 ms per-device debounce queue with bounded concurrency, so bursts are combined and at most two detection jobs execute in parallel. Independent devices no longer block behind a single global detection queue.
- Read-only Findings and Attacker API requests no longer trigger full scans. Detection queries are device-scoped and limited to the longest active rule window, while a cursor-based monitor fallback examines only devices that received events since its last sweep.
- Collectors retain their configured active interval, back off deterministically after quiet runs or repeated failures, add stable per-device jitter, and cap the effective interval at 15 minutes. This prevents ten devices from reconnecting simultaneously and reduces idle/error load.
- Collector state now persists idle/failure streaks and monitoring status exposes effective intervals plus dispatcher queue/concurrency. Backend/frontend builds and 2 focused scheduling/architecture tests passed.

## 2026-08-30 - Operational application top bar

- Replaced the disabled global search, disabled notification, duplicate language/user/logout controls, and oversized status cards with one compact operational bar.
- The bar now identifies the current workspace, shows backend health as a small live signal, links to the selected device, provides a direct New Action shortcut, and groups identity, language, settings, and logout in one account menu.
- Phone/tablet layouts reduce controls to recognizable icons and expose the account menu as a full-width safe panel. Reduced-motion behavior is preserved; targeted ESLint, frontend production build, and the focused UI contract test passed.
# Android server-connected v1.0.0 (2026-08-30)

- Added a Capacitor Android first-run server bootstrap with a real readiness probe, Persian mobile UX, and an in-app change-server action.
- Added native Bearer authentication backed by Android Secure Storage while retaining web Cookie/CSRF authentication and the existing role/section/PolicyGuard enforcement.
- Added release-deny/debug-only cleartext network security configs, Android version `1.0.0` (`versionCode 10000`), and a reproducible debug APK build script.
- Added architecture and Persian installation guides. Frontend/backend builds, focused Android transport tests, Gradle Debug/Release unit tests, manifest merge, and `assembleDebug` pass. The verified APK is available at `artifacts/Firewall-SOAR-Android-1.0.0-debug.apk` (SHA-256 `90274E6091843DC8745D3988C04D15E323EC8819E17B017FF59BADDB3746C92D`).

## 2026-08-31 - Android mobile shell and API routing repair (1.0.1)

- Routed every frontend API client through the native-aware configured server URL; navigation, dashboard, assets, findings, monitoring, actions, assistant, diagnostics, and settings no longer fall back to the WebView-local `/firewall-api` origin.
- Repaired the phone login layout and Android autofill paint, aligned the login minimum with the six-character server policy, disabled native autofocus, and made the drawer ignore stale desktop collapsed state while closing conflicting account overlays.
- Frontend build, targeted ESLint, 4/4 focused Android routing/layout tests, Gradle Debug/Release tests, and `assembleDebug` pass. APK: `artifacts/Firewall-SOAR-Android-1.0.1-debug.apk`; SHA-256: `369D453FC50F5BFC18D308BBD9781485132ED1315F0423E53CFFA76722803E63`.
## Stateful vendor-aware assistant conversation mode (2026-08-31)

- The Assistant **Chat** mode now sends a bounded, chronological, redacted window of the latest 12 user/assistant turns to the configured provider. Follow-up prompts therefore continue the same discussion instead of resetting to a one-shot security summary.
- Chat receives the currently selected device/vendor/name/connector perspective on every turn. The prompt explicitly allows general conversation, comparison, troubleshooting, and advice while separating observed evidence from general vendor knowledge.
- Chat is a hard non-action boundary: its provider contract always requests `shouldCreateIntent=false` and `intent=null`; the existing **Action** mode and controlled ActionPlan pipeline are unchanged.
- The deterministic offline fallback is vendor/device aware and remains conversation-only. The chat viewport now follows newly added replies so later responses are not hidden below the visible area.
- Validation passed: focused conversation/routing contracts (21/21), backend and frontend TypeScript builds, frontend production build, targeted frontend lint, UTF-8 guard, healthy local API/web container rebuilds, and HTTP 200 for the web and API health routes. A real OpenRouter prompt was intentionally not sent because that would transmit selected-device security context to an external provider without explicit operator approval.
## Calm, motion-led operational dashboard (2026-08-31)

- The dashboard hero now contains a lightweight code-native network-defense scene: packets move slowly from the network edge through a pulsing firewall shield to protected services, while separate threat signals stop at the firewall. The scene reflects real device/finding counts and the current overall health tone.
- The motion uses only React, Lucide SVG icons, and CSS; it adds no bitmap/video dependency, adapts at tablet/phone widths, and becomes static under the operating system's `prefers-reduced-motion` setting.
- The page was simplified to four decision-focused indicators, a two-column attention/recent-operations area, and at most three Linux server charts ordered by attention. All Action Center, registration, findings, history, refresh, server-detail, and full-monitoring navigation remains available.
- Validation passed: focused dashboard UX contracts (3/3), frontend TypeScript, targeted ESLint, UTF-8 guard, and production build.
- Deployed the rebuilt `firewall-web` image after Docker Desktop became available. Web, API, database, and ingress containers are healthy; the app shell, dashboard route, API health, and deployed dashboard JS/CSS all return HTTP 200.
- Production smoke covered six frontend routes and confirmed the deployed motion selectors/keyframes. Protected dashboard data endpoints return the expected JSON 401 without a session. Backend build passes; the full database suite remains safely gated by the required isolated `TEST_DATABASE_URL`. The repository-wide Persian-copy guard still reports pre-existing `AppShell` coverage gaps unrelated to this dashboard slice.

## Live-only, resilient Assistant conversation transport (2026-08-31)

- Root cause of the repeated Assistant answer was the configured host OpenRouter proxy being unavailable after Docker restarted. Chat silently accepted `deterministic-offline-fallback`, so a configured key appeared healthy while no model had analyzed the prompt.
- OpenAI-compatible requests now fall back from an unavailable host proxy to a direct HTTPS provider connection. Chat explicitly requires a live provider response; provider/configuration failures return a visible error and never masquerade a canned response as AI output. Action-mode fallback and the controlled ActionPlan pipeline are unchanged.
- Chat continues to send the bounded conversation history plus the current selected device/vendor context, uses a natural-prose-only prompt, and keeps `shouldCreateIntent=false`. The UI distinguishes a configured key from a failed live connection.
- Provider status is tri-state: configured but not yet verified, live response verified, or unavailable. A free-tier `429` now stays visible and asks for a later retry instead of claiming that a fallback answer was generated.
- Validation passed: focused Assistant/provider/routing contracts 24/24, backend and frontend TypeScript builds, targeted frontend lint, production build, healthy API/web Docker deployments, and a real sanitized two-turn OpenRouter probe. With the proxy deliberately stopped, direct failover returned a non-fallback provider response and the proxy was then restored.

## 2026-09-01 - AI conversation ownership boundary

- Fixed an authenticated IDOR in Assistant chat: supplied session IDs are now accepted only when the session belongs to the current user.
- Session lists, history reads, message clearing, intent lists/reads/updates, and action-request completion all inherit the same owner boundary. Cross-user identifiers return not found instead of exposing whether the object exists.
- Existing legacy sessions without an owner fail closed for authenticated users; new sessions persist the authenticated user ID. No database migration was needed because the ownership column and index already existed.
- Validation passed: the focused ownership regression tests (3/3) and backend TypeScript build.

## 2026-09-01 - Dependency security remediation

- Updated the production frontend toolchain and runtime dependencies to patched releases, including Vite 8.2.2, React Router 7.18.3, Tailwind's Vite integration 4.3.3, and Capacitor CLI 8.5.1.
- Updated Fastify to 5.12.1 and Prisma packages to 7.10.0, then constrained vulnerable transitive packages to patched compatible versions.
- Removed the unused SWC React plugin and adjusted the Vite configuration for the Vite 8 ESM contract.
- Production dependency audits now report no known vulnerabilities in both the root application and backend. Prisma generation, backend build, frontend production build, and the focused centralized-permission/ownership tests passed.

## 2026-09-01 - Nmap DNS-rebinding boundary

- Closed an internal-network scan bypass where a syntactically public hostname could resolve to a private, loopback, link-local, multicast, or reserved address after policy validation.
- Nmap now resolves a hostname once, rejects empty, mixed public/private, or entirely non-public answers, and pins the approved public IP into the worker argument list so the scanner cannot re-resolve a changed DNS answer.
- Expanded IPv4/IPv6 reserved-range coverage, including IPv4-mapped IPv6 addresses, while preserving the fixed-profile, argument-array, `shell: false` worker boundary and audit evidence.
- Validation passed with backend compilation and the isolated Task 20 diagnostics/Nmap suite against a disposable test database.

## 2026-09-01 - Android navigation and keyboard stability (1.0.2)

- Android navigation no longer disappears when the product-navigation request is delayed or temporarily fails. A local, role/section-filtered core navigation renders immediately, including the five-item bottom bar, and the richer server contract replaces it when available.
- The native login screen is anchored to the top of the visual viewport instead of being re-centered whenever the software keyboard changes WebView height. Native-only motion is reduced around the form, focus transforms are disabled, and the Android activity explicitly uses `adjustResize`.
- Released debug build `1.0.2` (`versionCode 10002`) at `artifacts/Firewall-SOAR-Android-1.0.2-debug.apk`, SHA-256 `18728497D8A5F4BF1C232C0A32D5A498819D19D81031D06050560C7F9B5A213A`.
- Validation passed: targeted frontend lint, production web build, 6/6 mobile transport/shell/PWA contracts, Gradle Debug/Release unit tests, Capacitor sync, and `assembleDebug`.

## 2026-09-04 - Vendor port and connection workspace

- Added an implemented `Assets -> Ports & connections` workspace for Cisco, MikroTik, FortiGate, pfSense, Linux, and generic registered devices.
- The backend persists physical-port inventory in `AssetInterface`, refreshes it through the existing read-only vendor connection check, extracts interface state and available LLDP/CDP/neighbor evidence, and keeps manual corrections authoritative across later discovery runs.
- Operators and administrators can map a port to a peer device, remote port, peer IP, cable type, VLAN, speed, and note. Every save, clear, and discovery operation is permission-gated and audited; read access remains available to authorized viewers.
- The UI renders lightweight vendor-toned, CSS-native 3D faceplates with link LEDs, mapped-connection cards, responsive editing, mobile horizontal inspection, explicit live/stored discovery feedback, and reduced-motion support. These are honest chassis archetypes when an exact hardware model is not registered.
- Validation passed: backend TypeScript build, frontend lint/TypeScript/production build, and 6/6 focused topology inference, authorization, navigation, responsive, and motion-safety tests.

## 2026-09-04 - Clickable service-port visibility

- Extended the same workspace with a separate graphical service rail: Linux `ss` listeners such as `0.0.0.0:8080/TCP`, MikroTik IP services, FortiGate custom service objects, and explicit port inventories from other vendors are presented without confusing policy objects with confirmed host listeners.
- Clicking a service endpoint opens its bind address, protocol, port, process/service identity, evidence source, exposure classification, and operator note. Admins/operators can correct the displayed record or add a manual endpoint; manual notes and corrections persist without changing the remote device and can be reverted to discovered values.
- Linux listener details refresh from existing security snapshots every 45 seconds and the selected visible Linux device gets a live refresh every two minutes. No all-device scan is triggered; hidden tabs stop live refreshes, discovery is capped at 256 endpoints, and the feature remains a lazy-loaded route.
- Validation passed: backend build, frontend ESLint/TypeScript, UTF-8 guard, 9/9 focused tests, and a bounded 1,000-listener parser benchmark (256-item output in under the 250 ms budget).
- Added an explicit Nginx SPA fallback for `/firewall/assets/topology`, preventing the route from being mistaken for a static Vite asset on direct navigation or browser refresh.

## 2026-09-04 - Deduplicated service listeners

- Service cards now use the stable identity `protocol + port`, so equivalent IPv4/IPv6 or repeated snapshot/live bindings no longer render as duplicate ports. TCP and UDP on the same number remain separate because they are different endpoints.
- All distinct listen addresses and processes are retained as bounded binding evidence and are visible in the click-through details instead of being discarded during consolidation.
- Existing address-based manual override keys are normalized transparently on read/save/clear, while new edits use the canonical endpoint identity.
- Validation passed: backend build, frontend TypeScript and targeted lint, and 10/10 focused topology tests, including IPv4/IPv6 collapse, TCP/UDP separation, evidence retention, and the existing parser performance bound.

## 2026-09-04 - Explainable, lower-noise attacker tracking

- Diagnosed the reported `alireza` case from the live database: the username itself was not classified as an attacker. Source IP `5.115.146.191` was listed because successful logins from a previously unseen source were combined with repeated failed `root` authentication records; several SSH/PAM lines represented the same logical attempts.
- Authentication burst rules now collapse duplicate timestamp formats and paired SSH/PAM messages into logical attempts before applying thresholds. Successful login from a new source is informational and cannot qualify an IP for the suspicious-source list by itself.
- The attacker API now returns an explicit assessment with actionable/informational finding counts, unique authentication failures, successful authentications, ordinary session events, and duplicate-collapse notes. The UI labels records as suspicious sources requiring review rather than confirmed attackers.
- Added one high-signal rule per primary vendor: Linux web exploit probes, MikroTik port scans, FortiGate management-plane probes, Cisco SNMP authentication failures, and pfSense IDS/IPS alerts. The core library now has six event-backed rules per vendor.
- Detection execution now buckets events once by vendor, appends groups in linear time, and preloads device/asset mappings instead of issuing per-group lookup queries. Attacker aggregation also uses per-IP maps and halves its bounded event sample from 10,000 to 5,000.
- Validation passed: backend and frontend production builds, targeted backend/frontend ESLint, and all 16 focused tests. The collector scheduling fixture now allows for the existing stable jitter and failure backoff.

## 2026-09-05 - Persian customer overview brochure

- Added an eight-page, customer-ready Persian overview of Firewall SOAR with plain-language explanations of the customer problem, product workflow, monitoring/detection, durable email alerts, graphical ports/services, Assistant modes, controlled execution, access management, Android access, deployment prerequisites, and acceptance criteria.
- The brochure distinguishes included capabilities from optional/configuration-dependent services and avoids presenting suspicious sources or AI output as guaranteed truth.
- Delivered both an editable standalone HTML source and a print-ready A4 PDF under `deliverables/`. The PDF uses the bundled Persian font, vector/CSS visuals, and contains no credentials, customer data, or environment values.
- Validation: visual review of all eight pages, embedded-font check, `%PDF-1.4` signature, eight-page structure, and 2.02 MB output size.

## 2026-09-05 - Minimal Assistant conversation bubbles

- Reworked the Assistant conversation surface to match the supplied quiet alternating-card layout: user messages use a compact deep-blue bubble and assistant replies use a wider violet bubble.
- Removed repeated visible avatars, sender labels, and timestamps from each bubble while retaining sender/time context through accessible labels and hover titles.
- Added centered user prompts, start-aligned assistant prose, bounded readable widths, Persian/English logical alignment, long-response expansion, and a dedicated narrow-screen layout.
- Validation passed: frontend TypeScript, targeted ESLint, UTF-8 guard, production build, diff check, 2/2 focused chat-template tests, healthy Docker web deployment, and HTTP 200 on the Assistant route/API health boundary.

## 2026-09-05 - Evidence-led full analysis and hardening report

- Full Analysis now honors the selected device across incidents, events, snapshots, ActionPlans, audit counts, and connector collection. Switching targets clears the previous report so evidence cannot leak between device scopes.
- Risk scoring now uses only open/investigating incidents from the last 24 hours, bounded weighted components, and explicit data coverage/confidence. Sensitive-port traffic by itself is no longer treated as a vulnerability.
- Fresh successful snapshots are deduplicated and error snapshots are excluded from coverage. Read-only connector collection is capped at 25 devices with concurrency 3 to protect response time and device load.
- Hardening is generated from the exact persisted assessment shown to the operator. High-volume source IPs no longer produce an automatic block recommendation without confirmed attack evidence, and unsupported vendor changes remain manual review items.
- Replaced the raw report grid with a responsive Persian-first report: risk dial, coverage/confidence, evidence basis, per-device/vendor review, separated missing data, prioritized findings, and explainable ActionPlan suggestions.
- Assessment evidence and recommendation payloads pass through the central persistence redactor; ActionPlan creation remains separate from execution and still uses the existing preview/confirmation/PolicyGuard/connector/audit pipeline.
- Validation passed: backend and frontend TypeScript builds, frontend production build, targeted ESLint, UTF-8 guard, and 22/22 focused assessment/vendor/API tests. The wider repository suite still contains unrelated stale contract failures from other uncommitted worktree changes.
## Business value and revenue model PDF (2026-09-06)

- Produced an 11-page Persian business-value report for a potential product sale, with current public market benchmarks, an explicit SOC capacity-cost model, module-level value attribution, three subscription packages, customer ROI sensitivity, seller ARR scenarios, and an ARR-based sale valuation lens.
- Kept customer savings, replacement-tool benchmarks, seller revenue, and profit conceptually separate to prevent double counting. The report explicitly treats staffing reduction as measured capacity or avoided hiring, not a guaranteed headcount cut.
- Added a canonical research source/claim ledger and a CSV companion containing the editable assumptions and outputs. All external prices are date-stamped, sourced from official vendor pages, and presented as comparables rather than feature-parity claims.
- Rendered the local-font HTML to PDF and visually inspected all 11 A4 pages for Persian text, clipping, tables, charts, and page boundaries.

## 2026-09-06 - Inline controlled port management

- Added direct controls to the graphical port drawer so operators can enable or disable Cisco, FortiGate, and MikroTik interfaces without leaving the topology page. Cisco and FortiGate interfaces also expose verified IPv4 configuration, and all three supported network vendors expose their native interface description, alias, or comment field.
- Added inline preview and one explicit confirmation while retaining the full controlled path: catalog ActionPlan, PolicyGuard, registered connector, audit evidence, semantic post-check, and topology rediscovery. The UI only reports success when the connector confirms a real execution.
- Added direct service-port controls for Linux firewall allow/deny and MikroTik management-service enable/disable. Linux copy explicitly distinguishes a firewall rule from stopping the listening process.
- Linux discovery now retains assigned interface addresses. Manual cable, peer, VLAN, speed, and note data remains separate from live device state so an inventory edit cannot pretend that a port changed remotely.
- Promoted MikroTik interface/service operations to registered executable catalog templates and added FortiGate interface-alias support plus targeted configuration read-back for interface state, IPv4, and alias changes.
- Unsupported vendor profiles remain honest inventory-only views rather than simulating a successful device change.
- Validation passed: 31 focused topology/FortiGate/MikroTik tests, catalog validation for 197 commands, backend TypeScript build, targeted frontend ESLint, UTF-8 guard, and production frontend build. The lazy topology page is 8.80 kB gzip.
- Rebuilt and deployed the API and web containers with the project-scoped deployment scripts. Database, API, web, and ingress are healthy; the deployed topology page and API health return HTTP 200, while the unauthenticated topology API remains protected with HTTP 401.

## 2026-09-06 - Fresh Linux service and firewall-port synchronization

- Replaced the selected Linux device's expensive periodic full rediscovery with one bounded SSH probe that reads listeners and the active firewall adapter in parallel. It runs when the topology opens, when the tab becomes visible, and every 60 seconds while visible; overlapping probes are suppressed.
- Live listener inventory is now authoritative by observation time. A newer successful `ss` result replaces, rather than merges with, an older Linux security snapshot, so stopped listeners cannot be resurrected from cached telemetry.
- Added UFW, firewalld, nftables, and iptables allow-rule parsing and keeps firewall policy distinct from a listening process. Equivalent IPv4/IPv6 rules still collapse to one protocol/port card.
- A failed probe is not presented as a successful empty scan. The last trustworthy source remains available, while its stale data cannot outrank a later successful collection.
- Production verification against `server-116` confirmed live source selection. TCP/8080 is still reported by the server as a loopback listener on `127.0.0.1` and also has firewall evidence; removing a firewall rule does not terminate the process bound to that socket.
- Validation passed: 17/17 focused topology tests, backend TypeScript build, targeted frontend ESLint, production frontend build, and healthy project-scoped API/web Docker deployments.

## 2026-09-08 - Removed the global motion rail

- Removed the decorative router-to-shield-to-server rail from the shared application shell, so it no longer renders above content on any desktop or mobile route.
- Deleted the unused scene component and its animation stylesheet instead of hiding them, eliminating their layout space, animation work, CSS payload, and icon imports while preserving page-specific visuals.
- Added a source contract that prevents the global rail, its spacer, or its styling hooks from being reintroduced accidentally.
- Validation passed: 2/2 focused shell contracts, targeted AppShell ESLint, no remaining motion-rail references under `src`, and a production frontend build.

## 2026-09-08 - MikroTik topology connection recovery and diagnostics

- Diagnosed the selected `m` device from the deployed runtime: its stored SSH port `4432` is unreachable, while an SSH service answers on `2222`; the credential assigned to `m` is currently rejected by RouterOS. No password, IP, or secret material was exposed during diagnosis.
- Added a bounded fallback over three common SSH management ports only after the configured port fails. A recovered port is persisted only after SSH authentication and required RouterOS read-only commands succeed, preventing a random open socket from being trusted.
- Topology discovery now returns a sanitized connection error code, and the UI distinguishes missing credentials, rejected MikroTik authentication, unreachable management paths, and generic offline inventory instead of showing one vague message.
- The existing valid `mikro` device remains healthy with 12 interfaces and 23 RouterOS services. Device `m` will populate automatically after its assigned credential is corrected; the application correctly refuses to report live data while authentication fails.
- Validation passed: 29/29 focused MikroTik/topology tests, backend TypeScript build, targeted frontend ESLint, and production frontend build.

## 2026-09-08 - Controlled device power actions in topology

- Added compact administrator-only Reboot and Shutdown controls directly to the graphical topology. Every enabled operation follows catalog creation, preview, one explicit confirmation, PolicyGuard, the real vendor connector, and audit/result verification.
- Implemented delayed Linux reboot/poweroff dispatch, RouterOS reboot/shutdown, and FortiOS reboot/shutdown with native confirmation/disconnect handling. Cisco IOS/IOS-XE exposes a delayed, cancellable reload with interactive `[confirm]` handling.
- Kept unsupported operations honest: Cisco has no universal software power-off contract, and pfSense/generic profiles have no verified write connector, so unavailable actions stay disabled rather than simulating success.
- No power command was sent to a registered device during validation. Focused topology/power tests passed 22/22, related connector/execution tests passed 37/37, catalog validation passed for 203 items, and backend/frontend production builds passed.

## 2026-09-08 - Show only collected vendor workspace data

- Preserved successful Linux, MikroTik, and FortiGate discovery results during verified onboarding instead of discarding them after the connection test.
- Device workspaces now derive identity, version, uptime, interfaces, health, and vendor sections from the last successful connector result; action history is no longer treated as proof that inventory was collected.
- Empty vendor capability sections and empty raw diagnostics are hidden. Non-Cisco devices can run a bounded live collection directly from the workspace and refresh the displayed facts.

## 2026-09-08 - Repair Cisco onboarding credential collisions

- New credentials receive the next available stable name when the requested label already exists, so a harmless display-name collision no longer blocks Cisco registration.
- Prisma unique-constraint details are mapped to a sanitized conflict response and are no longer returned to the browser.
- Generic onboarding now requires an explicit vendor selection instead of silently retaining the Linux default; vendor-specific routes remain preselected.

## 2026-09-08 - Direct asset workspace navigation

- Resolved the Nginx namespace collision between Vite bundles and extensionless `/firewall/assets/...` application routes.
- Device registration, device workspaces, vendor pages, and topology now support direct links and browser refreshes while fingerprinted JavaScript/CSS files retain static caching.

## 2026-09-08 - Recover legacy Cisco SSH registration

- Confirmed the target Cisco SSH service offers the legacy `diffie-hellman-group14-sha1` and `ssh-rsa` handshake while still accepting password authentication; no credential or device command was used for this diagnosis.
- Replaced the hidden compatibility setting with a visible per-device control and a one-click recovery action after `CISCO_SSH_NEGOTIATION_FAILED`.
- Modern SSH remains the default. The compatibility profile is enabled only after the operator explicitly selects it and is persisted only for that Cisco device.
- Focused Cisco connector/onboarding tests passed 8/8, with frontend TypeScript and targeted ESLint clean.
## Credential lifecycle management (2026-09-08)

- Administrators can now create, rename, rotate, and delete encrypted device credentials from `Settings -> Device credentials`.
- Existing secrets are never returned to or rendered by the browser; leaving a replacement secret empty preserves the stored value.
- Usage counts include both a device's primary credential and Cisco enable-secret references. In-use deletion requires an explicit warning and safely detaches device references.
- Device onboarding links directly to the credential manager. Focused credential tests, backend build, frontend TypeScript, and targeted ESLint pass.

## 2026-09-08 - Make Cisco workspace refresh live and trustworthy

- Fixed stale status precedence: a newer verified onboarding or inventory collection now supersedes an older SSH failure, while a genuinely newer failure remains visible.
- Replaced the Cisco workspace's setup redirect with a real bounded read-only SSH refresh. It persists sanitized system, inventory, interface, VLAN, network, and health evidence plus a fresh status check.
- Cisco onboarding and refresh redact credential-like CLI material before persistence; successful onboarding now records an explicit online status check.
- The deployed registered Cisco was refreshed successfully in about 8.5 seconds: `cisco-ios-classic`, expected hostname/model, 54 interfaces, 5 VLANs, zero connector warnings. The final workspace projection is `online`, `verified`, `collected`.
- Backend/frontend builds, targeted lint, four workspace regression tests, Docker API/web health checks, and the real sanitized Cisco smoke passed.

## 2026-09-08 - Stable Cisco port inventory and presentation

- Cisco topology refresh now performs one bounded live IOS collection and reuses the persisted compatibility profile instead of relying on stale generic inventory.
- `show ip interface brief` and `show interfaces status` are normalized into one canonical interface record; abbreviated and long IOS names no longer create duplicates.
- Operational link state and administrative shutdown state are stored separately, while stale non-manual phantom interfaces are removed atomically.
- The Cisco workspace now presents localized capability groups, a live inventory summary, and a complete interface list with link/admin state and assigned IP.
- Real-device validation returned 54 canonical interfaces: 19 operationally up, 35 down, 53 administratively enabled, one shutdown, and zero unknown states.
## Device onboarding usability and evidence freshness (2026-09-08)

- Registration and edit mode now have distinct guidance and final actions, with a compact live summary and direct navigation back to completed steps.
- Empty credential libraries open directly in create mode instead of showing an unusable empty selector.
- Changing a vendor, management target, credential, or Cisco compatibility option now clears stale verification evidence before the operator saves.

## 2026-09-09 - Scheduled vendor operations

- Added a dedicated `Actions -> Scheduled tasks` workspace for selecting a registered device, choosing only verified connector-backed catalog operations, entering their validated parameters, and scheduling one exact execution.
- Operators can enter either Jalali or Gregorian dates, select Tehran or UTC time, and see both calendar representations on upcoming items and execution history.
- Added persistent task and run-history records with pause, resume, cancel, and explicitly confirmed run-now controls. The worker polls in a bounded single-flight cycle and uses a unique execution key so the same scheduled occurrence cannot run twice.
- Execution rebuilds a fresh ActionPlan, rechecks the task owner's active account and current risk permission, and still passes through PolicyGuard, the registered connector, verification, and audit. A task is successful only when `connectorInvoked=true` and the ActionPlan succeeds.
- Interrupted or over-24-hour missed jobs fail closed without surprise replay. Errors stored in scheduler history are sanitized, while detailed controlled evidence remains attached to the linked ActionPlan.
- Validation passed: isolated PostgreSQL lifecycle tests 5/5, Prisma schema validation, 203-item catalog validation, backend TypeScript build, frontend production build, deployed migration, healthy API/web containers, HTTP 200 ingress health/page smoke, and HTTP 401 for unauthenticated scheduler data. The broader repository suite still has pre-existing stale source-contract failures from unrelated uncommitted worktree changes.

## 2026-09-09 - Effectful-only scheduler and Persian 24-hour time

- Scheduled-task selection now excludes every read-only observation/check command and groups the remaining verified write operations into practical Persian categories for Linux, MikroTik, FortiGate, and Cisco.
- The API independently rejects non-mutating catalog entries, execution revalidates the same invariant, and startup deactivates legacy active read-only schedules while retaining their audit/history records.
- Replaced the browser-localized time input with an explicit Persian hour/minute selector and forced all calendar summaries to 24-hour output, eliminating AM/PM from the Persian workflow.
- Validation: isolated scheduler contracts 7/7, backend/frontend builds, and targeted backend/frontend ESLint passed.

## 2026-09-09 - Scheduler time and scroll usability

- Replaced the long native hour/minute dropdowns with compact Persian numeric fields that accept Persian or Latin digits, clamp invalid values, and stay inside the scheduler form.
- Removed the persistent execution-confirmation checkbox; the required explicit approval is now requested once, at the final schedule action, with the task name and Jalali execution time.
- Added a bounded internally scrolling task/history board so its tabs remain visible, and removed the duplicate outer sidebar scrollbar.
- Unified desktop and mobile scrollbar styling with slim, low-contrast controls and contained scroll chaining.
- Validation passed: frontend/backend builds, targeted frontend ESLint, isolated scheduler contracts 7/7, healthy web deployment, and HTTP 200 page/health smoke checks.

## 2026-09-11 - FortiGate/Linux attacker intelligence and controlled response

- Reverted the experimental soft-3D icon pack and light-theme change at the operator's request; the previous visual system is deployed again.
- FortiOS key/value events now preserve the authoritative source (`srcip`, then SSL-VPN `remip`), destination, ports, interfaces, user, signature/policy, and vendor action. IPS, DoS/anomaly, malware, botnet/C2, WAF, VPN/admin authentication failures, and repeated denies are classified separately.
- FortiGate collection clears session-only log filters and requests a bounded 500-line page, keeping polling predictable while including event, traffic, VPN, and UTM evidence.
- Linux session lifecycle noise such as `Timeout, client not responding` no longer qualifies as an authentication attack. Historical authentication findings must contain enough real failure evidence, and duplicate PAM/SSH attempts remain collapsed.
- The attacker workspace distinguishes confirmed vendor threats, correlated likely attacks, review-only anomalies, and vendor-confirmed containment. Related findings are grouped into attack families instead of repeated cards.
- A response preview can be created directly from attacker evidence. Linux/MikroTik use registered managed block actions; FortiGate builds a registered deny-policy ActionPlan with observed interfaces and still follows preview, operator confirmation, PolicyGuard, connector verification, and audit.
- Validation passed: 6 focused normalization/API tests, backend and frontend production builds, 203-item catalog validation, targeted ESLint, and diff checks.

## 2026-09-13 - Sophos-to-Issabel VoIP registration repair

- Diagnosed LAN phone SIP traffic reaching Sophos but being evaluated by the identity-required internet rule or stale connection state; the dedicated `ISABEL` rule itself used the correct LAN `/24` and PBX host objects.
- Moved the dedicated `ISABEL` firewall rule to position 3, ahead of the identity-required internet rule, while retaining logging and limiting the destination to the Issabel host.
- Disabled the experimental `no-nat-voip` rule because it created an asymmetric return path through the directly connected MikroTik LAN; retained the default Port2 masquerade for symmetric SIP/RTP flows.
- Increased Sophos UDP stream timeout from 60 to 150 seconds and persistently unloaded the Sophos SIP helper, following Sophos VoIP troubleshooting guidance. Existing SIP conntrack entries were cleared after each policy change.
- Live validation showed new SIP sessions matching firewall rule ID 5 and NAT rule ID 2. Active PJSIP contacts remained available beyond the previous 60-second failure boundary; previously stale/offline contacts require their next phone REGISTER or a phone restart.
- No Issabel endpoint credentials, phone secrets, application code, or unrelated repository changes were modified.

## 2026-09-15 - Sophos Firewall application integration

- Added first-class Sophos Firewall onboarding over the official SFOS XML API, using stored write-only credentials and a bounded HTTPS client.
- Added sanitized collection for interfaces, zones, gateways, firewall rules, IP hosts, services, and IPsec connections. Collected interface state feeds the graphical topology without recursively generating duplicate or phantom ports.
- Added catalog-backed interface enable/disable/IP changes and firewall-rule enable/disable operations. Every mutation reads the current object, follows ActionPlan/PolicyGuard/audit, and performs a post-change readback before reporting success.
- Added Sophos device/catalog capability routing and a dedicated graphical Sophos faceplate profile. Backend and frontend production builds pass and the 209-item command catalog validates.
## 2026-09-16 - Linux SSH onboarding diagnostics repair

- Verified the requested Linux target at 185.89.22.116:22022 from both the Windows host and the API container. TCP reachability and the OpenSSH handshake succeed; the stored alireza password credential is rejected by the server with SSH_AUTH_FAILED.
- Fixed non-Cisco onboarding so connector stages, error code, safe message, warnings, and capabilities survive the failure path instead of being replaced by a generic connection-test message.
- Updated both onboarding test endpoints to return the safe connector error code and diagnostic stages. The existing Persian UI now maps SSH_AUTH_FAILED to the credential-rejected guidance.
- Rebuilt and deployed the API image. Backend TypeScript compilation, real connector failure-path smoke, persisted diagnostic verification, and API readiness passed. No password, private key, or decrypted credential was printed or committed.

## 2026-09-16 - Public product landing and latest frontend restoration

- Restored the active `firewall-web` service from the `latest-safe-snapshot` source and returned it to the canonical `track_firewall_log` Compose project/network; `/firewall/dashboard` now serves the current Persian product shell through main Nginx.
- Added a public, Persian-first `/firewall/landing` route while keeping all operational routes behind the existing authentication boundary.
- Built a concise landing with the real IRANYekan font and visual treatments derived from the current dashboard, controlled ActionPlan flow, and multi-vendor asset workspace. Product visuals contain only illustrative, non-operational values.
- Added scroll-triggered blur-to-clear reveals, responsive/reduced-motion behavior, and a final team section using the supplied portrait and the requested network, security, and product-design role.
- Hardened the frontend deployment script with an explicit Compose project name so folder names cannot silently place a rebuilt frontend on a disconnected Docker network.
- Frontend Docker production build passed and both `/firewall/landing` and `/firewall/dashboard` were served through Nginx without exporting a Docker image archive.
