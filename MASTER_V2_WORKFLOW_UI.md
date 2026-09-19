# MASTER_V2_WORKFLOW_UI.md

## Objective

Transform the current repository into a clean, workflow-first network automation product with a new UI, without breaking proven features.

Preserve working:
- authentication and RBAC
- credential references and secret handling
- audit and policy guard
- Cisco, MikroTik, FortiGate, and Linux connectors
- validated vendor actions and parsers
- existing device data and Git history
- Persian/English localization

Do not blindly rewrite the repository. Audit first, then migrate safely.

## 1. Research Before Coding

Read and inspect:
- `AGENTS.md`
- `CODEX_HANDOFF.md`
- `README*`
- `docs/CURRENT_STATUS.md`
- `docs/TASK_HISTORY.md`
- root workflow, acceptance, architecture, and handoff files
- package scripts
- Prisma schema and migrations
- AI planner/resolver/chat code
- Action Center, policy, approval, audit, and execution services
- connectors, vendor adapters, command catalogs, guided actions
- frontend routes, state, design system, and i18n
- recent relevant Git history

Run:
```bash
git status
git log --oneline --decorate -40
git diff --check
```

Research official documentation when needed:
- frameworks and libraries used by this repository
- Cisco, MikroTik, FortiGate, and Linux command behavior
- SSH compatibility and secure credential handling
- approval, audit, rollback, and workflow design

Prefer official docs and existing repository patterns. Do not use random snippets or assumptions.

Before implementation, write a concise internal map:
- what works
- what is duplicated
- what is unsafe
- what must be preserved
- what will be replaced
- phase boundaries

Do not stop after analysis. Continue to implementation.

## 2. Non-Negotiable Safety

- No `git reset --hard`, history rewriting, destructive clean, or broad revert.
- Do not stage unrelated untracked/deleted files.
- Do not commit caches, package stores, build output, temporary scripts, or prompt bundles.
- Never test against production data.
- Never weaken auth.
- Never log passwords, private keys, passphrases, API keys, or enable secrets.
- AI must never send raw CLI directly to a connector.
- `deviceId` is the source of truth for vendor/platform.
- No cross-vendor fallback.
- No automatic execution or navigation from chat.
- Prefer additive migrations only.
- Run focused tests before every commit.

## 3. Assistant Modes

Every prompt must resolve to exactly one mode.

### Chat
Use for normal conversation, explanations, informational questions, ambiguity, or unsupported requests.

Behavior:
- remain in chat
- no plan or workflow
- no redirect
- use selected-device context when relevant
- explain limitations honestly

### Direct Action
Use for one supported action with complete parameters.

Flow:
```text
Prompt -> Intent -> Backend Resolve -> Inline Review -> Approval
-> Backend Execute -> Verify -> Result -> Audit
```

Examples:
- show memory/CPU/interfaces/routes
- check service status
- run one safe diagnostic
- perform one simple supported write

The inline review must show:
- target device
- vendor/platform
- action
- parameters
- risk
- expected change
- verification
- Approve and Run
- Cancel

### Guided Workflow
Use for multi-step requests, missing parameters, dependencies, verification, or rollback planning.

Flow:
```text
Prompt -> WorkflowPlan -> Resolve Each Step -> Collect Parameters
-> Final Review -> Approval -> Sequential Backend Execution
-> Per-Step Verification -> Final Result -> Audit
```

Rules:
- failure blocks dependent steps
- unsupported steps stay visible and blocked
- no silent replacement with a similar action
- retry/rollback only when a valid backend contract exists

## 4. Architecture

Use this boundary:

```text
UI
-> AI Assistant
-> Intent Classifier
-> Planner
-> WorkflowPlan
-> Capability Resolver
-> ActionPlan per Step
-> Policy Guard
-> Approval
-> Action Center
-> Vendor Adapter
-> Connector
-> Device
```

AI plans. Backend validates and executes.

Keep separate:
- Intent
- AssistantDecision
- WorkflowPlan
- WorkflowStep
- ActionPlan
- Approval
- Execution
- Verification
- Rollback
- AuditEvent

Recommended AI output:

```ts
type AssistantDecision =
  | { mode: "chat"; message: string; reason: string; deviceId?: string }
  | {
      mode: "direct_action";
      deviceId: string;
      intentKey: string;
      parameters: Record<string, unknown>;
      reason: string;
    }
  | {
      mode: "guided_workflow";
      deviceId: string;
      title: string;
      steps: Array<{
        clientStepId: string;
        intentKey: string;
        parameters: Record<string, unknown>;
        dependsOn: string[];
        verificationIntentKey?: string;
        rollbackIntentKey?: string;
      }>;
      reason: string;
    };
```

