# TASK 20 — Real Network Operations, Device Onboarding Repair, Diagnostics Engine, and Full End-to-End Acceptance

## Mission

Turn `track_firewall_log` from a partially connected interface into a genuinely usable Network & Security Operations platform.

Current failures to repair:

1. Dashboard actions such as `تست سریع شبکه` and `بررسی دامنه یا IP` open placeholders or wrong routes instead of running real checks.
2. Device onboarding accepts form data but may remain in `draft`, never invoke the connector, never detect the platform, never discover capabilities, and never persist the Device.
3. Frontend controls and backend contracts are not consistently synchronized.
4. Integrations are not tangible and often provide no visible operational result.
5. Earlier GitHub-inspired architecture has not been converted into obvious, usable product capability.
6. Full real acceptance has not been proven across every primary route, button, worker, connector, API and persisted result.

This is not a UI-only task, documentation-only task, or mock-data task.

---

# Mandatory first gate

Before editing:

1. Read completely:
   - `AGENTS.md`
   - `CODEX_HANDOFF.md`
   - `docs/PROJECT_MEMORY_INDEX.md`
   - `docs/CURRENT_STATUS.md`
   - `docs/TASK_HISTORY.md`
   - `docs/ARCHITECTURE_MAP.md`
   - all Task 19/19.1/19.2/19.2A files present in the repository
   - current onboarding, dashboard, tools, integrations, actions, findings, monitoring, vendor, connector and Prisma code
   - all existing browser/control acceptance evidence
2. Inspect git status, current branch, recent commits, migration status, Product State, route registry, backend route registration, worker/queue code, connector registry and credential-reference service.
3. Verify Playwright MCP in this exact Codex session by invoking its browser tool, opening `http://localhost:5173`, reading URL/title/visible text and capturing a snapshot.
4. Do not use local Playwright or shell browser automation as fallback.
5. If MCP is unavailable, stop with `MCP_SESSION_NOT_AVAILABLE` and do not claim browser acceptance.

Create:

- `docs/TASK_20_PRECHANGE_RUNTIME_BASELINE.md`
- `docs/TASK_20_MCP_PROOF.md`
- `docs/TASK_20_ROUTE_CONTROL_BASELINE.md`
- `docs/TASK_20_API_FAILURE_REGISTER.md`
- `docs/TASK_20_BACKEND_LOG_REGISTER.md`

---

# Non-negotiable safety and honesty

- Never read, print, edit or commit `.env`.
- Never expose secret values.
- Frontend sends only credential reference IDs.
- No arbitrary shell commands or arbitrary Nmap flags.
- No destructive Prisma commands.
- Never use `prisma migrate reset`, `db push --force-reset`, `git reset --hard`, or `git clean -fd`.
- Never report onboarding success unless connector invocation, platform evidence, Device persistence and workspace navigation are proven.
- Never report diagnostic success unless a real provider/worker is invoked and normalized results are persisted and rendered.
- Mock/fixture/demo state must be visibly labeled.
- HTTP 200 is not proof of business success.
- Missing metrics must not be rendered as healthy zero values.
- Preserve ActionPlan confirmation and `connectorInvoked=true` requirements.
- Use separate commits per milestone.

---

# PHASE A — Repair device onboarding completely

Required flow:

```text
Dashboard → ثبت دستگاه جدید → Vendor → Platform → Connection → Address → Port
→ Credential reference → Site/Location/Environment → Save → Test connection
→ Detect platform → Discover → Preview → Commit Device → Device workspace
```

Authoritative state machine:

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

Hard invariants:

- `answers_saved` only after backend validation.
- `connection_verified` only after real connector invocation succeeds.
- `platform_detected` only after real evidence.
- `discovery_completed` only after discovery output is persisted.
- `preview_ready` only after backend builds an authoritative preview.
- `completed` only after Device persistence.
- duplicate requests and double-clicks are idempotent.
- stale sessions return structured recovery.
- frontend renders authoritative backend state.

Repair/create explicit APIs:

```text
POST /api/device-onboarding/sessions
GET  /api/device-onboarding/sessions/:sessionId
POST /api/device-onboarding/sessions/:sessionId/answers
POST /api/device-onboarding/sessions/:sessionId/test-connection
POST /api/device-onboarding/sessions/:sessionId/detect-platform
POST /api/device-onboarding/sessions/:sessionId/discover
POST /api/device-onboarding/sessions/:sessionId/build-preview
POST /api/device-onboarding/sessions/:sessionId/commit
POST /api/device-onboarding/sessions/:sessionId/retry
POST /api/device-onboarding/sessions/:sessionId/cancel
```

Do not overload `/answers` to silently perform all later steps.

