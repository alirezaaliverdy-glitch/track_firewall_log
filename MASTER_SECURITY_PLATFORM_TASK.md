# MASTER TASK — Security Operations Platform Expansion

## Project
`track_firewall_log`

## Mission

Evolve the current Persian-first firewall/network automation product into a modular Network & Security Command Center without turning the UI into a crowded dumping ground.

The product must remain centered around these existing strengths:

- Vendor-aware device management
- AI request resolver
- Guided Actions
- ActionPlan
- User confirmation
- Real connector execution
- Verification
- Audit trail

Do not replace the current architecture with another product.
Do not copy full external projects into this repository.
Extract the strongest ideas and integrate them through internal vendor-neutral modules and optional adapters.

## Non-negotiable rules

1. Read project memory files before coding:
   - `AGENTS.md`
   - `CODEX_HANDOFF.md`
   - `docs/PROJECT_MEMORY_INDEX.md`
   - `docs/CURRENT_STATUS.md`
   - `docs/TASK_HISTORY.md`
   - `docs/ARCHITECTURE_MAP.md`
   - `docs/CODEBASE_OVERVIEW.md`
   - `docs/PERSIAN_COMMAND_CATALOG_PRODUCT.md`
2. Preserve:
   - `ACTION_EXECUTION_MODE=quick_controlled`
   - `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`
3. Never mark an action successful unless `connectorInvoked=true`.
4. Never auto-remediate security findings. Every mutating remediation must create an ActionPlan and require confirmation.
5. Never commit `.env`, credentials, tokens, API keys or raw secrets.
6. Build internal abstractions first. External systems must be optional adapters, not hard dependencies.
7. Do not add ten unrelated dashboards. Use clear grouped navigation and drill-down pages.
8. Every implemented module must produce a visible, testable result. Placeholder-only architecture is not enough.

# Reference projects and what to extract

## NetBox
Use for asset inventory, sites, locations, interfaces, IPAM, prefixes, VLANs, device relationships and source-of-truth sync patterns. Implement an internal asset model plus optional NetBox adapter.

## Wazuh
Use for security event normalization, rule engine, threshold detection, finding lifecycle, evidence, suppression and exceptions. Implement an internal detection engine plus optional Wazuh adapter.

## OpenSearch Security Analytics
Use for searchable event timeline, correlation queries, aggregations, long-term event search and detection indexing. PostgreSQL remains the default. Create a provider interface and optional OpenSearch adapter.

## Grafana
Use for dashboard UX, time-range filtering, drill-down, alert state presentation, annotations and reusable visualization patterns. Do not reproduce Grafana.

## Fleet
Use for managed/unmanaged asset state, last seen, query result model, host detail layout, inventory health and scheduled collection jobs.

## DefectDojo
Use for finding status lifecycle, risk acceptance, false positives, remediation tracking, duplicate handling and finding-to-action linkage.

## TheHive
Use for incident/case management, tasks, timeline, evidence, notes and linking findings into cases.

## Cortex
Use for analyzer architecture, observable processing, enrichment jobs and structured analyzer output. Responders must not bypass ActionPlan confirmation.

## Greenbone/OpenVAS
Use for vulnerability import schema, scan result normalization, CVE/CVSS finding model and scanner adapter boundaries. Do not build a scanner in this task.

## Nmap
Use for discovery import, port/service inventory, parser boundaries and diffing exposed services. Do not run uncontrolled scans automatically.

## Neo4j concepts
Use for relationship graphs, dependency traversal, blast radius and attack-path-ready topology. Do not require Neo4j now. Add a graph provider boundary.

## OpenCTI
Use for IOC models, threat-intel enrichment, indicator relationships, confidence, expiration and source attribution.

## Uptime Kuma
Use for availability monitors, health history, monitor incidents and simple status UX.

## ntopng
Use for traffic summaries, top talkers, protocol distribution and flow aggregation adapter boundaries. Do not attempt full packet inspection.

## LangGraph
Use for durable AI workflow state, explicit steps, human approval checkpoints, retry and failure states and tool execution boundaries.

## Open WebUI
Use for conversation history UX, tool/model visibility, context attachments, action previews in chat and separation between answer and executable action.

# Target product architecture

```text
Core Platform
├── Assets
├── Network Inventory
├── Security Events
├── Detection Rules
├── Findings
├── Cases
├── Vulnerabilities
├── Observables & Enrichment
├── Monitoring
├── Threat Intelligence
├── Search & Correlation
├── Topology & Impact
├── AI Workflows
├── ActionPlan
├── Connector Execution
└── Audit
```