Rules:
- AI outputs intent keys and parameters, never raw commands.
- Backend derives vendor/platform from the selected device.
- Each step resolves independently.
- A full workflow does not need one catalog item.
- Plan creation and execution eligibility are separate.
- A plan may exist with blocked steps.

## 5. Unified Action Registry

Normalize these existing sources into one read model:
- command catalog
- legacy controlled actions
- vendor templates
- safe read actions
- guided actions

Contract:

```ts
type RegisteredAction = {
  key: string;
  vendor: string;
  platforms: string[];
  mode: "read" | "write";
  executionType: "direct" | "guided";
  parameterSchema: unknown;
  risk: "low" | "medium" | "high" | "critical";
  approvalRequired: boolean;
  executable: boolean;
  connector: string;
  verificationKey?: string;
  rollbackKey?: string;
};
```

Resolver rules:
- selected device first
- exact vendor/platform scope
- capability-aware
- no prompt-text vendor inference
- no nearest-command coercion
- no duplicate action paths
- structured missing parameters
- clear blocked/unsupported result

## 6. Workflow Engine

Workflow states:
```text
draft -> resolving -> needs_input -> ready_for_review
-> awaiting_approval -> approved -> running
-> succeeded | partially_succeeded | failed | blocked | cancelled
-> rollback_running -> rolled_back
```

Step states:
```text
draft -> resolving -> needs_input | blocked | ready
-> awaiting_approval -> queued -> running -> verifying
-> succeeded | failed | skipped | retryable
-> rollback_available -> rollback_running -> rolled_back
```

Implement:
- dependency validation
- cycle prevention
- ordered execution
- per-step validation and policy check
- stop-on-failure
- skip dependent steps
- per-step result
- verification
- retry/rollback only when supported
- immutable audit history

All real execution must pass through backend Action Center and valid connectors.

## 7. New UI

Goals:
- simple and operational
- Persian-first
- correct RTL/LTR
- responsive
- consistent typography and spacing
- no raw JSON, Prisma errors, stack traces, or internal expressions in normal UI

Use an approved Persian font such as Vazirmatn.

### App Shell
Sidebar:
- Dashboard
- Devices
- AI Assistant
- Action Center
- Workflows
- Monitoring
- Audit
- Settings

Topbar:
- search
- selected device
- language
- notifications
- profile
- connection health

### Dashboard
Use live backend data.

Show:
- online devices
- devices needing attention
- running operations
- pending approvals
- failed workflows
- credential problems
- recent actions/workflows
- quick actions
- vendor health for Cisco, MikroTik, FortiGate, Linux

Every card must navigate somewhere useful.

### Device Onboarding
```text
Identity -> Credentials/Test -> Detect/Discover -> Review
-> Register -> Device Workspace
```

Requirements:
- duplicate check
- credential references only
- legacy SSH only per-device under Advanced
- clear connection diagnostics
- real connector detection
- explicit warning for unverified registration

### Device Workspace
First view:
- name
- vendor/platform
- management address
- connection/verification status
- last successful check
- credential health
- hostname/model/version/uptime
- interface summary
- recommended next action

Tabs:
- Overview
- Inventory
- Interfaces
- Actions
- Monitoring
- History
- Advanced

Move raw evidence/debug to Advanced.

### AI Assistant
- show selected device clearly
- allow switching device
- clear stale intent/plan/workflow/vendor context on switch
- keep normal chat available
- display classification: Chat, Direct Action, Guided Workflow
- never auto-redirect
- suggestions are optional only

### Inline Action Center
Open a mini panel without leaving the page.

Show:
- action/workflow title
- device
- vendor/platform
- parameters
- risk
- preview
- verification
- approval status
- Approve and Run
- Cancel
- Open Full Details

After execution show:
- progress
- current phase
- concise result
- retry if allowed
- rollback if allowed
- audit link

### Full Action Center
Views:
- Pending Approval
- Ready
- Running
- Succeeded
- Failed
- Blocked
- History

Filters:
- device
- vendor
- risk
- status
- user
- date

### Workflow Page
Show:
- title, device, vendor, status, risk
- step timeline
- dependencies
- missing parameters
- blocked/unsupported steps
- approval
- execution progress
- verification
- retry/rollback
- final result
- audit link

## 8. Vendor Acceptance

Do not invent unsupported capabilities.

Linux:
- CPU, memory, disk, processes
- service status
- supported restart
- open ports
- logs summary
- nginx config test

Example:
```text
Restart nginx -> Verify service -> Test config -> Report
```

MikroTik:
- resources, interfaces, routes
- firewall/NAT read
- address lists, services, VPN status
- change SSH port
- create address list/rule
- verify and backup when supported

Example:
```text
Create address list -> Create firewall rule -> Verify
```

