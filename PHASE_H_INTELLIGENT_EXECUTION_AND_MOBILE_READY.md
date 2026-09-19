# PHASE H — Intelligent AI Action Routing, Generic Command Execution, and Mobile-Ready Architecture

## 0. Mission

Implement a production-grade AI orchestration layer that keeps ordinary chat fully available, classifies every request before action generation, supports live monitoring and multi-step vendor workflows, permits valid custom vendor operations outside the static catalog, and executes only through the backend-controlled approval, PolicyGuard, connector, verification, audit, and result pipeline.

This phase must extend the current architecture. Do not replace working security, workflow, connector, audit, PWA, or Capacitor foundations.

## 1. Non-Negotiable Product Behavior

The selected device is context, not an automatic action trigger.

The user must always be able to:

- Talk normally with the assistant.
- Ask general questions unrelated to the selected device.
- Ask informational questions about the selected device.
- Request cached or live monitoring.
- Request a single-step operation.
- Request a multi-step configuration.
- Request a valid operation absent from the static catalog.

Only explicit operational intent may create an executable ActionPlan. Conversation, explanation, and informational questions must never enter the execution pipeline.

## 2. Canonical Intent Model

Create one typed backend-owned decision contract:

```ts
type AssistantIntent =
  | "conversation"
  | "general_question"
  | "device_question"
  | "monitoring_cached"
  | "monitoring_live"
  | "single_step_action"
  | "multi_step_action"
  | "clarification_required";

interface AssistantIntentDecision {
  intent: AssistantIntent;
  confidence: number;
  reasonCode: string;
  targetDeviceId?: string;
  vendor?: string;
  platform?: string;
  requiresLiveData: boolean;
  requiresApproval: boolean;
  requiresParameters: boolean;
  destructivePotential: "none" | "low" | "medium" | "high" | "critical";
  missingContext: string[];
}
```

Use semantic classification with deterministic safeguards. Do not rely only on Persian or English keywords.

Words such as `دستور`, `فرمان`, `اجرا`, `پرامپت`, `command`, `run`, `execute`, `create`, `configure`, `build`, and `setup` may add evidence for operational intent, but must never be the sole rule.

These must remain explanations, not actions:

- «دستور show vlan چه کاری می‌کند؟»
- “Explain the command used to create a VLAN.”
- «آیا اجرای این فرمان خطرناک است؟»

These must become actions:

- «دستور ساخت VLAN 120 را روی این دستگاه اجرا کن.»
- “Create VLAN 120 on the selected switch.”
- «روی میکروتیک این route را اضافه کن.»

Confidence policy:

- High confidence: route immediately.
- Medium confidence: ask one concise clarification question.
- Low confidence: remain in chat and do not create an ActionPlan.

Do not reject a valid custom operation solely because it is absent from the catalog.

## 3. Execution Strategy Resolver

After classification, resolve exactly one strategy:

```ts
type ExecutionStrategy =
  | "chat_only"
  | "cached_answer"
  | "live_monitoring"
  | "catalog_action"
  | "guided_catalog_workflow"
  | "generic_vendor_action"
  | "clarification";
```

Priority order:

1. Chat-only for conversation and general questions.
2. Cached answer when trusted and fresh context is sufficient.
3. Exact catalog action when available.
4. Existing guided workflow for supported multi-step operations.
5. Generic vendor action when no exact catalog/workflow exists but the request can be translated safely for the selected vendor.
6. Clarification when target, intent, or parameters remain ambiguous.

Never coerce a request into the nearest unrelated catalog action. When a device is selected, its stored vendor/platform is the source of truth. Do not infer a conflicting vendor from prompt text.

## 4. Monitoring Behavior

Monitoring is read-only and must never mutate device state.

Examples include interface status, CPU, memory, disk, temperature, routing table, ARP table, VLAN list, firewall sessions, VPN status, service/container status, logs, configuration inspection, reachability, and health checks.

