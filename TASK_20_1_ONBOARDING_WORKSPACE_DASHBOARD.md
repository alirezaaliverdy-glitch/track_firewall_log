# TASK 20.1 — Authoritative Device Registration, Animated Success Flow, Device Workspace, and Live Dashboard Analytics

## Project
`track_firewall_log`

## Primary goal

Fix device onboarding completely and connect it to a real post-registration experience.

The final user flow must be:

```text
Dashboard
→ ثبت دستگاه جدید
→ Save answers
→ Test connection
→ Detect platform
→ Discover vendor/device data
→ Build preview
→ Commit Device
→ Animated success notification
→ Automatic navigation to the new Device workspace
→ Vendor-specific health, inventory, interfaces, services, configuration and history
```

This task is not complete if the form merely returns HTTP 200.

---

# Current reproducible failure

Backend logs currently show only:

```text
POST /api/device-onboarding/sessions/:sessionId/answers
→ 200
```

but none of these operations are proven:

```text
/test-connection
/detect-platform
/discover
/build-preview
/commit
```

Observed symptom:

- answers may be stored;
- session remains `draft`;
- connector is not invoked;
- platform is not detected;
- discovery does not complete;
- Device is not persisted;
- user receives no authoritative success or failure;
- no Device workspace opens.

The root cause must be traced and fixed end-to-end in frontend, backend, session state, API contracts and persistence.

---

# Mandatory preparation

Read completely:

- `AGENTS.md`
- `CODEX_HANDOFF.md`
- `docs/PROJECT_MEMORY_INDEX.md`
- `docs/CURRENT_STATUS.md`
- `docs/TASK_HISTORY.md`
- `docs/ARCHITECTURE_MAP.md`
- `TASK_19_PRODUCT_CONVERGENCE.md`
- `TASK_19_1_RUNTIME_CONVERGENCE_AND_CRITICAL_REPAIR.md`
- `TASK_19_2_DIAGNOSTICS_AND_ONBOARDING.md`
- `TASK_19_2A_RUNTIME_REPAIR_AND_FULL_AUDIT.md`
- `TASK_20_REAL_NETWORK_OPERATIONS.md`
- all current onboarding frontend/backend code
- credential-reference service
- connector registry
- Product State Contract
- dashboard widgets and route registry
- vendor/device workspace code
- Prisma schema and migrations
- existing tests and Playwright evidence

Before editing:

```powershell
git status --short
git log --oneline -15
cd backend
npx prisma validate
npx prisma migrate status
cd ..
```

Do not discard previous commits or untracked evidence.

---

# MCP gate

Use Playwright MCP from this exact Codex session.

Before implementation:

1. enumerate MCP tools;
2. invoke Playwright MCP;
3. open `http://localhost:5173`;
4. capture URL, title, visible text and snapshot;
5. reproduce the onboarding bug.

Do not use local Playwright or shell browser automation as a substitute.

If MCP is unavailable, stop with:

```text
MCP_SESSION_NOT_AVAILABLE
```

---

# Non-negotiable rules

- Never read, print, modify or commit `.env`.
- Never expose secret values.
- Frontend sends only credential reference IDs.
- Backend resolves secrets server-side.
- Never report connection success unless `connectorInvoked=true`.
- Never report platform detection without real evidence.
- Never report onboarding success unless a Device row is persisted.
- Never show fake dashboard data as live data.
- Never replace missing metrics with healthy zero values.
- Never use destructive Prisma commands.
- Never use:
  - `prisma migrate reset`
  - `db push --force-reset`
  - `git reset --hard`
  - `git clean -fd`
- All mutations require existing ActionPlan safety rules where applicable.
- Every milestone gets a separate commit.

---

# MILESTONE 20.1-A — Reproduce and trace the onboarding failure

Create:

- `docs/TASK_20_1_ONBOARDING_RUNTIME_TRACE.md`
- `docs/TASK_20_1_API_SEQUENCE_TRACE.md`
- `docs/TASK_20_1_FRONTEND_STATE_TRACE.md`
- `docs/TASK_20_1_BACKEND_STATE_TRACE.md`