All modules must share asset identity, site/location, vendor/platform, timeline, risk/severity, ActionPlan links and audit metadata.

# Phase 1 — Unified Asset Intelligence

Build a normalized asset domain inspired by NetBox and Fleet.

Minimum entities:
- Site
- Location
- Asset
- AssetRole
- Vendor
- Platform
- Interface
- IpAddress
- Prefix
- Vlan
- AssetRelationship
- AssetTag
- AssetSource
- AssetSyncRun

Requirements:
- Link existing managed devices to assets.
- Do not create duplicate device records.
- Keep credentials in current connector credential storage.
- Support managed/unmanaged state.
- Support last seen and health state.
- Support idempotent imports.
- Add duplicate detection by management IP, serial, hostname and external ID.
- Add adapters/interfaces for existing project devices, NetBox, Nmap, Wazuh agents and manual JSON/CSV.

Visible result:
Create one main navigation section: `دارایی‌ها`

Sub-pages:
- نمای کلی
- تجهیزات
- سایت‌ها
- شبکه‌ها و VLANها
- توپولوژی
- منابع همگام‌سازی

Asset detail tabs:
- خلاصه
- رابط‌ها و IPها
- ارتباطات
- وضعیت و مانیتورینگ
- یافته‌های امنیتی
- آسیب‌پذیری‌ها
- اقدامات
- تاریخچه

Do not scatter asset widgets across the main dashboard.

# Phase 2 — Security Event and Detection Engine

Build normalized models:
- SecurityEvent
- DetectionRule
- DetectionRuleGroup
- DetectionFinding
- DetectionEvidence
- RuleSuppression
- RuleException
- FindingStatusHistory
- DetectionExecution

Implement a safe structured rule DSL with:
- equals
- not_equals
- contains
- starts_with
- ends_with
- exists
- not_exists
- greater_than
- greater_or_equal
- less_than
- less_or_equal
- in
- not_in
- cidr_contains
- safe_regex

Support thresholds, time windows, grouping, correlation, suppression, deduplication, finding updates and evidence preservation.

Seed practical rules for Linux, MikroTik and FortiGate:
- repeated failed logins
- login from new source
- admin account created
- firewall/policy change
- NAT change
- management service enabled
- interface unexpectedly down
- VPN authentication failure
- new listening port
- firewall disabled
- critical service stopped
- repeated Daily Check failures

Visible result:
Create one navigation section: `امنیت`

Sub-pages:
- نمای کلی امنیت
- یافته‌ها
- رویدادها
- قوانین تشخیص
- استثناها
- تاریخچه اجرا

# Phase 3 — Findings, Cases and Remediation

Use DefectDojo and TheHive concepts.

Finding statuses:
- open
- investigating
- acknowledged
- resolved
- false_positive
- accepted_risk
- suppressed

Case entities:
- SecurityCase
- CaseTask
- CaseComment
- CaseEvidence
- CaseTimelineEntry
- CaseFindingLink
- CaseAssetLink
- CaseActionPlanLink

Finding detail must show Persian explanation, match reason, evidence, asset/site context, timeline, related findings, suggested action, previous actions and status history.

Remediation flow:
```text
Finding
→ Suggested catalog action
→ ActionPlan
→ Preview
→ Confirmation
→ Connector execution
→ Verification
→ Finding timeline update
```

Never execute directly from a rule or case.

Visible result:
Inside `امنیت`, add `پرونده‌ها`.

# Phase 4 — Analyzer and Enrichment Framework

Use Cortex and OpenCTI concepts.

Implement:
- Observable
- ObservableType
- AnalyzerDefinition
- AnalyzerJob
- AnalyzerResult
- ThreatIndicator
- ThreatIntelSource
- IndicatorRelationship

Supported first observables:
- IP
- domain
- URL
- hash
- CVE
- username
- hostname

Initial analyzers:
- local IP classification
- CIDR ownership lookup from internal assets
- hostname-to-asset lookup
- CVE metadata import
- future threat-intel provider interface

Visible result:
In finding/case details provide `غنی‌سازی و تحلیل`.

# Phase 5 — Vulnerability Intake

Use Greenbone/OpenVAS and DefectDojo concepts.

Implement:
- VulnerabilityFinding
- VulnerabilitySource
- VulnerabilityImport
- CVE metadata
- CVSS
- affected asset
- affected service/port
- remediation
- accepted risk
- duplicate handling

