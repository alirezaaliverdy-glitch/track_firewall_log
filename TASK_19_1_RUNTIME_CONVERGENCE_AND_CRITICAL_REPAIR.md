# TASK 19.1 — Runtime Convergence and Critical Workflow Repair
## Device Onboarding + Asset Workspace + Assistant-to-Action Center + ActionPlan Stale Fix

## Project

`track_firewall_log`

## Mission

Repair the current mismatch between backend, frontend, Product State Contract, routing, device onboarding, Assistant, Action Center, and connector execution.

The task must make these workflows visibly and reliably usable:

1. Add/register a new device from the UI.
2. Register and validate a Cisco IOS-XE device.
3. Open every asset and see a dedicated health and management workspace.
4. Move from AI Assistant to the exact ActionPlan in Action Center.
5. Execute a valid ActionPlan without an internal `COMMAND_PLAN_STALE` failure.
6. Handle repeated/idempotent requests correctly.
7. Keep frontend state, backend state, capability state, navigation and execution state synchronized.
8. Audit every primary route and control with Playwright MCP.
9. Fix all broken controls and avoidable 4xx/5xx responses found during the audit.
10. Preserve execution safety.

This is a runtime and product convergence task, not merely a UI redesign.

---

# Observed failures to reproduce first

## A. Device onboarding is hidden or missing

- No clear “ثبت دستگاه” entry is visible.
- The earlier device registration flow appears removed or hidden.
- Cisco cannot be tested because no Cisco device can be registered.
- Vendor pages expose capability text without a practical onboarding path.

## B. Assets experience is too shallow

- Asset/vendor cards are visually simple and operationally weak.
- Clicking an asset does not consistently open a dedicated asset workspace.
- There is no clear per-device health, history, findings, actions and capability experience.

## C. Assistant → Action Center navigation is broken

- “رفتن به مرکز عملیات” does not reliably navigate to the generated ActionPlan.
- The exact plan is not selected/focused after navigation.
- The workflow breaks between proposal and approval.

## D. ActionPlan execution fails with stale state

Observed error:

```text
Action API error 409:
COMMAND_PLAN_STALE:
The command plan is stale because the ActionPlan parameters changed.
```

Observed backend state includes:

```text
actionType: close_port
vendor: unknown → linux_edge
catalogCommandId: null
executionTemplateRef: null
connectorType: null
connectorInvoked: false
previewState: false
remoteCommand: sudo -n ufw delete allow 545/tcp ; sudo -n ufw status numbered
```

This suggests vendor/template/connector/parameters are resolved or mutated after preview/hash generation.

The root cause must be fixed. Do not suppress the 409.

## E. Persian UI remains partially English

Examples include:

- New Request
- Clear Chat
- Refresh Summary
- Safety Boundary
- AI Provider
- Action Center columns and filters

Persian mode must use Persian product copy while preserving technical identifiers only where necessary.

---

# Mandatory reading

Read completely before editing:

- `AGENTS.md`
- `CODEX_HANDOFF.md`
- `MASTER_SECURITY_PLATFORM_TASK.md`
- `TASK_18_2_PRODUCT_HARDENING_AND_INTEGRATIONS.md`
- `TASK_19_PRODUCT_CONVERGENCE.md`
- all asset/device/vendor routes and components
- all assistant/chat/action routes and components
- all ActionPlan schemas/services/controllers
- command catalog, resolver, preview, confirmation and connector code
- i18n dictionaries
- Prisma schema and migrations
- current git status and diff
- all referenced project memory docs

Preserve completed work.
Do not restart architecture from scratch.

---

# Non-negotiable safety

1. Never run destructive database or git commands.
2. Never run:
   - `prisma migrate reset`
   - `db push --force-reset`
   - `DROP DATABASE`
   - `TRUNCATE`
   - `git reset --hard`
   - `git clean -fd`
3. Never read, expose, modify or commit `.env` or secrets.
4. Never return stored credentials to frontend.
5. Never execute raw AI-generated CLI outside registered templates.
6. Network mutations require:
   - target device
   - detected vendor/platform
   - registered capability
   - canonical parameters
   - preview
   - approval
   - connector execution
   - verification
   - audit
7. Never report success unless `connectorInvoked=true`.
8. Internal normalization must not mutate an approved ActionPlan.
9. Changed parameters require a new revision and new confirmation.
10. Do not hide a working route because of a stale feature flag.

---

# MILESTONE R0 — Reproduce and document failures

Use connected Playwright MCP and current authenticated session.

Create:

- `docs/TASK_19_1_RUNTIME_BASELINE.md`
- `docs/TASK_19_1_BROKEN_CONTROL_REGISTER.md`
- `docs/TASK_19_1_API_FAILURE_REGISTER.md`