### 4.1 Cached Monitoring

Use `monitoring_cached` only when trusted and sufficiently fresh evidence already exists.

Requirements:

- Show timestamp and source.
- Clearly label the data as cached.
- Return `actionPlan: null`.
- Do not invoke Action Center or connectors.
- Do not imply that a live check occurred.

### 4.2 Live Monitoring

Use `monitoring_live` when current device state is required.

```text
Intent Classification
→ Read-only Monitoring Plan
→ Preview
→ User Approval
→ PolicyGuard Read-only Validation
→ Registered Connector
→ Result Capture
→ AI Analysis
→ Dedicated Monitoring Result Tab
→ Audit
```

Monitoring ActionPlans must:

- Set `readOnly: true`.
- Reject mutation commands.
- Use vendor-aware read-only validation.
- Support cancellation and timeout.
- Stream progress when available.
- Keep raw evidence separate from the AI summary.
- Never claim success without connector evidence.

The result tab must show target, vendor, executed commands/API operations, timing, safely redacted raw output, parsed findings, AI summary, anomalies, suggested next steps, export/copy controls, and audit link.

The chat receives only a concise summary and a control linking to the result tab.

## 5. Single-Step Operational Actions

Examples: restart service, disable interface, create one address object, add one route, change SSH port, or block one IP.

```text
Explicit Action Intent
→ Strategy Resolution
→ Catalog or Generic ActionPlan
→ Risk Analysis
→ Preview
→ Approval
→ PolicyGuard
→ Registered Connector
→ Verification
→ Result Tab
→ Audit
```

Requirements:

- Show exact normalized operation.
- Show generated vendor commands or API payloads.
- Show target device, risk, blast radius, verification, and rollback information.
- Never execute raw assistant output.
- High/critical risk strengthens approval. Risk alone must not permanently mark a valid operation unsupported.

## 6. Multi-Step Operational Actions

Examples: create VLAN and assign ports, site-to-site VPN, OSPF/BGP, NAT/VIP plus policy, DHCP, user/group permissions, Linux service deployment, Docker Compose, SD-WAN, or complex routing/security policy.

```text
Explicit Multi-Step Intent
→ Draft ActionPlan
→ Risk and Dependency Analysis
→ Initial Approval to Configure
→ Dedicated Parameter Workspace Tab
→ Vendor-Aware Parameter Collection
→ Validation
→ Generated Step Preview
→ Final Approval
→ Ordered Backend Execution
→ Per-Step Verification
→ Failure Handling / Rollback Offer
→ Execution Result Tab
→ Audit
```

### 6.1 Dedicated Parameter Workspace

Use a dedicated route such as:

```text
/actions/:planId/configure
```

It must show plan title, device/vendor/platform, ordered steps, required/optional parameters, field dependencies, safe defaults, validation errors, risk changes, generated preview, verification plan, rollback plan, save draft, cancel, and final approval.

Do not overload chat with large forms.

### 6.2 Backend-Owned Parameter Schemas

```ts
interface ActionParameterSchema {
  schemaVersion: string;
  actionType: string;
  vendor: string;
  platform?: string;
  fields: ActionParameterField[];
  validationRules: ValidationRule[];
  derivedValues: DerivedValueRule[];
  secretFields: string[];
}
```

The AI may select a schema, explain fields, suggest safe defaults, and prefill values explicitly provided by the user.

The AI must not invent missing IPs, interfaces, credentials, secrets, VLAN IDs, ASNs, PSKs, ports, names, or destructive options.

Secrets must use secure input and backend secret references. Never place secrets in chat history, logs, analytics, audit payloads, localStorage, IndexedDB, service-worker cache, or notifications.

### 6.3 Initial Vendor Workflow Coverage

Use registries/adapters, not giant switch statements.

#### Cisco

At minimum: VLAN create/delete/rename; access/trunk assignment; interface description/state; static routes; ACL create/update/apply; OSPF; BGP neighbors; NAT where supported; users; SSH; NTP/SNMP/syslog; backup/show configuration; IOS/IOS-XE/NX-OS/ASA-aware behavior.

