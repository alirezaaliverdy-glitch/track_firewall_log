# ActionPlan Consistency and Stale-Plan Repair Specification

## Core invariant

The exact object approved by the user must be the exact object executed.

## Canonical payload

```ts
interface CanonicalActionPlanPayload {
  actionType: string;
  targetDeviceId: string;
  vendor: string;
  platform?: string;
  capabilityKey: string;
  catalogCommandId: string;
  executionTemplateRef: string;
  connectorType: string;
  parameters: Record<string, unknown>;
  riskClass: string;
}
```

Hash only a stable serialized representation of this payload.

## Required sequence

```text
resolve target
resolve vendor/platform
resolve capability
resolve catalog command
resolve template
resolve connector
normalize parameters
validate
risk
preview
hash
persist revision
approve
execute revision
verify
audit
```

## Forbidden behavior

- mutation after approval
- defaults added after hash
- unresolved vendor at preview
- null template at preview
- connector selected during execution
- plan reused after user parameter edit
- stale error caused by server-side normalization

## Revision model

```text
ActionPlan
  ├─ Revision 1 draft
  ├─ Revision 2 approved
  └─ Revision 3 draft after edit
```

Execution references one immutable revision.

## Idempotency

Use a stable idempotency key based on:

- device
- capability
- canonical parameters
- desired state

Repeated requests must inspect current state through connector and return verified no-change when compliant.

## close_port semantics

Detect:

- UFW
- firewalld
- nftables
- iptables

Desired state:

```text
port 545/tcp is not allowed from the selected scope
```

Verification checks effective policy, not only exit code.

## Structured 409

A 409 is valid only for a real revision conflict.

Internal resolver changes are bugs, not user conflicts.