Required routes:

```text
/dashboard
/assets
/assets/devices
/assets/vendors
/assets/vendors/cisco
/assistant
/actions
/monitoring
/monitoring/linux
/security/findings
/security/rules
/integrations
/settings
```

Reproduce and record:

1. missing device registration;
2. Cisco no-device dead end;
3. broken Assistant → Action Center button;
4. port-close stale failure;
5. repeated close-port request;
6. mixed Persian/English UI;
7. dead controls;
8. console errors;
9. failed requests;
10. 4xx/5xx responses.

Record exact API request/response and browser behavior.

---

# MILESTONE R1 — Restore Device Onboarding

## Required visible entry points

A “ثبت دستگاه” CTA must be visible from:

```text
/assets
/assets/devices
/assets/vendors
/assets/vendors/:vendorKey
/assets/vendors/cisco
```

Add a secondary global action in the Assets page header.

## Required routes

```text
/assets/devices/new
/assets/onboarding
/assets/vendors/:vendorKey/devices/new
/assets/devices/:deviceId/setup
```

All routes must use one reusable onboarding engine.

## Onboarding steps

1. Vendor
2. Platform
3. Connection method
4. Management address
5. Port
6. Credential reference
7. Site/location
8. Safe connection test
9. Platform/version detection
10. Inventory discovery
11. Capability discovery
12. Preview
13. Save
14. Initial health collection
15. Result

## Initial supported paths

- Linux via SSH
- Cisco IOS-XE via SSH
- FortiGate via existing SSH/API connector
- MikroTik via existing API/SSH connector

Unsupported platform must be rejected clearly.

## APIs

Use or create:

```text
POST /api/device-onboarding/sessions
GET  /api/device-onboarding/sessions/:sessionId
POST /api/device-onboarding/sessions/:sessionId/answers
POST /api/device-onboarding/sessions/:sessionId/test
POST /api/device-onboarding/sessions/:sessionId/detect
POST /api/device-onboarding/sessions/:sessionId/discover
POST /api/device-onboarding/sessions/:sessionId/commit
```

## Product State fix

Add contract assertions:

- backend-ready + route-ready + UI-ready → CTA visible;
- unsupported route → hidden or explicit setup state;
- `planned` must not hide an already implemented route.

## Cisco acceptance

The user must be able to:

1. open Cisco vendor page;
2. click `ثبت دستگاه Cisco`;
3. enter connection details;
4. test SSH;
5. detect IOS-XE;
6. preview inventory/capabilities;
7. save device;
8. land on Cisco device detail;
9. run safe read-only validation.

No database or `.env` editing may be required.

---

# MILESTONE R2 — Dedicated Asset Workspace

## Routes

```text
/assets/devices/:deviceId
/assets/devices/:deviceId/overview
/assets/devices/:deviceId/health
/assets/devices/:deviceId/inventory
/assets/devices/:deviceId/capabilities
/assets/devices/:deviceId/findings
/assets/devices/:deviceId/actions
/assets/devices/:deviceId/history
/assets/devices/:deviceId/configuration
```

Clicking any asset card or row must open its workspace.

## Shared overview

Show:

- name
- vendor/platform/version
- site
- management IP
- online/offline/stale
- health score
- connector state
- last contact
- last successful collection
- findings by severity
- pending actions
- recent changes
- config backup age
- verification status

## Charts

At minimum:

- health score trend
- connector success/failure
- availability/uptime
- CPU/memory where available
- interface/service state distribution
- findings trend
- action success/failure
- recent-change annotations

Time ranges:

```text
1h
6h
24h
7d
30d
```

## Vendor-specific views

### Linux

- CPU
- memory/swap
- disk/inode
- load
- services
- listening ports
- firewall
- authentication events

### Cisco

- inventory
- interfaces
- VLANs
- trunks
- EtherChannels
- STP
- routing
- ACL/security
- configuration
- capability verification

### FortiGate

- interfaces
- policies
- addresses
- services
- routes
- VPN
- system health
- configuration

### MikroTik

- interfaces
- routes
- firewall
- NAT
- VPN
- system resources
- configuration

Show only supported capabilities.

Unsupported or missing data must render:

- reason
- requirement
- next action

Never raw JSON or giant empty panels.

---

# MILESTONE R3 — Fix Assistant to Action Center navigation

## Required behavior

When Assistant creates an ActionPlan:

- show a working `رفتن به مرکز عملیات` button;
- navigate to the exact plan;
- preserve `actionPlanId`;
- select/focus the plan;
- show current revision/status;
- scroll into view;
- allow preview/confirm/execute.

Preferred route:

```text
/actions/:actionPlanId
```

