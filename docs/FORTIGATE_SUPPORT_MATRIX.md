# FortiGate Support Matrix

This matrix records the FortiGate behavior present in the codebase. It is a visibility audit, not an expansion of the execution surface. The same data is exposed by `GET /api/vendors/fortigate/capabilities` and displayed in the FortiGate Capability Matrix panel.

## Safety boundary

- FortiGate changes accept structured catalog parameters, not raw FortiOS CLI.
- Every executable action passes PolicyGuard, deterministic compilation, dry-run storage, approval, and an immediate validation re-check before SSH execution.
- High-risk actions can require backup preflight. Critical/lockout-sensitive actions can also require break-glass, `EXECUTE`, the exact device name, and a reason.
- Read-only actions do not change configuration. Rollback metadata/instructions are stored, but automatic connector rollback is not implemented.

## Current support

| Category | Status | Risk | Current coverage |
|---|---|---:|---|
| Address objects | Execution | Medium | Create, update, and managed-only delete. |
| Address groups | Execution | Medium | Create and add/remove members. |
| Services | Execution | Medium | Custom TCP/UDP/TCP-UDP services and service groups. |
| Schedules | Execution | Medium | Recurring schedule create/update. |
| Firewall policies | Execution | High | Create/update, enable/disable, move, comment, and managed-only delete; selected operations become critical. |
| NAT | Execution | High | Controlled egress/SNAT and destination-NAT policy templates. |
| VIP / port forward | Execution | High | VIP/VIP-group creation and destination-NAT policy creation. |
| Interfaces | Execution | Critical | Read/discover, aliases, roles, enable/disable, VLAN creation, IP updates, and zones. |
| Static routes | Read-only | Low | Routing-table discovery; no route changes. |
| Logs / monitoring | Read-only | Low | Controlled log/session reads and device discovery output. |
| Backup / config read | Read-only | Medium | Full/sanitized config reads and backup-preflight metadata; no restore. |
| System status | Read-only | Low | Version, model, serial, hostname, VDOM, HA, interface, policy, object, service, schedule, and route summaries. |

All rows marked **Execution** require a validated dry-run and approval. The UI marks those rows green for code readiness while separately highlighting high/critical risk in orange/red.

## Partial support

- Static routes are discovered but cannot be created, updated, or removed.
- Schedules cover recurring schedules, not the full FortiOS schedule surface.
- Policies and NAT use a controlled set of structured templates; general-purpose/raw configuration editing is intentionally excluded.
- Monitoring reads are bounded connector actions/discovery, not a historical monitoring subsystem.
- Configuration can be read/sanitized and backup requirements can be enforced, but there is no external retention workflow or automated restore.
- Every write path provides rollback metadata, but automatic rollback execution is absent.

There are currently no FortiGate categories whose highest available mode is **dry-run only**. A catalog action is either connected to the guarded SSH execution path, available only as read-only discovery/action, or not implemented.

## Not supported

| Category | Risk to design for | Missing foundation |
|---|---:|---|
| DNS | High | Read-only discovery, structured actions, compiler, PolicyGuard, and rollback design. |
| DHCP | High | Scope/lease discovery, structured actions, compiler, PolicyGuard, and rollback design. |
| VPN | Critical | Sanitized discovery, VPN-specific model/validation, compiler, backup, break-glass, and rollback design. |
| Security profiles | High | Profile discovery and schemas for IPS, antivirus, web filter, application control, SSL inspection, and policy attachment. |

## Main implementation files

- Registry/API: `backend/src/capabilities/fortigate-capability-registry.ts`, `backend/src/routes/connector-plans.ts`
- Existing execution path: `backend/src/connectors/fortigate-ssh.connector.ts`, `backend/src/connectors/vendors/fortigate.planner.ts`
- Existing catalog and safety: `backend/src/actions/fortigate-action-catalog.ts`, `backend/src/services/fortigate-command-compiler.ts`, `backend/src/services/fortigate-policy-guard.service.ts`, `backend/src/services/policy-guard.service.ts`, `backend/src/services/action-plan.service.ts`
- UI: `src/lib/fortigateCapabilities.ts`, `src/components/fortigate/FortiGateCapabilityMatrixPanel.tsx`

## Recommended next FortiGate tasks

1. Add API/registry contract tests so category status cannot drift silently from the UI.
2. Add compiler/PolicyGuard regression tests for every existing FortiGate catalog action before expanding the catalog.
3. Add bounded, sanitized DNS and DHCP read-only discovery first; keep writes disabled.
4. Add static-route dry-run design with exact-target discovery and rollback metadata, then review it separately before enabling execution.
5. Add pagination/filter limits for log/session reads and a clear output-redaction test suite.
6. Design backup retention and operator-led restore documentation without adding automated restore execution.
7. Audit security-profile references on policies as read-only data before designing any profile mutation.