Adapters:
- Greenbone/OpenVAS import
- Generic JSON import
- Nmap service discovery import

No active scanner execution in this phase.

Visible result:
Inside `امنیت` add `آسیب‌پذیری‌ها`. Asset detail also displays vulnerabilities.

# Phase 6 — Monitoring and Availability

Use Uptime Kuma, Grafana and ntopng concepts.

Implement:
- Monitor
- MonitorCheck
- MonitorIncident
- MetricSample
- NetworkFlowSummary
- HealthState

Initial monitor types:
- ping
- TCP port
- HTTP/HTTPS
- connector health
- device reachability
- scheduled Daily Check

Add time-range filter and drill-down.

Visible result:
Create one top-level navigation section: `پایش`

Sub-pages:
- وضعیت کلی
- مانیتورها
- رخدادهای قطعی
- سلامت Connectorها
- ترافیک و جریان‌ها

Do not put all charts on the global dashboard.

# Phase 7 — Search, Timeline and Correlation

Use OpenSearch concepts.

Implement interfaces:
- EventSearchProvider
- FindingSearchProvider
- TimelineProvider
- CorrelationProvider

PostgreSQL remains the default provider. Optional OpenSearch adapter supports event indexing, full-text search, aggregations, correlation and long-term retention.

Add global search across assets, events, findings, cases, actions, IPs, users and CVEs.

Visible result:
Global search opens a dedicated results page grouped by entity type.

# Phase 8 — Topology, Impact and Graph

Use NetBox and Neo4j concepts.

Implement:
- topology traversal
- upstream/downstream lookup
- protected-by relationships
- depends-on relationships
- blast radius
- impacted assets
- action impact preview

ActionPlan must show target asset, related assets, site, dependency path, estimated blast radius and risk level.

Use relational database first. Create `GraphProvider` for future Neo4j.

Visible result:
Topology exists inside `دارایی‌ها`. Impact preview exists inside ActionPlan.

# Phase 9 — AI Workflow Orchestration

Use LangGraph and Open WebUI concepts.

Implement deterministic workflow state:
```text
understand_request
→ resolve_asset
→ resolve_vendor
→ resolve_action_or_workflow
→ collect_missing_input
→ build_preview
→ risk_check
→ user_confirmation
→ execute_connector
→ verify
→ summarize
```

Requirements:
- persisted workflow/session state
- explicit allowed transitions
- retry support
- cancellation
- human approval gates
- no arbitrary shell/CLI generated by LLM
- tool/action must resolve to registered templates
- asset IDs must come from database
- secrets must be masked
- chat clearly distinguishes answer, proposed action, guided workflow and execution result

Visible result:
Assistant panel must contain current context, selected asset, selected device/vendor, workflow step, missing information, action preview, confirmation button and verification result.

# UX and information architecture

Final sidebar must remain compact.

Recommended top-level navigation:
1. داشبورد
2. دارایی‌ها
3. امنیت
4. پایش
5. اقدامات
6. دستیار هوشمند
7. یکپارچه‌سازی‌ها
8. تنظیمات

Nested navigation:

## دارایی‌ها
- نمای کلی
- تجهیزات
- سایت‌ها
- شبکه‌ها
- توپولوژی
- همگام‌سازی

## امنیت
- نمای کلی
- یافته‌ها
- رویدادها
- پرونده‌ها
- آسیب‌پذیری‌ها
- قوانین

## پایش
- وضعیت کلی
- مانیتورها
- قطعی‌ها
- Connectorها
- ترافیک

## اقدامات
- Action Center
- Guided Actions
- تاریخچه اجرا
- تأییدها

## یکپارچه‌سازی‌ها
- NetBox
- Wazuh
- OpenSearch
- Greenbone
- Threat Intelligence

Dashboard rules:
- Maximum 6 primary cards.
- Maximum 3 high-value sections.
- No raw event tables on dashboard.
- No configuration forms on dashboard.
- Use drill-down links.
- Show only current risk, critical findings, asset health, recent action outcomes, urgent incidents and integration health.
- Persian RTL throughout.

# Required backend boundaries

Create or extend:
```text
backend/src/assets
backend/src/security-events
backend/src/detection
backend/src/findings
backend/src/cases
backend/src/vulnerabilities
backend/src/observables
backend/src/threat-intel
backend/src/monitoring
backend/src/search
backend/src/topology
backend/src/ai-workflows
backend/src/integrations/netbox
backend/src/integrations/wazuh
backend/src/integrations/opensearch
backend/src/integrations/greenbone
backend/src/integrations/nmap
```