Using Playwright MCP, perform:

1. open `/assets/devices/new`;
2. select Vendor;
3. select Platform;
4. choose Connection;
5. enter address and port;
6. select Credential Reference;
7. save answers;
8. observe every network request;
9. inspect rendered state;
10. inspect backend session state;
11. inspect Device persistence;
12. inspect console and backend errors.

Document:

- exact button clicked;
- request URL;
- request payload shape;
- response shape;
- session status before/after;
- frontend local state before/after;
- whether next endpoint was called;
- whether connector was invoked;
- whether Device was created.

Do not edit until the failure is reproduced and documented.

Commit:

```text
docs: trace task 20.1 onboarding failure
```

---

# MILESTONE 20.1-B — Repair the authoritative onboarding state machine

## Required states

```text
draft
answers_saved
connection_testing
connection_verified
platform_detecting
platform_detected
discovery_running
discovery_completed
preview_ready
saving
completed
```

Failure states:

```text
validation_failed
credential_missing
credential_invalid
connection_failed
platform_unsupported
discovery_failed
preview_failed
save_failed
cancelled
```

## Required API sequence

```text
POST /api/device-onboarding/sessions
POST /api/device-onboarding/sessions/:sessionId/answers
POST /api/device-onboarding/sessions/:sessionId/test-connection
POST /api/device-onboarding/sessions/:sessionId/detect-platform
POST /api/device-onboarding/sessions/:sessionId/discover
POST /api/device-onboarding/sessions/:sessionId/build-preview
POST /api/device-onboarding/sessions/:sessionId/commit
GET  /api/device-onboarding/sessions/:sessionId
POST /api/device-onboarding/sessions/:sessionId/retry
POST /api/device-onboarding/sessions/:sessionId/cancel
```

`/answers` must only validate and persist answers.

It must not pretend the entire onboarding flow succeeded.

## Frontend orchestration

Replace the ambiguous behavior with one of these patterns.

### Preferred pattern: explicit steps

```text
ذخیره اطلاعات
تست اتصال
تشخیص پلتفرم
کشف اطلاعات و قابلیت‌ها
ساخت پیش‌نمایش
ثبت دستگاه
```

### Allowed pattern: one orchestrated button

The button may run all steps only when it visibly shows:

```text
در حال ذخیره اطلاعات
در حال تست اتصال
در حال تشخیص پلتفرم
در حال کشف اطلاعات
در حال ساخت پیش‌نمایش
در حال ثبت دستگاه
```

The UI must show the exact failed step and a retry button.

## Hard invariants

- `answers_saved` only after backend validation.
- `connection_verified` only after connector invocation.
- `platform_detected` only after real evidence.
- `discovery_completed` only after discovery output is persisted.
- `preview_ready` only after authoritative backend preview.
- `completed` only after Device persistence.
- duplicate clicks are idempotent;
- one onboarding session cannot create duplicate Device rows;
- stale sessions return structured recovery;
- frontend state comes from backend state;
- no optimistic fake completion.

## Required API response fields

Every step must return:

```json
{
  "sessionId": "...",
  "status": "...",
  "revision": 1,
  "connectorInvoked": false,
  "platformDetected": null,
  "deviceId": null,
  "nextAllowedActions": [],
  "blockingReason": null,
  "updatedAt": "..."
}
```

Additional step-specific evidence is allowed.

Commit:

```text
fix: make onboarding state transitions authoritative
```

---

# MILESTONE 20.1-C — Credential reference and connector proof

## Credential reference rules

- frontend sends only `credentialReferenceId`;
- backend resolves the secret;
- session stores only the reference ID;
- secret never appears in response, logs, audit or browser;
- deleted/missing/inaccessible credentials return structured failure;
- wrong credential does not leave the UI spinning;
- credential test result is visible.

## Required visible states

```text
پیکربندی شده
در دسترس نیست
حذف شده
نامعتبر
تأیید شده
```

