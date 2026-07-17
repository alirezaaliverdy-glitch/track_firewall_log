# TASK 18.2 — Product Hardening, Planned-State Elimination, Integration UX, Prisma Recovery, Linux Observability, and Cisco Continuation

## Project

`track_firewall_log`

## Mission

Turn the current application from a partially wired prototype into a coherent, testable, production-shaped Network & Security Operations Platform.

The current product has useful backend foundations, but many routes, labels, integration cards, vendor pages and planned states are incomplete, disabled, mock-only, visually inconsistent or not connected to real user workflows.

This task must:

1. Repair the Prisma migration-history problem safely.
2. Preserve all existing data.
3. Audit every `planned`, `partial`, mock-only and dead-end state.
4. Convert incomplete features into one of:
   - implemented and working;
   - clearly scoped partial with a real user workflow;
   - explicitly disabled with a useful explanation and next action.
5. Make Vendor Management usable and understandable.
6. Make Integrations tangible and testable.
7. Complete Linux Observability UX.
8. Continue Cisco support in controlled milestones.
9. Fix UI consistency, responsive behavior, RTL, English/Persian mixing, overflow and empty screens.
10. Use Playwright MCP throughout.
11. Never claim success from build output alone.

Do not attempt every phase in one uncontrolled commit.

---

# Mandatory reading

Before editing, read:

- `AGENTS.md`
- `CODEX_HANDOFF.md`
- `MASTER_SECURITY_PLATFORM_TASK.md`
- `TASK_18_1_PLATFORM_UX_ARCHITECTURE.md`
- `TASK_18_2_CISCO_FULL_LINUX_OBSERVABILITY.md`
- `TASK_18_2_RECOVERY_AND_CONTINUATION.md`
- `PRISMA_BASELINE_RECOVERY_RUNBOOK.md`
- `CISCO_CAPABILITY_COVERAGE_MATRIX.md`
- `CISCO_RESEARCH_NOTES.md`
- `docs/PROJECT_MEMORY_INDEX.md`
- `docs/CURRENT_STATUS.md`
- `docs/TASK_HISTORY.md`
- `docs/ARCHITECTURE_MAP.md`
- `docs/CODEBASE_OVERVIEW.md`
- `docs/VENDOR_CAPABILITY_FRAMEWORK.md`
- `docs/LINUX_OBSERVABILITY.md`
- all current integration, vendor, monitoring, action, dashboard, route and i18n files
- `backend/prisma/schema.prisma`
- all migration files
- current git status and current diff

Create:

`docs/TASK_18_2_PRODUCT_HARDENING_DISCOVERY.md`

The discovery must list:

- every visible `planned` label;
- every route that renders an unfinished placeholder;
- every API returning empty/mocked/unwired data;
- every integration card and actual backend support state;
- every vendor card and capability count;
- every route with console/network failure;
- every untranslated or mixed-language area;
- every horizontal overflow or layout defect;
- every raw JSON exposure;
- every 404/500/401 observed;
- every feature that exists in backend but is not reachable in UI;
- every UI control that does nothing;
- every mock feature shown as if production-ready.

---

# Non-negotiable safety rules

1. Never run:
   - `prisma migrate reset`
   - `prisma db push --force-reset`
   - `DROP DATABASE`
   - destructive truncate/delete
   - `git reset --hard`
   - `git clean -fd`

2. Never read, print, modify or commit:
   - `.env`
   - credentials
   - database passwords
   - SSH keys
   - API tokens
   - Cisco enable secrets
   - integration secrets

3. Preserve:
   - `ACTION_EXECUTION_MODE=quick_controlled`
   - `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`

4. Never mark execution success unless `connectorInvoked=true`.

5. Never execute AI-generated raw CLI outside registered templates.

6. Every mutation requires:
   - preview;
   - risk;
   - user confirmation;
   - connector execution;
   - verification;
   - audit.

7. Before migration-history writes:
   - backup command;
   - baseline cutoff;
   - pending migrations;
   - drift report;
   - explicit user confirmation.

8. Existing data must be preserved and checked before and after.

---

# PHASE 0 — Browser baseline with Playwright MCP