Preferred dependency direction:
```text
Integrations
→ Normalizers/Mappers
→ Domain Services
→ Findings/Assets
→ ActionPlan
→ Connector Execution
```

The detection engine must never import connector implementations directly.

# Minimum tangible milestone

Do not attempt every phase in one uncontrolled commit.

The first milestone must deliver:
1. Unified Asset model linked to existing devices
2. Asset Inventory UI
3. SecurityEvent model
4. DetectionRule and Finding model
5. At least 12 working seeded rules
6. Finding list and detail UI
7. Finding-to-ActionPlan integration
8. Asset context in ActionPlan
9. Compact navigation redesign
10. Mock NetBox and Wazuh adapters
11. Import preview and idempotent sync
12. Backend and frontend tests

After this milestone, continue one phase at a time. Each phase must end with a visible user-facing result.

# Minimum APIs

```text
/api/assets
/api/assets/:id
/api/assets/:id/topology
/api/assets/:id/findings
/api/assets/import/preview
/api/assets/import/apply
/api/sites
/api/vlans
/api/prefixes

/api/security/events
/api/security/findings
/api/security/findings/:id
/api/security/findings/:id/status
/api/security/findings/:id/action-plan
/api/security/rules
/api/security/rules/:id/enable
/api/security/rules/:id/disable
/api/security/rules/test

/api/integrations/netbox/health
/api/integrations/netbox/sync-preview
/api/integrations/netbox/sync
/api/integrations/wazuh/health
/api/integrations/wazuh/sync-preview
/api/integrations/wazuh/sync
```

All mutation APIs need authorization, validation, audit and predictable error bodies.

# Security requirements

- Validate all imported payloads.
- Limit request and import sizes.
- Prevent SSRF in integration URLs.
- Verify TLS by default.
- Mask secrets.
- Never return tokens in APIs.
- Add rate limits to expensive queries.
- Add pagination.
- Add idempotency keys.
- Protect regex evaluation.
- Do not execute rule DSL as JavaScript.
- Avoid N+1 queries.
- Add database indexes.
- Use transactions for imports.
- Audit every security-relevant state change.

# Tests

At minimum test:
1. Repeated asset import does not duplicate assets.
2. Existing device links to one asset.
3. Asset context is attached to ActionPlan.
4. AI cannot invent asset IDs.
5. Detection threshold creates one finding.
6. Repeated events update finding evidence/count.
7. Suppression prevents duplicate findings.
8. Unknown events do not become critical.
9. Finding creates valid recommended ActionPlan.
10. Action does not execute before confirmation.
11. Success requires `connectorInvoked=true`.
12. Unsupported adapters remain non-executable.
13. NetBox mock sync is idempotent.
14. Wazuh mock import maps alerts correctly.
15. Raw secrets never appear in responses or logs.
16. Import preview performs no mutation.
17. Invalid rule DSL is rejected.
18. Dashboard does not fetch unbounded raw events.
19. Navigation remains grouped and compact.
20. Prisma migration validates.

# Documentation

Create:
- `docs/PLATFORM_EXPANSION_ROADMAP.md`
- `docs/ASSET_INTELLIGENCE.md`
- `docs/DETECTION_ENGINE.md`
- `docs/SECURITY_FINDINGS.md`
- `docs/CASE_MANAGEMENT.md`
- `docs/MONITORING_ARCHITECTURE.md`
- `docs/SEARCH_AND_CORRELATION.md`
- `docs/TOPOLOGY_AND_IMPACT.md`
- `docs/AI_WORKFLOW_ORCHESTRATION.md`
- `docs/INTEGRATIONS_ARCHITECTURE.md`
- `docs/UX_INFORMATION_ARCHITECTURE.md`

Update project memory and handoff files.

# Validation commands

```powershell
cd backend
npm run build
npm test
npx prisma validate

cd ..
pnpm build
```

Do not commit until builds/tests pass, Prisma validates, migration is reviewed and no secret file is staged.

# Final report format

1. Current architecture discovered
2. Phases completed
3. External project concepts adopted
4. Files changed
5. Database models added
6. APIs added
7. UI/navigation changes
8. Seeded rules
9. Integrations implemented
10. Build/test results
11. Known limitations
12. Remaining phases
13. Exact migration/start commands
14. Git status
15. Production blockers

Do not claim a feature is implemented unless it is visible, tested and connected to the real application flow.
