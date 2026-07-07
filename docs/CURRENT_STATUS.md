# Current Project Status

Last updated: 2026-07-07

Branch: `product-persian-command-catalog`

Product mode: `PRODUCT_MODE=persian_command_catalog`

## Product State

The project is a Persian-first Mini-SOAR prototype. The controlled product path remains:

`AI/Catalog -> ActionPlan -> Preview -> User Confirm -> Connector -> Audit/Result`

Task 16 is partially in progress. The AI resolver, AI chat response contract, and Command Catalog AI fallback are now hardened. Daily Check UX, Linux Service Health, and broader result UX work are still open.

## What Works

- Backend AI resolver now maps supported Persian requests to real registered templates instead of defaulting to vague manual proposals when a template exists.
- `POST /api/ai/chat` returns a structured contract with assistant message, execution support, implementation state, mapped template, missing fields, next step, and optional ActionPlan.
- `POST /api/commands/ai-propose` now returns honest modes:
  `executable_action_plan`, `needs_input`, `manual_proposal`.
- Command Catalog frontend now reacts to those modes and sends executable plans to Action Center without the earlier misleading “created but not executed” state.
- Execution pipeline protections remain intact: explicit `intent=execute`, template resolution, real connector invocation, persisted result output, and `connectorInvoked=true` required before success.
- Backend build, backend test suite, targeted Task 16 resolver/fallback test, and frontend build all pass.

## Partial or Open

- AI assistant panel still contains older mixed English/mojibake UI strings outside the new execution-state card.
- Daily Check is implemented in backend foundations from Task 15.1, but the broader Task 16 UX pass is not finished.
- Linux Service Health panel and its new command set are not implemented yet in this round.
- Global “open result in new tab with popup-block fallback” work is not finished across every entry point.

## Known Bugs and Risks

- Mojibake remains in parts of older frontend/backend strings and docs; this should be fixed in a dedicated UTF-8 cleanup task.
- Frontend production build still reports the existing large-chunk warning from Vite; this is not a new regression from this round.
- Success must continue to require real execution evidence. Preview-only states must never be treated as successful execution.

## Vendor Status

| Vendor | Catalog state | Connector status | Daily Check | Notes |
|---|---|---|---|---|
| Linux | `implemented` + some `manualOnly` | Real `linux-ssh` templates registered | Real connector-backed | Strongest execution path with AI mapping support |
| MikroTik | `implemented` + `manualOnly` + `planned` | Real `mikrotik-ssh` templates registered | Real connector-backed | Strong execution path with AI mapping support |
| FortiGate | Mostly `manualOnly` | No product-grade executable catalog flow yet | Manual-only/profile exists | Legacy foundations exist but not promoted |
| Cisco | `manualOnly` | No registered product execution connector | Manual-only/profile exists | Honest non-executable state |
| pfSense | `manualOnly` | No registered product execution connector | Manual-only/profile exists | Honest non-executable state |
| Juniper | `manualOnly` | No registered product execution connector | Manual-only/profile exists | Planned/manual only |
| Palo Alto | `manualOnly` | No registered product execution connector | Manual-only/profile exists | Planned/manual only |
| Windows | `manualOnly` | No registered product execution connector | Manual-only/profile exists | Planned/manual only |
| Docker | Planned direction | No registered product execution connector | Manual-only/profile exists | No product commands yet |
| Kubernetes | Planned direction | No registered product execution connector | Manual-only/profile exists | No product commands yet |

## Next Recommended Task

Continue Task 16 with the remaining product-core items in this order:

1. Finish Daily Check UI/result experience.
2. Add Linux Service Health templates/UI.
3. Apply global new-tab result navigation and result formatting cleanup.
4. Run a dedicated mojibake/UTF-8 repair pass without touching execution policy.

## Protected Behavior

Keep:

- `ACTION_EXECUTION_MODE=quick_controlled`
- `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`

In this lab mode, one user confirmation is enough for supported Linux/MikroTik templates, but selected device, validated parameters, registered template/connector, explicit `intent=execute`, real connector invocation, audit logs, and real execution results remain mandatory.
