# Current Project Status

Last updated: 2026-07-07

Branch: `product-persian-command-catalog`

Product mode: `PRODUCT_MODE=persian_command_catalog`

## Product State

The project now behaves as a Persian-first Network & Security Command Center with the controlled path:

`AI/Catalog -> ActionPlan -> Preview -> User Confirm -> Connector -> Audit/Result`

Task 16 is functionally complete for:

- AI resolver / AI assistant contract / honest catalog AI fallback
- vendor-aware Daily Check foundations and Persian UI
- Linux Service Health templates, connector coverage, and UI
- result navigation in a new tab with popup-block fallback
- structured Action Result formatting for key Linux and MikroTik actions

## What Works

- AI-supported Persian requests that map to registered templates create executable ActionPlans instead of vague manual proposals.
- Command Catalog AI fallback now returns honest modes: `executable_action_plan`, `needs_input`, `manual_proposal`.
- Daily Check now uses vendor-aware profiles across Linux, MikroTik, FortiGate, Cisco, pfSense, Juniper, Palo Alto, Windows, Docker, and Kubernetes.
- Linux and MikroTik Daily Check remain the real connector-backed execution paths.
- Linux Service Health is available for running services, failed services, important services, and targeted service status checks.
- Action execution results open in a new tab from Action Center, with a visible fallback link if the browser blocks popups.
- Action Result view now shows Persian summary, execution status, device/vendor, duration, structured output, next actions, and collapsed raw output.
- Execution safety remains strict: `intent=execute`, resolved template, real connector invocation, persisted stdout/stderr/exitCode/duration, and no success without `connectorInvoked=true`.

## Partial or Open

- Older mojibake strings still exist in unrelated legacy UI/backend areas and need a dedicated encoding cleanup task.
- Daily Check for non-Linux/MikroTik vendors is honest manual-only today; it is not real execution yet.
- Frontend build still emits the existing large-chunk warning; this is not introduced by Task 16.
- The local database needed the Task 16 enum migration SQL executed for validation; other environments must also apply it before using the new Linux service-health actions.

## Known Bugs and Risks

- If another environment does not apply `20260707160000_task16_linux_service_health`, creating plans for new Linux service-health actions will fail at the database enum layer.
- Several legacy screens still mix older English text with Persian-first UI conventions.
- Success semantics must stay evidence-based; preview-only states must never be shown as successful execution.

## Vendor Status

| Vendor | implemented | manualOnly | planned | connector status | daily check status |
|---|---|---|---|---|---|
| Linux | Yes | Some catalog items | No | `linux-ssh` real connector | Real execution |
| MikroTik | Yes | Some catalog items | Some | `mikrotik-ssh` real connector | Real execution |
| FortiGate | No product-grade execute path in current mode | Yes | Some | connector not ready for promoted product flow | Manual checklist |
| Cisco | No | Yes | Some | connector not ready | Manual checklist |
| pfSense | No | Yes | Some | connector not ready | Manual checklist |
| Juniper | No | Yes | Some | connector not ready | Manual checklist |
| Palo Alto | No | Yes | Some | connector not ready | Manual checklist |
| Windows | No | Yes | Some | connector not ready | Manual checklist |
| Docker | No | Yes | Some | connector not ready | Manual checklist |
| Kubernetes | No | Yes | Some | connector not ready | Manual checklist |

## Next Recommended Task

1. Run a focused UTF-8/mojibake cleanup pass without touching execution policy.
2. Apply the Task 16 enum migration to every shared/local environment that uses the project database.
3. If product scope continues, deepen Linux/MikroTik result UX and start real connector work for the next vendor.

## Validation

- `cd backend && npm run prisma:generate`
- `cd backend && npm run validate:command-catalog`
- `cd backend && npm run build`
- `cd backend && npm test`
- `cd backend && npx prisma db execute --file prisma/migrations/20260707160000_task16_linux_service_health/migration.sql`
- `pnpm build`

Validation status: passed. Frontend build still shows the existing Vite chunk-size warning only.

## Protected Behavior

Keep:

- `ACTION_EXECUTION_MODE=quick_controlled`
- `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true`

In this lab mode, one user confirmation is enough for supported Linux/MikroTik templates, but selected device, validated parameters, registered template/connector, explicit `intent=execute`, real connector invocation, audit logs, and real execution results remain mandatory.
