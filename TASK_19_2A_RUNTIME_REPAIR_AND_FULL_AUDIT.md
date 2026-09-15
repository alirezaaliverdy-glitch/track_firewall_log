# TASK 19.2A — Runtime Repair and Full MCP Audit

## Mission
Fix the current runtime failures:
- Device onboarding stays in `draft`.
- `ذخیره پاسخ‌ها و ساخت Preview` appears to do nothing.
- Connector is not invoked.
- Cisco device is not persisted.
- Dashboard quick actions route to the wrong pages.
- Linux monitoring logs Prisma errors because `public.HealthSnapshot` is absent.
- Audit all primary routes and visible controls with Playwright MCP.

## Evidence
Observed onboarding route:
`/assets/devices/new`

Observed Cisco values:
- Vendor: Cisco
- Platform: Cisco IOS-XE via SSH
- Connection: SSH
- Address: 192.168.7.12
- Port: 22
- Credential reference: cisco-f2 — admin
- Site: Tehran
- Environment: Lab
- Location: Rack

Observed backend behavior:
- repeated `POST /api/device-onboarding/sessions/:id/answers`
- responses are HTTP 200
- session remains `draft`
- `connectorInvoked=false`
- no platform detection
- no discovery
- no preview
- no saved Device

Observed monitoring error:
`The table public.HealthSnapshot does not exist in the current database`

## Mandatory reading
Read:
- AGENTS.md
- CODEX_HANDOFF.md
- TASK_19_PRODUCT_CONVERGENCE.md
- TASK_19_1_RUNTIME_CONVERGENCE_AND_CRITICAL_REPAIR.md
- TASK_19_2_DIAGNOSTICS_AND_ONBOARDING.md
- Product State Contract
- onboarding backend/frontend
- Dashboard quick actions and router registry
- integrations/tools routes
- Linux monitoring service
- Prisma schema/migrations
- current tests and Playwright evidence
- i18n dictionaries
- git status/diff

Preserve all completed work.

## Safety
- Never read or modify `.env`.
- Never expose credentials.
- Never run destructive database commands.
- Never use `prisma migrate reset`, `db push --force-reset`, `git reset --hard`, or `git clean -fd`.
- Never report onboarding success unless Device persistence is proven.
- Never report connection success unless connector invocation is proven.
- Never report platform detection without real evidence.
- Optional missing tables must not cause repeated Prisma stack traces.
- Use Playwright MCP to test every visible control.
- Do not start Nmap/external scans until runtime is stable.

# Milestone A — Reproduce and document

Create:
- docs/TASK_19_2A_RUNTIME_BASELINE.md
- docs/TASK_19_2A_ONBOARDING_FAILURE_TRACE.md
- docs/TASK_19_2A_DASHBOARD_CONTROL_MATRIX.md
- docs/TASK_19_2A_API_FAILURE_REGISTER.md

Reproduce:
1. Cisco onboarding from Dashboard.
2. Save answers and Preview.
3. Test connection.
4. Platform detect.
5. Discovery.
6. Save device.
7. Dashboard network-test action.
8. Dashboard domain/IP action.
9. Linux monitoring summary.
10. Assets/device navigation.
11. every visible Dashboard quick action.
12. console/network/backend errors.

Record exact request, response, state transition and UI state.

# Milestone B — Repair onboarding state machine

Required sequence:
`draft → answers_saved → connection_testing → connection_verified → platform_detecting → platform_detected → discovery_running → discovery_completed → preview_ready → saving → completed`

Failure states:
`connection_failed`, `platform_unsupported`, `discovery_failed`, `validation_failed`, `save_failed`, `cancelled`

Invariants:
- answers_saved only after validation
- connection_verified only after connector invocation
- platform_detected only with evidence
- preview_ready only after discovery
- completed only after Device persistence
- transitions idempotent
- duplicate clicks do not create duplicate Devices
- stale sessions return structured recovery
- frontend renders authoritative backend state

Repair/create APIs:
- POST /api/device-onboarding/sessions
- GET /api/device-onboarding/sessions/:sessionId
- POST /api/device-onboarding/sessions/:sessionId/answers
- POST /api/device-onboarding/sessions/:sessionId/test
- POST /api/device-onboarding/sessions/:sessionId/detect
- POST /api/device-onboarding/sessions/:sessionId/discover
- POST /api/device-onboarding/sessions/:sessionId/preview
- POST /api/device-onboarding/sessions/:sessionId/commit
- POST /api/device-onboarding/sessions/:sessionId/cancel

Do not overload `/answers` to silently perform all later steps.

Preferred UI:
- ذخیره اطلاعات
- تست اتصال
- تشخیص پلتفرم
- کشف تجهیزات و قابلیت‌ها
- ساخت پیش‌نمایش
- ثبت دستگاه

Alternative:
Keep one orchestration button but show step-by-step progress and exact failure.

Show:
- current step
- active request
- connector invoked
- detected platform
- capabilities
- preview
- saved Device ID
- retry and blocking reason