#### MikroTik RouterOS

At minimum: addresses/interface lists; VLAN/bridge/ports; static routes; filter/raw/mangle; NAT; address lists; DHCP; DNS; WireGuard; IPsec/L2TP where supported; users/groups; services/SSH port; queues; backup/export; monitoring.

#### FortiGate

At minimum: address/service objects; firewall policies; VIP/DNAT; static routes; VLAN/interfaces; IPsec VPN; SSL VPN where supported; SD-WAN; users/groups; admin settings; logging/SNMP; backup/show configuration; monitoring.

#### Linux

At minimum: systemd; package lifecycle; UFW/firewalld/nftables; users/groups/sudo; SSH; permissions; Nginx/Apache; Docker/Compose; interfaces/routes/DNS; cron/systemd timers; logs/process/ports; backup/archive.

## 7. Generic Vendor Action Pipeline

A request must not become unsupported only because no static catalog entry exists.

```ts
interface GenericVendorAction {
  vendor: string;
  platform?: string;
  targetDeviceId: string;
  userIntent: string;
  normalizedOperation: string;
  steps: GenericVendorStep[];
  risk: RiskAssessment;
  requiredParameters: ParameterRequirement[];
  verification: VerificationPlan;
  rollback?: RollbackPlan;
  provenance: {
    provider: string;
    model: string;
    generatedAt: string;
    promptVersion: string;
  };
}
```

Allowed:

- AI generates candidate vendor commands/API operations.
- Backend normalizes and validates them.
- Backend presents them for review.
- Backend executes only after approval through registered connectors.

Forbidden:

- AI directly opens SSH or device APIs.
- Frontend executes commands.
- Raw model output bypasses backend validation.
- Unsupported connector families report success.
- Commands are silently replaced with unrelated catalog actions.

## 8. Layered Command Validation

Replace narrow scenario-specific fallback rules with:

1. Structural validation
2. Vendor/platform grammar validation
3. Read-only versus mutation validation
4. Dangerous token/control validation
5. Parameter completeness
6. Device capability validation
7. Connector capability validation
8. Risk classification
9. Verification availability
10. Approval policy

Catalog absence is not a rejection reason. Risk is not a rejection reason by itself.

Reject only when syntax cannot be safely parsed, vendor/platform mismatch exists, target capability or connector is unsupported, required parameters are missing, policy forbids the operation, the command attempts to bypass controls, verification is meaningless for a critical mutation, or the requester lacks permission.

Return structured reason codes, never untranslated UI keys.

## 9. Approval Model

- Read-only monitoring: normal confirmation unless organization policy explicitly pre-approves monitoring.
- Low/medium mutation: explicit confirmation.
- High risk: privileged permission plus reason.
- Critical risk: privileged permission, typed confirmation, impact acknowledgement, optional second approver, and break-glass audit metadata.

Approval must bind to plan hash, device ID, vendor/platform, parameters hash, generated steps hash, risk version, and expiration. Any material change invalidates approval.

## 10. Verification and Result Semantics

Every mutation must have meaningful verification. Connector exit code alone is not success.

Examples: VLAN existence/name, interface state/configuration, route table entry, firewall object/policy references, VPN configuration/status, service state and listening port, or Docker workload state.

```ts
type ExecutionResultState =
  | "succeeded_verified"
  | "succeeded_unverified"
  | "partially_succeeded"
  | "failed"
  | "rolled_back"
  | "rollback_failed"
  | "cancelled"
  | "timed_out";
```

Critical actions must never become `succeeded_verified` without verification evidence.

## 11. Failure, Retry, and Rollback

- Stop dependent steps after prerequisite failure.
- Preserve evidence for completed steps.
- Separate retryable and non-retryable failures.
- Never automatically retry destructive commands.
- Offer rollback only when a reviewed rollback exists.
- Require confirmation unless automatic rollback was explicitly approved before execution.
- Keep all states visible in Action Center.