The Playwright MCP server named `playwright` is connected.

Use the current authenticated browser session.

Before editing, visit:

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
```

For each route record:

- page title;
- whether it opens;
- visible `planned` labels;
- dead controls;
- API calls;
- failed requests;
- console errors;
- empty/partial state;
- layout/overflow;
- RTL/LTR;
- mobile behavior;
- user value.

Create:

`docs/TASK_18_2_PRODUCT_BROWSER_BASELINE.md`

Take screenshots or precise browser observations.

Do not edit until this baseline exists.

---

# PHASE 1 — Safe Prisma recovery

Follow:

`PRISMA_BASELINE_RECOVERY_RUNBOOK.md`

Required sequence:

1. safe schema discovery;
2. backup plan;
3. migration list analysis;
4. baseline cutoff;
5. already represented migrations;
6. genuinely pending migrations;
7. drift analysis;
8. stop and ask user for confirmation;
9. only then resolve/deploy;
10. verify row counts and schema.

Create:

- `docs/PRISMA_BASELINE_ANALYSIS.md`
- `docs/PRISMA_BASELINE_EXECUTION_RESULT.md`

Do not begin later phases until migration state is clean.

---

# PHASE 2 — Planned-state and dead-end audit

Search the entire repository for:

```text
planned
partial
mock
mock-only
not implemented
coming soon
disabled
TODO
placeholder
```

Create:

`docs/PLANNED_STATE_REGISTER.md`

For each item record:

- route;
- UI component;
- backend support;
- current state;
- intended user value;
- action:
  - implement now;
  - wire to existing backend;
  - move under integrations/lab;
  - keep partial with a clear reason;
  - disable and hide from primary navigation;
- acceptance criteria;
- milestone.

Rules:

1. A `planned` badge must never be the only content of a main route.
2. Planned items must not dominate primary navigation.
3. A planned feature must show:
   - what it will do;
   - why unavailable;
   - what is required;
   - whether it is mock, partial or unsupported.
4. If the backend already supports it, wire it now instead of leaving `planned`.
5. If it has no backend and no immediate milestone, move it out of the main user journey.
6. Do not fake functionality with static cards.

---

# PHASE 3 — Information architecture and navigation cleanup

Keep top-level navigation compact:

1. داشبورد
2. دارایی‌ها
3. امنیت
4. پایش
5. اقدامات
6. دستیار هوشمند
7. یکپارچه‌سازی‌ها
8. تنظیمات

Remove or demote incomplete items from primary navigation.

Examples:

- `Sites`, `VLANs`, `Topology`:
  - active only if they have real data and a usable route;
  - otherwise place under a secondary “در حال توسعه” area, not as prominent dead links.

- `Cases`, `Vulnerabilities`:
  - do not appear as normal active pages until minimum real workflow exists.

- `Cisco Devices`:
  - show only when Cisco device model/API exists;
  - otherwise vendor overview must explain no Cisco devices are registered.

Use consistent Persian labels and i18n keys.

No mixed raw English/Persian headings unless a technical term is intentionally preserved.

---

# PHASE 4 — Vendor Management that actually works

## Goal

Make the Vendor section useful, not merely a capability matrix dumped on screen.

Routes:

```text
/assets/vendors
/assets/vendors/:vendorKey
/assets/vendors/:vendorKey/devices
/assets/vendors/:vendorKey/devices/:deviceId
```

Vendor overview must show:

- vendor name;
- platforms;
- managed device count;
- online/offline count;
- connector health;
- implemented read capabilities;
- executable mutations;
- partial/planned capabilities;
- last sync/collection;
- recent failures;
- required setup.

Supported vendors visible now:

- Linux
- MikroTik
- FortiGate
- Cisco

Each vendor page must answer:

1. What devices are connected?
2. What can I read?
3. What can I change?
4. What is unsupported?
5. What failed recently?
6. Where do I go next?

## Cisco vendor UX

Current matrix text is hard to scan and mixes English/Persian.

Replace with:

- summary cards;
- platform table;
- capability groups;
- status badges;
- search/filter;
- device list;
- “ثبت دستگاه Cisco” CTA;
- “بررسی قابلیت‌ها” CTA;
- “باز کردن کتابخانه اقدامات” CTA.

Capability rows:

- title
- domain
- read/mutate
- implementation state
- connector
- platform/version
- last verified
- action

Do not expose raw command templates to normal users by default.

Technical details can appear in a collapsible section.

## No-device state

If no Cisco device exists:

- show a useful onboarding state;
- explain required fields;
- link to device registration;
- do not render an empty matrix as the main experience.

---

# PHASE 5 — Integrations that are tangible

Current integration cards must become real workflows.

Routes:

```text
/integrations
/integrations/netbox
/integrations/wazuh
/integrations/opensearch
/integrations/greenbone
```

Only show enabled/implemented integrations prominently.

For every integration card show:

- name;
- purpose;
- mode:
  - production
  - mock
  - partial
  - not configured
- health;
- configuration status;
- last health check;
- last sync;
- imported/updated/skipped/error counts;
- next action.

## NetBox

Minimum tangible workflow:

1. configuration status;
2. health check;
3. preview sync;
4. show create/update/conflict counts;
5. user confirmation;
6. apply sync;
7. result;
8. audit;
9. sync history.

If only mock exists:

- clearly label it `Mock / آزمایشی`;
- allow a safe demo preview;
- never imply production sync.

## Wazuh

Minimum tangible workflow:

1. configuration status;
2. health check;
3. preview import;
4. mapped event/rule/finding counts;
5. confirmation;
6. apply;
7. result;
8. audit;
9. import history.

## OpenSearch / Greenbone

If not implemented:

- do not show fake Sync buttons;
- show setup requirements;
- show implementation state;
- provide a disabled CTA with a precise reason;
- keep them secondary.

## Integration result component

Create a structured result view:

- status;
- summary;
- counts;
- warnings;
- errors;
- skipped items;
- duration;
- audit ID;
- technical details collapsible.

No raw JSON in the normal UI.

---

# PHASE 6 — Backend log and API failure cleanup

The supplied backend logs show repeated integration requests, health checks and sync/provider calls.

Perform a route-level and service-level audit for:

```text
/api/integrations/*
/api/vendors/*
/api/monitoring/*
/api/dashboard/*
```

For each:

- confirm route exists;
- confirm authentication;
- confirm response contract;
- confirm no accidental 500;
- confirm mock mode is explicit;
- confirm no duplicate request loops;
- confirm OPTIONS/CORS behavior;
- confirm bounded result size;
- confirm predictable errors.

Create a standard API error shape:

```json
{
  "error": {
    "code": "INTEGRATION_NOT_CONFIGURED",
    "message": "این یکپارچه‌سازی هنوز پیکربندی نشده است.",
    "details": {},
    "retryable": false
  }
}
```

Frontend must map these errors to understandable UI states.

Do not display backend stack traces.

---

# PHASE 7 — Linux Observability UX completion

Implement Milestone 18.2B fully after Prisma recovery.

Dashboard:

- Linux health card;
- healthy/warning/critical/offline/stale;
- compact CPU/memory chart;
- high disk count;
- failed-service count;
- maximum five server rows;
- link to `/monitoring/linux`.

Linux list:

```text
/monitoring/linux
```

Show:

- server
- site
- IP
- CPU
- memory
- disk
- load
- failed services
- uptime
- last collection
- status
- refresh

Linux detail:

```text
/monitoring/linux/:deviceId
```

Show:

- health score;
- CPU;
- memory/swap;
- disk/inode;
- network;
- load;
- failed services;
- listening ports;
- firewall;
- collection history;
- findings;
- ActionPlans.

Time ranges:

- 1h
- 6h
- 24h
- 7d
- 30d

States:

- loading
- empty
- partial
- stale
- offline
- unknown
- error
- permission denied

No 500 for missing metric tables or no-data conditions.

---

# PHASE 8 — Cisco continuation

After product hardening and Linux UX, continue Cisco in separate milestones.

## 18.2C Layer 2

- VLAN create/rename/delete
- access/trunk
- allowed VLAN add/remove/set
- native VLAN
- shutdown/no shutdown
- description
- EtherChannel
- LACP
- PAgP
- static channel
- STP safe actions
- config backup
- verification
- rollback status

## 18.2D Layer 3/Security

- static routes
- ACL lifecycle
- port security
- NTP/syslog/SNMP
- selected routing workflows
- troubleshooting

Do not mix 18.2C/18.2D with the integration and UI-hardening commit.

---

# PHASE 9 — UI consistency and polish

Fix globally:

- spacing;
- typography;
- contrast;
- card hierarchy;
- tables;
- empty states;
- buttons;
- badges;
- responsive behavior;
- RTL;
- long text wrapping;
- narrow sidebar;
- mobile drawer;
- page header consistency;
- breadcrumbs;
- active navigation;
- skeletons;
- focus states;
- disabled states.

Rules:

1. No route should look like an unfinished developer screen.
2. No English-heavy capability dump in Persian mode.
3. No huge empty areas with a single badge.
4. No horizontally scrolling page unless a data table truly requires it.
5. No duplicated cards.
6. No raw command output in normal view.
7. No API status text dumped as paragraphs.
8. Technical details belong in collapsible panels.

Use existing design tokens.

Do not hard-code new scattered colors.

---

# PHASE 10 — Playwright MCP acceptance

Use Playwright MCP continuously.

Required routes:

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
```

For each route test:

- route opens;
- page has user value;
- no dead CTA;
- no unexplained planned-only page;
- console clean;
- no failed request loop;
- API error handled;
- Persian RTL;
- English LTR;
- desktop 1440;
- laptop 1280;
- mobile 390;
- no overflow;
- loading;
- empty;
- error;
- partial/mock/not-configured;
- long text;
- no raw JSON.

Create:

`docs/TASK_18_2_PRODUCT_BROWSER_RESULTS.md`

---

# PHASE 11 — Tests

Backend tests:

1. Prisma baseline preserves data.
2. Integration health response.
3. NetBox preview is read-only.
4. NetBox apply requires confirmation.
5. Wazuh preview is read-only.
6. Wazuh apply requires confirmation.
7. Mock mode cannot present production success.
8. Vendor capability state is accurate.
9. Vendor device list is bounded.
10. Linux no-data does not return 500.
11. Linux stale/offline/unknown behavior.
12. API error contract.
13. no duplicate integration request loop.
14. success requires `connectorInvoked=true`.

Frontend tests:

1. planned-only routes are not primary dead ends.
2. vendor summary renders.
3. Cisco no-device onboarding.
4. capability filters.
5. integration mode badge.
6. NetBox preview result.
7. Wazuh preview result.
8. structured error state.
9. Linux dashboard card.
10. no raw JSON.
11. mobile no overflow.
12. RTL/LTR.
13. max six dashboard cards.
14. disabled CTA explains why.
15. no dead control.

---

# Controlled milestones and commits

## Milestone H1
- discovery
- Playwright baseline
- Prisma baseline analysis
- no database write yet

## Milestone H2
- backup confirmation
- Prisma resolve/deploy
- data verification
- separate commit

## Milestone H3
- planned-state cleanup
- navigation cleanup
- vendor UX
- separate commit

## Milestone H4
- integration UX and backend wiring
- NetBox/Wazuh tangible preview/apply/history
- separate commit

## Milestone H5
- Linux Observability UX
- separate commit

## Milestone H6
- global UI polish and browser acceptance
- separate commit

## Milestone H7
- Cisco 18.2C Layer-2
- separate commit

Do not start the next milestone before reporting the current one.

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

Also run:

```powershell
git diff --check
git status --short
```

---

# Final report

Report:

1. Prisma baseline state
2. Backup location
3. Data preservation evidence
4. Planned-state register result
5. Dead routes removed or repaired
6. Vendor UX result
7. Cisco UX result
8. Integration UX result
9. NetBox workflow result
10. Wazuh workflow result
11. Linux Observability result
12. UI fixes
13. APIs/routes added or fixed
14. Playwright MCP routes tested
15. Console/network errors fixed
16. Build/test results
17. Production blockers
18. Remaining Cisco milestones
19. Git status
20. Commit hashes

Do not call the product “complete” while any primary route is still a dead-end, fake, mock-without-label, or planned-only screen.