FortiGate:
- status, interfaces, routes, policies
- address objects, services, VIP, VPN, SD-WAN read
- create address/VIP/policy
- verify and backup when supported

Example:
```text
Create address -> Create VIP -> Create policy -> Verify
```

Cisco:
- IOS-XE and IOS Classic as separate platforms
- version, inventory, interfaces, routes, VLAN, CPU/memory
- supported config metadata and safe reads
- create VLAN
- assign interface
- interface description/state/IP
- static route, NTP, Syslog
- save config and verify

Example:
```text
Create VLAN -> Assign interface -> Save -> Verify
```

NX-OS, ASA, FTD, and IOS-XR require separate future contracts.

## 9. Implementation Phases

Complete phases in order. Do not continue until tests pass.

### Phase 0: Audit and Baseline
- repository map
- generated-file cleanup
- baseline tests
- safe implementation plan

Commit:
```text
chore(v2): establish safe rebuild baseline
```

### Phase 1: Design System and App Shell
No business-logic changes.

Commit:
```text
feat(ui): add workflow-first application shell
```

### Phase 2: Domain Contracts
Add typed planning, workflow, execution, approval, and audit contracts.

Commit:
```text
feat(workflow): add typed planning contracts
```

### Phase 3: Unified Action Registry
Normalize all valid action sources and enforce isolation.

Commit:
```text
feat(actions): unify vendor action registry
```

### Phase 4: Workflow Engine
Planner, resolver, parameters, approval, execution, verification, failure, audit.

Commit:
```text
feat(workflow): execute validated multi-step plans
```

### Phase 5: Action Center UI
Inline panel and full Action Center.

Commit:
```text
feat(action-center): add inline review and execution
```

### Phase 6: AI Assistant
Chat, direct action, guided workflow, device context, no auto-redirect.

Commit:
```text
feat(ai): add device-scoped planning
```

### Phase 7: Dashboard and Device Workspace
Live operational dashboard and simplified workspace.

Commit:
```text
feat(dashboard): add operational workflow dashboard
```

### Phase 8: Vendor Acceptance
Validate all four vendors through the shared architecture.

Vendor-specific changes belong only in adapters, parsers, templates, and capability definitions. No vendor hacks in AI routing.

### Phase 9: Stabilization
Regression, UI click-through, browser smoke, DB tests, real-device read tests, approved write tests, i18n, UTF-8, accessibility, secret scan, performance, and Git checks.

Commit:
```text
test(stability): lock workflow regression coverage
```

## 10. Required Tests

Chat:
- normal conversation stays in chat
- informational prompts create no action
- switching device clears stale context

Direct actions:
- Linux memory
- Cisco show version
- MikroTik resource status
- FortiGate system status

Expected:
- inline review
- explicit approval
- backend execution
- result
- no auto-redirect

Guided workflows:
- Linux: restart nginx -> verify
- MikroTik: change SSH port -> verify
- FortiGate: address -> VIP -> policy -> verify
- Cisco: VLAN -> interface -> save -> verify

Unsupported:
- plan visible
- step blocked
- execution disabled
- clear explanation
- no raw command execution

Security:
- no secrets in UI/log/results
- AI never invokes connectors
- no execution without approval
- selected device controls vendor/platform
- no cross-vendor action reuse

## 11. Validation

Use actual repository scripts.

At minimum:
- backend build/typecheck
- frontend build/typecheck
- planner tests
- workflow state-machine tests
- resolver tests
- action registry tests
- Action Center tests
- vendor isolation tests
- vendor regression tests
- i18n parity
- UTF-8/mojibake
- catalog validation
- workflow validation
- secret scan
- `git diff --check`

Database:
- separate test DB only
- never production
- existing/additive migrations only
- report skipped DB tests honestly

Real devices:
- read-only first
- registered device and credential references only
- explicit approval for writes
- never print secrets

## 12. Completion Criteria

Complete only when:
- new UI is consistent and functional
- dashboard uses real backend data
- onboarding works
- device workspace shows real data
- normal chat works
- AI correctly separates all three modes
- direct actions use inline approval
- workflows collect parameters and execute step-by-step
- all execution remains backend-only
- vendors share one architecture
- Persian/English and RTL/LTR work
- normal UI hides raw backend errors
- required tests pass
- each phase has a scoped commit
- working features remain intact

## 13. Final Report

Report:
1. initial repository state
2. files and docs reviewed
3. research and official sources used
4. old architecture problems
5. new architecture
6. completed phases
7. changed files
8. migrations
9. commits and hashes
10. passed/failed/skipped tests
11. real-device validation
12. unsupported capabilities
13. remaining risks
14. exact run commands
15. manual UI test paths

Stop after stabilization. Do not start unrelated work.
