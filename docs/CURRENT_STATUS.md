# Current Project Status

Last updated: 2026-07-07

Branch: `product-persian-command-catalog`

Product mode: `PRODUCT_MODE=persian_command_catalog`

## Product State

The project is an MVP/prototype Mini-SOAR. Its primary path is Persian-first and backend-first:

`AI/Catalog -> ActionPlan -> Preview -> User Confirm -> PolicyGuard -> Connector -> Audit/Result`

The catalog contains 51 items: 22 implemented connector-backed commands (15 Linux, 7 MikroTik, including Daily Check), 28 manual-only items, and 1 planned MikroTik item. AI uses compact Evidence Packs and can propose actions; it cannot silently execute raw commands.

## What Works

- React/Vite application with authentication, device/credential registry, Persian command catalog, AI assistant, Action Center, dedicated result view, Daily Check, events/incidents, findings, and Linux telemetry.
- Fastify/Prisma/PostgreSQL backend with catalog validation, ActionPlan lifecycle, stable preview fingerprinting, explicit execute intent, PolicyGuard, SSH connectors, result persistence, and audit.
- Real registered Linux and MikroTik catalog/Daily Check templates after one confirmation in protected lab-unrestricted mode.
- Vendor-aware telemetry registry for Linux, MikroTik, FortiGate, pfSense, Cisco, Palo Alto, Juniper, Windows, Docker, Kubernetes, AWS, and Azure; normalized persisted findings are currently fed by Linux snapshots/live streams.
- Multi-vendor deterministic assessment/hardening profiles and proposal-only remediation.

## Partial or Open

- Verification is primarily output/result review; automatic rollback is incomplete.
- FortiGate has legacy planner/SSH connector foundations, but Persian product catalog and Daily Check remain manual-only and need product-path integration/testing before executable claims.
- Non-Linux telemetry profiles mostly provide rule scaffolding; their collectors/parsers do not yet feed the shared engine.
- Detection correlation/rule DSL, reporting, broader Linux distro testing, and production hardening remain incomplete.

## Known Bugs and Risks

- Some existing Persian source strings/docs have mojibake and need a scoped UTF-8 cleanup with regression testing.
- Root frontend package version remains `0.0.0`; backend is `0.1.0` (informational, not runtime failure).
- Successful execution must continue to require `connectorInvoked=true`; preview-only responses must never be accepted as success.

## Vendor Status

| Vendor | Product catalog state | Connector status | Daily Check | Telemetry status |
|---|---|---|---|---|
| Linux | `implemented` (15) plus `manualOnly` (2) | Real `linux-ssh` registered templates | `implemented`, connector-backed | Implemented snapshots/live ingestion and findings |
| MikroTik | `implemented` (7), `manualOnly` (1), `planned` (1) | Real `mikrotik-ssh` registered templates | `implemented`, connector-backed | Implemented profile/rules; collector integration partial |
| FortiGate | `manualOnly` (7) | Legacy SSH connector/planner exists; not wired as executable product catalog/Daily Check | `manualOnly` | Implemented profile/rules; collector integration open |
| Cisco | `manualOnly` (7) | No registered product execution connector | `manualOnly` | Planned/scaffold profile; collector integration open |
| pfSense | `manualOnly` (6) | Planner is manual/unsupported; no real execution connector | `manualOnly` | Implemented profile/rules; collector integration open |
| Juniper | `manualOnly` (1) | No registered product execution connector | `manualOnly` | Planned/scaffold profile |
| Palo Alto | `manualOnly` (1) | No registered product execution connector | `manualOnly` | Planned/scaffold profile |
| Windows | `manualOnly` (1) | No registered product execution connector | `manualOnly` | Planned/scaffold profile |
| Docker | No product catalog item (`planned` direction) | No registered product execution connector | `manualOnly` | Planned/scaffold profile |
| Kubernetes | No product catalog item (`planned` direction) | No registered product execution connector | `manualOnly` | Planned/scaffold profile |

## Next Recommended Task

Run a dedicated UTF-8/Persian mojibake repair across product-facing source strings and docs, with backend/frontend tests and no execution-policy changes. After that, add real collectors/connectors one vendor at a time rather than promoting manual/planned entries early.

## Protected Behavior

Keep `ACTION_EXECUTION_MODE=quick_controlled` and `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`. In this lab combination, one confirmation is enough for supported registered Linux/MikroTik templates, while device, parameters, template/connector, `intent=execute`, real invocation, audit, and real-result checks remain mandatory.
