# Phase D — Backend Refactor Without Behavior Change

## Objective
Reduce regression risk by decomposing oversized backend modules while preserving public route/service behavior.

## Freeze behavior first

Before moving code, add or confirm characterization tests around:

- ActionPlan proposal, preview, approval, execution, verification and audit
- custom AI plan validation
- workflow dependency/skip behavior
- Cisco, MikroTik, FortiGate and Linux connector dispatch
- AI chat mode routing

## Split `action-plan.service.ts`

Keep a compatibility facade at the existing import path. Suggested modules:

```text
backend/src/actions/action-plan/
  action-plan.repository.ts
  action-plan-proposal.service.ts
  action-plan-preview.service.ts
  action-plan-approval.service.ts
  action-plan-execution.service.ts
  action-plan-verification.service.ts
  action-plan-audit.service.ts
  action-plan-lifecycle.ts
  action-plan.types.ts
  index.ts
```

## Split AI services

```text
backend/src/ai/assistant/
  assistant-routing.service.ts
  assistant-conversation.service.ts
  assistant-device-question.service.ts
  assistant-action-planning.service.ts
  assistant-provider-classifier.ts
  assistant-response-contract.ts
```

Keep `ai-chat.service.ts` as a thin facade until all callers migrate.

## Split command compilers/connectors

- Extract FortiGate compiler domains: interfaces, policies, objects, VPN, system/admin, routing.
- Extract Linux connector concerns: connection/session, command execution, telemetry/read collection, output parsing, evidence.
- Keep connector interfaces stable.

## Quality targets

- No behavior change in this phase.
- No core handwritten source file should remain above 50 KB; target under 35 KB where practical.
- No circular dependencies.
- No duplicated policy logic.
- Public exports and API response shapes remain compatible.
- Build and focused tests pass after each extraction, not only at the end.

## Commit sequence

Use separate commits if necessary:

- `refactor(actions): decompose action plan services`
- `refactor(ai): decompose assistant routing and planning`
- `refactor(connectors): split vendor compiler and connector concerns`
