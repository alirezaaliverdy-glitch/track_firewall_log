# Phase C — Extensible Custom Command Policy Engine

## Objective
Replace scattered custom-command regular expressions with a typed, testable vendor policy engine. Valid commands must not be rejected merely because they are absent from the static catalog.

## Architecture

Create a registry such as:

```text
backend/src/commands/custom-policy/
  custom-command-policy.types.ts
  custom-command-policy.registry.ts
  linux.policy.ts
  mikrotik.policy.ts
  fortigate.policy.ts
  cisco.policy.ts
  parsers/
  tests/
```

Each vendor policy must provide:

- platform support check
- parse/normalize operation
- allow/deny decision
- risk calculation
- required role/permission
- required typed parameters
- expected impact
- verification command/operation generation
- rollback/backup requirements
- timeout and output limits
- explicit hard-deny rules

## Execution policy

- Catalog-backed templates remain preferred.
- A valid custom operation may execute through a registered connector.
- Cross-vendor commands are rejected.
- Secrets in commands or logs are rejected/redacted.
- Shell chaining, redirection, command substitution and uncontrolled interactive shells are rejected for Linux.
- Catastrophic commands remain hard-blocked by default: factory reset, erase config/storage, credential dumping, unrestricted secret export, uncontrolled reboot/shutdown, destructive wildcard deletion.
- Unknown parser result creates a reviewable non-executable plan with an exact reason; never silently map to the nearest catalog action.
- Optional future break-glass behavior must be feature-flagged, admin-only and out of scope unless all tests and audit requirements are implemented.

## Backend-only execution

The connector receives a validated execution specification, not arbitrary provider text.

```text
AI operation/command
-> policy parse
-> normalized operation
-> permission/risk/parameter validation
-> preview
-> approval
-> connector compile/dispatch
-> verification
-> audit
```

## Verification rules

- Every mutable operation requires explicit verification.
- High-risk connectivity changes require pre-change evidence and rollback guidance.
- A connector exit code without verification is not success.
- Multi-step dependent operations stop and mark dependents skipped after failure.

## Required tests

For Cisco, MikroTik, FortiGate and Linux:

- valid catalog command
- valid custom command not in catalog
- cross-vendor rejection
- secret detection/redaction
- hard-deny destructive command
- multi-step plan ordering
- dependency failure and skip
- verification failure
- role/risk enforcement
- connector evidence and audit persistence

## Commit

`refactor(actions): add extensible vendor command policy engine`