## 12. UI Requirements

### Assistant

- Ordinary chat remains default.
- Device selection supplies context only.
- Never show execution controls for chat-only responses.
- Show a concise classification explanation when confidence is uncertain.
- Let the user correct a mistaken classification before execution.

### Action Center

Use simple mini-panels for preview, approval, parameter handoff, progress, verification, and result. Do not auto-navigate away from chat.

Open full routes/tabs for monitoring results, multi-step parameter workspace, execution results, and audit details.

### Errors

Show localized and actionable causes: missing parameter, connector unavailable, vendor mismatch, unsupported capability, permission denied, approval expired, policy denied, verification failed, device unreachable, timeout, or unsafe generated command.

Never display raw translation keys such as `support.reason.customConnectorValidated`.

## 13. Mobile and Capacitor Readiness

### 13.1 Architecture Boundary

The mobile app remains a client.

Backend responsibilities: authentication, RBAC, intent authority, ActionPlan persistence, PolicyGuard, approvals, connector execution, SSH/API sessions, secret storage, verification, audit, and result persistence.

Mobile/client responsibilities: chat, device selection, parameter forms, preview, approval interaction, progress/result display, notifications, deep links, and read-only offline cache.

### 13.2 API and Transport

- One typed API transport abstraction.
- HTTPS plus WebSocket/SSE reconnect.
- Resume streams after network changes.
- Idempotency keys for mutations.
- Duplicate approval/execution prevention.
- Deep links for plan, parameter, result, and approval routes.
- App background/foreground handling.
- Secure session preservation.
- No production dependency on localhost.

### 13.3 Mobile Security

- Never store device credentials, SSH keys, PSKs, API tokens, raw secrets, or reusable command authorization in browser/mobile caches or logs.
- Use OS secure storage only for revocable session material in native packaging.
- Optional biometrics are a local gate, not backend authentication.
- Require fresh backend authorization for high/critical approvals.
- Disable execution and approval while offline.
- Offline content is read-only and marked stale.
- Redact sensitive outputs before caching or notifications.

### 13.4 Notifications

Add hooks for approval requested, execution started, step failed, verification failed, execution completed, and device disconnected. Notifications deep-link to the correct route without exposing secrets or full command output.

### 13.5 Responsive Acceptance

Validate at 390px phone, 768px tablet, and desktop, in Persian RTL and English LTR. No horizontal overflow. Touch targets, parameter forms, previews, progress, and results must remain usable.

## 14. Native Mobile SSH Decision

Do not move production connector execution into the mobile client during this phase.

Default production architecture:

```text
Mobile App
→ Secure Backend API
→ PolicyGuard / Approval / Audit
→ Backend Connector
→ Vendor Device
```

A future optional Local Lab Connector may be designed separately for isolated labs only. It must not store production credentials, bypass backend approval/audit, allow background arbitrary commands, or masquerade as the production execution path.

## 15. Data Model and Migrations

Persist typed fields for intent decision, execution strategy, plan/schema versions, plan hash, approval binding, monitoring/read-only flag, command provenance, verification evidence, result state, notification correlation, idempotency key, and resume state where appropriate.

All migrations must be backward-compatible and tested against an isolated test database. Never use development or production data for migration tests.

## 16. Observability

Add structured events for classification, strategy, clarification, parameter workspace, validation, preview, approval, connector execution, verification, rollback, mobile disconnect/resume, and result viewing.

Never log secrets or full sensitive output.

Add metrics for corrected classification accuracy, catalog versus generic usage, approval conversion, connector/verification failures, planning/execution latency, monitoring latency, mobile reconnect success, and duplicate execution prevention.

## 17. Required Regression Scenarios

### Conversation

- Selected Cisco device + greeting → chat only.
- Selected MikroTik device + unrelated question → chat only.
- “Explain VLAN creation command” → explanation, no plan.

