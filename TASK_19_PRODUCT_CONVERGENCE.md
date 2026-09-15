# TASK 19 — Product Convergence
## Vendor Operations, Cisco Verification, Detection Engineering, Persian Findings, Settings, and Tangible Integrations

## Project
`track_firewall_log`

## Mission

Turn the current application into one coherent Network & Security Operations Platform.

The current product has strong backend pieces, but too many pages, vendor capabilities, rules, findings, settings and integrations are disconnected, unclear, unverified, partially translated or not reachable through a complete user workflow.

Task 19 must synchronize:

- backend capability state;
- API contracts;
- navigation;
- vendor/device onboarding;
- detection rules;
- findings;
- settings;
- integrations;
- ActionPlan execution;
- UI state;
- Playwright browser verification.

The final product must not show a route as usable unless the corresponding backend, API, UI and tests agree.

Do not attempt all milestones in one uncontrolled commit.

---

# Mandatory reading

Before editing, read completely:

- `AGENTS.md`
- `CODEX_HANDOFF.md`
- `MASTER_SECURITY_PLATFORM_TASK.md`
- `TASK_18_1_PLATFORM_UX_ARCHITECTURE.md`
- `TASK_18_2_CISCO_FULL_LINUX_OBSERVABILITY.md`
- `TASK_18_2_RECOVERY_AND_CONTINUATION.md`
- `TASK_18_2_PRODUCT_HARDENING_AND_INTEGRATIONS.md`
- `CISCO_CAPABILITY_COVERAGE_MATRIX.md`
- `PRISMA_BASELINE_RECOVERY_RUNBOOK.md`
- `docs/PROJECT_MEMORY_INDEX.md`
- `docs/CURRENT_STATUS.md`
- `docs/TASK_HISTORY.md`
- `docs/ARCHITECTURE_MAP.md`
- `docs/CODEBASE_OVERVIEW.md`
- `docs/VENDOR_CAPABILITY_FRAMEWORK.md`
- `docs/LINUX_OBSERVABILITY.md`
- all current route, integration, vendor, findings, rules, settings, i18n, capability, action and connector files
- all current migrations
- current git status and current diff

Preserve completed work. Do not restart the architecture.

---

# Non-negotiable safety

1. Never run destructive Prisma/database commands.
2. Never expose, log or commit secrets.
3. Never mark execution successful unless `connectorInvoked=true`.
4. No AI-generated raw CLI may bypass registered templates.
5. Cisco mutations require platform detection, registered capability, validated inputs, backup, preview, confirmation, execution, verification and audit.
6. Integrations must never show production success in mock mode.
7. No primary route may exist only to display `planned`.
8. A feature may be labeled implemented only when backend, API, UI and tests agree.
9. Do not write `.env` from the UI.
10. Do not call the task complete until browser acceptance passes.

---

# Product foundation: Product State Contract

Create a backend-generated Product State Contract as the single source of truth for the frontend.

Suggested APIs:

```text
GET /api/product-state
GET /api/product-state/navigation
GET /api/product-state/features
GET /api/product-state/vendors
GET /api/product-state/integrations
```

Suggested model:

```ts
type ProductFeatureState =
  | "implemented"
  | "partial"
  | "not_configured"
  | "unverified"
  | "planned"
  | "unsupported"
  | "disabled";

interface ProductFeature {
  key: string;
  titleFa: string;
  titleEn: string;
  route?: string;
  state: ProductFeatureState;
  userVisible: boolean;
  navigationVisible: boolean;
  backendReady: boolean;
  apiReady: boolean;
  uiReady: boolean;
  tested: boolean;
  reason?: string;
  requirements?: string[];
  lastVerifiedAt?: string;
}
```

Rules:

- navigation consumes this contract;
- vendor pages consume real capability state;
- integrations expose real/mock/not-configured status;
- planned and unsupported features are hidden from primary navigation;
- feature-state mismatch fails tests;
- mock state is always explicit.

Create:
`docs/PRODUCT_STATE_CONTRACT.md`

---

# Milestone 19A — Full audit and UI/backend synchronization

The Playwright MCP server named `playwright` is connected.

Use the authenticated browser session.

Audit:

```text
/dashboard
/assets
/assets/devices
/assets/vendors
/assets/vendors/cisco
/security
/security/findings
/security/rules
/monitoring
/monitoring/linux
/actions
/assistant
/integrations
/integrations/netbox
/integrations/wazuh
/settings
```

For every route record:

- whether it opens;
- actual user goal;
- API calls;
- backend support;
- visible planned/partial/mock state;
- dead controls;
- console errors;
- failed requests;
- loading/empty/error state;
- RTL/LTR;
- mobile behavior;
- user-visible value.

Create:

- `docs/TASK_19_BROWSER_BASELINE.md`
- `docs/TASK_19_FEATURE_GAP_REGISTER.md`
- `docs/TASK_19_UI_BACKEND_CONTRACT_GAPS.md`

Then implement Product State Contract and generate navigation from it.

Acceptance:

- primary navigation contains no planned-only route;
- backend/UI mismatch is tested;
- every route has a real user purpose;
- separate commit.

---

# Milestone 19B — Device and Vendor Onboarding Center

## User goal

The user must clearly know where and how to register a new device.

Create routes:

```text
/assets/onboarding
/assets/devices/new
/assets/devices/:deviceId/setup
/assets/vendors
/assets/vendors/registry
/assets/vendors/:vendorKey
/assets/vendors/:vendorKey/devices
/assets/vendors/:vendorKey/devices/new
```

## Device onboarding wizard

Steps:

1. Vendor
2. Platform
3. Connector type
4. Management address
5. Port
6. Credential reference
7. Site/location
8. Safe connection test
9. Platform detection
10. Capability discovery
11. Inventory preview
12. Save device
13. Initial health collection
14. Result

Initial supported paths:

- Cisco IOS-XE over SSH
- FortiGate using existing SSH/API connector
- MikroTik using existing RouterOS API/SSH connector
- Linux over SSH

No secret value may return to the frontend after submission.

## APIs

```text
POST /api/devices/onboarding/sessions
GET  /api/devices/onboarding/sessions/:id
POST /api/devices/onboarding/sessions/:id/answers
POST /api/devices/onboarding/sessions/:id/test-connection
POST /api/devices/onboarding/sessions/:id/detect-platform
POST /api/devices/onboarding/sessions/:id/discover-capabilities
POST /api/devices/onboarding/sessions/:id/commit
```

## Result

Show:

- connection status;
- detected vendor/platform/version;
- hostname/model/serial;
- capabilities;
- read operations;
- mutations;
- unsupported operations;
- health;
- next step.

Acceptance:

A user can register a Cisco IOS-XE lab device without editing the DB or `.env`.

---

# Milestone 19C — Cisco real support verification

## Objective

Answer truthfully: does Cisco support actually work?

Capability states:

- `implemented_verified`
- `implemented_unverified`
- `partial`
- `planned`
- `unsupported`

Do not show vague implemented status.

## Validation routes

```text
/assets/vendors/cisco/lab-validation
/assets/vendors/cisco/devices/:deviceId/validation
```

Validation suite:

1. SSH connection
2. prompt handling
3. privilege mode
4. platform detection
5. version/model/inventory
6. interfaces
7. IP interface brief
8. VLANs
9. trunks
10. EtherChannel summary
11. STP
12. routing table
13. ACL list
14. CPU/memory
15. configuration summary
16. parser quality
17. timeout behavior
18. unsupported platform rejection

Result table:

- capability;
- connector invoked;
- command executed;
- parser passed;
- structured data count;
- duration;
- warning/error;
- verified timestamp.

## Cisco vendor dashboard

Show:

- devices by platform;
- online/offline;
- connector success rate;
- health score trend;
- CPU/memory;
- interface up/down/error counts;
- VLAN count;
- EtherChannel health;
- config backup age;
- recent changes;
- failed verifications;
- capability coverage.

Charts:

- health score trend;
- connector success trend;
- interface state distribution;
- capability verification coverage;
- action success/failure.

## Cisco device tabs

- Overview
- Health
- Inventory
- Interfaces
- VLANs
- EtherChannels
- STP
- Routing
- ACL/Security
- Configuration
- Capabilities
- Actions
- History

If no device exists, show `ثبت دستگاه Cisco` and onboarding guidance instead of a raw capability dump.

---

# Milestone 19D — Vendor Registry and specialist vendor dashboards