Frontend controls:

```text
ذخیره اطلاعات
تست اتصال
تشخیص پلتفرم
کشف اطلاعات و قابلیت‌ها
ساخت پیش‌نمایش
ثبت دستگاه
```

A single orchestration button is allowed only when every step, progress state and failure is visible.

Show:

- current backend state;
- current request;
- connector invoked;
- credential-reference status;
- platform evidence;
- discovery summary;
- exact blocking reason;
- retry;
- Preview;
- persisted Device ID;
- final workspace route.

## Cisco legacy SSH compatibility

The lab Cisco target may require legacy negotiation.

- Do not weaken global SSH security.
- Implement an explicit per-device compatibility profile.
- Use only reviewed KEX and host-key algorithms.
- Prefer modern algorithms first.
- Record a warning and audit event.
- During onboarding run read-only commands only.

Read-only proof set:

```text
show version
show inventory
show ip interface brief
show interfaces status
show vlan brief
show etherchannel summary
show spanning-tree summary
show ip route
show access-lists
```

Apply the same state-machine contract to supported Linux, FortiGate and MikroTik onboarding.

Phase A acceptance:

- a real target is persisted and opens at `/assets/devices/:deviceId`, or
- the flow fails honestly with a precise recoverable state and no fake success.

Create:

- `docs/TASK_20_ONBOARDING_STATE_MACHINE.md`
- `docs/TASK_20_ONBOARDING_REAL_RESULTS.md`
- `docs/TASK_20_CREDENTIAL_REFERENCE_PROOF.md`

Commit:

```text
fix: make device onboarding authoritative and persistent
```

---

# PHASE B — Replace Dashboard placeholders with real routes

Required routes:

```text
ثبت دستگاه جدید   → /assets/devices/new
تست سریع شبکه     → /tools/network-check
بررسی دامنه یا IP → /tools
Nmap               → /tools/nmap
مانیتورها          → /tools/monitors
مشاهده دستگاه‌ها  → /assets/devices
```

Requirements:

- one central typed route registry;
- Product State exposes only routes that exist;
- every button is a real route or action;
- direct URL and reload work;
- Persian/English share route semantics;
- mobile and desktop business behavior match;
- no diagnostic action routes to a generic placeholder.

`/tools/network-check` must accept a real target and execute a persisted diagnostic session.

Commit:

```text
feat: replace dashboard placeholders with real network tools
```

---

# PHASE C — Build the real diagnostics engine

Create domain models:

```text
DiagnosticSession
DiagnosticCheck
DiagnosticNodeResult
DiagnosticEvidence
DiagnosticMonitor
DiagnosticRun
ScanAuthorizationScope
ProviderHealth
```

Session states:

```text
draft
policy_check
queued
running
partial
completed
failed
cancelled
```

Normalize and classify:

- domain;
- IPv4;
- IPv6;
- URL;
- host:port;
- CIDR;
- registered asset;
- public/private target.

Real routes:

```text
/tools
/tools/network-check
/tools/domain-check
/tools/ip-check
/tools/nmap
/tools/dns
/tools/http
/tools/tls
/tools/ports
/tools/traceroute
/tools/ip-info
/tools/subnet
/tools/history
/tools/monitors
```

For domains suggest DNS, Ping, HTTP/HTTPS, TLS, TCP 80/443, IP/ASN and traceroute.
For IPs suggest reverse DNS, Ping, selected TCP, IP/ASN and authorized Nmap.

Result tabs:

```text
خلاصه
دسترسی‌پذیری
DNS
HTTP و TLS
پورت‌ها
مسیر
اطلاعات IP
Nmap
تاریخچه
شواهد
```

Raw JSON or terminal output must not be the primary UX.

Commit:

```text
feat: add persisted diagnostic sessions and tools workspace
```

---

# PHASE D — Implement Check-Host multi-region provider

Use the documented JSON API, not HTML scraping or browser CSRF tokens.

Support:

- ping;
- http;
- tcp;
- udp;
- dns;
- node list;
- selected nodes;
- normal/extended result polling.

Implement:

- typed schemas;
- target validation;
- bounded polling and backoff;
- timeout;
- cache;
- rate limiting;
- country/node selection;
- partial results;
- provider health;
- persisted request ID and source nodes;
- structured errors.

UI shows country, city, node, IP, ASN, result, latency, resolved target, HTTP status, DNS addresses and error/partial state.

Always label:

```text
منبع بررسی: Check-Host external nodes
```

Real acceptance targets:

```text
example.com
8.8.8.8
```

Required real tests:

- DNS on `example.com`;
- HTTP on `https://example.com`;
- Ping on `8.8.8.8`;
- TCP on `example.com:443`.