## Connector proof

For every supported vendor:

- selected connector ID;
- connector invoked;
- connection start/end time;
- sanitized evidence;
- failure category;
- retry state.

Do not expose passwords, private keys or tokens.

Commit:

```text
fix: prove credential resolution and connector invocation
```

---

# MILESTONE 20.1-D — Persist the Device and show animated success

## Successful commit contract

`POST /commit` must:

1. validate session revision;
2. verify required prior states;
3. persist Device;
4. persist vendor/platform metadata;
5. persist discovery snapshot;
6. link Credential Reference;
7. link Site/Location/Environment;
8. create an audit event;
9. return the Device ID and workspace route.

Response:

```json
{
  "status": "completed",
  "deviceId": "...",
  "workspaceUrl": "/assets/devices/<deviceId>",
  "messageKey": "deviceRegistration.success"
}
```

## Animated success notification

After successful Device persistence, display an animated success UI at the top of the page.

Requirements:

- appears only after real `completed` response;
- not triggered by local form state;
- Persian and English;
- RTL/LTR safe;
- accessible;
- reduced-motion safe;
- auto-dismiss after 4–6 seconds;
- manual close button;
- includes Device name/vendor;
- includes action:
  `مشاهده جزئیات دستگاه`;
- must not block navigation;
- must not duplicate on re-render.

Persian example:

```text
دستگاه با موفقیت ثبت شد
Cisco IOS-XE با شناسه <deviceId> آماده مدیریت است.
```

Animation:

- smooth slide/fade from top;
- progress indicator;
- success icon animation;
- no excessive bounce or childish motion;
- use CSS transitions or the existing animation library;
- respect `prefers-reduced-motion`.

## Automatic navigation

After success:

- wait approximately 800–1200 ms so the user sees the success state;
- navigate automatically to:
  `/assets/devices/:deviceId`;
- preserve toast/banner across navigation;
- browser back must not resubmit the form;
- refresh must open the Device workspace directly.

Commit:

```text
feat: add animated successful device registration flow
```

---

# MILESTONE 20.1-E — Build the Device workspace

Route:

```text
/assets/devices/:deviceId
```

The page must load from persisted backend data.

## Header

Show:

- Device name;
- Vendor;
- Platform;
- model;
- serial number;
- hostname;
- management IP;
- site/location;
- connection state;
- last successful collection;
- health score;
- capability state;
- actions:
  - اجرای چک
  - بروزرسانی اطلاعات
  - مشاهده تاریخچه
  - باز کردن Action Center

## Overview cards

At minimum:

```text
سلامت کلی
اتصال
CPU
Memory
Uptime
Interfaces
Ports
Services
Alerts/Findings
Last backup/config snapshot
```

Only show metrics supported by the selected vendor/platform.

Unsupported data must show:

```text
برای این پلتفرم در دسترس نیست
```

not zero.

## Vendor-aware tabs

Common tabs:

```text
نمای کلی
سلامت
اینترفیس‌ها
شبکه
سرویس‌ها
یافته‌ها
اقدامات
تاریخچه
شواهد
```

### Cisco IOS/IOS-XE

Show when available:

- version;
- model;
- serial;
- uptime;
- CPU/memory;
- interfaces;
- VLANs;
- trunks;
- EtherChannel;
- STP summary;
- routing table summary;
- ACL summary;
- environment/power/fans;
- config collection state.

### FortiGate

Show when available:

- version/build;
- serial;
- HA;
- VDOM;
- interfaces;
- policies;
- VPN;
- sessions;
- CPU/memory;
- storage;
- licenses;
- security profiles;
- findings.

### MikroTik

Show when available:

- RouterOS version;
- board/serial;
- CPU/memory;
- interfaces;
- routes;
- firewall;
- NAT;
- VPN;
- wireless where supported;
- services;
- backup state.

### Linux

Show when available:

- distribution/kernel;
- uptime;
- CPU;
- memory;
- disk;
- load;
- interfaces;
- listening ports;
- services;
- processes;
- firewall;
- failed units;
- findings.