Restore a real Vendor Management area.

Routes:

```text
/assets/vendors
/assets/vendors/registry
/assets/vendors/:vendorKey
/assets/vendors/:vendorKey/devices
/assets/vendors/:vendorKey/capabilities
/assets/vendors/:vendorKey/health
```

Each vendor page answers:

1. Which devices are connected?
2. What can be read?
3. What can be changed?
4. What is unsupported?
5. What failed recently?
6. What is the next action?

Vendor summary:

- platforms;
- connectors;
- device count;
- health;
- capability coverage;
- action coverage;
- verification coverage;
- latest version seen;
- recent errors;
- onboarding CTA.

Vendor definition management is admin/developer-only.
Do not allow arbitrary execution templates through the UI.

---

# Milestone 19E — Detection Engineering 2.0

Rewrite `/security/rules` around a real detection-engineering model.

Use these principles:

- structured rule format;
- Sigma-like import/export;
- ATT&CK mapping;
- normalized telemetry requirements;
- false-positive guidance;
- versioning;
- testing;
- rule lifecycle;
- rule quality scoring.

## Rule model

```ts
interface DetectionRule {
  id: string;
  stableKey: string;
  titleFa: string;
  titleEn: string;
  descriptionFa: string;
  descriptionEn: string;
  status: "draft" | "testing" | "enabled" | "disabled" | "deprecated";
  severity: "informational" | "low" | "medium" | "high" | "critical";
  confidence: number;
  riskScore: number;
  logSources: LogSourceRequirement[];
  detection: DetectionExpression;
  falsePositivesFa: string[];
  falsePositivesEn: string[];
  references: string[];
  attackMappings: AttackMapping[];
  tags: string[];
  version: number;
  lastTestedAt?: string;
  testStatus?: string;
}
```

## Lifecycle

```text
Draft
→ Validate
→ Test
→ Simulation preview
→ Enable
→ Monitor quality
→ Tune
→ Deprecate
```

## Rules UI

Views:

- Rule library
- Coverage
- Quality
- Testing
- Change history

Filters:

- severity
- status
- vendor
- log source
- ATT&CK tactic
- ATT&CK technique
- test status
- language

Rule detail:

- Persian explanation;
- why it matters;
- required telemetry;
- detection summary;
- false positives;
- ATT&CK mapping;
- recent matches;
- affected assets;
- recommended response;
- quality score;
- tests;
- versions.

## Creative but useful features

- ATT&CK coverage heatmap;
- blind spots;
- missing telemetry;
- noisy rules;
- no-signal rules;
- suggested tuning;
- duplicate rule detection;
- simulation on sanitized stored events;
- rule diff.

Imported rules remain disabled until validated and tested.

Create:
`docs/DETECTION_ENGINEERING_STANDARD.md`

---

# Milestone 19F — Normalized security event schema

Create a vendor-neutral normalized event schema inspired by OCSF concepts while preserving current product compatibility.

Core fields:

```text
event.id
event.time
event.category
event.type
event.action
event.outcome
event.severity
source.ip
source.port
source.user
destination.ip
destination.port
destination.user
device.id
asset.id
vendor
product
rule.id
rule.name
network.protocol
process.*
file.*
authentication.*
http.*
dns.*
cloud.*
raw.reference
```

Create adapters for:

- Linux
- Wazuh
- FortiGate
- MikroTik
- Cisco
- NetBox change events
- OpenSearch detector output

Track mapping quality and unmapped fields.
Do not expose unrestricted raw payloads as normal UI.

Create:
`docs/NORMALIZED_SECURITY_EVENT_SCHEMA.md`

---

# Milestone 19G — Persian findings and explainability

## Required behavior

When Persian is selected:

- labels are Persian;
- finding title is Persian;
- summary is Persian;
- impact is Persian;
- evidence explanation is Persian;
- false-positive guidance is Persian;
- recommended response is Persian;
- technical IDs remain unchanged when necessary;
- English/raw source is collapsible.

## Finding content

Add:

```text
titleFa/titleEn
summaryFa/summaryEn
impactFa/impactEn
recommendationFa/recommendationEn
falsePositiveGuidanceFa/En
translationSource
translationVersion
analysisVersion
```

Analysis pipeline:

```text
Normalized events
→ rule
→ asset context
→ topology context
→ severity/confidence
→ Persian explanation
→ impact
→ recommended investigation
→ optional ActionPlan proposal
```

Translation policy:

- curated translations for stable rule content;
- deterministic Persian templates as fallback;
- optional AI contextual summary when configured;
- never block finding display on AI;
- record translation source.

Finding detail shows:

- Persian title and summary;
- severity/confidence/risk;
- asset;
- timeline;
- evidence;
- ATT&CK mapping;
- why detected;
- false-positive possibility;
- recommendations;
- related events/findings;
- ActionPlan proposal;
- raw details collapsed.

---

# Milestone 19H — Finding lifecycle and minimal cases

Finding states:

```text
new
triaged
investigating
confirmed
false_positive
accepted_risk
mitigated
resolved
reopened
```

Add:

- owner;
- SLA;
- due date;
- comments;
- evidence;
- duplicate/merge;
- accepted-risk reason;
- remediation verification;
- history.

Minimal Case model:

```text
Case
CaseTask
CaseTimelineEntry
CaseObservable
CaseFindingLink
```

Do not expose a primary Cases route until the minimum workflow works.

---

# Milestone 19I — Functional Settings Center

Rewrite `/settings`.

Sections:

## General
- language
- timezone
- date/number format
- theme
- default landing page

## Security
- session timeout
- MFA status
- password policy summary
- roles/RBAC
- audit retention
- high-risk confirmation policy

## Notifications
- email
- webhook
- in-app
- severity thresholds
- quiet hours

## Monitoring
- collection interval
- stale threshold
- retention
- health thresholds

## Detection
- evaluation schedule
- deduplication window
- correlation window
- disabled rule behavior

## AI
- provider status
- model
- allowed use cases
- privacy mode
- translation enabled
- proposal-only mode
- no secret display

## Integrations
- NetBox
- Wazuh
- OpenSearch
- Greenbone
- connection status
- setup guidance

## Vendors
- enabled vendors
- default connectors
- capability refresh schedule
- unsupported platform policy

## Backup and Data
- DB backup status
- config backup policy
- retention
- export
- restore docs

Rules:

- settings persist in backend storage;
- secrets use secret references;
- changes are validated and audited;
- show effective value and source: default/environment/database/policy;
- environment-only values are read-only with explanation;
- never edit `.env` from UI.

---

# Milestone 19J — Tangible open-source capabilities

Do not merely mention open-source projects. Each selected project must result in a visible workflow.

## NetBox

Tangible:

- sites/locations/device roles;
- IPAM prefixes/IPs;
- VLANs;
- source-of-truth sync;
- preview/apply/conflicts;
- drift comparison;
- topology source.

## Wazuh

Tangible:

- agents/endpoints;
- alerts/events;
- rule metadata;
- normalized mapping;
- finding creation;
- preview/import/history.

## OpenSearch Security Analytics

Tangible:

- searchable timeline;
- detector state;
- rule synchronization;
- Sigma-compatible path;
- correlations;
- bounded event drill-down.

## Sigma

Tangible:

- rule import/export;
- validation;
- field compatibility;
- testing;
- versioning;
- ATT&CK mapping.

## MITRE ATT&CK

Tangible:

- mapping;
- coverage heatmap;
- blind spots;
- navigation from rules/findings;
- evidence mapping.

## OCSF-inspired schema

Tangible:

- normalized event contract;
- mapping quality;
- unmapped-field report;
- vendor-neutral detections.

## DefectDojo concepts

Tangible:

- finding lifecycle;
- duplicate/merge;
- accepted risk;
- false positive;
- remediation verification;
- SLA.

## TheHive concepts

Tangible:

- cases;
- tasks;
- observables;
- timeline;
- linked findings.

Do not copy archived or commercial code.

## Grafana concepts

Tangible:

- time range;
- reusable panels;
- annotations;
- thresholds;
- drill-down;
- reliable loading/error states.

## Uptime Kuma concepts

Tangible:

- heartbeat;
- uptime percentage;
- latency;
- incidents;
- maintenance windows;
- status history.

Create:
`docs/OPEN_SOURCE_CAPABILITY_ACCEPTANCE_MATRIX.md`

Each project must list:

- concept used;
- internal module;
- API;
- route;
- real/mock state;
- tests;
- user-visible proof;
- license review;
- blocker.