Acceptable fallback:

```text
/actions?planId=:actionPlanId
```

## Requirements

- router navigation, not a dead anchor;
- plan survives reload;
- invalid plan IDs show structured error;
- Assistant and Action Center share the same plan ID;
- no duplicate plan on navigation;
- mobile works.

## Tests

- proposal → Action Center
- browser back
- direct URL
- reload
- plan not found
- Persian and English

---

# MILESTONE R4 — Root-cause fix for COMMAND_PLAN_STALE

## Required execution order

```text
user intent
→ target device
→ detected vendor/platform
→ capability
→ catalog command
→ execution template
→ connector type
→ canonical parameters
→ risk
→ preview
→ immutable revision hash
→ approval
→ execute exact approved revision
```

No vendor/template/connector/parameter mutation after preview hash creation.

## Required fields or equivalents

```ts
planRevision: number
planState: "draft" | "preview_ready" | "approved" | "executing" | "completed" | "failed" | "superseded"
canonicalParameters: Json
canonicalParametersHash: string
previewHash: string
approvedRevision?: number
approvedPreviewHash?: string
approvedAt?: Date
resolvedVendor: string
resolvedPlatform?: string
catalogCommandId: string
executionTemplateRef: string
connectorType: string
idempotencyKey?: string
supersedesPlanId?: string
```

Use a non-destructive migration only if necessary.

## Canonicalization

Before hashing:

- port → integer
- protocol normalized
- IP/CIDR canonicalized
- interface names canonicalized
- booleans normalized
- semantically unordered arrays sorted
- no timestamp/random value in hash
- no defaults injected after approval

## Revision behavior

- editing parameters creates a new draft revision;
- approved revision remains immutable;
- new revision requires preview and confirmation;
- execution references exact approved revision/hash.

## Structured 409

A genuine conflict returns:

```json
{
  "error": {
    "code": "COMMAND_PLAN_STALE",
    "message": "پارامترهای برنامه نسبت به نسخه تأییدشده تغییر کرده‌اند.",
    "retryable": true,
    "recovery": "CREATE_NEW_REVISION",
    "currentRevision": 3,
    "approvedRevision": 2,
    "changedFields": ["port"]
  }
}
```

Frontend shows:

- changed fields;
- why reconfirmation is needed;
- `ساخت پیش‌نمایش جدید`;
- safe rollback to approved revision when allowed.

Do not show raw endpoint text as the main error.

## Internal-resolution regression

These must happen before preview and must not cause stale:

- `vendor: unknown` → `linux_edge`
- catalog command resolution
- connector type resolution
- execution template resolution
- protocol normalization
- device context loading

## close_port workflow

For:

```text
پورت 545 را ببند
```

Required flow:

1. identify selected Linux device;
2. resolve registered close-port capability;
3. canonical params:
   - port: 545
   - protocol: tcp or ask if ambiguous
4. inspect current firewall state;
5. preview;
6. confirmation;
7. invoke Linux connector;
8. execute registered adapter;
9. verify effective state;
10. audit;
11. update UI.

## Idempotency

Repeated close request on an already closed port must not fail stale.

Return one of:

```text
verified_no_change
already_compliant
completed
```

Only after real connector verification.

`connectorInvoked` must be true for verified no-change.

Do not run unnecessary destructive commands when already compliant.

## Firewall semantics

Detect and use the correct adapter:

- UFW
- firewalld
- nftables
- iptables

Do not assume `ufw delete allow 545/tcp` is always sufficient.

Preview must explain chosen strategy.

---

# MILESTONE R5 — Action Center cleanup

Required fixes:

- Persian labels in Persian mode
- exact selected plan
- revision/status
- preview
- risk
- target device
- vendor/platform
- connector
- template
- parameters
- verification
- audit timeline
- structured errors
- recovery actions
- no raw API URL in user-facing errors

List behavior:

- filters work;
- tabs work;
- selection highlighted;
- URL reflects selection;
- refresh keeps selection;
- stale/superseded revisions understandable;
- repeated actions grouped.

Replace vague states with:

```text
پیش‌نمایش آماده
منتظر تأیید
در حال اجرا
تأییدشده بدون تغییر
ناموفق
نیازمند پیش‌نمایش جدید
```

---

# MILESTONE R6 — Global route and control audit

Audit every primary route and visible control:

- Dashboard
- Assets
- Vendors
- Security
- Monitoring
- Actions
- Assistant
- Integrations
- Settings

For every control:

- click it;
- verify route/API/state;
- loading;
- error;
- empty;
- permission;
- Persian;
- English;
- mobile.

Create:

- `docs/TASK_19_1_ROUTE_ACCEPTANCE_MATRIX.md`
- `docs/TASK_19_1_CONTROL_ACCEPTANCE_MATRIX.md`

No dead control may remain without being explicitly disabled and explained.

---

# MILESTONE R7 — Persian/English consistency

Translate product copy in Persian mode, including:

- New Request
- Clear Chat
- Refresh Summary
- Safety Boundary
- AI Provider
- Execution mode
- Latest status
- Active review
- Action plans
- headers
- filters
- buttons
- errors
- empty states
- onboarding steps

Technical identifiers may remain English:

- Linux
- Cisco IOS-XE
- IP
- SSH
- VLAN
- EtherChannel
- API
- ActionPlan

Use i18n dictionaries only.

Add a test that fails when known English product copy appears in Persian primary routes.

---

# MILESTONE R8 — Playwright MCP end-to-end acceptance

Use Playwright MCP continuously.

## Flow 1: Add Linux device

```text
Assets
→ Add device
→ Linux
→ SSH test
→ detect
→ capability preview
→ save
→ device workspace
```

## Flow 2: Add Cisco device

```text
Cisco vendor
→ Register Cisco device
→ SSH test
→ IOS-XE detect
→ inventory/capabilities
→ save
→ Cisco workspace
→ validation suite
```

## Flow 3: Assistant close port

```text
Assistant
→ select Linux device
→ request close port 545
→ proposal
→ Action Center
→ preview
→ confirm
→ execute
→ verify
→ success/already compliant
```

## Flow 4: Genuine parameter edit

```text
approved plan
→ edit port
→ new revision
→ new preview
→ re-confirm
→ execute
```

## Flow 5: Asset health

```text
Assets
→ open device
→ health chart
→ findings
→ actions
→ history
```

## Viewports/locales

- 1440×900 Persian
- 1280×800 Persian
- 390×844 Persian
- 1440×900 English
- 390×844 English

Verify:

- no console errors;
- no unexpected failed requests;
- no 409 from internal normalization;
- no page-level overflow;
- no dead controls;
- no mixed product language;
- exact ActionPlan navigation;
- connector invocation where lab execution is allowed.

Create:

`docs/TASK_19_1_BROWSER_RESULTS.md`

---

# MILESTONE R9 — Tests

## Backend tests

1. Product State exposes onboarding route.
2. Device creation is permission protected.
3. Credentials redacted.
4. Cisco IOS-XE onboarding detection.
5. Unsupported Cisco rejection.
6. Per-device detail contract.
7. Vendor/template/connector resolution before preview.
8. Canonical hashing.
9. Approved revision immutability.
10. Edit creates new revision.
11. Internal resolution does not create stale conflict.
12. Genuine edit returns structured conflict/revision response.
13. close_port idempotency.
14. already-compliant requires connector verification.
15. success requires `connectorInvoked=true`.
16. Assistant plan ID equals Action Center plan ID.
17. direct plan URL.
18. no duplicate plan on navigation.
19. structured API errors.
20. execution permissions.

## Frontend tests

1. Add-device CTA visible.
2. Cisco onboarding CTA visible.
3. onboarding wizard.
4. asset opens workspace.
5. health charts render.
6. unsupported capability state.
7. Assistant button navigates to exact plan.
8. Action Center selects exact plan.
9. 409 recovery UI.
10. new revision flow.
11. Persian labels.
12. English LTR.
13. mobile no overflow.
14. no raw API URL.
15. no dead control.

---

# Controlled implementation order

## R-A
- reproduce failures
- write baseline docs

## R-B
- restore onboarding and Product State route visibility
- device workspace foundation
- separate commit

## R-C
- fix Assistant → Action Center
- separate commit

## R-D
- ActionPlan revision/canonicalization/stale root-cause fix
- migration if required
- separate commit

## R-E
- Action Center UX and i18n
- separate commit

## R-F
- asset charts and vendor-specific tabs
- separate commit

## R-G
- global control audit and Playwright acceptance
- separate commit

Do not mix all fixes into one commit.

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
npm run lint
```

Also:

```powershell
git diff --check
git status --short
```

---

# Final report

Report:

1. Root cause of hidden onboarding
2. Routes restored
3. Product State fixes
4. Cisco onboarding result
5. Asset workspace result
6. Charts and health result
7. Assistant navigation result
8. Root cause of COMMAND_PLAN_STALE
9. ActionPlan revision changes
10. close_port real result
11. repeated-request result
12. Action Center fixes
13. Persian/English fixes
14. broken controls fixed
15. API failures fixed
16. Playwright flows tested
17. build/test results
18. migrations
19. production blockers
20. commit hashes
21. final git status

Do not claim completion unless all five end-to-end flows are visibly usable.