## Health scoring

Create a documented, backend-owned health score.

Inputs may include:

- reachability;
- connector health;
- metric thresholds;
- interface state;
- service state;
- open findings;
- stale collection;
- configuration drift;
- backup freshness.

Return:

```text
healthy
attention
degraded
critical
unknown
```

Never calculate health only in the frontend.

## Charts

Use real persisted time-series data.

Required charts:

1. Health score over time
2. CPU and memory over time
3. Interface/port state summary
4. Findings by severity
5. Availability/latency history

Requirements:

- animated on first render;
- responsive;
- colored by semantic meaning;
- dark-mode compatible;
- tooltip;
- time range: 1h, 24h, 7d, 30d;
- loading/empty/partial/error states;
- no fake data;
- no random values;
- show source and last update;
- respect reduced motion.

Commit:

```text
feat: add vendor-aware device workspace
```

---

# MILESTONE 20.1-F — Add live animated Dashboard charts

The Dashboard must become an operational summary, not a decorative hallway.

## Required real widgets

### Network health

- overall health score;
- healthy/attention/degraded/critical/unknown device counts;
- animated donut or segmented ring;
- click opens filtered Assets view.

### Device availability

- online/offline/degraded/unknown;
- animated bar or donut;
- backed by persisted device/monitor state.

### Findings severity

- critical/high/medium/low/info;
- animated bar or donut;
- click opens filtered Findings.

### CPU and memory trend

- aggregated from supported monitored devices;
- line chart;
- selectable time range;
- no unsupported devices treated as zero.

### Latency/availability trend

- monitor and diagnostic history;
- line chart;
- latest outages and recoveries.

### Vendor distribution

- Cisco/FortiGate/MikroTik/Linux/other;
- animated categorical chart;
- click filters Assets.

### Recent operational activity

- device registrations;
- checks;
- findings;
- actions;
- monitor failures/recoveries;
- integration runs.

## Dashboard design requirements

- colorful but professional;
- semantic colors;
- no neon overload;
- subtle entry animation;
- animated value transitions;
- responsive grid;
- Persian RTL and English LTR;
- laptop and mobile layouts;
- skeleton loading;
- empty state with a useful CTA;
- partial data warning;
- source and freshness label;
- charts must navigate to the related page/filter.

## Backend aggregation API

Create or repair:

```text
GET /api/dashboard/overview
GET /api/dashboard/health-series
GET /api/dashboard/resource-series
GET /api/dashboard/availability-series
GET /api/dashboard/findings-summary
GET /api/dashboard/vendor-summary
GET /api/dashboard/activity
```

Use stable typed contracts.

Do not issue dozens of unrelated frontend requests when one aggregated endpoint is appropriate.

Commit:

```text
feat: add live animated operational dashboard charts
```

---

# MILESTONE 20.1-G — Full frontend/backend synchronization audit

Use Playwright MCP to inspect every primary route and every visible control:

```text
/dashboard
/assets
/assets/devices
/assets/devices/new
/assets/devices/:deviceId
/assets/vendors
/assets/vendors/cisco
/security
/security/findings
/security/rules
/monitoring
/monitoring/linux
/actions
/assistant
/tools
/tools/network-check
/tools/history
/tools/monitors
/integrations
/settings
```

For each control verify:

- visible;
- enabled or disabled with reason;
- correct route;
- correct API request;
- correct response handling;
- loading;
- success;
- failure;
- empty;
- partial;
- persisted state;
- no duplicate submission;
- no stale state;
- no unexpected 4xx/5xx;
- no console error;
- no page-level overflow;
- Persian/English;
- desktop/mobile.

Create:

- `docs/TASK_20_1_ROUTE_ACCEPTANCE_MATRIX.md`
- `docs/TASK_20_1_CONTROL_ACCEPTANCE_MATRIX.md`
- `docs/TASK_20_1_API_CONTRACT_MATRIX.md`
- `docs/TASK_20_1_BROWSER_RESULTS.md`