---

# Milestone 19K — Intelligence differentiators

After core workflows work, add:

## Change impact preview

Before mutation show:

- device;
- interfaces;
- VLANs;
- routes;
- dependent assets;
- management reachability risk;
- blast radius;
- rollback readiness.

## Health-to-Finding

Create findings only after threshold + duration.
Avoid alert storms through deduplication, suppression, maintenance windows and correlation.

## Finding-to-Action

A finding may propose a registered ActionPlan with reason, evidence, expected outcome, risk, verification and rollback.

## Timeline annotations

Configuration changes and actions annotate health charts.

## Trust indicators

Every automated result shows:

- source;
- last refresh;
- confidence;
- connector invoked;
- verified/unverified;
- mock/real.

---

# Milestone 19L — UI and navigation quality

Primary navigation:

1. Dashboard
2. Assets
3. Security
4. Monitoring
5. Actions
6. AI Assistant
7. Integrations
8. Settings

Requirements:

- vendor pages under Assets;
- onboarding is obvious;
- Rules and Findings are complete workflows;
- planned-only items hidden;
- Settings functional;
- Persian mode genuinely Persian;
- English mode LTR;
- tables handle long content;
- mobile has no page-level overflow;
- technical details collapsible;
- every page has one clear primary action.

---

# Milestone 19M — Playwright MCP acceptance

Use Playwright after every UI milestone.

Required flows:

1. Register Linux device
2. Register Cisco device or use no-device onboarding
3. Run Cisco validation
4. Open vendor health dashboard
5. Browse rule library
6. Open rule detail
7. View findings in Persian
8. Open finding detail
9. Change a safe setting
10. Check NetBox/Wazuh state
11. Open Linux monitoring
12. Propose ActionPlan from finding

Test:

- 1440x900
- 1280x800
- 390x844
- Persian RTL
- English LTR
- console/network
- loading/empty/error
- partial/mock/not configured/unverified
- long content
- keyboard basics
- no raw JSON
- no dead controls

Create:
`docs/TASK_19_BROWSER_RESULTS.md`

---

# Milestone 19N — Tests

Backend minimum:

- product-state contract;
- navigation/state consistency;
- onboarding validation;
- secret redaction;
- Cisco platform detection and read validation;
- vendor health aggregation;
- rule validation;
- Sigma-like import;
- ATT&CK mapping;
- event normalization;
- unmapped fields;
- Persian deterministic findings;
- AI fallback;
- lifecycle transitions;
- settings validation;
- environment settings read-only;
- integration mode honesty;
- NetBox/Wazuh workflows;
- health-to-finding deduplication;
- connectorInvoked success requirement.

Frontend minimum:

- onboarding wizard;
- vendor charts;
- Cisco no-device state;
- validation result;
- rules library;
- ATT&CK coverage;
- Persian findings;
- raw details collapsed;
- settings;
- integration status;
- mobile/RTL/LTR;
- no dead controls;
- no raw JSON.

---

# Controlled order

## 19A
Audit + Product State Contract + navigation alignment

## 19B
Device onboarding + vendor registry + vendor dashboards

## 19C
Cisco validation + Cisco health/coverage UX

## 19D
Normalized events + detection engineering + ATT&CK/Sigma

## 19E
Persian findings + lifecycle + minimal cases

## 19F
Settings Center

## 19G
Tangible NetBox/Wazuh/OpenSearch/open-source capabilities

## 19H
Intelligence differentiators + final polish

Each milestone:

- separate commit;
- backend tests/build;
- frontend tests/build;
- Playwright verification;
- memory update;
- honest status.

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
```

---

# Final report

Report:

1. Product State Contract
2. Routes fixed
3. Onboarding result
4. Vendor Registry
5. Cisco verification
6. Vendor health dashboards
7. Detection Engineering
8. ATT&CK/Sigma/normalized schema
9. Persian findings
10. Lifecycle/cases
11. Settings
12. NetBox/Wazuh/OpenSearch
13. Open-source acceptance matrix
14. UI/RTL/mobile
15. Playwright flows
16. Builds/tests
17. Migrations
18. Blockers
19. Remaining work
20. Commit hashes
21. Final git status

Do not say done unless the user can visibly complete the workflow.