Cisco acceptance:
1. save answers
2. test SSH
3. detect IOS-XE
4. discover inventory/capabilities
5. build Preview
6. save Device
7. navigate to `/assets/devices/:deviceId`
8. show workspace
9. run read-only validation

If unavailable, fail honestly and keep session recoverable.

# Milestone C — Credential-reference handling

Requirements:
- frontend sends only credential reference ID
- backend resolves secret server-side
- secret is never returned
- session stores only reference ID
- connector receives resolved credential through secret service
- missing/deleted credential returns structured 409 or 422
- states: configured, missing, inaccessible, invalid, verified

Add tests for valid/missing/deleted/wrong-vendor/permission-denied/redaction.

# Milestone D — Dashboard routing

Required routes:
- ثبت دستگاه جدید → /assets/devices/new
- تست سریع شبکه → /tools/network-check
- بررسی دامنه یا IP → /tools
- مشاهده دستگاه‌ها → /assets/devices

Do not route diagnostic actions to `/integrations` unless `/integrations` is explicitly the tools landing page.

Requirements:
- central route registry
- router navigation
- direct URL/reload works
- Persian/English same route
- mobile/desktop same behavior
- zero dead/blank routes

# Milestone E — Optional observability tables

Current missing tables may include:
- HealthSnapshot
- CollectionRun
- DeviceCapabilityCache

Choose one controlled strategy.

Preferred if schema should exist:
- inspect migration history
- identify exact non-destructive migration
- backup
- deploy only required migration
- verify table/indexes

Allowed if tables remain optional:
- detect table capability at startup
- cache result
- skip unavailable queries
- return stable state:
  - available
  - partial
  - not_configured
  - temporarily_unavailable
  - failed
- return reason `OBSERVABILITY_SCHEMA_NOT_APPLIED`
- log one concise warning, not repeated stack traces
- UI shows useful unavailable state

Do not convert missing metrics to healthy zero values.

# Milestone F — Full Playwright MCP audit

Audit:
- /dashboard
- /assets
- /assets/devices
- /assets/devices/new
- /assets/vendors
- /assets/vendors/cisco
- /security
- /security/findings
- /security/rules
- /monitoring
- /monitoring/linux
- /actions
- /assistant
- /tools
- /tools/network-check
- /integrations
- /settings

For every visible control:
- click/submit
- verify route/API/state
- loading/success/error
- no duplicate creation
- RTL/LTR
- mobile
- no dead control

Create:
- docs/TASK_19_2A_ROUTE_ACCEPTANCE_MATRIX.md
- docs/TASK_19_2A_CONTROL_ACCEPTANCE_MATRIX.md
- docs/TASK_19_2A_BROWSER_RESULTS.md

# Milestone G — Regression tests

Backend:
1. onboarding validation
2. transition legality
3. duplicate idempotency
4. connection requires connector invocation
5. detection requires evidence
6. discovery persistence
7. Preview creation
8. Device commit
9. duplicate prevention
10. credential resolution
11. secret redaction
12. stale recovery
13. Dashboard route registry
14. missing optional-table fallback
15. no repeated Prisma stack trace
16. monitoring stable contract
17. success requires saved Device ID
18. Cisco read-only validation

Frontend:
1. save button advances state
2. progress visible
3. failure visible
4. retry works
5. Preview renders
6. commit navigates to workspace
7. Dashboard Add Device route
8. Quick Network Test route
9. domain/IP route
10. Devices route
11. monitoring unavailable state
12. Persian/English
13. desktop/mobile
14. no dead controls
15. no page-level overflow

# Final acceptance flows

Flow 1:
`/dashboard → ثبت دستگاه جدید → Cisco → save → test → detect → discover → preview → commit → workspace`

Flow 2:
`/dashboard → تست سریع شبکه → /tools/network-check`

Flow 3:
`/dashboard → بررسی دامنه یا IP → /tools`

Flow 4:
`/monitoring/linux → stable partial/not_configured state without stack-trace storm`

Viewports:
- 1440x900 Persian/English
- 1280x800 Persian
- 390x844 Persian/English

Verify:
- zero page-level overflow
- zero dead buttons
- zero unexpected 4xx/5xx
- zero current-navigation console errors
- no fake success
- no silent failure

# Controlled implementation order
1. reproduce and document
2. onboarding state-machine fix, separate commit
3. credential/Cisco flow, separate commit
4. Dashboard routing, separate commit
5. optional-table handling, separate commit
6. full audit/regression fixes, separate commit

# Validation
Backend:
- npx prisma validate
- npx prisma migrate status
- npx prisma generate
- npm run build
- npm test
- npm run validate:command-catalog

Frontend:
- npx pnpm@10 build
- npm run test:i18n
- npm run lint

Also:
- git diff --check
- git status --short

# Final report
Report root causes, state-machine fix, connector evidence, Cisco result, Device ID, Dashboard routes, optional-table strategy, Prisma/log result, broken controls found/fixed, Playwright evidence, tests/builds, migrations, blockers, commits and final git status.

Do not claim completion unless onboarding leaves `draft` and either persists the Device or returns an honest recoverable failure.