Commit:

```text
fix: synchronize task 20.1 frontend and backend flows
```

---

# MILESTONE 20.1-H — Real acceptance

## Flow 1 — Successful device registration

Using an explicitly supplied real target and credential reference:

```text
Dashboard
→ ثبت دستگاه جدید
→ fill form
→ ذخیره اطلاعات
→ تست اتصال
→ تشخیص پلتفرم
→ کشف اطلاعات
→ Preview
→ ثبت دستگاه
→ animated success banner
→ automatic redirect
→ device workspace
```

Evidence required:

- session ID;
- request sequence;
- `connectorInvoked=true`;
- detected platform;
- discovery output ID;
- Device ID;
- audit event ID;
- workspace URL;
- screenshot of success animation;
- screenshot of device workspace;
- database persistence proof.

## Flow 2 — Failure and retry

Use a controlled invalid credential/reference case:

- structured error;
- exact failed step;
- no fake success;
- retry works;
- session remains recoverable;
- no duplicate Device.

## Flow 3 — Dashboard charts

- open Dashboard;
- verify real API data;
- verify animated chart render;
- switch time range;
- click chart segment;
- verify filtered destination;
- verify mobile;
- verify Persian/English.

## Viewports

- 1440×900 Persian
- 1440×900 English
- 1280×800 Persian
- 390×844 Persian
- 390×844 English

---

# Required tests

## Backend

1. onboarding legal transitions;
2. answers validation;
3. credential reference resolution;
4. secret redaction;
5. connection requires connector invocation;
6. platform evidence required;
7. discovery persistence;
8. preview creation;
9. Device commit;
10. duplicate commit idempotency;
11. stale revision recovery;
12. workspace API;
13. vendor-aware capability filtering;
14. health score calculation;
15. dashboard aggregation;
16. time-range queries;
17. missing metric behavior;
18. activity feed;
19. success response contract;
20. audit event persistence.

## Frontend

1. save answers advances state;
2. connection progress;
3. detection progress;
4. discovery progress;
5. Preview;
6. commit;
7. animated success banner;
8. reduced-motion mode;
9. auto redirect;
10. toast persistence across navigation;
11. device workspace render;
12. vendor-specific tabs;
13. unsupported capability state;
14. dashboard charts;
15. chart navigation;
16. time-range switching;
17. loading/empty/partial/error;
18. Persian/English;
19. mobile;
20. no dead controls;
21. no duplicate submission;
22. no raw JSON;
23. no page-level overflow.

---

# Validation commands

Backend:

```powershell
cd backend
npx prisma validate
npx prisma migrate status
npx prisma generate
npm run build
npm test
npm run validate:command-catalog
```

Frontend:

```powershell
cd ..
npx pnpm@10 build
npm run test:i18n
npm run test:utf8
npm run lint
```

Also:

```powershell
git diff --check
git status --short
git log --oneline -15
```

If full repository lint fails because of pre-existing debt:

- changed-file lint must pass;
- list legacy failures separately;
- do not hide new lint failures.

---

# Autonomous policy

Continue autonomously through safe code, tests and UI work.

Do not ask for routine confirmations.

Stop only for:

1. missing real target;
2. missing Credential Reference;
3. destructive database operation;
4. unapproved device mutation;
5. MCP unavailable;
6. ambiguous production migration.

Read-only device onboarding and discovery are allowed after the user supplies the explicit target and Credential Reference.

---

# Final report

Report:

1. onboarding root cause;
2. exact fixed request sequence;
3. connector evidence;
4. platform evidence;
5. discovery evidence;
6. Device ID;
7. success animation evidence;
8. redirect evidence;
9. Device workspace evidence;
10. dashboard charts and data sources;
11. every additional broken control found;
12. every additional broken control fixed;
13. test counts;
14. build results;
15. migration status;
16. Playwright screenshots;
17. commit hashes;
18. remaining blockers;
19. final git status.

Do not claim completion unless the Device is persisted and the workspace opens.