Persist and display each result.

Commit:

```text
feat: integrate multi-region network checks
```

---

# PHASE E — Add safe Nmap through an isolated worker

Architecture:

```text
API → target policy engine → authorization scope → job queue
→ isolated Nmap worker → XML → parser → normalized result
→ findings/history → UI
```

Never run Nmap in the web request handler.

Allowed profiles:

1. host discovery;
2. quick reviewed TCP ports;
3. selected validated TCP ports;
4. bounded service detection;
5. OS guess for authorized assets;
6. traceroute;
7. full TCP only with admin permission and explicit scope.

Prohibited:

- arbitrary flags;
- evasion;
- spoofing;
- decoys;
- idle scans;
- fragmentation;
- brute-force/exploit scripts;
- intrusive NSE by default;
- random Internet ranges.

Worker safety:

- spawn argument arrays;
- no shell concatenation;
- timeout and cancellation;
- CPU/memory/process limits;
- max targets/ports/duration;
- worker health;
- audit;
- restricted raw XML evidence.

Normalize host state, addresses, hostname, ports, protocols, states, services, products, versions, OS confidence, hops, duration and drift from previous runs.

Real Nmap acceptance target:

```text
scanme.nmap.org
```

Run only:

- one host-discovery test;
- one quick reviewed TCP test;
- no exploit scripts;
- no DoS;
- no more than two scans in the task.

Also support an authorized registered lab asset when a scope exists.

UI must prove `workerInvoked=true` and show persisted structured results.

Commit:

```text
feat: add authorized isolated nmap diagnostics
```

---

# PHASE F — Add real persisted monitors

Implement Uptime-Kuma-inspired lifecycle without copying code/UI.

Monitor types:

- ping;
- HTTP/HTTPS;
- DNS;
- TCP;
- TLS expiry;
- service port;
- provider health;
- connector health;
- device reachability.

Fields:

- interval;
- timeout;
- failure/recovery thresholds;
- maintenance window;
- notification policy;
- owner;
- enabled state;
- last result;
- uptime percentage;
- latency history;
- failure/recovery timeline.

Dashboard shows active monitors, outages, degraded checks, expiring certificates and recent recoveries.

A real scheduler and persisted runs are mandatory.

Commit:

```text
feat: add real network monitors and availability history
```

---

# PHASE G — Make GitHub-inspired capabilities tangible

Do not copy entire external repositories. Build product-native adapters.

## NetBox

Source-of-truth sync for sites, locations, racks, devices, interfaces, IPs, VLANs and prefixes.

Visible flow:

```text
Test connection → Preview sync → Conflict review → Apply selected changes → Open imported assets
```

## Wazuh

Ingest recent alerts, map agents/devices, normalize severity/rule/evidence, create findings and link assets.

## OpenSearch Security Analytics

Searchable event timeline, detector/rule mapping, time filters, aggregations and finding evidence search. PostgreSQL remains authoritative for product state.

## TheHive

Case/incident workflow with owner, tasks, observables, evidence and related actions.

## Cortex

Analyzer job abstraction with observable input, analyzer selection, queued/running/result/error and normalized output. Mutations still require ActionPlan confirmation.

## OpenCTI

IOC enrichment with relationships, confidence, source, expiry and asset/finding correlation.

## Greenbone/OpenVAS

Vulnerability result import adapter with scanner reference, CVE/CVSS evidence, false-positive/suppression and remediation lifecycle. Do not build a new vulnerability scanner.

## ntopng

Traffic summaries, top talkers, protocols, flows, interfaces, anomalies and time ranges.

Every enabled integration must have:

- purpose;
- `real`, `fixture`, `not_configured`, `disabled`, `error` state;
- test connection/fixture validation;
- last successful run;
- errors;
- Preview;
- apply/import/run;
- history;
- user-visible result;
- related asset/finding/action.

No fake Sync button.
Fixture mode is visibly labeled.

Commit:

```text
feat: expose tangible security integration workflows
```

---

# PHASE H — Fix optional schema and backend log failures

Audit optional tables including:

```text
HealthSnapshot
CollectionRun
DeviceCapabilityCache
```

For each determine required/optional/planned/already represented.

When a clear non-destructive migration is required:

- create backup;
- validate SQL;
- apply only the required migration;
- verify tables/indexes;
- run tests.

When optional:

- capability-detect once;
- cache availability;
- do not run a known failing Prisma query;
- emit one concise warning;
- return `available`, `partial`, `not_configured`, `temporarily_unavailable`, or `failed`;
- show actionable UI.

No stack-trace storm and no healthy-zero fiction.

Commit:

```text
fix: stabilize optional observability schema behavior
```

---

# PHASE I — Full frontend/backend synchronization audit

Audit every primary page for route, Product State, API schema, loading/error/empty/partial state, persisted data, direct reload, mobile, locale and history.

Routes:

```text
/dashboard
/assets
/assets/devices
/assets/devices/new
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
/tools/nmap
/tools/history
/tools/monitors
/integrations
/settings
```

Every visible control is classified:

```text
working
fixed
disabled_with_reason
not_configured
removed
```

No dead controls.

Create:

- `docs/TASK_20_ROUTE_ACCEPTANCE_MATRIX.md`
- `docs/TASK_20_CONTROL_ACCEPTANCE_MATRIX.md`
- `docs/TASK_20_API_CONTRACT_MATRIX.md`
- `docs/TASK_20_PROVIDER_WORKER_MATRIX.md`

Commit:

```text
fix: converge frontend controls with backend contracts
```

---

# PHASE J — Full real Playwright MCP acceptance

Use only the MCP-controlled browser.

## Flow 1: Device onboarding

```text
Dashboard → ثبت دستگاه جدید → supported real target → Save → Test
→ Detect → Discover → Preview → Persist → Workspace
```

## Flow 2: Domain check

```text
Dashboard → بررسی دامنه یا IP → example.com
→ DNS + HTTP + TLS + TCP → persisted result → history
```

## Flow 3: IP check

```text
Dashboard → تست سریع شبکه → 8.8.8.8
→ Ping + IP/ASN → persisted result
```

## Flow 4: Nmap

```text
Tools → Nmap → scanme.nmap.org → safe quick profile
→ worker invoked → structured result → history
```

## Flow 5: Unauthorized target

```text
unregistered private target → Nmap → policy rejection
→ workerInvoked=false → clear explanation
```

## Flow 6: Monitor

```text
Create HTTP monitor for example.com → scheduler run
→ persisted result → history → Dashboard status
```

## Flow 7: Integration

At least one real configured adapter or visibly fixture-backed adapter:

```text
Open integration → test/validate → Preview → apply/import → visible product result
```

Viewports/locales:

- 1440×900 Persian;
- 1440×900 English;
- 1280×800 Persian;
- 390×844 Persian;
- 390×844 English.

Record URL, screenshot/snapshot, visible state, API calls, failed requests, console errors, HTTP errors, persisted IDs, worker/connector invocation and final status.

Require:

- zero page-level overflow;
- zero dead controls;
- zero unexpected 4xx/5xx;
- zero current-flow console errors;
- no fake success;
- no silent failure.

Create:

- `docs/TASK_20_BROWSER_RESULTS.md`
- `docs/TASK_20_REAL_ACCEPTANCE_RESULTS.md`
- `docs/TASK_20_REMAINING_BLOCKERS.md`

Commit:

```text
test: prove real network operations end to end
```

---

# Regression requirements

Backend tests must cover onboarding transitions, idempotency, credential resolution/redaction, connector invocation, platform evidence, discovery persistence, Preview/commit, target parser, SSRF/rebinding/redirect protection, Check-Host polling/partial/rate limit, Nmap allowlist/worker/XML/scope, monitors, history, findings, optional-table fallback, integration contracts, Product State and audit evidence.

Frontend tests must cover Dashboard routes, onboarding progress/failure/retry, Preview/workspace navigation, tools input/suggestions, domain/IP/multi-region results, Nmap profile/policy rejection, history, monitors, integration state, Persian/English, mobile, no raw JSON and no dead controls.

---

# Validation

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
npm run lint
```

Also:

```powershell
git diff --check
git status --short
git log --oneline -15
```

When repository-wide lint has pre-existing debt, prove changed-file lint is clean and report legacy debt separately.

---

# Autonomous policy

Continue autonomously across safe milestones and do not ask for routine confirmations.

Stop only for:

1. destructive database operation;
2. ambiguous production target;
3. missing credential reference for a required live external system;
4. unapproved device mutation;
5. Playwright MCP unavailable in the current session;
6. external provider authorization ambiguity.

Pre-approved public acceptance targets are limited to:

```text
example.com
8.8.8.8
scanme.nmap.org
```

Do not broaden them.

---

# Final report

Report root causes, onboarding proof, Device IDs, connector evidence, Dashboard routes, diagnostic result IDs, Check-Host request IDs, Nmap worker evidence, monitor evidence, integration workflows, tangible GitHub-inspired capabilities, migration/log status, API audit, route/control audit, MCP evidence, exact test counts, builds, lint, commits, blockers and final git status.

Do not use `complete`, `green`, or `done` unless every claimed capability has evidence.