### Monitoring

- “What VLANs exist?” with fresh cached evidence → cached answer.
- “Check current VLANs now” → live read-only plan.
- Result opens dedicated route.
- Mutation hidden in monitoring plan → rejected.

### Cisco VLAN

- “Create VLAN 120 named STAFF” → executable guided or generic plan.
- Schema includes VLAN ID and name.
- Preview is platform-appropriate.
- Approval binds to plan hash.
- Verification checks existence/name.
- Catalog absence does not force unsupported state.

### MikroTik

- Create VLAN interface/bridge membership with missing interface → parameter workspace.
- Live resource check → monitoring result.

### FortiGate

- Create address object plus policy → ordered multi-step plan.
- Required source/destination/service/interface fields enforced.
- Verification checks objects and policy.

### Linux

- “Is nginx running?” → monitoring.
- “Restart nginx” → single-step action.
- “Deploy nginx reverse proxy” → multi-step parameter workspace.
- Shell metacharacter injection → rejected.

### Risk and Mobile

- High-risk valid action → stronger approval, not automatic unsupported.
- Parameter change after approval → approval invalidated.
- Offline approval → blocked.
- Duplicate mobile retry → one execution only.

### Generic Action

- Valid unknown action → generic pipeline.
- No nearest-catalog coercion.
- Missing connector capability → clear blocked reason.
- Raw AI output cannot invoke connector.

## 18. Validation Gates

Run all existing gates plus:

1. Frontend build
2. Backend build
3. Type checks
4. Command catalog validation
5. Full isolated backend TAP
6. Intent classifier tests
7. Strategy resolver tests
8. Generic action policy tests
9. Parameter schema tests
10. Approval binding tests
11. Verification/result-state tests
12. i18n
13. UTF-8
14. Workflow tests
15. Playwright desktop
16. Playwright 390px mobile
17. RTL/LTR acceptance
18. PWA artifact checks
19. Offline execution/approval blocking
20. Mobile reconnect/idempotency tests
21. `git diff --check`

Do not run destructive commands on real devices. Use mocks, fixtures, simulators, or explicitly designated lab devices.

## 19. Implementation Sequence

### H1 — Characterization

Read current architecture/handoff. Add failing regressions for Cisco VLAN and unsupported custom actions. Capture current behavior before production changes.

### H2 — Intent and Strategy

Add typed classifier/resolver. Separate conversation, questions, monitoring, single-step, and multi-step behavior.

### H3 — Generic Vendor Action

Implement the generic contract, remove incorrect fallback coupling, and add layered validation.

### H4 — Schemas and Workspace

Implement backend schema registry and dedicated parameter route. Add broad initial vendor coverage.

### H5 — Monitoring Pipeline

Implement cached/live decisions, read-only enforcement, and result route.

### H6 — Approval, Verification, Result

Bind approvals, add result states/evidence, and implement retry/rollback behavior.

### H7 — Mobile Hardening

Add idempotency, reconnect/resume, deep links, notification hooks, secure storage boundaries, and offline blocking.

### H8 — Acceptance and Stabilization

Run all gates, fix only scoped regressions, update `CODEX_HANDOFF.md` and acceptance matrix, and produce the final report.

Use focused commits. Preserve unrelated dirty, deleted, and untracked files exactly.

## 20. Final Deliverables

Provide architecture summary, changed files by subsystem, migrations, intent/strategy matrix, vendor workflow matrix, generic-action behavior, monitoring behavior, mobile readiness, security boundaries, exact test results, unsupported platform/connector combinations, remaining risks, manual test paths, commit IDs, rollback instructions, and production deployment notes.

Phase H is complete only when the assistant can converse normally, classify requests correctly, create executable catalog or generic vendor plans, collect vendor-aware parameters for multi-step operations, execute only through the backend-controlled pipeline, verify results, and expose the full workflow safely on desktop and mobile.
